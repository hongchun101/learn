import { describe, it, expect } from 'vitest';
import {
  erc20Init,
  erc20Transfer,
  erc20Approve,
  erc20TransferFrom,
  erc721Mint,
  erc721Approve,
  erc721Transfer,
  erc1155Mint,
  erc1155Transfer,
  erc4626Deposit,
  ReentrancyGuard,
  pullPaymentWithdraw,
  ensureOwner,
  setOwner,
  uupsUpgrade,
  unsafeAdd,
  checkedAdd,
  demo as ch09Demo,
} from '../src/09-solidity-patterns/index.js';

const A = '0x' + 'aa'.repeat(20);
const B = '0x' + 'bb'.repeat(20);
const C = '0x' + 'cc'.repeat(20);

describe('Chapter 09 — Smart-Contract Patterns & Security', () => {
  it('ERC-20 transfer moves balance atomically', () => {
    const s = erc20Init(A, { name: 'T', symbol: 'T', decimals: 18, totalSupply: 1_000n });
    const r = erc20Transfer(s, A, B, 250n);
    expect(r.ok).toBe(true);
    expect(s.balances.get(A)).toBe(750n);
    expect(s.balances.get(B)).toBe(250n);
  });

  it('ERC-20 transfer rejects insufficient balance', () => {
    const s = erc20Init(A, { name: 'T', symbol: 'T', decimals: 18, totalSupply: 100n });
    const r = erc20Transfer(s, A, B, 250n);
    expect(r.ok).toBe(false);
  });

  it('ERC-20 approve + transferFrom respects allowance', () => {
    const s = erc20Init(A, { name: 'T', symbol: 'T', decimals: 18, totalSupply: 1_000n });
    erc20Approve(s, A, C, 500n);
    expect(s.allowances.get(A)?.get(C)).toBe(500n);
    const r = erc20TransferFrom(s, C, A, B, 300n);
    expect(r.ok).toBe(true);
    expect(s.balances.get(A)).toBe(700n);
    expect(s.balances.get(B)).toBe(300n);
    expect(s.allowances.get(A)?.get(C)).toBe(200n);
  });

  it('ERC-721 mint assigns a fresh token id', () => {
    const s = { name: 'N', symbol: 'N', nextTokenId: 0n, owners: new Map<bigint, string>(), balances: new Map<string, bigint>(), approvals: new Map<bigint, string>(), operators: new Map<string, Set<string>>() };
    expect(erc721Mint(s, A)).toBe(0n);
    expect(erc721Mint(s, A)).toBe(1n);
    expect(s.balances.get(A)).toBe(2n);
  });

  it('ERC-721 approve rejects non-owner callers', () => {
    const s = { name: 'N', symbol: 'N', nextTokenId: 0n, owners: new Map<bigint, string>(), balances: new Map<string, bigint>(), approvals: new Map<bigint, string>(), operators: new Map<string, Set<string>>() };
    const id = erc721Mint(s, A);
    expect(erc721Approve(s, B, id, C)).toBe(false);
    expect(erc721Approve(s, A, id, B)).toBe(true);
  });

  it('ERC-721 transfer updates ownership and balances', () => {
    const s = { name: 'N', symbol: 'N', nextTokenId: 0n, owners: new Map<bigint, string>(), balances: new Map<string, bigint>(), approvals: new Map<bigint, string>(), operators: new Map<string, Set<string>>() };
    const id = erc721Mint(s, A);
    expect(erc721Transfer(s, A, B, id)).toBe(true);
    expect(s.owners.get(id)).toBe(B);
    expect(s.balances.get(A)).toBe(0n);
    expect(s.balances.get(B)).toBe(1n);
  });

  it('ERC-1155 mint and transfer move amounts between holders', () => {
    const s = { balances: new Map<string, Map<bigint, bigint>>() };
    erc1155Mint(s, A, 1n, 100n, new Uint8Array());
    erc1155Transfer(s, A, B, 1n, 30n);
    expect(s.balances.get(A)?.get(1n)).toBe(70n);
    expect(s.balances.get(B)?.get(1n)).toBe(30n);
  });

  it('ERC-4626 deposit issues shares 1:1 on first deposit', () => {
    // Build vault with empty underlying.
    const v = {
      asset: erc20Init('0x' + '11'.repeat(20), { name: '', symbol: '', decimals: 0, totalSupply: 0n }),
      shares: erc20Init('0x' + '11'.repeat(20), { name: 'v', symbol: 'v', decimals: 0, totalSupply: 0n }),
    };
    // Fund the depositor and let them deposit.
    v.asset.balances.set(A, 1_000n);
    const shares = erc4626Deposit(v, A, 500n);
    expect(shares).toBe(500n);
  });

  it('ReentrancyGuard prevents nested entry', () => {
    const g = new ReentrancyGuard();
    expect(() => g.execute(() => { g.enter(); return 'ok'; })).toThrow();
  });

  it('Pull payment sets owed to zero before transfer', () => {
    const s = { owed: new Map<string, bigint>([[A, 100n]]) };
    expect(pullPaymentWithdraw(s, A)).toBe(100n);
    expect(pullPaymentWithdraw(s, A)).toBe(0n);
  });

  it('Access control: ensureOwner rejects non-owner', () => {
    const state = { storage: new Map(), balances: new Map(), owners: new Map(), balances_: new Map(), owners_: new Map(), approvals: new Map(), operators: new Map(), allowances: new Map(), locked: new Set(), owners_mapping: new Map([['master', A]]), paused: new Map(), reentrancyKey: 'rk' } as unknown as Parameters<typeof ensureOwner>[0];
    expect(() => ensureOwner(state, B)).toThrow();
    expect(() => ensureOwner(state, A)).not.toThrow();
  });

  it('setOwner rotates the owner', () => {
    const state = { storage: new Map(), balances: new Map(), owners: new Map(), balances_: new Map(), owners_: new Map(), approvals: new Map(), operators: new Map(), allowances: new Map(), locked: new Set(), owners_mapping: new Map([['master', A]]), paused: new Map(), reentrancyKey: 'rk' } as unknown as Parameters<typeof ensureOwner>[0];
    setOwner(state, A, B);
    expect(state.owners_mapping.get('master')).toBe(B);
  });

  it('UUPS upgrade records history and updates impl', () => {
    const s = { impl: 'v1', history: [] as string[] };
    uupsUpgrade(s, A, 'v2');
    expect(s.impl).toBe('v2');
    expect(s.history).toEqual(['v1']);
  });

  it('unsafeAdd overflows with no check (legacy semantics)', () => {
    expect(unsafeAdd(2n ** 200n, 2n ** 200n)).toBe(2n ** 201n);
  });

  it('checkedAdd rejects overflow', () => {
    expect(() => checkedAdd(2n ** 255n, 2n ** 255n)).toThrow();
  });

  it('ch09 demo runs end-to-end', () => {
    const out = ch09Demo();
    expect(out.erc20Supply).toBe('999900');
    expect(out.erc721Id).toBe('0');
    expect(out.erc4626Shares).toBe('500');
    expect(out.reentrancyTriggered).toBe(true);
  });
});
