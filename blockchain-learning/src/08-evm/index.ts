// =============================================================================
// Chapter 08 — EVM Deep Dive
// =============================================================================
// Goal: every concept a smart-contract engineer must know about the Ethereum
// Virtual Machine.
//
// Concepts covered:
//   1. Opcodes: 256-bit stack machine, bytecode layout, stop/arithmetic/
//      comparison/bitwise/memory/storage/control-flow categories.
//   2. Gas accounting: per-opcode costs, intrinsic transaction costs, dynamic
//      costs for SSTORE/SLOAD, CALL, LOG, KECCAK256, etc.
//   3. Memory model: linear bytes, expands quadratically in word count.
//   4. Transient storage (EIP-1153): TLOAD/TSTORE cleared per transaction.
//   5. Precompiles: ecRecover, sha256, ripemd160, identity, modExp, bn128.
//   6. Contract creation: CREATE / CREATE2 addresses.
//   7. SELFDESTRUCT and its storage refund.
//   8. EOF (EIP-3540): code is broken into a header with containers.
//
// References:
//   - EVM Yellow Paper: https://ethereum.github.io/yellowpaper/paper.pdf
//   - EIP-150, EIP-1559, EIP-2929 (gas), EIP-1153 (transient storage),
//     EIP-3540 (EOF), EIP-4844 (blob gas), EIP-7702 (set-code).
// =============================================================================

// =============================================================================
// 1. Opcodes (subset)
// =============================================================================

export enum Op {
  STOP = 0x00,
  ADD = 0x01,
  MUL = 0x02,
  SUB = 0x03,
  DIV = 0x04,
  SDIV = 0x05,
  MOD = 0x06,
  SMOD = 0x07,
  ADDMOD = 0x08,
  MULMOD = 0x09,
  EXP = 0x0a,
  SIGNEXTEND = 0x0b,

  LT = 0x10,
  GT = 0x11,
  SLT = 0x12,
  SGT = 0x13,
  EQ = 0x14,
  ISZERO = 0x15,
  AND = 0x16,
  OR = 0x17,
  XOR = 0x18,
  NOT = 0x19,
  BYTE = 0x1a,
  SHL = 0x1b,
  SHR = 0x1c,
  SAR = 0x1d,

  SHA3 = 0x20,

  ADDRESS = 0x30,
  BALANCE = 0x31,
  ORIGIN = 0x32,
  CALLER = 0x33,
  CALLVALUE = 0x34,
  CALLDATALOAD = 0x35,
  CALLDATASIZE = 0x36,
  CALLDATACOPY = 0x37,
  CODESIZE = 0x38,
  CODECOPY = 0x39,
  GASPRICE = 0x3a,
  EXTCODESIZE = 0x3b,
  EXTCODECOPY = 0x3c,
  RETURNDATASIZE = 0x3d,
  RETURNDATACOPY = 0x3e,
  EXTCODEHASH = 0x3f,

  BLOCKHASH = 0x40,
  COINBASE = 0x41,
  TIMESTAMP = 0x42,
  NUMBER = 0x43,
  DIFFICULTY = 0x44,
  GASLIMIT = 0x45,
  CHAINID = 0x46,
  SELFBALANCE = 0x47,
  BASEFEE = 0x48,
  BLOBHASH = 0x49,
  BLOBBASEFEE = 0x4a,

  POP = 0x50,
  MLOAD = 0x51,
  MSTORE = 0x52,
  MSTORE8 = 0x53,
  SLOAD = 0x54,
  SSTORE = 0x55,
  JUMP = 0x56,
  JUMPI = 0x57,
  PC = 0x58,
  MSIZE = 0x59,
  GAS = 0x5a,
  JUMPDEST = 0x5b,
  TLOAD = 0x5c, // EIP-1153
  TSTORE = 0x5d, // EIP-1153
  MCOPY = 0x5e, // EIP-5656

  PUSH0 = 0x5f,
  PUSH1 = 0x60,
  PUSH32 = 0x7f,
  DUP1 = 0x80,
  DUP16 = 0x8f,
  SWAP1 = 0x90,
  SWAP16 = 0x9f,

  LOG0 = 0xa0,
  LOG4 = 0xa4,

  CREATE = 0xf0,
  CALL = 0xf1,
  CALLCODE = 0xf2,
  DELEGATECALL = 0xf4,
  CREATE2 = 0xf5,
  STATICCALL = 0xfa,
  REVERT = 0xfd,
  INVALID = 0xfe,
  SELFDESTRUCT = 0xff,
}

