# 08. Chart 依赖管理

## 8.1 为什么需要依赖

复杂应用通常包含多个组件:
- 应用本身
- 数据库(postgresql / mysql / redis)
- 监控(prometheus / grafana)
- 消息队列(kafka / rabbitmq)

依赖让你在一个 Chart 中"打包"这些组件,统一管理版本和配置。

## 8.2 三种依赖来源

### 1. Repository 依赖(传统)

```yaml
# Chart.yaml
dependencies:
  - name: postgresql
    version: 12.x.x
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled
```

### 2. 本地路径依赖(开发阶段)

```yaml
dependencies:
  - name: my-common-lib
    version: 0.1.0
    repository: file://../my-common-lib
```

### 3. OCI 依赖(新,推荐)

```yaml
dependencies:
  - name: myapp
    version: 1.2.3
    repository: oci://registry-1.docker.io/myorg
```

## 8.3 完整 dependencies 字段

```yaml
dependencies:
  - name: postgresql
    version: "~12.1.0"          # SemVer 范围
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled   # 开关
    tags:                            # tag 标签(可多选)
      - database
    alias: db                        # 引用别名
    import-values:                   # 导入子 chart 的 values
      - child
      - extra
```

### 字段详解

| 字段 | 说明 |
|------|------|
| `name` | 子 chart 名(必须与 charts/ 下的目录一致) |
| `version` | 版本范围,支持 SemVer:`1.2.3`/`^1.2.0`/`~1.2.0`/`12.x.x` |
| `repository` | 仓库 URL,可以是 HTTP 仓库或 `file://`/`oci://` |
| `condition` | 一个 values 路径,值为 false 时跳过此依赖 |
| `tags` | 标签列表,任何 tag 启用则依赖启用(见 8.5) |
| `alias` | 模板中引用时的别名,解决重名 |
| `import-values` | 把子 chart 的某些 values 暴露到父 chart |

## 8.4 SemVer 范围

```yaml
version: "1.2.3"      # 精确
version: "^1.2.3"     # >= 1.2.3, < 2.0.0
version: "~1.2.3"     # >= 1.2.3, < 1.3.0
version: "1.2.x"      # 1.2.0 ~ 1.2.x
version: "12.x.x"     # 任何 12.x
version: ">=1.0.0"    # 大于等于
version: ">=1.0.0 <2.0.0"  # 范围
```

## 8.5 condition vs tags

```yaml
# Chart.yaml
dependencies:
  - name: postgresql
    version: 12.x.x
    condition: postgresql.enabled
    tags: [database]

  - name: redis
    version: 17.x.x
    condition: redis.enabled
    tags: [database, cache]
```

```yaml
# values.yaml
postgresql:
  enabled: true
redis:
  enabled: true

# 全部启用
# postgresql.enabled = false → 跳过 postgresql
# postgresql.enabled 缺失 → 默认 false
```

**`tags` 行为**(v3.7+):
- 任何 **tag 被选中** → 依赖被启用
- 用 `helm install --tags database` 启用所有 `database` 标签
- `--tags database,cache` 启用任一 tag 的依赖

```bash
# 只安装带 database tag 的依赖
helm install myapp ./chart --tags database
```

## 8.6 依赖管理命令

```bash
# 1. 列出依赖
helm dependency list ./mychart

# 2. 下载依赖(根据 Chart.yaml 更新 charts/ 和 Chart.lock)
helm dependency update ./mychart

# 3. 仅构建 charts/ 目录(假设已下载)
helm dependency build ./mychart

# 4. 列出可能更新版本
helm dependency update ./mychart --skip-refresh  # 不查远端
```

`helm dependency update` 会:
1. 解析 Chart.yaml 的 dependencies
2. 下载到 `./charts/`
3. 生成 `Chart.lock`(锁定实际版本)

### Chart.lock 示例

```yaml
dependencies:
- name: postgresql
  repository: https://charts.bitnami.com/bitnami
  version: 12.1.7
- name: redis
  repository: https://charts.bitnami.com/bitnami
  version: 17.4.2
digest: sha256:abc123...
generated: "2024-01-15T10:00:00.123456Z"
```

**务必把 `Chart.lock` 提交到 Git**,保证所有人/所有 CI 部署一致。

