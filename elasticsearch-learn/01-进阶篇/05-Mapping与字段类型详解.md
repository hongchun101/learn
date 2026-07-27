# 第 5 章 Mapping 与字段类型详解

## 本章目标

学完本章,你能:

- 设计一个生产可用的 mapping。
- 理解 **text / keyword / multi-field / numeric / date / geo / object / nested** 等字段类型。
- 掌握 **dynamic mapping 策略**(true / false / strict / runtime)。
- 理解 **doc_values / index_options / norms** 等底层细节。
- 知道如何做 **reindex 改变 mapping**。

---

## 5.1 Mapping 是什么

> Mapping 是 ES 中"索引的 schema"。

Mapping 决定:

- 字段是什么类型(数值 / 字符串 / 日期 / 经纬度 ...)。
- 字段是否被 **索引**(可搜索)、是否 **存储**(`_source`)。
- 字段用什么 **分词器**(text 字段)。
- 字段是否参与 **聚合**、**排序**、**打分**。

---

## 5.2 字段类型总览

### 5.2.1 字符串

| 类型 | 行为 |
| --- | --- |
| `text` | 全文搜索:分词 + 倒排 |
| `keyword` | 精确匹配:不分词,适合聚合、排序、term 查询 |
| `text+keyword` 多字段 | 既能全文搜索又能精确匹配 |

```
{
  "title": {
    "type": "text",
    "fields": {
      "raw": { "type": "keyword", "ignore_above": 256 }
    }
  }
}
```

> `ignore_above`:超过该长度的字符串不索引(避免聚合巨大基数)。

### 5.2.2 数值

| 类型 | 范围 |
| --- | --- |
| `long` | -2^63 ~ 2^63-1 |
| `integer` | -2^31 ~ 2^31-1 |
| `short` | -32768 ~ 32767 |
| `byte` | -128 ~ 127 |
| `double` / `float` | 浮点 |
| `half_float` | 半精度(节省空间) |
| `scaled_float` | 长整数按固定精度缩放,适合金额 |

金额强烈推荐 `scaled_float`,精度可控:

```
"price": { "type": "scaled_float", "scaling_factor": 100 }
```

### 5.2.3 日期

```
"timestamp": { "type": "date", "format": "yyyy-MM-dd HH:mm:ss||epoch_millis" }
```

- 支持 `format` 多格式匹配。
- 内部存的是 `epoch_millis`(long)。
- 范围查询、聚合、排序都很快。

### 5.2.4 布尔

`boolean` 接受 `true` / `false` / 字符串 `"true"` / `"false"`。

### 5.2.5 二进制

`binary` 存 base64,不索引,极少用。

### 5.2.6 范围类型

`integer_range` / `long_range` / `double_range` / `float_range` / `date_range` / `ip_range`。
用于"查询落在某个区间的文档"。

### 5.2.7 复杂类型

| 类型 | 用途 |
| --- | --- |
| `object` | 默认 JSON 对象,字段扁平化存储 |
| `nested` | 嵌套数组(可独立查询) |
| `flattened` | 任意 key-value,不预先定 mapping |
| `join` | 父子关系 |

#### object vs nested

```
# 普通 object
{
  "user": [{ "name": "a", "age": 20 }, { "name": "b", "age": 30 }]
}
```

ES 内部扁平化(把数组里所有 `name`、`age` 放到一个字段),所以**会丢失"a 和 20 属于同一个人"的关系**。

nested 让每条数组项作为独立隐藏文档:

```
{
  "mappings": {
    "properties": {
      "user": {
        "type": "nested",
        "properties": {
          "name": { "type": "keyword" },
          "age":  { "type": "integer" }
        }
      }
    }
  }
}
```

查询时要包在 `nested` query 里。代价:每个 nested 文档单独索引,索引体积和查询开销都更大。

### 5.2.8 地理位置

| 类型 | 用途 |
| --- | --- |
| `geo_point` | 经纬度点 |
| `geo_shape` | 复杂图形(多边形) |

```
"location": { "type": "geo_point" }
```

### 5.2.9 IP

`ip` 类型支持 IPv4 / IPv6,自带 `ip_range` 查询。

### 5.2.10 向量(8.x 重点)

`dense_vector` 用于存 embedding(配合 kNN / ANN 搜索,常用于 RAG / 语义搜索 / 图像检索)。

```
{
  "type": "dense_vector",
  "dims": 768,
  "index": true,
  "similarity": "cosine"
}
```

> 详见 [第 18 章 实战项目案例](../03-专家篇/18-实战项目案例.md) 中的 RAG 案例。

---

## 5.3 dynamic mapping 策略

