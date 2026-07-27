# 第 4 章 CRUD 基本操作

## 本章目标

学完本章,你能:

- 创建一个 index 并指定 mapping。
- 用 REST API 做 **增 / 删 / 改 / 查** 文档。
- 用 `_bulk` 做批量写入。
- 理解 ES 的乐观并发控制(`_version` / `if_seq_no` / `if_primary_term`)。

---

## 4.1 HTTP 速记

| 方法 | 用途 | 幂等 |
| --- | --- | --- |
| GET | 查询 | 是 |
| POST | 创建 / 查询(带 body) | 否 |
| PUT | 创建 / 全量替换 | 是 |
| DELETE | 删除 | 是 |
| HEAD | 探活 | 是 |

> 在 ES 中 `POST` 和 `PUT` 都能创建文档,但语义不同:`PUT /index/_doc/id` 是"用 id 写入";`POST /index/_doc` 是"自动生成 id 写入"。

---

## 4.2 准备工作

启动 ES + Kibana,进入 Dev Tools,以下示例可直接粘进去执行。

```
# 删除一个已存在的索引(避免重复)
DELETE /books
```

---

## 4.3 创建索引与 mapping

### 4.3.1 最简创建

```
PUT /books
{
  "settings": { "number_of_shards": 1, "number_of_replicas": 0 },
  "mappings": {
    "properties": {
      "title":   { "type": "text" },
      "author":  { "type": "keyword" },
      "price":   { "type": "double" },
      "pubdate": { "type": "date" },
      "tags":    { "type": "keyword" }
    }
  }
}
```

各字段类型说明:

- `text`:会被分词,可全文搜索。
- `keyword`:不分词,适合精确匹配、聚合、排序。
- `double`、`date`:数值 / 时间。

### 4.3.2 动态映射(dynamic mapping)

如果没显式建索引,ES 会"猜":字符串默认当 `text` + `keyword`(`text` 加 `.keyword` 子字段)。

```
POST /logs/_doc/1
{ "level": "INFO", "msg": "hello world" }
```

GET `/logs/_mapping` 你会看到 ES 自动推断出 `text` + `keyword` 多字段。

> 生产强烈建议显式 mapping,避免字符串变 `text` 后做精确匹配失败。

---

## 4.4 文档 CRUD

### 4.4.1 新增:PUT 指定 id

```
PUT /books/_doc/b001
{
  "title":   "深入理解 Elasticsearch",
  "author":  "张三",
  "price":   89.0,
  "pubdate": "2024-01-15",
  "tags":    ["elasticsearch", "search"]
}
```

响应:

```json
{
  "_index": "books",
  "_id": "b001",
  "_version": 1,
  "result": "created",
  "_shards": { "total": 2, "successful": 1, "failed": 0 }
}
```

> 注意:ES 的响应是 `_shards` 全部 200 才算成功,否则部分失败也算整体失败。

### 4.4.2 新增:POST 自动生成 id

```
POST /books/_doc
{
  "title":   "Effective Java",
  "author":  "Joshua Bloch",
  "price":   99.0,
  "pubdate": "2018-01-01",
  "tags":    ["java", "best-practice"]
}
```

### 4.4.3 局部更新

```
POST /books/_update/b001
{
  "doc": {
    "price": 79.0
  }
}
```

> 局部更新内部是"读取 + 替换"流程,比"全量 PUT"开销略大(并发会触发 retry)。

### 4.4.4 全量替换(PUT 覆盖)

```
PUT /books/_doc/b001
{
  "title":   "深入理解 Elasticsearch (第 2 版)",
  "author":  "张三",
  "price":   99.0,
  "pubdate": "2024-06-01",
  "tags":    ["elasticsearch", "search", "v2"]
}
```

> 全量替换会清空未提供的字段,务必传完整。

### 4.4.5 删除

```
DELETE /books/_doc/b001
```

---

## 4.5 查询

### 4.5.1 按 id 取

```
GET /books/_doc/b001
```

### 4.5.2 全量(慎用)

```
GET /books/_search
{
  "query": { "match_all": {} }
}
```

### 4.5.3 match 全文搜索

```
GET /books/_search
{
  "query": {
    "match": { "title": "elasticsearch" }
  }
}
```

> `match` 在 `text` 字段上会分词。多个词用 `match` 走的是 OR 行为(默认)。

### 4.5.4 term 精确匹配

```
GET /books/_search
{
  "query": {
    "term": { "author": "张三" }
  }
}
```

> `term` 不分词;要匹配 `text` 字段,通常要用 `.keyword` 子字段。

### 4.5.5 bool 组合查询

```
GET /books/_search
{
  "query": {
    "bool": {
      "must":   [{ "match": { "title":   "elasticsearch" } }],
      "filter": [{ "term":  { "author":  "张三" } }],
      "must_not": [{ "term": { "tags": "deprecated" } }],
      "should":  [{ "match": { "title": "search" } }]
    }
  }
}
```

`must` 参与打分;`filter` 不打分,只是过滤(可缓存);`should` 在没 `must` 时至少要匹配 1 个。

### 4.5.6 范围查询

```
GET /books/_search
{
  "query": {
    "range": {
      "price": { "gte": 50, "lte": 100 }
    }
  }
}
```