## 8.7 import-values:跨 chart 共享配置

```yaml
# 子 chart: mydb,values.yaml
service:
  port: 5432
auth:
  user: postgres
```

```yaml
# 父 chart
dependencies:
  - name: mydb
    version: 1.0.0
    import-values:
      - child       # 把 mydb.values 直接导入到父 values.mydb
```

父 chart 可以:

```yaml
# 父 values.yaml
mydb:
  service:
    port: 5432
  auth:
    user: postgres
# 直接覆盖
```

**两种 import 模式**:

```yaml
# 模式 1:从子 chart 复制整棵
import-values:
  - child

# 模式 2:按 key 列表导入
import-values:
  - data        # 把 child.data 导入到父
  - metadata
```

## 8.8 alias:解决重名

```yaml
dependencies:
  - name: postgresql
    alias: primary-db
  - name: postgresql
    alias: replica-db
    condition: replica.enabled
```

模板引用:

```yaml
# primary-db 的资源
{{- include "primary-db.postgresql.fullname" . }}
# replica-db 的资源
{{- include "replica-db.postgresql.fullname" . }}
```

## 8.9 实战:完整 umbrella chart

```yaml
# umbrella-chart/Chart.yaml
apiVersion: v2
name: my-stack
version: 1.0.0
appVersion: "1.0.0"
description: My microservice stack
dependencies:
  - name: postgresql
    version: "~12.1.7"
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled
  - name: redis
    version: "~17.4.2"
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
  - name: myapp
    version: 1.2.0
    repository: file://../myapp
    condition: myapp.enabled
  - name: myapp
    alias: myapp-sidecar
    version: 1.2.0
    repository: file://../myapp
    condition: sidecar.enabled
```

```yaml
# umbrella-chart/values.yaml
postgresql:
  enabled: true
  auth:
    postgresPassword: changeme
  primary:
    persistence:
      size: 10Gi

redis:
  enabled: true
  auth:
    enabled: false
  master:
    persistence:
      size: 5Gi

myapp:
  enabled: true
  replicaCount: 3
  image:
    repository: myorg/myapp
    tag: "1.2.0"
  config:
    dbUrl: postgresql://postgres:changeme@my-stack-postgresql:5432/app
    redisUrl: redis://my-stack-redis-master:6379

myapp-sidecar:
  enabled: false
```

## 8.10 OCI 依赖(现代推荐)

```bash
# 1. 登录
helm registry login registry-1.docker.io

# 2. 打包并推送
helm package ./myapp
helm push myapp-1.0.0.tgz oci://registry-1.docker.io/myorg

# 3. 在另一个 chart 中引用
```

```yaml
# 父 Chart.yaml
dependencies:
  - name: myapp
    version: 1.x.x
    repository: oci://registry-1.docker.io/myorg
```

**OCI 优势**:
- 复用镜像仓库,不需要维护 HTTP chart repo
- 权限/审计与镜像一致
- Helm 3.8+ 稳定支持

## 8.11 依赖管理陷阱

| 陷阱 | 解决 |
|------|------|
| `Chart.lock` 没提交 | 必须提交,确保版本一致 |
| 子 chart 升级破坏父 chart | 用 SemVer 范围限定 |
| 多个依赖名相同(无 alias) | 必加 alias |
| `condition` 拼写错 | 默认就是 false,小心静默失败 |
| `import-values` 字段名错 | 调试用 `helm template`,不会报错 |
| 依赖太多启动慢 | 拆成多个 umbrella chart,或用 helmfile |

## 8.12 `helm install --dependency-update`

```bash
# 自动更新依赖
helm install myapp ./chart --dependency-update

# 等价于:helm dep update + helm install
```

## 8.13 本章小结

- Chart 依赖写在 `Chart.yaml` 的 `dependencies` 字段
- 三种来源:Repository / 本地路径 / OCI(推荐)
- `Chart.lock` 必须提交,锁定实际版本
- `condition` / `tags` 控制启用,`alias` 解决重名
- `import-values` 跨 chart 共享配置
- 用 SemVer 范围控制升级粒度
- 现代推荐 OCI 依赖,与镜像仓库统一治理
