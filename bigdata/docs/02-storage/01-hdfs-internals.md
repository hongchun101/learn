# 01. HDFS 原理与源码

> **本章定位**:把 HDFS 从"会用"带到"能调源码"。覆盖 NameNode HA、FSNamesystem、EditLog/FsImage、Lease、纠删码、RBF Router,并解读 DFSOutputStream/DFSInputStream 的关键路径。
>
> **学习目标**:能在面试中讲清楚 HDFS 写入链路,能定位生产常见的"卡在 Lease / FsImage 合并慢"等问题。

---

## 1. HDFS 整体架构

```
              Client
                |
                v
+-----------------------------+
|   NameNode (Active)         | <----> ZooKeeper (ZKFC)
|   - FSNamesystem            |
|   - FsImage / EditLog       |
+-----------------------------+
        |                |
        | 写日志         |  心跳 + BlockReport
        v                v
   JournalNode1       DataNode x N
   JournalNode2       (Block 存储)
   JournalNode3       (Pipeline 写)
        ^
        | 共享 EditLog
        |
+-----------------------------+
|   NameNode (Standby)        |
|   - 热备,定期合并 FsImage  |
+-----------------------------+
```

**核心角色**:
- **NameNode (NN)**:元数据大脑,内存里维护整棵文件系统树(命名空间 + Block 映射)。所有元数据变更先写 EditLog 再修改内存。
- **DataNode (DN)**:存 Block,默认 128 MB/块,3 副本。定期(默认 6 h)发 BlockReport 给 NN。
- **JournalNode (JN)**:NN HA 时共享 EditLog 的集群(通常 3 节点,ZAB 协议),保证主备 NN 元数据一致。
- **ZKFC**:ZK 客户端 + 健康检查,控制 Active 切换。
- **Client**:读时直接连 DN;写时连 NN 拿写入许可,然后通过 Pipeline 把数据传给 DN 链。

---

## 2. NameNode HA(高可用)

### 2.1 为什么需要 HA?

NN 单点故障 → 整个集群不可写,影响小时级。NameNode HA 通过"主备 + 共享存储"实现热备,RTO < 30 秒。

### 2.2 HA 的关键组件

| 组件 | 作用 |
| --- | --- |
| ZKFailoverController (ZKFC) | 在每台 NN 上运行,周期性向 ZooKeeper 持临时节点 |
| HealthMonitor | 检测 NN 是否健康(是否能响应 RPC、磁盘/网络) |
| ActiveStandbyElector | 通过 ZooKeeper 选举 Active |
| JournalNode | 共享 EditLog,主写备读,QJM 协议保证一致性 |
| Shared Storage | 存放 FsImage,通常也是 HDFS 上的目录 |

### 2.3 主备切换流程

1. ZKFC 不断给 ZK 写心跳,Active 节点持有 `/hadoop-ha/${nameservice}/ActiveBreadCrumb` 锁。
2. Active NN 宕机 → 心跳超时 → 选举新 Active(原 Standby 升级)。
3. 新 Active 从 JournalNode 拉最新 EditLog,replay 到内存。
4. 升级完成后接管 RPC,客户端通过 RPC 重连。

**关键参数**(`hdfs-site.xml`):
```xml
<property>
  <name>dfs.ha.automatic-failover.enabled</name>
  <value>true</value>
</property>
<property>
  <name>ha.zookeeper.quorum</name>
  <value>zk1:2181,zk2:2181,zk3:2181</value>
</property>
<property>
  <name>dfs.nameservices</name>
  <value>mycluster</value>
</property>
```

---

## 3. FSNamesystem:NN 内存里的真相

`FSNamesystem` 是 NameNode 端的"门面"类,所有对文件系统的操作都通过它。

源码路径:`hadoop-hdfs-project/hadoop-hdfs/src/main/java/org/apache/hadoop/hdfs/server/namenode/FSNamesystem.java`

### 3.1 内存数据结构