### 4.5.7 排序 / 分页 / 截断字段

```
GET /books/_search
{
  "from": 0,
  "size": 10,
  "_source": ["title", "price"],
  "sort": [{ "pubdate": "desc" }],
  "query": { "match_all": {} }
}
```

> 深分页(`from + size` 超过 10000)会报错,需要用 `search_after` 或 PIT。详见 [第 7 章](../01-进阶篇/07-搜索与Query-DSL.md)。

---

## 4.6 批量操作 `_bulk`

> 单条写入开销大,生产必用 `_bulk`。

```
POST /_bulk
{ "index": { "_index": "books", "_id": "b002" } }
{ "title": "Kubernetes 权威指南", "author": "李四", "price": 119, "pubdate": "2023-09-01", "tags": ["k8s"] }
{ "index": { "_index": "books", "_id": "b003" } }
{ "title": "Elasticsearch 实战", "author": "王五", "price": 89, "pubdate": "2022-05-01", "tags": ["es"] }
{ "delete": { "_index": "books", "_id": "b001" } }
{ "update": { "_index": "books", "_id": "b002" } }
{ "doc": { "price": 99 } }
```

注意:

- **两行为一组**:一行 metadata + 一行 payload(只有 `delete` 是一行)。
- 整体不一定原子:每个子项独立成功/失败。
- 推荐批次大小 5~15 MB,过大反而 OOM。

### 4.6.1 通过 curl 做 bulk

```bash
curl -H "Content-Type: application/x-ndjson" -u elastic:es123456 \
  -XPOST http://localhost:9200/_bulk --data-binary @bulk.ndjson
```

---

## 4.7 乐观并发控制(乐观锁)

ES 通过 `_seq_no` + `_primary_term` 实现乐观锁:

```
POST /books/_update/b001?if_seq_no=0&if_primary_term=1
{ "doc": { "price": 79 } }
```

- `if_seq_no` 不匹配 → 返回 409 冲突。
- 客户端捕获后决定重试或回滚。

> `_version` 是从 7.x 起 deprecated,推荐 `if_seq_no` / `if_primary_term`。

---

## 4.8 文档元数据

每个文档都有以下元数据字段:

| 字段 | 含义 |
| --- | --- |
| `_index` | 所在索引 |
| `_id` | 文档 id |
| `_version` | 版本(自增,7.x 起 deprecated) |
| `_seq_no` | 顺序号(乐观锁) |
| `_primary_term` | 主任期(乐观锁) |
| `_source` | 原始 JSON |
| `_score` | 相关性分(搜索时) |

> 想禁用 `_source` 节省存储,改 mapping 的 `_source: { enabled: false }`,但失去 update / reindex 能力。

---

## 4.9 常用辅助 API

| API | 用途 |
| --- | --- |
| `GET /_cat/indices?v` | 看所有索引 |
| `GET /_cat/shards?v` | 看分片分布 |
| `GET /_cat/nodes?v` | 看节点 |
| `GET /books/_count` | 文档计数 |
| `GET /books/_mapping` | 看 mapping |
| `GET /books/_settings` | 看设置 |
| `POST /books/_refresh` | 强制 refresh |
| `POST /books/_flush` | 强制 flush |
| `GET /books/_search?q=*` | URL 简写搜索 |
| `HEAD /books/_doc/b001` | 是否存在 |

---

## 4.10 错误码速查

| 状态码 | 含义 | 常见 |
| --- | --- | --- |
| 200 | OK | 大部分成功 |
| 201 | Created | 创建成功 |
| 400 | Bad Request | DSL 写错 |
| 401 | Unauthorized | 没登录 |
| 403 | Forbidden | 权限不足 |
| 404 | Not Found | 索引/文档不存在 |
| 409 | Conflict | 乐观锁冲突 |
| 429 | Too Many Requests | 限流 |
| 500 | Internal Error | 服务内部错误 |
| 503 | Service Unavailable | 集群 red |

---

## 4.11 要点速查

- PUT/POST 都能写;PUT 必带 id 且可覆盖,POST 可自动生成 id。
- `text` 字段全文搜索;`keyword` 字段精确匹配 / 聚合。
- 局部更新用 `_update`;全量替换用 `PUT /_doc`。
- 生产必用 `_bulk`;批次 5~15 MB。
- 乐观锁用 `if_seq_no + if_primary_term`。
- `_source` 默认存原始 JSON,关掉会失去 update 能力。

---

## 4.12 实操练习

1. 创建 `books` 索引,显式指定 5 个字段。
2. 写入 5 条数据,其中 2 条走 `PUT _doc`,1 条走 `POST _doc`。
3. 用 `_bulk` 一次性写入 3 条,再用 `_bulk` 删 1 条、改 1 条。
4. 触发一次 `if_seq_no` 冲突:两个 client 同时 `_update`,看谁会 409。

---

## 4.13 思考题

1. 局部更新比全量覆盖贵,但生产为什么还是常用?
2. 批量请求中混入失败项,为什么需要自己重试?ES 不会自动滚?
3. 删除文档后磁盘会立刻释放吗?为什么?
4. 为什么不推荐把日期存为字符串,而要存 `date` 类型?

---

进入[第 5 章 Mapping 与字段类型详解 →](../01-进阶篇/05-Mapping与字段类型详解.md)
