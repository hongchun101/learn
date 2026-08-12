# 09. 存储卷 Volume 与 PV/PVC

## 9.1 容器存储的难题

**容器是临时的**——重启/迁移/扩缩时数据丢失。K8s 用**卷(Volume)** 抽象解决:

```text
┌─────────────────────────┐
│  Container              │
│  /data  ←───── mount    │
└────────┬────────────────┘
         │
   ┌─────┴──────────────┐
   │   Volume (抽象层)   │
   └─────┬──────────────┘
         │
   ┌─────┴──────────┐
   │   Backend      │
   │  - emptyDir    │
   │  - hostPath    │
   │  - nfs         │
   │  - awsEBS      │
   │  - ceph        │
   │  - gcePD       │
   │  - configMap   │
   │  - secret      │
   └────────────────┘
```

## 9.2 Volume 类型总览

| 类型 | 生命周期 | 共享 | 典型用途 |
|------|----------|------|----------|
| `emptyDir` | Pod 内 | 容器间 | 临时文件、缓存 |
| `hostPath` | 节点 | 节点级 | DaemonSet、调试 |
| `nfs` | 集群 | 多 Pod | 共享文件(简单) |
| `configMap`/`secret` | 资源生命周期 | 多 Pod | 配置 |
| `persistentVolumeClaim` | Pod 内 | 多 Pod | **生产主用** |
| `csi` | 集群 | 多 Pod | 云盘/块存储 |
| `gitRepo`(弃用) | - | - | 改用 init container |
| `downwardAPI` | 资源生命周期 | 多 Pod | Pod 元数据 |

## 9.3 emptyDir(临时卷)

```yaml
spec:
  containers:
  - name: app
    volumeMounts:
    - name: cache
      mountPath: /var/cache
    - name: html
      mountPath: /usr/share/nginx/html
  - name: log-shipper
    volumeMounts:
    - name: html
      mountPath: /var/log/nginx
  volumes:
  - name: cache
    emptyDir: {}                            # 默认在节点磁盘
  - name: html
    emptyDir:
      sizeLimit: 100Mi                      # 限制大小
      medium: Memory                        # 内存盘!(快但重启丢)
```

**特点**:
- **Pod 创建时新建,Pod 删除时清除**
- 同一 Pod 内多容器共享
- 节点磁盘满了会 evict
- `medium: Memory` 用 tmpfs(快,但占内存)

## 9.4 hostPath(节点路径)

```yaml
volumes:
- name: host-vol
  hostPath:
    path: /data/pod
    type: DirectoryOrCreate      # 不存在则创建
    # type: Directory           # 必须存在
    # type: File                # 单文件
    # type: FileOrCreate
    # type: Socket
    # type: CharDevice
    # type: BlockDevice
```

**特点**:
- **节点本地存储**,Pod 迁移数据不丢
- **慎用**——耦合到具体节点,违反 K8s 解耦原则
- 用途:DaemonSet 日志(/var/log)、节点监控

**生产铁律**:**避免 hostPath**(用 PV/PVC 替代)。

## 9.5 NFS / CSI

详见后续章节,这里先理解 PV/PVC 模型。

## 9.6 PV / PVC 抽象(核心)

**核心设计**:**存储管理员**和**应用开发者**解耦。

```text
应用开发者         存储管理员
    │                │
    │ 申请(PVC)      │ 准备(PV)
    ▼                ▼
    ┌────┐          ┌────┐
    │PVC │ ←─绑定─→ │ PV │  ← 后端存储
    └────┘          └────┘
       │                │
       └────── Pod 引用 ─┘
```

### 三层模型

| 对象 | 创建者 | 关注点 |
|------|--------|--------|
| **StorageClass**(SC) | 存储管理员 | 存储"类"(快/慢/SSD/HDD) |
| **PersistentVolume**(PV) | 存储管理员 / 动态 | 实际存储资源 |
| **PersistentVolumeClaim**(PVC) | 应用开发者 | 申请存储 |

