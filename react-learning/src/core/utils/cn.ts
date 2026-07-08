/**
 * `cn` — class-name composer. Thin wrapper around `clsx` that adds the
 * project's import alias to the auto-import list and keeps callsites terse.
 */
import clsx, { type ClassValue } from 'clsx';
export const cn = (...inputs: ClassValue[]): string => clsx(inputs);
