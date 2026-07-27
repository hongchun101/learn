# 第 7 章 搜索与 Query DSL

## 本章目标

学完本章,你能:

- 区分 **Query context** 与 **Filter context**。
- 熟练使用 **match / term / range / bool / multi_match** 等核心 query。
- 知道 multi_match 的 `type` 区别(best_fields / most_fields / cross_fields / phrase ...)。
- 用 **search_after / PIT** 做深分页。
- 理解 **highlight / suggest / collapse / post_filter** 等辅助能力。

---

## 7.1 两种 context

ES 把 query 分类成 **Query context** 和 **Filter context**:

- **Query context**:会算相关性 `_score`,控制"文档相关度"。
  - `match` / `query_string` / `bool.must` / `bool.should` ...
- **Filter context**:只判断"匹配 / 不匹配",不参与打分;可缓存,效率高。
  - `term` / `range` / `exists` / `bool.filter` ...

> **经验:能 filter 的就 filter,效率高很多。**

---

## 7.2 核心 query 类型

### 7.2.1 match_all

```
GET /books/_search
{ "query": { "match_all": {} } }
```

### 7.2.2 match

```
{ "match": { "title": "elasticsearch 入门" } }
```

- 默认 OR。
- 设置 operator:

```
{ "match": { "title": { "query": "elasticsearch 入门", "operator": "and" } } }
```

- 最小匹配:

```
{ "match": { "title": { "query": "elasticsearch 入门 教程", "minimum_should_match": "75%" } } }
```

### 7.2.3 multi_match

跨多字段搜:

```
{ "multi_match": {
    "query": "elasticsearch 教程",
    "fields": ["title^3", "tags", "comment"]
  } }
```

`^3` 是字段加权(影响打分)。

`type` 选项:

| type | 行为 | 适用场景 |
| --- | --- | --- |
| `best_fields`(默认) | 取单字段最高分 | 一篇内容主要落在一个字段 |
| `most_fields` | 多字段分数求和 | 同一文本被分到多字段 |
| `cross_fields` | 把多字段视作"一整段文本" | 字段相互补全(人名 / 姓 / 名) |
| `phrase` | 严格 phrase 匹配 | 精确短语 |
| `phrase_prefix` | 末尾前缀 | 补全 |
| `bool_prefix` | 末尾 token 当 prefix | 实时补全 |

### 7.2.4 term / terms

精确匹配,不分词:

```
{ "term":  { "author": "张三" } }
{ "terms": { "author": ["张三", "李四"] } }
```

> text 字段不可直接 term(已被分词),要么用 `.keyword`,要么先重 index。

### 7.2.5 range

```
{ "range": { "price": { "gte": 50, "lte": 100 } } }
{ "range": { "launched_at": { "gte": "2024-01-01" } } }
{ "range": { "launched_at": { "gte": "now-30d/d" } } }  // 日期运算
```

### 7.2.6 exists

字段存在:

```
{ "exists": { "field": "price" } }
```

> ES 7.x 起,空数组 `[]` 不算存在。

### 7.2.7 prefix / wildcard / regexp

- `prefix`:前缀匹配。
- `wildcard`:`*` 任意多,`?` 单个。
- `regexp`:正则。

> 性能差(底层是 scan)。**避免用通配符开头**(因为要扫所有 term)。

### 7.2.8 fuzzy

容错搜索("iphone" → "iphon"):

```
{ "fuzzy": { "title": { "value": "iphon", "fuzziness": "AUTO" } } }
```

> 模糊匹配影响性能,慎用于大索引。

### 7.2.9 ids

```
{ "ids": { "values": ["b001", "b002"] } }
```

---

## 7.3 bool 组合

```
{
  "query": {
    "bool": {
      "must":     [],   // 打分,影响 _score
      "filter":   [],   // 过滤,不打分
      "should":   [],   // 可选加分
      "must_not": []    // 反向
    }
  }
}
```

行为规则:

- `must` 全部满足,且加入打分。
- `filter` 全部满足,不加打分,可缓存。
- `should` 行为依赖上下文:
  - 同时有 `must`:`should` 加分,不强制。
  - 只有 `should`:**至少匹配 1 个**(`minimum_should_match` 默认 1)。
- `must_not` 全部不满足。

### 7.3.1 复杂示例

```
{
  "query": {
    "bool": {
      "must": [
        { "multi_match": { "query": "elasticsearch", "fields": ["title^2", "comment"] } }
      ],
      "filter": [
        { "term":  { "on_sale": true } },
        { "terms": { "category": ["book", "ebook"] } },
        { "range": { "price": { "gte": 0, "lte": 200 } } }
      ],
      "must_not": [
        { "term": { "tags": "deprecated" } }
      ],
      "should": [
        { "term": { "brand": "elasticsearch-official" } }
      ]
    }
  }
}
```

