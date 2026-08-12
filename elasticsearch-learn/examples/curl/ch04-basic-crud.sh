#!/usr/bin/env bash
# ch04-basic-crud.sh:对应第 4 章 CRUD 基本操作
# 用法: bash ch04-basic-crud.sh
set -euo pipefail
ES=${ES:-http://localhost:9200}

echo "==> 1) 建索引"
curl -fsS -XPUT "$ES/products" -H 'Content-Type: application/json' -d '{
  "mappings": {
    "properties": {
      "title":   { "type": "text" },
      "price":   { "type": "scaled_float", "scaling_factor": 100 },
      "on_sale": { "type": "boolean" },
      "tags":    { "type": "keyword" }
    }
  }
}'

echo "==> 2) 单条写入"
curl -fsS -XPOST "$ES/products/_doc/1?refresh=true" -H 'Content-Type: application/json' -d '{
  "title": "iPhone 15 Pro",
  "price": 999900,
  "on_sale": true,
  "tags": ["5g", "ios"]
}'

echo "==> 3) 读取"
curl -fsS "$ES/products/_doc/1?pretty"

echo "==> 4) 乐观锁更新(seq_no)"
SEQ=$(curl -fsS "$ES/products/_doc/1" | jq -r '._seq_no')
PRI=$(curl -fsS "$ES/products/_doc/1" | jq -r '._primary_term')
curl -fsS -XPOST "$ES/products/_update/1?if_seq_no=$SEQ&if_primary_term=$PRI&retry_on_conflict=3" \
  -H 'Content-Type: application/json' -d '{
    "doc": { "price": 899900 }
  }'

echo "==> 5) 批量"
curl -fsS -XPOST "$ES/_bulk?refresh=true" -H 'Content-Type: application/json' --data-binary '
{ "index": { "_index": "products", "_id": "2" } }
{ "title": "MacBook Pro 14", "price": 1499900, "tags": ["apple","laptop"] }
{ "index": { "_index": "products", "_id": "3" } }
{ "title": "iPad Air", "price": 479900, "tags": ["apple","tablet"] }
'

echo "==> 6) 搜索"
curl -fsS -XPOST "$ES/products/_search" -H 'Content-Type: application/json' -d '{
  "query": { "bool": {
    "must":   [ { "match": { "title": "iPhone" } } ],
    "filter": [ { "term":  { "on_sale": true } } ]
  }}
}'

echo "==> 7) 删除"
curl -fsS -XDELETE "$ES/products/_doc/2"

echo "==> 8) 删索引"
curl -fsS -XDELETE "$ES/products"