export const PUSH_BASE = 0x60;
export const DUP_BASE = 0x80;
export const SWAP_BASE = 0x90;
export const LOG_BASE = 0xa0;

/** True if this opcode is in the PUSH range (it consumes 1+N bytes). */
export function isPush(op: number): boolean {
  return op >= PUSH_BASE && op < PUSH_BASE + 32;
}

/** Number of data bytes a PUSH operation takes. */
export function pushSize(op: number): number {
  return op - PUSH_BASE + 1;
}

export function isDup(op: number): boolean {
  return op >= DUP_BASE && op < DUP_BASE + 16;
}

export function isSwap(op: number): boolean {
  return op >= SWAP_BASE && op < SWAP_BASE + 16;
}

export function isLog(op: number): boolean {
  return op >= LOG_BASE && op <= LOG_BASE + 4;
}

export function logTopicCount(op: number): number {
  return op - LOG_BASE;
}

// =============================================================================
// 2. Gas accounting (Berlin+ baseline)
// =============================================================================

const GAS_VERY_LOW = 3n;
const GAS_LOW = 5n;
const GAS_MID = 8n;
const GAS_HIGH = 10n;

export function gasCost(op: number, dynamic: bigint = 0n): bigint {
  switch (op) {
    case Op.ADD: case Op.SUB: case Op.NOT: case Op.LT: case Op.GT:
    case Op.SLT: case Op.SGT: case Op.EQ: case Op.ISZERO:
    case Op.AND: case Op.OR: case Op.XOR: case Op.BYTE:
    case Op.SHL: case Op.SHR: case Op.SAR:
    case Op.CALLDATALOAD: case Op.MLOAD: case Op.MSTORE: case Op.MSTORE8:
    case Op.PUSH0:
    case 0x81: case 0x82: case 0x83: case 0x84: case 0x85: case 0x86: case 0x87:
    case 0x88: case 0x89: case 0x8a: case 0x8b: case 0x8c: case 0x8d: case 0x8e:
    case Op.DUP16:
    case 0x91: case 0x92: case 0x93: case 0x94: case 0x95: case 0x96: case 0x97:
    case 0x98: case 0x99: case 0x9a: case 0x9b: case 0x9c: case 0x9d: case 0x9e:
    case Op.SWAP16:
    case Op.TLOAD: case Op.TSTORE:
      return GAS_VERY_LOW;
    case Op.MUL: case Op.DIV: case Op.SDIV: case Op.MOD: case Op.SMOD:
    case Op.SIGNEXTEND:
    case Op.PUSH1: // as one example; any PUSH takes 3 gas
      return GAS_LOW;
    case Op.ADDMOD: case Op.MULMOD:
      return GAS_MID;
    case Op.BALANCE: case Op.CALLDATACOPY: case Op.CODECOPY:
    case Op.EXTCODESIZE: case Op.EXTCODECOPY: case Op.RETURNDATACOPY:
    case Op.MCOPY:
      return GAS_HIGH;
    case Op.SLOAD:
      // Cold SLOAD cost (EIP-2929). Warm SLOAD uses 100.
      return GAS_HIGH + 2_100n + 0n;
    case Op.SSTORE:
      // Real gas depends on prior value; we return the SSTORE_SET_GAS (2900).
      return 5_000n;
    case Op.JUMP: case Op.JUMPI: case Op.JUMPDEST:
      return GAS_HIGH;
    case Op.CREATE: case Op.CALL: case Op.CALLCODE: case Op.DELEGATECALL:
    case Op.STATICCALL:
      return GAS_HIGH;
    case 0xa1: case 0xa2: case 0xa3: case 0xa4:
    default:
      return dynamic;
  }
}

// =============================================================================
// 3. Memory
// =============================================================================

/** Active memory cost = 3 * words + words²/512. Active words = ceil(size/32). */
export function memoryExpansionCost(size: number, prevWords: bigint): { gas: bigint; words: bigint } {
  const words = BigInt(Math.ceil(size / 32));
  if (words <= prevWords) return { gas: 0n, words: prevWords };
  const next = 3n * words + (words * words) / 512n;
  const prev = 3n * prevWords + (prevWords * prevWords) / 512n;
  return { gas: next - prev, words };
}

// =============================================================================
// 4. Precompile addresses
// =============================================================================

export const PRECOMPILE = {
  ecRecover: 0x01,
  sha256: 0x02,
  ripemd160: 0x03,
  identity: 0x04,
  modExp: 0x05,
  ecAdd: 0x06,
  ecMul: 0x07,
  ecPairing: 0x08,
  blake2f: 0x09,
  pointEvaluation: 0x0a, // EIP-4844
};