- **INodeFile / INodeDirectory**:文件系统树节点,每个文件/目录一个对象。
- **BlocksMap**:`Map<Block, BlockInfo>`(实际是 GSet),Block → DataNode 列表。
- **LeaseManager**:管理文件写入租约,防止客户端写一半崩了导致文件"死锁"。
- **SafeModeMonitor**:启动时进入安全模式,等待足够 DataNode 上报 Block。
- **FSDir* / FSDirAttr* / FSDirEditOp***:把读写按目录分类(子类化,降低 FSNamesystem 体积)。

**内存占用估算**:每个文件约 250–300 字节,1 亿文件 → 25–30 GB 堆内存 → 推荐 NN 用 128 GB+ 堆,启用堆外内存(`off_heap`)。

### 3.2 写元数据的两条路径

```
1. Client RPC
2. RPC 路由到 FSNamesystem 的方法
3. 加锁(全局 namesystemLock 或细粒度锁)
4. 检查权限、配额、命名空间约束
5. 修改内存中的 INode / BlocksMap
6. 写 EditLog (同步到 JournalNode)
7. 返回 Client 成功
```

`FSNamesystem` 自 3.x 起把锁拆成 **read/write/append/complete** 等多种细粒度锁(见 `FSNamesystemLock`),提升并发。

---

## 4. EditLog 与 FsImage

### 4.1 二者关系

- **FsImage**:NN 内存元数据的"快照",序列化到磁盘的二进制文件,定期全量生成。
- **EditLog**:FsImage 之后发生的"增量日志",每次元数据变更写一条。

**为什么两者并存?**
- FsImage 全量加载慢(几亿文件要几十秒到几分钟),EditLog 增量加载快。
- 但 EditLog 不能无限增长(越大重启越慢),所以定期合并(Checkpoint)成新的 FsImage。

### 4.2 Checkpoint 流程(Standby NN 触发)

1. Standby NN 定时(或被指令触发)合并 EditLog。
2. 从 JournalNode 下载所有 EditLog,合并最近的 FsImage,生成新的 FsImage。
3. 上传到指定目录(通常是主 NameNode 共享的 `dfs.namenode.name.dir`)。
4. 替换旧 FsImage,truncate 旧 EditLog。

源码入口:`hadoop-hdfs-project/hadoop-hdfs/src/main/java/org/apache/hadoop/hdfs/server/namenode/FSImage.java`

**关键参数**:
```xml
<property>
  <name>dfs.namenode.checkpoint.period</name>     <!-- 3600s 触发一次合并 -->
  <value>3600</value>
</property>
<property>
  <name>dfs.namenode.checkpoint.txns</name>       <!-- 每 100 万次事务合并 -->
  <value>1000000</value>
</property>
<property>
  <name>dfs.namenode.num.checkpoints.retained</name>  <!-- 保留最近 2 个 FsImage -->
  <value>2</value>
</property>
```

### 4.3 故障案例:Checkpoint 慢导致 OOM

**症状**:NN 频繁 Full GC,甚至 OOM。
**根因**:EditLog 累积几亿条事务,Checkpoint 时一次性加载到内存排序,内存峰值翻倍。
**调优**:
- 把 `dfs.namenode.checkpoint.period` 调小(如 1800 秒)。
- 拆分 NameSpace 用 Federation。
- 升级到 Hadoop 3.4+ 使用 PB-based FsImage(启动更快)。

---

## 5. Lease(租约)机制

### 5.1 为什么需要 Lease?

写文件时客户端可能中途崩溃,如果文件没有标记,其他人无法清理半成品。Lease 给客户端一个"独占写权限",NN 通过 Lease 跟踪谁正在写、续约情况。

### 5.2 Lease 源码

源码入口:`hadoop-hdfs-project/hadoop-hdfs/src/main/java/org/apache/hadoop/hdfs/server/namenode/LeaseManager.java`

核心数据结构:
- `Map<String, Lease> sortedLeases` — 按最近续约时间排序。
- `Map<Long, Lease> leases` — 按 inode id 索引。
- 每个 Lease 包含 `INodeFile` 列表、持有者、续约时间。

