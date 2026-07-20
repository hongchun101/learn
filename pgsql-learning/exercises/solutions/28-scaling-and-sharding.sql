-- Solutions 28
\echo --- Route SELECTs to replica, writes to primary.
\echo --- Reason to NOT shard:
\echo --- 1) Cross-shard JOINs become impossible or painful
\echo --- 2) Cross-shard transactions impossible without 2PC
\echo --- 3) Operational complexity: schema migrations, replica per shard
\echo --- 4) Few workloads actually need it; vertical scaling first.
