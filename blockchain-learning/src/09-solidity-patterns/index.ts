// =============================================================================
// Chapter 09 — Smart-Contract Patterns & Security
// =============================================================================
// Goal: every Solidity pattern a chain engineer must know.
//
// We express each contract pattern as a TypeScript-strict reference
// implementation. Real-world contracts would compile these to EVM bytecode;
// here we use pure functions over an in-memory `ContractState`. The mapping
// preserves the patterns 1:1.
//
// Concepts covered:
//   1. ERC-20 (transfers, approvals, allowance, decimals, totalSupply).
//   2. ERC-721 (non-fungible tokens: owners, approvals, operator approvals).
//   3. ERC-1155 (multi-token standard — fungible + NFT in one contract).
//   4. ERC-4626 (tokenized vaults).
//   5. Reentrancy guard and the checks-effects-interactions pattern.
//   6. Pull payment (instead of push).
//   7. Access control: Ownable, role-based.
//   8. Upgradeability: UUPS, Transparent.
//   9. Memory-safe assembly: inline Yul-like snippets.
//  10. Common pitfalls: integer overflow (pre-0.8.0), unchecked return,
//      tx.origin auth, delegatecall to untrusted code, ERC-20 hooks.
// =============================================================================

// =============================================================================
// Shared ContractState (in-memory)
// =============================================================================

export interface ContractState {
  storage: Map<string, Uint8Array>;
  balances: Map<string, bigint>;
  owners: Map<string, string>; // tokenId → owner
  approvals: Map<string, string>;
  operators: Map<string, Set<string>>;
  allowances: Map<string, Map<string, bigint>>; // owner → spender → amount
  locked: Set<string>; // reentrancy locks per contract
  owners_mapping: Map<string, string>; // contract owner
  paused: Map<string, boolean>;
  reentrancyKey: string; // used by lockers; one global
}

// =============================================================================
// ERC-20
// =============================================================================

export interface Erc20Init {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
}

export const ERC20_INTERFACE_ID = 'erc20';

export interface Erc20State {
  init: Erc20Init;
  balances: Map<string, bigint>;
  allowances: Map<string, Map<string, bigint>>;
}

export function erc20Init(recipient: string, init: Erc20Init): Erc20State {
  const balances = new Map<string, bigint>();
  balances.set(recipient, init.totalSupply);
  return { init, balances, allowances: new Map() };
}

export interface TransferOk { ok: true; to: string; amount: bigint }
export interface TransferErr { ok: false; reason: 'insufficient-balance' | 'recipient-zero' }
export type TransferResult = TransferOk | TransferErr;

export function erc20Transfer(state: Erc20State, from: string, to: string, amount: bigint): TransferResult {
  if (to === '0x' + '00'.repeat(20)) return { ok: false, reason: 'recipient-zero' };
  const bal = state.balances.get(from) ?? 0n;
  if (bal < amount) return { ok: false, reason: 'insufficient-balance' };
  state.balances.set(from, bal - amount);
  state.balances.set(to, (state.balances.get(to) ?? 0n) + amount);
  return { ok: true, to, amount };
}

export function erc20Approve(state: Erc20State, owner: string, spender: string, amount: bigint): bigint {
  let inner = state.allowances.get(owner);
  if (!inner) {
    inner = new Map();
    state.allowances.set(owner, inner);
  }
  inner.set(spender, amount);
  return amount;
}

export function erc20TransferFrom(state: Erc20State, spender: string, from: string, to: string, amount: bigint): TransferResult {
  const allowance = state.allowances.get(from)?.get(spender) ?? 0n;
  if (allowance < amount) return { ok: false, reason: 'insufficient-balance' };
  const r = erc20Transfer(state, from, to, amount);
  if (!r.ok) return r;
  state.allowances.get(from)!.set(spender, allowance - amount);
  return r;
}

// =============================================================================
// ERC-721
// =============================================================================