### 类比

```text
StorageClass = "硬盘类型"(SSD 1TB)
PV          = 物理硬盘(/dev/sda1)
PVC         = "我需要 1TB SSD"(逻辑请求)
Pod         = 电脑
```

## 9.7 StorageClass(动态供应)

**传统方式**:管理员先创建一堆 PV。**动态方式**:用户创建 PVC,K8s 自动创建 PV。

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata: { name: ssd }
provisioner: kubernetes.io/aws-ebs       # or ebs.csi.aws.com
parameters:
  type: gp3
  fsType: ext4
  iopsPerGB: "50"
  encrypted: "true"
  kmsKeyId: alias/aws/ebs
reclaimPolicy: Delete                    # Delete / Retain
volumeBindingMode: WaitForFirstConsumer   # 重要!延迟到 Pod 调度时
allowVolumeExpansion: true               # 允许扩容
mountOptions:
- "debug"
```

### 常用 provisioner

| CSI Driver | 用途 |
|-----------|------|
| `ebs.csi.aws.com` | AWS EBS |
| `disk.csi.azure.com` | Azure Disk |
| `pd.csi.storage.gke.io` | GCP Persistent Disk |
| `diskplugin.csi.alibabacloud.com` | 阿里云盘 |
| `csi.nfs.nfs-provisioner` | NFS |
| `rook-ceph.cephfs.csi.ceph.com` | CephFS |
| `rook-ceph.rbd.csi.ceph.com` | Ceph RBD |
| `cinder.csi.openstack.org` | OpenStack Cinder |

### 关键参数

| 参数 | 推荐 | 说明 |
|------|------|------|
| `reclaimPolicy` | `Delete`(测试)/ `Retain`(生产) | PVC 删除后 PV 怎么处理 |
| `volumeBindingMode` | **`WaitForFirstConsumer`**(推荐) | 延迟到 Pod 调度,避免 PV 跨 zone 错配 |
| `allowVolumeExpansion` | `true` | 允许 PVC 扩容 |
| `mountOptions` | 按需 | 文件系统挂载选项 |

## 9.8 PVC(应用申请)

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: app-data, namespace: prod }
spec:
  accessModes:               # 重要!
  - ReadWriteOnce             # RWO:单节点读写
  # - ReadOnlyMany           # ROX:多节点只读
  # - ReadWriteMany          # RWX:多节点读写(需要支持)
  # - ReadWriteOncePod       # RWOP:1.22+,单 Pod 独占
  storageClassName: ssd
  resources:
    requests:
      storage: 10Gi
  selector:                  # 可选,绑特定 PV
    matchLabels:
      tier: gold
  volumeMode: Filesystem     # 或 Block(原始块设备)
  volumeName: pre-created-pv # 可选,绑特定 PV
```

### accessModes 详解

| Mode | 缩写 | 含义 | 支持后端 |
|------|------|------|----------|
| `ReadWriteOnce` | RWO | 单节点 mount + 读写 | 大多数 |
| `ReadOnlyMany` | ROX | 多节点 mount + 只读 | 大多数 |
| `ReadWriteMany` | RWX | 多节点 mount + 读写 | NFS、CephFS、某些云盘 |
| `ReadWriteOncePod` | RWOP | 单 Pod mount + 读写 | EBS |

**注意**:`RWO` 不是说只能 1 个 Pod 读,是只能 1 个节点 mount。同一节点多 Pod 可以读。

## 9.9 Pod 引用 PVC

```yaml
apiVersion: v1
kind: Pod
metadata: { name: app }
spec:
  containers:
  - name: app
    image: myapp:1.0
    volumeMounts:
    - name: data
      mountPath: /var/lib/app
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: app-data
```

## 9.10 完整 PV/PVC 实战

