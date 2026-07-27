# FAQ 与常见坑

> 80% 的生产问题都来自下面这些坑。每个坑都有"原因 / 解决"两部分。

---

## 一、基础篇

### F1. 启动报错:`max virtual memory areas vm.max_map_count is too low`

**原因**:ES 用 mmap 加载 segment,需要大虚拟内存映射数。
**解决**:

```bash
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

---

### F2. 单节点集群一直是 yellow?

**原因**:副本未分配(单节点无法放副本)。
**解决**:

```
PUT /index/_settings
{ "index.number_of_replicas": 0 }
```

> 或者加节点,让副本分配出去。

---

### F3. 8.x 启动后一直要账号密码?

**原因**:8.x 默认开启 Security。
**解决**:

- 登录用 `elastic` / 启动时生成的密码。
- 重置:`./bin/elasticsearch-reset-password -u elastic -i`。
- 学习用:在 `elasticsearch.yml` 配 `xpack.security.enabled: false`(不推荐)。

---

### F4. 写入文档后立刻搜不到?

**原因**:refresh 延迟,默认 1s。
**解决**:

- 等 1s。
- `POST /index/_refresh` 强制。
- 写场景允许大延迟:`PUT /index/_settings {"index.refresh_interval": "30s"}`。

---

### F5. 创建索引报错"unknown setting index.xxx"?

**原因**:8.x 移除了 `index.mapping.types`,一些历史 setting 不再支持。
**解决**:按当前版本文档检查 setting 写法。

---

## 二、Mapping / 字段

### F6. term query 匹配不到 text 字段?

**原因**:text 已被分词,term 不分词。
**解决**:

- 用 `.keyword` 子字段。
- 或 mapping 时把字段直接定为 `keyword`。

---

### F7. 想加字段,但 ES 自动加"text + keyword"多字段?

**原因**:`dynamic: true`(默认)时,字符串自动加 text + keyword。
**解决**:

- mapping 时显式定义 `type: keyword`。
- 或用 `dynamic_templates` 控制。
- 或 `dynamic: strict` 直接禁。

---

### F8. 改 mapping(改类型 / 改分词器)无效?

**原因**:已写入文档的 mapping 不可改。
**解决**:**reindex 到新 index** + 别名切换。

---

### F9. text 字段聚合 OOM?

**原因**:text 默认无 doc_values,聚合触发 fielddata,内存爆。
**解决**:

- 用 `.keyword` 子字段。
- 或在 mapping 中加 `fielddata: false`(禁聚合)。
- 集群级限:`indices.fielddata.cache.size`。

---

### F10. 数字字段排序错乱 / 排序慢?

**原因**:用了 text 字段排序,或 doc_values 未启用。
**解决**:

- 字段类型用 `long` / `double`。
- 排序字段加 `"doc_values": true`(默认开)。
- 或用 `fielddata`(慎用)。

---

### F11. nested 字段查不到?

**原因**:nested 数组要包在 `nested` query 里。
**解决**:

```
"query": {
  "nested": {
    "path": "specs",
    "query": { "bool": { ... } }
  }
}
```

---

## 三、性能 / 调优

### F12. 写入很慢?

**原因**:

- 副本数太多。
- refresh 太频繁。
- bulk 批次太小 / 太大。
- disk IO 满。
- merge 阻塞。

**解决**:

- 写时副本 0。
- `refresh_interval: 30s+`。
- bulk 5~15MB。
- 改 SSD。
- 调 `index.merge.scheduler.max_thread_count`。

---

### F13. 搜索很慢?

**原因**:

- 大索引无范围限制。
- 深分页。
- highlight 复杂。
- fielddata 爆。
- profile 查阶段:query 慢 / fetch 慢。

**解决**:

- 加 `range` filter。
- `search_after`。
- 减少 highlight 字段。
- 用 `.keyword` 替 text 聚合。
- `profile=true` 查瓶颈。

---

### F14. JVM 持续高占用 / GC 频繁?

**原因**:

- heap 太小。
- fielddata 爆。
- 大聚合。

**解决**:

- 调大 Xmx(注意 32G 上限)。
- 关 fielddata(用 `.keyword`)。
- 拆分聚合(用 composite / 限制 size)。

---

### F15. 磁盘很快写满?

**原因**:

- ILM 没配 / 配错。
- rollover 条件没满足。
- 索引没冷 / 没删。
- 没设 `index.merge.policy` 控 segment 数。

**解决**:

- 检查 `_ilm/explain`。
- 加 rollover 条件。
- 改 searchable snapshot。
- 加磁盘告警(85%)。

---

## 四、查询

### F16. `range` 报错 "Text fields are not optimised for operations that require per-document field data"?

**原因**:在 text 字段上做 `range` / 排序 / 聚合。
**解决**:字段类型改 keyword / numeric / date。

---

### F17. 高亮不显示?

**原因**:

- 字段没分词 / 没匹配。
- 用了 `unified` 但没 position 信息。
- 高亮字段被 `index_options: docs`(没 position)。

**解决**:

- 用 `match` / `term` 命中。
- `unified` 需要 `index_options: positions`(默认)。
- 改 `highlighter: fvh` 需 `term_vector: with_positions_offsets`。

---

### F18. suggest 没结果?

**原因**:

- 没在 mapping 配 `completion` / `search_as_you_type`。
- 输入与字段不匹配(中文没分词)。
- 输入是空 / 太长。

**解决**:

- 加 `completion` 字段。
- 输入先 `_analyze` 看分词。
- completion 字段有 `analyzer` 限制。

---

### F19. 聚合不精确?

**原因**:`terms` shard_size 不足。
**解决**:

- 调大 `shard_size`(2x size)。
- `composite` 全分桶。
- `show_term_doc_count_error: true` 看误差。

---

### F20. 深分页报错 "Result window is too large"?

**原因**:`from + size > index.max_result_window`(默认 10000)。
**解决**:

- 改 `search_after`。
- 调大 `max_result_window`(不推荐,大值会让 deep paging 慢)。
- 用 PIT。

---

## 五、集群 / 部署

### F21. 集群 red,unassigned 一直恢复不了?

**原因**:

- 磁盘满。
- 节点数 < 副本数。
- `cluster.routing.allocation.enable: none`。
- 节点 `version` 不兼容。

**解决**:`GET /_cluster/allocation/explain` 看具体原因,逐项修。

---

### F22. 节点频繁掉线?

**原因**:

- GC 长时间 STW。
- 磁盘 IO 满 → 文件系统 hang。
- OOM 被杀。
- 网络抖动。

**解决**:

- 调小 heap / 优化 GC。
- 用 SSD,避免 IO 满。
- 监控 `/_nodes/hot_threads`。
- 检查 `journalctl` / `dmesg`。

---

### F23. 集群状态:`master not discovered`?

**原因**:

- `discovery.seed_hosts` 没配。
- 防火墙挡了 9300。
- 节点 hostname 解析失败。

**解决**:

- 显式配 seed_hosts。
- 防火墙开 9300。
- hosts 加 hostname。

---

### F24. 跨集群搜索报 "unable to connect to remote cluster"?

**原因**:

- `cluster.remote.x.seeds` 没配。
- 9300 端口不通。
- TLS 不一致。

**解决**:

```
GET /_remote/info
```

看 connected 状态,排查 transport。

---

### F25. 节点加入后一直 initialising?

**原因**:

- shard 太大,recovery 慢。
- disk IO 慢。
- 节点 CPU / mem 吃满。

**解决**:

- `GET /<index>/_recovery` 看进度。
- 调大 `indices.recovery.max_bytes_per_sec`。
- 单 shard 控制在 10~50GB。

---

## 六、安全

### F26. 8.x 启动后 elastic 密码忘了?

**解决**:

```bash
./bin/elasticsearch-reset-password -u elastic -i
```

> 之前生成 elastic 用户的密码会失效,重置后用新密码。

---

### F27. 跨节点 TLS 错误?

**原因**:

- CA 不一致。
- 证书过期。
- hostname 不匹配。

**解决**:

- 重新生成证书,统一 CA 签发。
- 用 `verification_mode: certificate` 而非 `full`(debug)。
- 看 transport SSL 错误日志。

---

### F28. API Key 报 401?

**原因**:

- Key 过期 / 吊销。
- `Authorization` header 格式错。
- 角色权限不够。

**解决**:

- 看返回的 `WWW-Authenticate`。
- 用 base64 重新编码 id:api_key。
- 重建 Key。

---

## 七、写入 / 索引模板

### F29. 创建索引时 mapping 没生效?

**原因**:

- 索引名不在 `index_patterns`。
- 多个模板竞争,优先级选错。
- 已有索引的 mapping 不能改。

**解决**:

- 看 `_index_template`,确认 match。
- 用 component 模板,显式 composed_of。
- 改 mapping → reindex。

---

### F30. rollover 不触发?

**原因**:条件没满足(看 `/_ilm/explain`)。

**解决**:

- 调小 `max_age` / `max_size`。
- 检查别名 `is_write_index: true`。
- 确认 `index.lifecycle.name` 设置了。

---

### F31. ILM 卡在某个 phase?

**原因**:

- allocate 条件不满足(没有 `box_type: warm` 的节点)。
- shrink 目标分片数不匹配。
- 节点版本低。

**解决**:

- `/_ilm/explain` 看详情。
- 配对应节点。
- 手动 `POST /<idx>/_ilm/retry`。

---

## 八、搜索质量

### F32. 搜"Java"出来很多 "javascript"?

**原因**:standard 分词,`Java` 命中 `java`。
**解决**:

- 同义词 / 词形还原(stemmer)过滤。
- 自定义分词。
- 加 `min_should_match` 提高精度。

---

### F33. 拼写错误搜不到?

**原因**:默认没拼写纠错。
**解决**:加 `term suggester` / `phrase suggester`,结合 `_analyze` 看候选。

---

### F34. 多义词(苹果手机 / 苹果水果)乱匹配?

**原因**:上下文缺。
**解决**:

- 加 `category` 等 filter 限定上下文。
- 同义词按类目维护。
- 用 vector + 文本混合召回。

---

## 九、Elasticsearch 8.x 升级相关

### F35. 7.x → 8.x 报错 `index has current version x`?

**原因**:跨大版本要中间版本过渡。
**解决**:先升 7.17,再升 8.x。

---

### F36. 8.x 默认 HTTPS,客户端报错?

**原因**:HTTP 客户端要 SSL。
**解决**:

- Java 客户端:`setSSLContext`。
- curl:`-k`(测试)或加 `--cacert`。
- 配 `verification_mode: full` + 正确 CA。

---

### F37. 8.x 数据流不能 update?

**原因**:Data Stream 强制 append-only。
**解决**:

- 用 update_by_query 改。
- 改完想正常 update,先 unfollow + 普通 index。

---

## 十、生产级 FAQ

### F38. 8.x 启动后,磁盘 IO 突然变高?

**原因**:

- merge 集中。
- 大量 refresh。
- segment 太多。

**解决**:

- `/_cat/segments?v&h=index,segment.count`。
- 调 `index.merge.scheduler.max_thread_count`。
- 大批量写完做一次 `forcemerge`。

---

### F39. 集群慢但 CPU 内存正常?

**原因**:

- disk IO 高(`iostat`)。
- 跨节点网络(RPC)。
- long GC(看 `gc.log`)。

**解决**:

- 上 SSD。
- 节点间 10G。
- heap 不超 32G + G1GC。

---

### F40. 一个 query 之前快,现在慢?

**原因**:

- 索引量增加(没规划好 shard)。
- 长期没 merge。
- mapping 变化(加了 nested / dense_vector)。
- 缓存失效(节点重启 / 重新分配)。

**解决**:

- 监控 latency 趋势,看是不是慢的累积。
- `forcemerge` 控 segment。
- 排查 mapping 变化。
- 重启不影响磁盘(segment 在磁盘)。

---

## 十一、客户端相关

### F41. Java High Level Client 8.x 没了?

**原因**:8.x 推 **Java API Client**(`elasticsearch-java`),替代 High Level Client。
**解决**:用 `co.elastic.clients:elasticsearch-java:8.13.4`。

---

### F42. Spring Data Elasticsearch 不兼容 8.x?

**原因**:Spring Data ES 5.x 对应 ES 8.x;旧版不兼容。
**解决**:用 Spring Data ES 5.x 或 Spring Boot 3.x。

---

### F43. Kibana 显示 "index pattern does not contain any time field"?

**原因**:index 没 `date` 字段,或没选 time field。
**解决**:

- 在 Kibana 选 index pattern 时指定 `@timestamp`。
- mapping 加 `date` 字段。

---

## 十二、设计相关

### F44. 选 ES 替代 MySQL 做业务主库?

**结论**:**不要**。
- ES 无 ACID 事务。
- 写入性能不如 MySQL。
- join 弱。
- 不擅长事务性业务。

> 业务主库用 MySQL / PG,搜索 / 分析用 ES。两者同步。

---

### F45. 商品搜索要不要用 routing?

**判断**:

- 多租户 / 大品牌:**用**(按 tenant_id / brand_id routing,查询只走 1 shard)。
- 单业务:**不用**(避免热点)。

---

### F46. ES 当 OLAP 用合适吗?

**判断**:

- 简单聚合 + 全文:**合适**。
- 超大宽表 + 高频聚合:**ClickHouse / Doris 更合适**。

---

### F47. 选 5 个主分片还是 20 个?

**经验**:

- 数据 1TB / 单 shard 30GB → 33 个主分片。
- 节点数 = 主分片数 × 1~2 倍(预留副本)。
- 太少 → 单 shard 大,影响恢复 / merge。
- 太多 → 资源浪费,查询合并成本高。

---

### F48. 多久做一次 forcemerge?

**经验**:

- 写多场景,segment 数超 5 → 触发。
- 写后 / rollover 后 / shrink 后,forcemerge 一次,合成 1~2 个 segment。
- 不频繁(默认后台 merge 已够)。

---

### F49. 业务上,要不要在 ES 上做 join?

**结论**:**不要**。
- ES join 性能差(类似 `join` 字段)。
- 业务上做宽表(冗余字段)比 join 好。
- 实在要 join:用 application-side join(查两次)或 ES SQL(性能有限)。

---

### F50. ES 里的"事务日志"在哪?能改吗?

**位置**:`<data_path>/indices/<index_uuid>/<shard>/translog/`。
**改**:

```
PUT /index/_settings
{ "index.translog.durability": "async" }
```

> 不推荐改,默认是 `request` 模式,保证 ACID-D 持久性。

---

## 写在最后

ES 的坑大致归类:

1. **分词**:中文必须 IK,standard 不行。
2. **聚合 / 排序**:text 不行,用 `.keyword`。
3. **mapping**:生产 `dynamic: strict`。
4. **shard**:10~50GB,数量按数据量估算。
5. **JVM**:32G 上限,关 swap,G1GC。
6. **ILM**:热温冷分层 + 滚动。
7. **写入**:bulk 5~15MB,refresh 30s+,副本 0 写。
8. **查询**:filter 优先,search_after 替深分页。
9. **集群**:3 master,角色分离,慢日志。
10. **安全**:8.x 默认开,API Key 服务间调用。

> **记住一句话:一切都是分片,分片是 Lucene index,Lucene 是倒排索引**。
> 理解了底层,所有 API 都是顺理成章的。

教程完结!

回到 [README 索引 →](../README.md)
