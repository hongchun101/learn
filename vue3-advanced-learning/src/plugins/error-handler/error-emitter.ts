import { ref, type Ref } from 'vue';

export interface CapturedError {
  message: string;
  stack?: string;
  info?: string;
  timestamp: number;
  source: string;
}

const errors: Ref<CapturedError[]> = ref([]);
const listeners: Set<(e: CapturedError) => void> = new Set();

function capture(source: string, err: unknown, info?: string): void {
  const error: CapturedError = {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    info,
    timestamp: Date.now(),
    source,
  };
  errors.value.push(error);
  if (errors.value.length > 50) errors.value.shift();
  listeners.forEach((l) => l(error));
}

export const errorEmitter = {
  errors,
  capture,
  on(listener: (e: CapturedError) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  clear(): void {
    errors.value = [];
  },
};