```yaml
# 1. StorageClass
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata: { name: fast-ssd }
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
  encrypted: "true"
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
---
# 2. PVC
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: app-data }
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 50Gi
---
# 3. Deployment 引用
apiVersion: apps/v1
kind: Deployment
metadata: { name: app }
spec:
  replicas: 1
  selector: { matchLabels: { app: myapp } }
  template:
    metadata: { labels: { app: myapp } }
    spec:
      containers:
      - name: app
        image: myapp:1.0
        volumeMounts:
        - name: data
          mountPath: /var/lib/app
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: app-data
```

**操作流程**:
1. 应用创建 PVC
2. K8s 看到 PVC,按 SC 调 provisioner
3. provisioner 在云厂商创建卷 → 生成 PV → 绑定 PVC
4. Pod 调度时 K8s 把 PV 挂载到节点
5. Pod 容器看到 /var/lib/app

## 9.11 静态 PV 实战(传统方式)

```yaml
# 1. 手动创建 PV
apiVersion: v1
kind: PersistentVolume
metadata:
  name: manual-pv-1
  labels:
    tier: gold
spec:
  capacity:
    storage: 10Gi
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual
  volumeMode: Filesystem
  hostPath:                      # 测试用
    path: /tmp/data
    type: DirectoryOrCreate
---
# 2. PVC 申请
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: app-data }
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: manual
  resources:
    requests: { storage: 5Gi }
# 自动找到 matching PV 并绑定
```

## 9.12 volumeMode(块 vs 文件系统)

```yaml
# Filesystem(默认,自动格式化 + 挂载)
spec:
  volumeMode: Filesystem
  # → 容器看到 /data 是 mount 的文件系统
# 用途:绝大多数场景

# Block(原始块设备)
spec:
  volumeMode: Block
  # → 容器看到 /dev/sdx(没文件系统)
# 用途:数据库(自己管理文件系统,性能更好)
```

**Pod 用法**:

```yaml
# Filesystem
volumeMounts:
- { name: data, mountPath: /data }

# Block
volumeDevices:                  # 注意:不是 volumeMounts
- { name: data, devicePath: /dev/xvda }
```

## 9.13 回收策略

```yaml
# PV 怎么回收
spec:
  persistentVolumeReclaimPolicy:
    Retain      # 手动清理(PV 保留,数据不删,需手动)
    Delete      # 自动删除(云盘也删,慎用生产)
    Recycle     # 旧,已废弃(等于 rm -rf)
```

**生产建议**:
- **关键数据**:`Retain`(避免误删)
- **临时数据**:`Delete`
- 配合 `volumeBindingMode: WaitForFirstConsumer` 防 zone 错配

## 9.14 扩容卷

```bash
# 1. PVC 改大
kubectl edit pvc app-data
spec.resources.requests.storage: 100Gi    # 原来 50Gi

# 2. 限制
# - SC 必须 allowVolumeExpansion: true
# - 文件系统支持(几乎都支持)
# - 不支持缩容!

# 3. 状态
kubectl get pvc app-data
# STATUS 状态:FileSystemResizePending → 几分钟后 Resized
```

**应用感知**:
- 大多数文件系统自动 resize(不需要重启)
- 少数需要 Pod 重启(老版本 ext4 driver)

## 9.15 StatefulSet 与存储

StatefulSet 用 **volumeClaimTemplates** 自动给每个 Pod 创建 PVC:

```yaml
spec:
  serviceName: mysql
  replicas: 3
  template:
    spec:
      containers:
      - name: mysql
        image: mysql:8.0
        volumeMounts:
        - { name: data, mountPath: /var/lib/mysql }
  volumeClaimTemplates:
  - metadata: { name: data }
    spec:
      accessModes: [ReadWriteOnce]
      storageClassName: fast-ssd
      resources: { requests: { storage: 100Gi } }
```

**结果**:
```text
mysql-0 → pvc-data-mysql-0
mysql-1 → pvc-data-mysql-1
mysql-2 → pvc-data-mysql-2
```

详见 10 章。

## 9.16 CSI(Container Storage Interface)深入

