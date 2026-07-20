import { bech32, bech32m } from '@scure/base';

export function encodeBech32(prefix: string, data5bit: Uint8Array, versionByte: number): string {
  return bech32.encode(prefix, [versionByte, ...data5bit]);
}

export function decodeBech32(address: string): { prefix: string; words: Uint8Array } {
  const { prefix, words } = bech32.decode(address as `${string}1${string}`);
  return { prefix, words: Uint8Array.from(words) };
}

export { bech32, bech32m };