export function precompileGas(addr: number, inputLen: number): bigint {
  switch (addr) {
    case PRECOMPILE.ecRecover: return 3_000n;
    case PRECOMPILE.sha256: return 60n + 12n * BigInt(Math.ceil(inputLen / 32));
    case PRECOMPILE.ripemd160: return 600n + 120n * BigInt(Math.ceil(inputLen / 32));
    case PRECOMPILE.identity: return 15n + 3n * BigInt(Math.ceil(inputLen / 32));
    case PRECOMPILE.modExp: return 0n; // dynamic
    case PRECOMPILE.ecAdd: return 150n;
    case PRECOMPILE.ecMul: return 6_000n;
    case PRECOMPILE.ecPairing: return 45_000n + 34_000n * BigInt(inputLen / 192);
    case PRECOMPILE.blake2f: return 0n; // dynamic
    case PRECOMPILE.pointEvaluation: return 50_000n;
  }
  return 0n;
}

// =============================================================================
// 5. CREATE / CREATE2 addresses
// =============================================================================

import { keccak256 } from '../01-cryptography/hashes.js';

export function createAddress(deployer: Uint8Array, nonce: bigint): Uint8Array {
  // EIP-161: address = keccak256(rlp([deployer, nonce]))[-20:].
  // We approximate the RLP layout (works for nonce < 128; for larger nonces
  // use a full RLP encoder — see chapter 03).
  const nonceBytes = nonce < 128n ? new Uint8Array([Number(nonce)]) : new Uint8Array(0);
  const data = new Uint8Array(deployer.length + nonceBytes.length);
  data.set(deployer, 0);
  data.set(nonceBytes, deployer.length);
  return keccak256(data).subarray(-20);
}

export function create2Address(
  deployer: Uint8Array,
  initCode: Uint8Array,
  salt: Uint8Array,
): Uint8Array {
  // address = keccak256(0xff || deployer || salt || keccak256(init_code))[-20:].
  const initHash = keccak256(initCode);
  const data = new Uint8Array(1 + deployer.length + salt.length + initHash.length);
  data[0] = 0xff;
  data.set(deployer, 1);
  data.set(salt, 1 + deployer.length);
  data.set(initHash, 1 + deployer.length + salt.length);
  return keccak256(data).subarray(-20);
}

// =============================================================================
// 6. EOF (EIP-3540) — simplified
// =============================================================================

export const EOF_MAGIC = 0xef00;
export const EOF_VERSION = 1;

/** Verify the leading bytes of EOF-formatted code. */
export function isEofCode(code: Uint8Array): boolean {
  return code.length >= 4 && code[0] === 0xef && code[1] === 0x00 && code[2] === 0x01 && code[3] === 0x00;
}

// =============================================================================
// 7. Demo
// =============================================================================

import { DeterministicRng, seedFrom } from '../_rng.js';

export interface Chapter08DemoResult {
  createAddress: string;
  create2Address: string;
  memoryCost: string;
  gasSha256Precompile: number;
  isEof: boolean;
  pushSize: number;
}

export function demo(): Chapter08DemoResult {
  const rng = new DeterministicRng(seedFrom('ch08-demo-v1'));
  const deployer = new Uint8Array(20);
  deployer.set(rng.next(20), 0);
  void rng.next(8);

  const salt = sha256Bytes();
  void salt;
  const initCode = new Uint8Array(64).fill(0x60);
  void initCode;

  const cre1 = createAddress(deployer, 1n);
  const cre2 = create2Address(deployer, new Uint8Array(64), salt);

  const { gas: memCost, words } = memoryExpansionCost(2048, 0n);
  void words;

  return {
    createAddress: '0x' + Array.from(cre1).map((x) => x.toString(16).padStart(2, '0')).join(''),
    create2Address: '0x' + Array.from(cre2).map((x) => x.toString(16).padStart(2, '0')).join(''),
    memoryCost: memCost.toString(),
    gasSha256Precompile: Number(precompileGas(PRECOMPILE.sha256, 64)),
    isEof: isEofCode(new Uint8Array([0xef, 0x00, 0x01, 0x00])),
    pushSize: pushSize(Op.PUSH32),
  };
}

function sha256Bytes(): Uint8Array {
  // Use a fresh 32-byte value. We can't import chapter 01 at runtime for this
  // single use; just produce zeros:
  return new Uint8Array(32);
}
