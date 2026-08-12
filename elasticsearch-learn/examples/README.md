# Elasticsearch 实战代码示例

> 对应教程 1-24 章的 **可直接运行** 示例。所有示例默认假设:
> - ES 8.13+ 单节点(或集群)监听 `http://localhost:9200`
> - 已开启安全(无认证或已配置 API key)
> - 命令在 Linux / Mac / Git Bash 下可直接执行
> - 文件名约定:`ch{章号}-{主题}.{ext}`

## 目录

| 目录 | 适用 | 说明 |
| --- | --- | --- |
| `curl/` | 1-18 章 | REST API,可拷贝到 Kibana Dev Tools 或 curl 直接跑 |
| `java/` | 21 章 | Java API Client 8.x |
| `python/` | 19, 21 章 | elasticsearch-py 8.x |
| `go/` | 21 章 | go-elasticsearch v8 |
| `logstash/` | 17 章 | Logstash pipeline 配置 |
| `kibana/` | 16-18 章 | Kibana 仪表盘 NDJSON |
| `rally/` | 23 章 | esrally 压测配置 |
| `k8s/` | 2, 16 章 | K8s / docker-compose |

## 快速开始

```bash
# 启动一个本地集群(需 Docker)
cd k8s && docker compose up -d
sleep 20
curl -XGET 'http://localhost:9200/_cluster/health?pretty'

# 跑一个基础 CRUD 示例
bash curl/ch04-basic-crud.sh
```

## 学习路径建议

- **第 1-2 周**:跑 `curl/` 1-12 章
- **第 3 周**:跑 `python/` + `java/`
- **第 4 周**:用 `rally/` 压测 + 调参
- **第 5-6 周**:用 `k8s/` 部署多节点 + 跑混沌实验

## 反馈

每个示例如果跑不通,先看对应章节的"环境与前置"。Bug 欢迎提 PR。
