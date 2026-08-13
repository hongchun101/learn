// =============================================================================
// Capstone — Key-value store surface (chapter 11)
// =============================================================================
// A trivial in-memory key-value store with per-entry version stored alongside
// the value. Real replicated systems use Raft + WAL + snapshots; the capstone
// uses an in-memory map so the tests stay fast and deterministic.
//
// The version is an HLC-style (phys, logical) pair stored as a single
// monotonic number — the cluster's `clientTs` — so MVCC tie-breaking is
// deterministic.
// =============================================================================

export interface Entry {
  value: Uint8Array;
  ts: number;
  idempotencyKey: Uint8Array;
}

export class KvStore {
  private readonly data = new Map<string, Entry>();

  size(): number {
    return this.data.size;
  }

  get(key: string): Entry | undefined {
    return this.data.get(key);
  }

  put(key: string, entry: Entry): boolean {
    const existing = this.data.get(key);
    if (existing) {
      if (entry.ts < existing.ts) return false;
      if (entry.ts === existing.ts && bytesKey(entry.idempotencyKey) < bytesKey(existing.idempotencyKey)) {
        return false;
      }
    }
    this.data.set(key, entry);
    return true;
  }

  delete(key: string): boolean {
    return this.data.delete(key);
  }

  keys(): string[] {
    return [...this.data.keys()];
  }
}

function bytesKey(b: Uint8Array): string {
  let out = '';
  for (const x of b) out += x.toString(16).padStart(2, '0');
  return out;
}
