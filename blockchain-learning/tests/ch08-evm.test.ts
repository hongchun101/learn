import { describe, it, expect } from 'vitest';
import {
  Op,
  PUSH_BASE,
  DUP_BASE,
  SWAP_BASE,
  LOG_BASE,
  isPush,
  pushSize,
  isDup,
  isSwap,
  isLog,
  logTopicCount,
  gasCost,
  memoryExpansionCost,
  PRECOMPILE,
  precompileGas,
  createAddress,
  create2Address,
  isEofCode,
  EOF_MAGIC,
  EOF_VERSION,
  demo as ch08Demo,
} from '../src/08-evm/index.js';

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
  return true;
}

describe('Chapter 08 — EVM Deep Dive', () => {
  it('PUSH instructions are detected correctly', () => {
    expect(PUSH_BASE).toBe(0x60);
    expect(isPush(0x60)).toBe(true);
    expect(isPush(0x7f)).toBe(true);
    expect(isPush(0x80)).toBe(false);
    expect(pushSize(0x60)).toBe(1);
    expect(pushSize(0x7f)).toBe(32);
  });

  it('DUP/SWAP are in their respective base ranges', () => {
    expect(isDup(DUP_BASE)).toBe(true);
    expect(isDup(DUP_BASE + 15)).toBe(true);
    expect(isDup(SWAP_BASE)).toBe(false);
    expect(isSwap(SWAP_BASE)).toBe(true);
    expect(isSwap(SWAP_BASE + 15)).toBe(true);
  });

  it('LOG topic count = op - LOG_BASE', () => {
    expect(isLog(LOG_BASE)).toBe(true);
    expect(isLog(LOG_BASE + 4)).toBe(true);
    expect(logTopicCount(LOG_BASE)).toBe(0);
    expect(logTopicCount(LOG_BASE + 4)).toBe(4);
  });

  it('gasCost for ADD is very-low (3)', () => {
    expect(gasCost(Op.ADD)).toBe(3n);
  });

  it('gasCost for SSTORE and SLOAD includes cold access (EIP-2929)', () => {
    expect(gasCost(Op.SLOAD)).toBeGreaterThanOrEqual(2_100n);
    expect(gasCost(Op.SSTORE)).toBeGreaterThanOrEqual(5_000n);
  });

  it('memoryExpansionCost grows quadratically', () => {
    const a = memoryExpansionCost(512, 0n);
    const b = memoryExpansionCost(1024, 0n);
    expect(a.gas).toBeLessThan(b.gas);
    expect(a.words).toBe(16n);
    expect(b.words).toBe(32n);
  });

  it('precompileGas has fixed or word-multiplied values', () => {
    expect(precompileGas(PRECOMPILE.ecRecover, 0)).toBe(3_000n);
    expect(precompileGas(PRECOMPILE.identity, 100)).toBeGreaterThan(0n);
    expect(precompileGas(PRECOMPILE.ecAdd, 0)).toBe(150n);
  });

  it('createAddress returns 20 bytes (keccak truncated)', () => {
    const addr = createAddress(new Uint8Array(20).fill(0xab), 1n);
    expect(addr.length).toBe(20);
  });

  it('create2Address is deterministic per (deployer, init, salt)', () => {
    const dep = new Uint8Array(20).fill(0xab);
    const init = new Uint8Array(64).fill(0x60);
    const salt = new Uint8Array(32).fill(0xee);
    const a = create2Address(dep, init, salt);
    const b = create2Address(dep, init, salt);
    expect(equalBytes(a, b)).toBe(true);
    expect(a.length).toBe(20);
  });

  it('isEofCode detects the EOF magic', () => {
    expect(EOF_MAGIC).toBe(0xef00);
    expect(EOF_VERSION).toBe(1);
    expect(isEofCode(new Uint8Array([0xef, 0x00, 0x01, 0x00]))).toBe(true);
    expect(isEofCode(new Uint8Array([0x60, 0x00]))).toBe(false);
  });

  it('ch08 demo runs end-to-end', () => {
    const out = ch08Demo();
    expect(out.createAddress.startsWith('0x')).toBe(true);
    expect(out.create2Address.startsWith('0x')).toBe(true);
    expect(out.isEof).toBe(true);
    expect(out.pushSize).toBe(32);
    expect(out.gasSha256Precompile).toBeGreaterThan(0);
  });
});
