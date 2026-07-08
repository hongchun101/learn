/**
 * Barrel: re-exports the public surface of this folder.
 * Kept tiny on purpose — re-exporting the whole folder is a smell.
 */

export { assertNever, isUser, ok, err, unwrap, map, area } from '../01-basics/index.js';
export type { Result, Shape, User, Event } from '../01-basics/index.js';