---

## 7.4 constant_score

当你不关心分数,只想要"快速过滤",把整个 query 包起来,`score: 1.0`:

```
{ "constant_score": { "filter": { "term": { "on_sale": true } } } }
```

---

## 7.5 dis_max

> 当 `multi_match` 跨多字段时,默认 `best_fields` 是 `dis_max`:
> 取单字段最高分(避免被低分字段拖累)。

```
{ "dis_max": {
    "queries": [
      { "term": { "title": "elasticsearch" } },
      { "term": { "comment": "elasticsearch" } }
    ],
    "tie_breaker": 0.3
  } }
```

`tie_breaker`:把次高分按 0.3 加到最高分上(避免信息丢失)。

---

## 7.6 function_score(自定义打分)

自定义分数函数(影响排序):

```
{
  "query": {
    "function_score": {
      "query": { "match": { "title": "elasticsearch" } },
      "functions": [
        { "filter": { "term": { "on_sale": true } }, "weight": 2 },
        { "field_value_factor": { "field": "popularity", "factor": 1.2, "modifier": "log1p", "missing": 0 } },
        { "gauss": { "launched_at": { "origin": "now", "scale": "30d", "decay": 0.5 } } }
      ],
      "score_mode": "sum",
      "boost_mode": "multiply"
    }
  }
}
```

- `score_mode`:多函数分数合并方式(sum / avg / max / min / first)。
- `boost_mode`:函数分与原 query 分结合方式(multiply / sum / replace / avg / max / min)。

> 排序可控的核心:搜索相关性 × 业务权重(新品 / 销量 / 评分)。

---

## 7.7 boosting(正负向加权)

提升 / 降权:

```
{ "boosting": {
    "positive": { "match": { "title": "elasticsearch" } },
    "negative": { "term":  { "category": "old" } },
    "negative_boost": 0.3
  } }
```

> 命中 negative 的不剔除,只是分数被降权(× 0.3)。

---

## 7.8 sort 排序

```
{
  "sort": [
    { "_score": "desc" },
    { "price":  "asc" },
    { "launched_at": { "order": "desc" } }
  ]
}
```

> 排序字段要有 `doc_values`(默认数值 / keyword / date 都有)。

### 7.8.1 字符串排序

`text` 字段无法直接排序,要么用 `.keyword` 子字段,要么在 mapping 中启用 `fielddata`(内存列存,慎用)。

---

## 7.9 source 过滤

```
{
  "_source": ["title", "price"],
  "query":   { "match_all": {} }
}
```

或排除:

```
{ "_source": { "excludes": ["comment"] } }
```

---

## 7.10 分页

### 7.10.1 浅分页

```
{ "from": 0, "size": 20, "query": { "match_all": {} } }
```

- `from + size` ≤ 10000(默认 `index.max_result_window`)。
- 深分页会导致每个 shard 都返回 `from + size` 条,内存与 CPU 都爆。

### 7.10.2 深分页:search_after

> 用上一页最后一条的 sort 值定位下一页。

第 1 页:

```
POST /books/_search
{
  "size": 20,
  "query": { "match_all": {} },
  "sort": [
    { "pubdate": "desc" },
    { "_id":    "asc" }
  ]
}
```

第 2 页:把上页最后一条的 `sort` 值传入:

```
POST /books/_search
{
  "size": 20,
  "query": { "match_all": {} },
  "search_after": ["2024-01-15T00:00:00Z", "b001"],
  "sort": [
    { "pubdate": "desc" },
    { "_id":    "asc" }
  ]
}
```

> 必须是 **稳定的 sort**(加 `_id` 作为 tie breaker)。

### 7.10.3 PIT(Point In Time)

PIT 把"搜索时的视图"锁定,避免边翻页边写导致漏数据:

```
POST /books/_pit?keep_alive=1m
{ "id": "...", "keep_alive": "1m" }   // 创建

POST /_search
{
  "size": 20,
  "query": { "match_all": {} },
  "pit": { "id": "...", "keep_alive": "1m" },
  "sort": [{ "pubdate": "desc" }]
}
```

DELETE `_pit` 释放。

---

## 7.11 highlight(高亮)

```
{
  "query": { "match": { "comment": "elasticsearch" } },
  "highlight": {
    "fields": {
      "comment": {
        "pre_tags":  ["<em>"],
        "post_tags": ["</em>"],
        "number_of_fragments": 3
      }
    }
  }
}
```

