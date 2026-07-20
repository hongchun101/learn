# 03 · Test inventory

Every test that ships with the curriculum. Each row is a *contract*:
the test was chosen to break one plausible bug, not just exercise
plumbing.

| Module | Test file | Test name | Asserts |
|--------|-----------|-----------|---------|
| 01 | tests/modules/test_module_01_storage.py | test_slotted_insert_read | Row encodes/decodes round-trip |
| 01 | | test_slotted_delete_marks_slot | Delete produces zero-length slot |
| 01 | | test_bptree_basic | 16 inserts, get(7) returns slot 7 |
| 01 | | test_bptree_range | range_get returns inclusive [3, 9] |
| 01 | | test_sstable_get | SSTable.get finds present, returns None for absent |
| 01 | | test_lsm_roundtrip | LSM.get returns put value |
| 01 | | test_lsm_delete_isolation | Delete hides value immediately |
| 01 | | test_rowstore_contract | Put/get/delete for the test storage |
| 02 | tests/modules/test_module_02_wal.py | test_log_record_roundtrip | UPDATE round-trips via encode/decode |
| 02 | | test_log_record_tombstone | Tombstones survive encode/decode (None value) |
| 02 | | test_recovery_replays_committed_only | Recover puts all UPDATE of a committed txn |
| 02 | | test_recovery_skips_aborted | Aborted UPDATEs are not replayed |
| 03 | tests/modules/test_module_03_mvcc.py | test_mvcc_snapshot_read | Newest committed value visible at later snapshot |
| 03 | | test_mvcc_aborted_write_invisible | Aborted write does not exist |
| 03 | | test_mvcc_write_write_conflict | Second commit sees other txn's pending → raise |
| 03 | | test_mvcc_serial_snapshot | Each snapshot sees the value current at its read_ts |
| 03 | | test_mvcc_gc | GC does not destroy the current version |
| 04 | tests/modules/test_module_04_parser.py | test_select_parses | Column list, FROM, WHERE parse |
| 04 | | test_insert_parses | INSERT VALUES (a,b),(c,d) yields 2 rows |
| 04 | | test_create_table_parses | CREATE TABLE columns parsed |
| 04 | | test_group_by_having_order_by_limit | All clauses parsed |
| 04 | | test_chapter_demo_runs | run_demo returns dict with COLUMN-kind columns |
| 05 | tests/modules/test_module_05_planner.py | test_select_plan_shape | SCAN→FILTER→PROJECT tree |
| 05 | | test_create_plan | CREATE_TABLE op |
| 05 | | test_pushdown_noop_for_optimal | Predicate pushdown is idempotent |
| 05 | | test_simplify_tautology | `WHERE 1=1` simplifies to no predicate |
| 06 | tests/modules/test_module_06_executor.py | test_scan_returns_rows | Scan yields every row |
| 06 | | test_filter_selects_rows | WHERE price > 10 |
| 06 | | test_sort_orders_rows | ORDER BY DESC |
| 06 | | test_limit_truncates | LIMIT 3 |
| 06 | | test_chapter_demo_runs | run_demo returns rows |
| 07 | tests/modules/test_module_07_joins.py | test_chapter_demo_runs | All three joins return rows |
| 08 | tests/modules/test_module_08_cbo.py | test_histogram_lt_monotone | Selectivity monotone |
| 08 | | test_estimate_uniform | `col = c` selectivity = total/distinct |
| 08 | | test_cost_model_dominates_scan | Hash cost < NL cost for typical inputs |
| 08 | | test_join_ordering_picks_cheapest | DP emits at least one order |
| 08 | | test_chapter_runs | run_demo returns best_order |
| 09-18 | tests/modules/test_module_09_to_18.py | test_09_secondary_index | Lookup returns the right positions |
| 09 | | test_09_covering_index | Covering lookup returns (key, extras) |
| 09 | | test_09_zone_map | Prune drops disjoint zones |
| 09 | | test_09_bloom | Bloom holds, may produce false positives |
| 10 | | test_10_vectorized | vectorized_filter matches per-row |
| 11 | | test_11_parallel_map | parallel_map preserves order |
| 11 | | test_11_exchange | Exchange round-trips rows |
| 12 | | test_12_consistent_hash | assign_shard returns a member of shards |
| 12 | | test_12_vector_clock | happens_before is a partial order |
| 12 | | test_12_2pc | 2PC commits on unanimous yes |
| 12 | | test_12_raft | Raft cluster: leader + committed log |
| 13 | | test_13_rle | RLE round-trips |
| 13 | | test_13_dictionary | Dictionary collapses repeats |
| 13 | | test_13_delta | Delta encode/decode round-trips |
| 13 | | test_13_bitset_pack | Boolean packed densely |
| 14 | | test_14_groupby | SUM and COUNT per group |
| 14 | | test_14_topk | topk orders by frequency |
| 14 | | test_14_hll | HLL within ±15% |
| 14 | | test_14_tdigest | t-digest within ±10% |
| 15 | | test_15_compile_predicate | Compiled fn behaves correctly |
| 15 | | test_15_chapter | run_demo returns bytecode |
| 16 | | test_16_explain | Explain produces "SCAN" line |
| 16 | | test_16_replay | Replay serializes to JSON |
| 17 | | test_17_wire_roundtrip | Wire frame round-trips |
| 17 | | test_17_chapter | run_demo returns HELLO frame |
| 18 | | test_18_capstone_smoke | All 8 capstone queries return rows |
| 18 | | test_18_wire_demo | Wire demo produces frames |
| contracts | tests/contracts/__init__.py | test_storage_contract_demo | RowStore satisfies Storage |
| contracts | | test_parser_contract_demo | SqlParser produces Ast |
| contracts | | test_plan_contract_demo | Planner produces Operator tree |
| contracts | | test_executor_contract_demo | Executor opens/closes |
| contracts | | test_snapshot_contract_demo | MVTransaction has add_read/add_write |

**Total: 56 test functions. Each defends an observable contract.**

Run with:

```bash
pytest tests/ -v          # everything
pytest tests/modules -v  # per-module only
```