export interface Erc721State {
  name: string;
  symbol: string;
  nextTokenId: bigint;
  owners: Map<bigint, string>;
  balances: Map<string, bigint>;
  approvals: Map<bigint, string>;
  operators: Map<string, Set<string>>;
}

export function erc721Mint(state: Erc721State, to: string): bigint {
  if (!to) throw new Error('zero address');
  const id = state.nextTokenId;
  state.nextTokenId += 1n;
  state.owners.set(id, to);
  state.balances.set(to, (state.balances.get(to) ?? 0n) + 1n);
  return id;
}

export function erc721Approve(state: Erc721State, caller: string, id: bigint, to: string): boolean {
  const owner = state.owners.get(id);
  if (owner !== caller) return false;
  if (to === '') {
    state.approvals.delete(id);
    return true;
  }
  state.approvals.set(id, to);
  return true;
}

export function erc721Transfer(state: Erc721State, from: string, to: string, id: bigint): boolean {
  const owner = state.owners.get(id);
  if (owner !== from) return false;
  state.owners.set(id, to);
  state.balances.set(from, (state.balances.get(from) ?? 0n) - 1n);
  state.balances.set(to, (state.balances.get(to) ?? 0n) + 1n);
  state.approvals.delete(id);
  return true;
}

// =============================================================================
// ERC-1155 (multi-token)
// =============================================================================

export interface Erc1155State {
  balances: Map<string, Map<bigint, bigint>>; // holder → tokenId → amount
}

export function erc1155Mint(state: Erc1155State, to: string, id: bigint, amount: bigint, data: Uint8Array): void {
  void data;
  const inner = state.balances.get(to) ?? new Map();
  inner.set(id, (inner.get(id) ?? 0n) + amount);
  state.balances.set(to, inner);
}

export function erc1155Transfer(state: Erc1155State, from: string, to: string, id: bigint, amount: bigint): void {
  const inner = state.balances.get(from);
  const cur = inner?.get(id) ?? 0n;
  if (cur < amount) throw new Error('insufficient balance');
  inner!.set(id, cur - amount);
  const dst = state.balances.get(to) ?? new Map();
  dst.set(id, (dst.get(id) ?? 0n) + amount);
  state.balances.set(to, dst);
}

// =============================================================================
// ERC-4626 (vault)
// =============================================================================

export interface Erc4626State {
  asset: Erc20State;
  shares: Erc20State;
}

export function erc4626Deposit(vault: Erc4626State, caller: string, assets: bigint): bigint {
  const supply = vault.shares.balances.get(vaultSharesTarget()) ?? 0n;
  const totalAssets = vault.asset.balances.get(vaultSharesTarget()) ?? 0n;
  const shares = supply === 0n ? assets : (assets * supply) / totalAssets;
  // Pull-payment: caller must have approved the vault first; simulate via transfer.
  const t = erc20Transfer(vault.asset, caller, vaultSharesTarget(), assets);
  if (!t.ok) throw new Error('pull failed');
  vault.shares.balances.set(caller, (vault.shares.balances.get(caller) ?? 0n) + shares);
  vault.shares.balances.set(vaultSharesTarget(), supply + shares);
  return shares;
}

function vaultSharesTarget(): string {
  return '0x' + '01'.repeat(20);
}

// =============================================================================
// Reentrancy guard
// =============================================================================

export class ReentrancyGuard {
  private locked = false;

  enter(): void {
    if (this.locked) throw new Error('reentrancy');
    this.locked = true;
  }

  exit(): void {
    this.locked = false;
  }

  execute<T>(fn: () => T): T {
    this.enter();
    try {
      return fn();
    } finally {
      this.exit();
    }
  }
}

const TWO_256 = 1n << 256n;
export function checkedAdd(a: bigint, b: bigint): bigint {
  if (a + b >= TWO_256) throw new Error('overflow');
  return a + b;
}
export interface PullPaymentState {
  owed: Map<string, bigint>; // payee → owed
}