**Lease 续约**:客户端每次调用 `addBlock` 或 `append` 都会 `renewLease()`,默认硬超时 1 小时(`dfs.lease.period=3600000ms`),软超时 60 秒(进入"软超时"会通知客户端清理)。

**Lease 恢复**:NN 发现 Lease 过期但 DataNode 还在写,会尝试:
1. 通知原 Client 续约(若仍存活)。
2. 触发 `LeaseRecovery` → 通知最后一个 Block 的 DataNodes 同步到最一致的标记点,截断 Pipeline,关闭文件。

---

## 6. 纠删码(Erasure Coding)

### 6.1 为什么引入 EC?

三副本存储 1 PB 数据需要 3 PB 物理盘,存储利用率 33%。**纠删码通过数学编码把数据切成 k 个数据块 + m 校验块**,只需 k+m 块即可恢复,典型配置 RS(10,4) 只需 1.4 倍存储,利用率 71%。

### 6.2 常用 EC 策略

| 策略 | 数据块 | 校验块 | 容错 | 利用率 |
| --- | --- | --- | --- | --- |
| RS-3-2 | 3 | 2 | 2 | 60% |
| RS-6-3 | 6 | 3 | 3 | 67% |
| RS-10-4 | 10 | 4 | 4 | 71%(推荐) |
| RS-LEGACY-6-3-1024k | 6 | 3 | 3 | 67%(老) |

### 6.3 使用方式

```bash
# 创建目录时指定 EC 策略
hdfs ec -setPolicy -path /data/warehouse/cold -policy RS-10-4-1024k

# 移动现有数据
hdfs ec -replicate /data/warehouse/cold
```

### 6.4 限制

- 只支持 HDFS-3.x 后的 EC 模式,且**只对按顺序追加的文件生效**(Parquet)。
- EC 文件不能 append,不能 hflush,不能做 hdfs-1.x 时代的小文件。
- 读取路径更长(需要解码),延迟略高。

---

## 7. HDFS RBF(基于路由的 Federation)

### 7.1 什么是 RBF?

传统 Federation 通过多 NN 划分命名空间,客户端需要知道去哪个 NN 访问。**RBF(Router-Based Federation)**引入一个独立 Router 集群,客户端连 Router,由 Router 透明地把请求转发到后端 NN。

```
       Client
         |
         v
+---------------+     +---------------+     +---------------+
| Router        | --> | Router        | --> | Router        |
+---------------+     +---------------+     +---------------+
        \                  |                  /
         ------------------+------------------
                            v
              +-------+   +-------+   +-------+
              | NN-1  |   | NN-2  |   | NN-3  |
              +-------+   +-------+   +-------+
              子集群 ns1   子集群 ns2   子集群 ns3
```

### 7.2 RBF 的关键能力

- **统一命名空间**:`/data/xxx`,Router 根据挂载表决定路由到哪个子集群。
- **透明 failover**:子 NN 切换对客户端无感。
- **跨集群 Rebalance**:Router 提供 Balance 工具,把数据从冷子集群迁到热子集群。
- **状态存储**:Router 通过 State Store(ZK/MySQL)维护挂载表。

### 7.3 RBF 适用场景

- 单集群 > 5000 DataNode。
- 多业务线命名空间强隔离。
- 多区域/多机房数据联邦。

---

## 8. 写数据链路源码:DFSOutputStream

源码入口:`hadoop-hdfs-project/hadoop-hdfs-client/src/main/java/org/apache/hadoop/hdfs/DFSOutputStream.java`

### 8.1 写入流程

```
Client                            NN                   DN1 -> DN2 -> DN3
  | create(path)                  |                     |
  |------------------------------>|                     |
  |<-------- lease+info ---------|                     |
  |                                                      
  | write(chunk1)                                          
  |======> packet(64KB) ====>  (addBlock)              |
  |-------------- addBlock(返回 DN 列表)-->|             |
  |<----- BlockConstructionPipeline -----|             |
  |                                                      
  |==== packet =====> DN1 === packet ===> DN2 === packet ===> DN3
  |                  |                |                |
  |                  |<--- ack --------|<--- ack --------|
  |                                                      
  | close()                                               
  |-------------- complete -------->|                     |
  |<---------- success -------------|                     |
```

