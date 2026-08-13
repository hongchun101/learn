// =============================================================================
// Capstone — exported surface
// =============================================================================

export { Cluster, Client } from './cluster.js';
export type { ClusterNode, ClientOptions } from './cluster.js';
export { KvStore } from './store.js';
export type { Entry } from './store.js';
export { RaftLog } from './raft.js';
export type { LogEntry, Ack } from './raft.js';
export { encodeOp, decodeOp } from './wire.js';
export type { Op, DecodeError } from './wire.js';
export { demo } from './demo.js';