```
{
  "mappings": {
    "dynamic": "true" | "false" | "strict" | "runtime"
  }
}
```

| 值 | 行为 |
| --- | --- |
| `true`(默认) | 自动加新字段进 mapping |
| `false` | 字段能存进 `_source`,但不建索引(无法搜索) |
| `strict` | 出现新字段直接报错(严格 schema) |
| `runtime` | 新字段作为 runtime field,查时才计算 |

> 生产推荐 `strict` 或配合显式模板;严格防"上游加字段导致集群变卡"。

### 5.3.1 dynamic_templates

按 pattern 自动应用 mapping:

```
"dynamic_templates": [
  {
    "strings_as_keyword": {
      "match_mapping_type": "string",
      "match": "*",
      "mapping": { "type": "keyword", "ignore_above": 256 }
    }
  },
  {
    "string_text_with_keyword": {
      "match_mapping_type": "string",
      "match": "title*",
      "mapping": {
        "type": "text",
        "fields": { "raw": { "type": "keyword", "ignore_above": 256 } }
      }
    }
  }
]
```

> 比手写全 mapping 简单,且防漏。但对未知字段类型,仍然要做下游校验。

---

## 5.4 字段公共参数

### 5.4.1 `index`

控制字段是否被索引(可被搜索)。`false` 则不建倒排,但仍能存 `_source`。

### 5.4.2 `doc_values`

控制字段是否构建列存(用于聚合、排序)。`false` 则不能聚合 / 排序。
text 字段默认不开 doc_values,keyword 默认开。

### 5.4.3 `norms`

存归一化因子,用于打分。text 字段默认开,keyword 默认关。
- 关闭 norms → 不参与打分,节省空间。
- 关闭后,只能"全有或全无"匹配,不能再 boost。

### 5.4.4 `index_options`

控制倒排索引存储什么:

| 值 | docs | freqs | positions | offsets |
| --- | --- | --- | --- | --- |
| `docs` | ✔ | | | |
| `freqs` | ✔ | ✔ | | |
| `positions`(默认) | ✔ | ✔ | ✔ | |
| `offsets` | ✔ | ✔ | ✔ | ✔ |

> 不需要 phrase / 高亮时,用 `freqs` 即可省空间。

### 5.4.5 `eager_global_ordinals`

适合聚合高基数字段。建索引时就构建全局字典,聚合时快,但写入稍慢。  
`eager_global_ordinals: true` 加在 keyword 上。

### 5.4.6 `fielddata`

text 字段在内存中按需构建的列存。开启后能聚合 / 排序 text,但内存开销大,**慎用**。keyword 自带 doc_values,不需 fielddata。

---

## 5.5 multi-field:一份数据多种用法

```
{
  "city": {
    "type": "text",
    "fields": {
      "raw": { "type": "keyword" }
    }
  }
}
```

- `city`:全文搜索(分词)
- `city.raw`:聚合 / 精确匹配

> 多字段每多一份都增加存储,不要滥用。

---

## 5.6 复制字段 copy_to

把多个字段拼到目标字段上(常用于全文搜索):

```
{
  "first_name": { "type": "text", "copy_to": "full_name" },
  "last_name":  { "type": "text", "copy_to": "full_name" },
  "full_name":  { "type": "text" }
}
```

---

## 5.7 meta 字段:_source / _id / _routing

### 5.7.1 `_source`

默认存原始 JSON,占空间但支持 update / reindex。可关:

```
"_source": { "enabled": false }
```

或限制:

```
"_source": { "includes": ["title", "price"], "excludes": ["description"] }
```

### 5.7.2 `_routing`

写入时指定 routing,让所有匹配该 routing 的文档落同一 shard。
好处:查询时只查一个 shard → 快。坏处:热点分片。
场景:多租户数据按 tenantId routing。

```
PUT /events?routing=user123
{ ... }
```

---

## 5.8 runtime fields(运行时字段)

不预先索引,在查询时通过 script 计算,适合"不常查但偶尔要"的字段。

```
{
  "mappings": {
    "runtime": {
      "full_name": {
        "type": "keyword",
        "script": {
          "source": "emit(doc['first_name'].value + ' ' + doc['last_name'].value)"
        }
      }
    }
  }
}
```

代价:每次查都跑 script,慢。适合"离线分析"和"小数据量查询"。

---

## 5.9 改 mapping 的代价与做法

| 操作 | 能否改 | 怎么做 |
| --- | --- | --- |
| 加新字段 | 能 | `PUT /index/_mapping` |
| 改字段类型 | **不能** | reindex 到新 index |
| 加 multi-field | 能 | `PUT /index/_mapping` |
| 改 `index: false → true` | 不能(已写的不生效) | reindex |
| 改 `dynamic: true → strict` | 能 | 立刻生效,新字段报错 |
| 改 `number_of_shards` | 不能 | reindex(用 `split` 也可有限扩) |
| 改 `number_of_replicas` | 能 | `PUT /index/_settings` |
| 改分词器 | 不能(已写的不生效) | reindex |

