#!/usr/bin/env bash
# ch19-hybrid-search.sh:对应第 19 章 向量 + BM25 混合检索 (RRF)
# 前置:本地 ES 8.13+
# 注:向量是占位,请用真实 embedding 替换
set -euo pipefail
ES=${ES:-http://localhost:9200}

echo "==> 1) 建带 dense_vector 字段的索引"
curl -fsS -XPUT "$ES/products_semantic" -H 'Content-Type: application/json' -d '{
  "settings": { "number_of_shards": 1, "number_of_replicas": 0 },
  "mappings": {
    "properties": {
      "title":     { "type": "text" },
      "title_vec": { "type": "dense_vector", "dims": 4, "index": true, "similarity": "cosine" },
      "category":  { "type": "keyword" },
      "price":     { "type": "scaled_float", "scaling_factor": 100 }
    }
  }
}'

echo "==> 2) 写 4 条"
for i in 1 2 3 4; do
  case $i in
    1) VEC="[0.1, 0.2, 0.3, 0.4]"; TITLE="iPhone 15"; CAT=phone; PRICE=999900;;
    2) VEC="[0.15, 0.22, 0.31, 0.41]"; TITLE="iPhone 14"; CAT=phone; PRICE=699900;;
    3) VEC="[0.6, 0.7, 0.1, 0.2]"; TITLE="MacBook Pro 14"; CAT=laptop; PRICE=1499900;;
    4) VEC="[0.65, 0.71, 0.11, 0.22]"; TITLE="MacBook Air"; CAT=laptop; PRICE=999900;;
  esac
  curl -fsS -XPOST "$ES/products_semantic/_doc/$i?refresh=true" -H 'Content-Type: application/json' \
    -d "{\"title\":\"$TITLE\",\"title_vec\":$VEC,\"category\":\"$CAT\",\"price\":$PRICE}"
done

echo "==> 3) 混合检索 (BM25 + KNN + RRF)"
curl -fsS -XPOST "$ES/products_semantic/_search" -H 'Content-Type: application/json' -d '{
  "size": 5,
  "query": {
    "multi_match": { "query": "MacBook", "fields": ["title^2"] }
  },
  "knn": {
    "field": "title_vec",
    "query_vector": [0.6, 0.7, 0.1, 0.2],
    "k": 5,
    "num_candidates": 20
  },
  "rank": { "rrf": { "window_size": 50, "rank_constant": 60 } }
}' | jq .

echo "==> 4) 清理"
curl -fsS -XDELETE "$ES/products_semantic"