### 8.2 关键变量

- **`DataStreamer`**:后台线程,负责从缓冲区取 packet 发送到 Pipeline。
- **`ResponseProcessor`**:接收 DN 的 ack 响应。
- **`DFSOutputStream$Packet`**:64 KB 数据包(默认 `dfs.client.write.block-size` 影响 Block,`dfs.client.write.packet.size` 控制 Packet)。
- **`BlockConstructionStage`**:Pipeline 状态机(PIPELINE_SETUP_CREATE → PIPELINE_SETUP_APPEND → DATA_TRANSMITTING → ...)。

### 8.3 关键代码片段(简化版)

```java
// 写入 packet
private void writePacket(DFSOutputStream.DataStreamer streamer) {
  synchronized (streamer) {
    if (streamer.blockStream != null) {
      // 将缓冲数据写入 socket
      streamer.blockStream.write(buf, off, len);
    }
  }
}

// ACK 处理
void receiveResponse(...) {
  // 校验 seqno,更新 firstBadLink
  // 如果某 DN 失败,通知 streamer 重建 Pipeline
}
```

### 8.4 故障案例:写入卡顿

**症状**:`hdfs dfs -put` 大文件时长时间卡住,NN 上看到 `Pending Replication Blocks` 增多。
**根因**:Pipeline 中某个 DN 慢盘/慢网络,导致 ACK 慢,Client 端 Packet 队列塞满。
**调优**:
- `dfs.client.socket-timeout=60000` 提高超时。
- `dfs.datanode.balance.bandwidthPerSec=200MB/s` 限制 rebalance 抢占带宽。
- DN 端磁盘统一型号(不要混用 HDD/SSD)。
- 启用 EC 降低总副本数。

---

## 9. 读数据链路源码:DFSInputStream

源码入口:`hadoop-hdfs-project/hadoop-hdfs-client/src/main/java/org/apache/hadoop/hdfs/DFSInputStream.java`

### 9.1 读链路

1. `open(path)` → NN RPC → 获取 Block 列表 + DataNode 位置(按距离排序)。
2. `read(buf)` → 从最近的 DN 读取 Block。
3. 读完当前 Block 后取下一个 Block 信息,**但不会预取**(老版本),新版支持 `dfs.client.read.shortcircuit` 走本地短路读。

### 9.2 短路读(Short-Circuit Local Read)

如果 Client 与某个 DN 同节点,可以通过 UNIX Domain Socket 直接读 `/path/to/block`,绕过 RPC 和 TCP,延迟从 ms 降到 μs 级。

**启用方式**:
```xml
<property>
  <name>dfs.client.read.shortcircuit</name>
  <value>true</value>
</property>
<property>
  <name>dfs.domain.socket.path</name>
  <value>/var/run/hadoop-hdfs/dn._PORT</value>
</property>
```

### 9.3 故障案例:NameNode RPC 慢导致读延迟

**症状**:Spark 作业读 HDFS 文件 P99 延迟飙升。
**根因**:NN 端 RPC handler 满(`rpc.RpcServer` 队列堆积)。
**排查**:
```bash
# NN 端 jstack
"IPC Server handler N on port 8020" RUNNABLE
# jstat 观察 GC
```
**调优**:
- `dfs.namenode.handler.count=64` 调大(NN 节点多核时)。
- NN 端启用堆外内存(`HADOOP_NAMENODE_OPTS=-XX:MaxDirectMemorySize=80g`)。

---

## 10. 生产经验(踩坑 & 调优参数)

### 10.1 踩坑清单