### 5.9.1 reindex 模板

```
POST _reindex
{
  "source": { "index": "old_index" },
  "dest":   { "index": "new_index" }
}
```

加 script 改字段值:

```
POST _reindex
{
  "source": { "index": "old_index" },
  "dest":   { "index": "new_index" },
  "script": {
    "source": "ctx._source.price = ctx._source.price * 1.1"
  }
}
```

切流:用别名(Alias)平滑切换:

```
POST /_aliases
{
  "actions": [
    { "add": { "index": "old_index", "alias": "books" } },
    { "add": { "index": "new_index", "alias": "books_v2" } }
  ]
}
```

应用层查 `books`,流量迁移后,移除 old 别名。

---

## 5.10 一个电商商品 mapping 示例

```
PUT /products
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "ik_smart_pinyin": {
          "type": "custom",
          "tokenizer": "ik_smart"
        }
      }
    }
  },
  "mappings": {
    "dynamic": "strict",
    "dynamic_templates": [
      {
        "all_keyword": {
          "match_mapping_type": "string",
          "match": "*",
          "mapping": {
            "type": "keyword",
            "ignore_above": 256
          }
        }
      }
    ],
    "properties": {
      "id":         { "type": "long" },
      "title":      { "type": "text", "analyzer": "ik_max_word",
                      "fields": { "raw": { "type": "keyword" } } },
      "brand":      { "type": "keyword" },
      "category":   { "type": "keyword" },
      "tags":       { "type": "keyword" },
      "price":      { "type": "scaled_float", "scaling_factor": 100 },
      "stock":      { "type": "integer" },
      "on_sale":    { "type": "boolean" },
      "launched_at":{ "type": "date" },
      "specs": {
        "type": "nested",
        "properties": {
          "k": { "type": "keyword" },
          "v": { "type": "keyword" }
        }
      },
      "location":   { "type": "geo_point" },
      "comment":    { "type": "text", "analyzer": "ik_smart" },
      "embedding":  { "type": "dense_vector", "dims": 768, "index": false }
    }
  }
}
```

要点:

- `dynamic: strict` 严防加字段。
- 金额 `scaled_float`。
- `text + keyword` 多字段。
- 嵌套规格用 `nested`。
- 经纬度 `geo_point`,向量 `dense_vector`。
- `index: false` 关闭不参与搜索的列存,节省空间。

---

## 5.11 索引模板(Index Template)

数据写入时,ES 自动按**索引模板**套用 mapping / settings。

```
PUT _index_template/products-template
{
  "index_patterns": ["products*"],
  "template": {
    "settings": { "number_of_shards": 3, "number_of_replicas": 1 },
    "mappings": { "properties": { /* ... */ } }
  },
  "priority": 100
}
```

> 新建 `products_202401` 会自动套用。

Composable 模板 + Component 模板是 7.8+ 的新写法,可以"组件复用":

```
PUT _component_template/products_settings
{ "template": { "settings": { ... } } }

PUT _index_template/products-final
{
  "index_patterns": ["products*"],
  "composed_of": ["products_settings", "products_mappings"],
  "priority": 100
}
```

---

## 5.12 要点速查

- 字符串 → `text` 全文,`keyword` 精确;常用多字段。
- 金额 → `scaled_float`;日期 → `date`。
- object 默认扁平,nested 让数组项独立。
- `dynamic: strict` 是生产推荐。
- 多字段、复制字段、运行时字段按需使用。
- 改 mapping 多数情况要 reindex。
- 索引模板 + 组件模板管理一类索引。

---

## 5.13 实操练习

1. 设计一个 `users` 索引 mapping,字段:username / email / age / register_date / roles / profile。
2. 用 `dynamic: strict` 测一下,写入新字段会怎么样。
3. 写一段 reindex,从 `books` 复制到 `books_v2`,加个 `discount` 字段(price * 0.9)。
4. 用别名切换:`books` 从 v1 切到 v2。

---

## 5.14 思考题

1. 为什么 string 默认映射成 `text + keyword` 多字段?为什么不默认只 `keyword`?
2. 何时该用 nested?为什么不所有数组都用 nested?
3. dynamic `false` 和 `runtime` 的区别?什么场景用哪个?
4. dense_vector 维度越大越准吗?有什么代价?

---

下一章:[第 6 章 分词器(Analyzer)深入 →](./06-分词器深入.md)
