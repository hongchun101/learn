"""
ch19_hybrid_search.py — Python 端混合检索示例
对应教程第 19 章,需要 elasticsearch==8.13.*  pip install elasticsearch
"""
from elasticsearch import Elasticsearch
import numpy as np

es = Elasticsearch("http://localhost:9200")

INDEX = "demo_hybrid"
DIM = 4

# 1) 建索引
es.indices.delete(index=INDEX, ignore_unavailable=True)
es.indices.create(index=INDEX, body={
    "mappings": {
        "properties": {
            "title":    {"type": "text"},
            "title_vec":{"type":"dense_vector","dims":DIM,"index":True,"similarity":"cosine"},
            "category": {"type": "keyword"}
        }
    }
})

# 2) 造 1000 条随机数据
np.random.seed(0)
for i in range(1000):
    vec = np.random.rand(DIM).tolist()
    es.index(index=INDEX, id=str(i), document={
        "title":    f"item {i} {'phone' if i%2 else 'laptop'}",
        "title_vec":vec,
        "category": "phone" if i % 2 else "laptop"
    }, refresh=(i == 999))

# 3) 混合查询
query_text = "phone"
query_vec  = np.random.rand(DIM).tolist()
resp = es.search(index=INDEX, body={
    "size": 10,
    "query": {"match": {"title": query_text}},
    "knn": {
        "field": "title_vec",
        "query_vector": query_vec,
        "k": 10,
        "num_candidates": 100
    },
    "rank": {"rrf": {"window_size": 50, "rank_constant": 60}}
})

for hit in resp["hits"]["hits"]:
    print(hit["_id"], hit["_score"], hit["_source"])

es.indices.delete(index=INDEX)