输出中多 `highlight` 字段,带 `<em>...</em>`。

> 内部需要重跑分词,成本高。生产用 **fast vector highlighter**(配置 `term_vector: with_positions_offsets`)或 **unified**(默认)。

---

## 7.12 suggesters(搜索建议)

### 7.12.1 term suggester(纠错)

```
{
  "suggest": {
    "my-suggestion": {
      "text": "elasticsaerch",
      "term": {
        "field": "title",
        "suggest_mode": "missing"
      }
    }
  }
}
```

### 7.12.2 completion suggester(自动补全)

```json
PUT /products
{
  "mappings": {
    "properties": {
      "name":        { "type": "keyword" },
      "suggest":     {
        "type": "completion",
        "analyzer": "ik_smart"
      }
    }
  }
}
```

```
POST /products/_search
{
  "_source": ["name"],
  "suggest": {
    "product-suggest": {
      "prefix": "el",
      "completion": { "field": "suggest" }
    }
  }
}
```

> completion 字段用 FST 存储,补全极快,但只能前缀。

### 7.12.3 search_as_you_type

```json
"suggest": { "type": "search_as_you_type" }
```

> 比 completion 灵活,可用在中间词匹配。

---

## 7.13 collapse(折叠)

按字段去重,只取每个值的 top N:

```
{
  "query":   { "match_all": {} },
  "collapse": { "field": "category" }
}
```

> 类似 SQL 的 `DISTINCT ON`,但只"塌缩"到 top,不会全列。

---

## 7.14 post_filter(过滤后置)

"先聚合后过滤"用,常用于**左侧分类筛选**:

```
{
  "query": {
    "match": { "title": "elasticsearch" }
  },
  "aggs": {
    "all_categories": {
      "terms": { "field": "category" }
    }
  },
  "post_filter": {
    "term": { "category": "book" }
  }
}
```

返回的是 query 命中的文档;`aggs.all_categories` 是 query 命中全集;`post_filter` 只影响 hits。

> 体验:左侧分类数量不会因为用户选了某个分类而变少(便于继续点击)。

---

## 7.15 性能与正确性

### 7.15.1 query 缓存

- 节点级别:filter context 命中可缓存。
- shard 级别:第一次 query 跑,后面命中缓存。
- `request_cache`(`?request_cache=true`)用于 hits 级别缓存(默认 false)。

### 7.15.2 query 与 fetch 阶段

```
query phase  → 取 doc id + sort + total
fetch phase → 取 _source + highlight
```

- 命中很多但 size 小的查询,fetch 阶段也快。
- 命中很多且 highlight 复杂,fetch 阶段可能成为瓶颈。

### 7.15.3 search_as_you_type vs completion

| 维度 | completion | search_as_you_type |
| --- | --- | --- |
| 性能 | 极快(FST) | 较快 |
| 中间词 | 不支持 | 支持 |
| 排序 | 限制 | 自由 |
| 内存 | 中 | 较大 |

---

## 7.16 监控与调试

| API | 用途 |
| --- | --- |
| `GET /_validate/query?explain=true` | 验证 DSL 是否合法 |
| `GET /<index>/_search?explain=true` | 看每个文档打分公式 |
| `GET /<index>/_search?profile=true` | 性能剖析(每个 shard 各阶段耗时) |

> 生产中 `profile` 是性能调优第一步。

---

## 7.17 要点速查

- `must` / `should` 打分;`filter` 不打分可缓存。
- multi_match 多种 `type` 对应不同业务场景。
- 排序要稳定(加 `_id` tie breaker),深分页用 `search_after` 或 PIT。
- 补全用 `completion` / `search_as_you_type`。
- `post_filter` 用于"聚合不受过滤影响"的场景。
- `profile=true` 是性能调优起点。

---

## 7.18 实操练习

1. 写一个 multi_match,跨 `title^3, tags, comment`,加 `most_fields` 模式。
2. 实现深分页,翻 3 页各 10 条,确认无重复。
3. 加 highlight 到 `comment`,前端渲染。
4. 左侧分类筛选:用 `post_filter` + `terms` agg,观察 agg 数量不随筛选变化。
5. `profile=true` 看你写的最复杂 query,找出耗时最长阶段。

---

## 7.19 思考题

1. 为什么 `filter` 比 `query` 快?为什么它能缓存?
2. `multi_match` 哪种 `type` 适合电商商品搜索?为什么?
3. `search_after` 比 `from + size` 性能好,但为什么"不能跳页"?
4. `function_score` 和 `boosting` 都能调整相关性,何时用哪个?

---

下一章:[第 8 章 聚合分析(Aggregations)→](./08-聚合分析.md)
