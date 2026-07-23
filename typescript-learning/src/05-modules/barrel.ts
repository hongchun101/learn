/**
 * Barrel：再导出此文件夹的公共 API。
 * 特意保持精简——再导出整个文件夹是一种代码异味。
 */

export { assertNever, isUser, ok, err, unwrap, map, area } from '../01-basics/index.js';
export type { Result, Shape, User, Event } from '../01-basics/index.js';