| 症状 | 根因 | 解决 |
| --- | --- | --- |
| NN 频繁 Full GC | FsImage 大 + Checkpoint 触发堆峰值 | 减少单 NN 文件数 / 升级到 PB FsImage |
| 文件写入卡住 | Pipeline 中某 DN 慢 | 检查 DN 磁盘 I/O、网络 |
| `Could not obtain block` | 副本不足 | 检查 DN 离线状态、`dfs.replication` 是否合理 |
| 小文件过多 | Spark 写大量 part 文件 | 用 `coalesce` 或 `INSERT OVERWRITE` 重写 |
| Lease 长时间不释放 | 客户端崩溃 | 等待硬超时或手动 `hdfs debug recoverLease` |

### 10.2 关键调优参数

```xml
<!-- hdfs-site.xml 推荐生产配置 -->
<property>
  <name>dfs.blocksize</name><value>268435456</value>   <!-- 256 MB -->
</property>
<property>
  <name>dfs.namenode.handler.count</name><value>64</value>
</property>
<property>
  <name>dfs.datanode.handler.count</name><value>32</value>
</property>
<property>
  <name>dfs.client.read.shortcircuit</name><value>true</value>
</property>
<property>
  <name>dfs.client.block.write.replace-datanode-on-failure.enable</name>
  <value>true</value>
</property>
<property>
  <name>dfs.datanode.balance.bandwidthPerSec</name><value>200M</value>
</property>
<property>
  <name>dfs.namenode.checkpoint.period</name><value>1800</value>
</property>
```

---

## 11. 实战任务

### 任务 1:本地启 HDFS 3.3.6(伪分布式)

```bash
docker run -d --name nn -p 9870:9870 -p 9000:9000 \
  -e ENSURE_NAMENODE_DIR=/tmp/namenode \
  apache/hadoop:3.3.6 namenode
docker run -d --name dn apache/hadoop:3.3.6 datanode
```

写一个 1 GB 文件:
```bash
docker exec nn bash -c "hdfs dfs -put /etc/services /tmp/big && \
  yes 'hello world' | head -c 1073741824 > /tmp/big && \
  hdfs dfs -put /tmp/big /tmp/big"
```

观察 NN WebUI:`http://localhost:9870`,看 Block 分布与副本数。

### 任务 2:对比 EC 与 3 副本的写入耗时

```bash
# 创建 EC 目录
hdfs ec -setPolicy -path /ec -policy RS-6-3-1024k
# 测试
time hdfs dfs -put 10G.file /ec
time hdfs dfs -put 10G.file /replica3
```

### 任务 3:模拟 Lease 泄漏

```python
import pyarrow as pa, pyarrow.fs as pafs
fs = pafs.HadoopFileSystem("localhost", 9000)
f = fs.open_output_stream("/tmp/lease_test")
f.write(b"x" * 1024)
# 不 close,直接 kill 进程 → 模拟崩溃
import os; os._exit(0)
```

在 NN 上看 `dfs.lease.period` 到期前,该文件状态是 `under construction`,到期后自动关闭。

---

## 12. 专家面试题(5 题)

1. **NameNode HA 中,ZooKeeper 和 JournalNode 各自的作用是什么?能否去掉其一?**
2. **FsImage 与 EditLog 各自的作用是什么?为什么不能只用其一?**
3. **DFSOutputStream 的 Pipeline 写入,如果中间 DN 故障会如何处理?源码层面怎么实现?**
4. **纠删码 RS-10-4 和 3 副本各有什么优劣?什么样的数据适合 EC?**
5. **HDFS RBF 解决了传统 Federation 的什么问题?Router 自身如何保证高可用?**

---

## 13. 本章小结

- HDFS 不是"古董",它仍是大多数离线数仓的底座。读懂 NN/EditLog/Lease/Pipeline 源码,才能定位 80% 的生产问题。
- 纠删码 + RBF 是 HDFS 在云原生时代的两个关键能力。
- 下一章我们将进入"列式存储 + LSM"的世界——HBase。

下一章:[02-HBase 架构与读写链路](./02-hbase-internals.md)