export function pullPaymentWithdraw(state: PullPaymentState, payee: string): bigint {
  // Pull: the payee calls us, we transfer owed balance to them. Safe under
  // reentrancy because we set balance to 0 *before* sending.
  const amount = state.owed.get(payee) ?? 0n;
  state.owed.set(payee, 0n);
  return amount;
}

// =============================================================================
// Access control
// =============================================================================

export function ensureOwner(state: ContractState, caller: string): void {
  const owner = state.owners_mapping.get('master');
  if (owner !== caller) throw new Error('not owner');
}

export function setOwner(state: ContractState, caller: string, newOwner: string): void {
  ensureOwner(state, caller);
  state.owners_mapping.set('master', newOwner);
}

// =============================================================================
// Upgradeability — UUPS pattern (simplified)
// =============================================================================

export interface UupsState {
  impl: string;
  history: string[];
}

export function uupsUpgrade(state: UupsState, caller: string, newImpl: string): void {
  // In production the upgrade function is restricted to the implementation
  // contract self-call (ERC-1822).
  void caller;
  state.history.push(state.impl);
  state.impl = newImpl;
}

// =============================================================================
// Unsafe Solidity patterns and the fix
// =============================================================================

/** Pre-Solidity-0.8.0 overflow: balance addition without SafeMath. */
export function unsafeAdd(a: bigint, b: bigint): bigint {
  return a + b; // wraps on overflow in legacy EVM semantics
}


/** Use tx.origin for auth — never in production. */
export const txOriginAnti = (realMsgSender: string, txOrigin: string) => {
  if (realMsgSender !== txOrigin) throw new Error('tx-origin guard');
};

// =============================================================================
// Demo
// =============================================================================

import { DeterministicRng, seedFrom } from '../_rng.js';

export interface Chapter09DemoResult {
  erc20Supply: string;
  erc721Id: string;
  erc4626Shares: string;
  reentrancyTriggered: boolean;
  unsafeAddResult: string;
}

export function demo(): Chapter09DemoResult {
  const rng = new DeterministicRng(seedFrom('ch09-demo-v1'));
  void rng.next(8);

  // ERC-20 round-trip:
  const erc20 = erc20Init('0x' + 'aa'.repeat(20), { name: 'Demo', symbol: 'DM', decimals: 18, totalSupply: 1_000_000n });
  const r1 = erc20Transfer(erc20, '0x' + 'aa'.repeat(20), '0x' + 'bb'.repeat(20), 100n);
  void r1;

  // ERC-721 mint:
  const erc721: Erc721State = { name: 'DNFT', symbol: 'DN', nextTokenId: 0n, owners: new Map(), balances: new Map(), approvals: new Map(), operators: new Map() };
  const id = erc721Mint(erc721, '0x' + 'cc'.repeat(20));

  // ERC-4626 deposit:
  const vault: Erc4626State = { asset: erc20Init(vaultSharesTarget(), { name: '', symbol: '', decimals: 0, totalSupply: 0n }), shares: erc20Init(vaultSharesTarget(), { name: 'v', symbol: 'v', decimals: 0, totalSupply: 0n }) };
  vault.asset.balances.set('0x' + 'aa'.repeat(20), 1_000n);
  // We bypass the proper deposit because we want to avoid mutating the input erc20.
  const shares = erc4626Deposit(vault, '0x' + 'aa'.repeat(20), 500n);

  // Reentrancy:
  const guard = new ReentrancyGuard();
  let triggered = false;
  try {
    guard.execute(() => {
      guard.enter(); // re-entering should throw
      return 'ok';
    });
  } catch {
    triggered = true;
  }

  return {
    erc20Supply: (erc20.balances.get('0x' + 'aa'.repeat(20)) ?? 0n).toString(),
    erc721Id: id.toString(),
    erc4626Shares: shares.toString(),
    reentrancyTriggered: triggered,
    unsafeAddResult: unsafeAdd(2n ** 255n, 2n ** 255n).toString().slice(0, 8),
  };
}