**CSI** 是 K8s 1.13+ 的存储标准。所有存储驱动都用 CSI。

### CSI 架构

```text
Pod (kubelet)
   │
   ↓ Volume mount request
CSI Driver (DaemonSet + Deployment)
   │
   ├── node plugin (DaemonSet)     # 节点上,负责 mount/umount
   └── controller plugin (Deployment)  # 控制面,负责 create/delete volume
   │
   ↓
Backend (云盘 / Ceph / NFS)
```

### AWS EBS CSI 实战

```bash
# 1. 安装 driver
helm install aws-ebs-csi-driver aws-ebs-csi-driver/aws-ebs-csi-driver \
  --namespace kube-system

# 2. IAM Role 给节点(关键!)

# 3. 创建 SC
kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata: { name: ebs-sc }
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
EOF

# 4. PVC
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: my-pvc }
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: ebs-sc
  resources: { requests: { storage: 100Gi } }
EOF
```

### 多 CSI Driver 注意事项

- 一个节点可以装多个 CSI driver(node plugin 各管各的)
- 不能两个 driver 管同一块盘
- SC 上 `provisioner` 字段决定哪个 driver

## 9.17 SubPath 与 mountPropagation

### SubPath(挂载部分路径)

```yaml
# 场景:挂载 ConfigMap 单个文件,不覆盖目录其他文件
volumeMounts:
- name: config
  mountPath: /etc/app/app.conf
  subPath: app.conf          # 只挂这个文件

# 或挂载到子目录
- name: data
  mountPath: /data/2024
  subPath: data-2024
```

### mountPropagation(挂载传播)

```yaml
volumeMounts:
- name: vol
  mountPath: /data
  mountPropagation: Bidirectional  # 容器 mount 会传到 host
  # None(default): 隔离
  # HostToContainer: host → container 单向
```

**用途**:`Bidirectional` 让容器内的 mount 影响 host(很少用,大多数应用不需要)。

## 9.18 CSI Volume Snapshot(备份基础)

```yaml
# VolumeSnapshotClass
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshotClass
metadata: { name: csi-snapclass }
driver: ebs.csi.aws.com
deletionPolicy: Delete
parameters:
  tagSpecification_1: "tag1=value1"
---
# Snapshot
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata: { name: app-snap-1 }
spec:
  volumeSnapshotClassName: csi-snapclass
  source:
    persistentVolumeClaimName: app-data
---
# 从 snapshot 恢复
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: app-data-restore }
spec:
  dataSource:
    name: app-snap-1
    kind: VolumeSnapshot
    apiGroup: snapshot.storage.k8s.io
  accessModes: [ReadWriteOnce]
  resources: { requests: { storage: 50Gi } }
```

详见 20 章备份。

## 9.19 故障排查

### PVC 一直 Pending

```bash
kubectl describe pvc app-data
# Events:
#   FailedBinding: no persistent volumes available

# 常见原因:
# 1. 没有匹配 SC
# 2. 容量超出 SC 范围
# 3. accessModes 不支持
# 4. 节点 affinity 不匹配(zone 错配)
# 5. StorageClass 不存在

# 解决:
# - 改 accessModes(降级)
# - 用 WaitForFirstConsumer + Pod 调度
# - 加存储容量
```

### Pod 一直 ContainerCreating

```bash
kubectl describe pod <name>
# Events:
#   FailedMount: MountVolume.SetUp failed

# 常见:
# 1. PV 损坏 / detach
# 2. CSI driver 异常
# 3. Secret(凭证)错误
# 4. fsType 不兼容
```

### 卷数据残留

```bash
# 节点重启后 Pod 漂移,数据没了
# - 检查 hostPath 是否在错的节点
# - 检查云盘是否 detach / 重新 attach 到新节点
```

## 9.20 高级:Local Persistent Volume

**Local PV** = 节点本地直连的磁盘(SSD/NVMe)。

```yaml
apiVersion: v1
kind: PersistentVolume
metadata: { name: local-pv-1 }
spec:
  capacity: { storage: 500Gi }
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: local-storage
  local:
    path: /mnt/disks/ssd1
  nodeAffinity:
    required:
      nodeSelectorTerms:
      - matchExpressions:
        - { key: kubernetes.io/hostname, operator: In, values: [node1] }
```

**特点**:
- **极低延迟**(本地 SSD/NVMe)
- 适合数据库(MySQL, PostgreSQL, Redis)
- Pod 调度必须到 PV 所在节点(用 `volumeBindingMode: WaitForFirstConsumer`)
- 节点宕机数据丢,**必须做应用层复制/备份**

**生产**:**StatefulSet + Local PV + 应用层 replication**(etcd/mysql raft)是最稳的"高性能持久化"方案。

## 9.21 实战:Local PV + StatefulSet(etcd)

```yaml
# Local PV
apiVersion: v1
kind: PersistentVolume
metadata: { name: etcd-pv-0 }
spec:
  capacity: { storage: 50Gi }
  accessModes: [ReadWriteOnce]
  storageClassName: local
  local: { path: /mnt/disks/etcd-0 }
  nodeAffinity:
    required:
      nodeSelectorTerms:
      - matchExpressions:
        - { key: kubernetes.io/hostname, operator: In, values: [node1] }
---
# StatefulSet
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: etcd }
spec:
  serviceName: etcd
  replicas: 3
  selector: { matchLabels: { app: etcd } }
  template:
    metadata: { labels: { app: etcd } }
    spec:
      containers:
      - name: etcd
        image: quay.io/coreos/etcd:v3.5
        volumeMounts:
        - { name: data, mountPath: /etcd-data }
  volumeClaimTemplates:
  - metadata: { name: data }
    spec:
      accessModes: [ReadWriteOnce]
      storageClassName: local
      resources: { requests: { storage: 50Gi } }
```

## 9.22 容量规划与监控

### Prometheus 抓取 CSI 指标

```yaml
# CSI driver 暴露 metrics
# 例如 aws-ebs-csi-driver: prometheus.io/scrape: "true"
# 关键指标:
# - csi_sidecar_operations_seconds
# - csi_operations_seconds
# - csi_plugin_operations_seconds
```

### 容量预警

```bash
# 看 PVC 使用量(应用报告)
kubectl exec -it <pod> -- df -h

# PV 容量
kubectl get pv
# CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM
# 100Gi      RWO            Delete           Bound    default/app-data
```

## 9.23 专家清单

部署有状态服务前:

- [ ] 选择合适的 StorageClass
- [ ] `volumeBindingMode: WaitForFirstConsumer`
- [ ] `reclaimPolicy: Retain` 用于生产
- [ ] 备份方案(snapshot / Velero)
- [ ] 容量预警监控
- [ ] 测试恢复流程
- [ ] accessModes 选对(RWO/RWX)
- [ ] 高 IO 场景用 local PV 或高性能云盘
- [ ] Pod 调度约束(`podAntiAffinity` / `topologySpreadConstraints`)
- [ ] 应用层 replication(etcd raft / MySQL binlog)

## 9.24 本章小结

- Volume = 容器外挂存储的抽象
- `emptyDir` 临时,`hostPath` 节点本地(慎用),`PV/PVC` 生产主用
- **PV/PVC 三层模型**:StorageClass → PV → PVC,解耦开发与运维
- 动态供应:`StorageClass + provisioner`,PVC 一键创建 PV
- 关键参数:`reclaimPolicy` / `volumeBindingMode` / `allowVolumeExpansion`
- CSI 是存储标准,所有云厂商都提供
- accessModes:RWO/ROX/RWX/RWOP,生产注意 RWO 单节点限制
- 备份:VolumeSnapshot + Velero
- 高级:Local PV 极低延迟,适合数据库
- 监控:csi 指标 + 应用层报告
