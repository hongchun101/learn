# 第 06 章 计算机基础

> 性能调优到根,绕不开这几样:**零拷贝、Page Cache、磁盘 IO 调度、TCP 拥塞控制、内核参数**。Kafka/RocketMQ/HDFS/Spark Shuffle 全是这些原理的工程化。

---

## 一、零拷贝(Zero-Copy)

### 1.1 传统 IO 路径

```
磁盘 --> DMA 拷贝 --> 内核缓冲区 --> CPU 拷贝 --> 用户缓冲区 --> CPU 拷贝 --> Socket 缓冲区 --> DMA 拷贝 --> 网卡
       [1]                [2]               [3]                [4]                [5]
       2 次 DMA,2 次 CPU 拷贝,4 次上下文切换
```

### 1.2 零拷贝路径(sendfile)

```
磁盘 --> DMA --> 内核缓冲区 --> DMA --> 网卡
       [1]               [2]
       1 次 CPU 拷贝(EADY),2 次 DMA,2 次上下文切换
```

### 1.3 Java 落地

```java
// JDK NIO:FileChannel.transferTo() 在 Linux 下走 sendfile
FileChannel src = FileChannel.open(Paths.get("bigfile.dat"), StandardOpenOption.READ);
SocketChannel dst = SocketChannel.open(new InetSocketAddress(host, port));
long sent = src.transferTo(0, src.size(), dst);    // 零拷贝
```

### 1.4 Kafka 为何吞吐高

```
Producer -> Page Cache -> Socket -> Consumer
                |
                v
            transferTo() 零拷贝

消费者读 = 命中 Page Cache,不落盘 = 顺序读 内存 ≈ 顺序写 磁盘的 10x
```

**生产经验**:如果 broker 内存不足导致 Page Cache 命中下降,Kafka 吞吐断崖式下跌。先扩内存,再考虑 SSD。

---

## 二、Page Cache

### 2.1 是什么

Linux 把空闲内存当磁盘缓存,所有文件 IO 走 Page Cache:

```
+--------+        +--------+        +--------+
|  进程   |  read  |  Page  |  miss  |  磁盘   |
|  buffer | <----- |  Cache | <----- |        |
+--------+        +--------+        +--------+

写入:
+--------+   write   +--------+   dirty   +--------+
|  进程   | --------> |  Page  | --------> |  磁盘   |
+--------+            +--------+           +--------+
                    (延迟刷盘,batch 提升吞吐)
```

### 2.2 关键参数

```bash
cat /proc/sys/vm/dirty_ratio          # 脏页占比触发同步写
cat /proc/sys/vm/dirty_background_ratio
cat /proc/sys/vm/dirty_expire_centisecs  # 脏页存活时间
cat /proc/sys/vm/dirty_writeback_centisecs  # 后台回写周期
```

| 参数 | 默认 | 大数据建议 |
|------|------|-----------|
| `dirty_ratio` | 20 | 5-10(单盘写满后回写慢) |
| `dirty_background_ratio` | 10 | 3-5 |
| `dirty_expire_centisecs` | 3000 | 1500 |
| `dirty_writeback_centisecs` | 500 | 100 |

### 2.3 监控

```bash
# /proc/vmstat 关键字段
cat /proc/vmstat | grep -E 'dirty|writeback'
# nr_dirty
# nr_writeback
# nr_dirty_threshold
# nr_dirty_background_threshold
```

### 2.4 绕过 Page Cache 的场景

```bash
# 大数据落盘,担心污染 cache
dd if=/dev/zero of=/data/bigfile bs=1M count=10000 oflag=direct
# MySQL: innodb_flush_method = O_DIRECT
# HDFS: 短应答路径(默认走 Page Cache)
```

---

## 三、磁盘 IO 调度

### 3.1 Linux IO 栈

```
+----------+    +-------------+    +-----------+    +------+
|  应用     | -> |  Page Cache | -> | IO 调度器 | -> | 磁盘  |
|  (read/  |    |  (VFS)      |    |  (电梯)   |    | 驱动  |
|   write) |    |             |    |           |    |      |
+----------+    +-------------+    +-----------+    +------+
                  ↑                    ↑
                  |                    |
              dirty 页              merge/sort
              cache hit             batch/schedule
```

### 3.2 调度器对比

| 调度器 | 策略 | 适用 |
|--------|------|------|
| `noop` | FIFO,合并相邻请求 | NVMe SSD、虚拟化 |
| `deadline` | 读/写各一队列,带超时 | 数据库 |
| `cfq` (旧默认) | 公平队列,按进程分组 | 桌面、混合负载 |
| `bfq` | 按权重,低延迟 | 桌面/嵌入式 |
| `kyber` | token bucket,两队列 | NVMe(内核 5.x 默认) |
| `mq-deadline` | 多队列版 deadline | NVMe |

### 3.3 查看与切换

```bash
cat /sys/block/sda/queue/scheduler
# [noop] deadline cfq
echo deadline > /sys/block/sda/queue/scheduler
# 永久:在 GRUB cmdline 加 elevator=deadline
```

### 3.4 NVMe 优化

```bash
# 查看队列
cat /sys/block/nvme0n1/queue/nr_requests
# 调整队列深度
echo 1024 > /sys/block/nvme0n1/queue/nr_requests

# 中断合并
echo 0 > /sys/block/nvme0n1/queue/io_poll
# 启用 poll(适合低延迟)
echo 1 > /sys/block/nvme0n1/queue/io_poll
```

---

## 四、TCP 拥塞控制

### 4.1 拥塞窗口演化

```
                  慢启动
   cwnd            指数增长
     |            +
     |          +
     |        +   ← 拥塞避免
     |      +       线性增长
     |    +
     |  +
     |+
     +--------------> 时间

      ↑                  ↑
      |                  |
   ssthresh          拥塞发生
   (阈值)           cwnd 减半
```

### 4.2 经典算法对比

| 算法 | 思路 | 优 |
|------|------|----|
| Reno/Tahoe | AIMD(加性增,乘性减) | 简单 |
| Cubic | 三次函数增长,适合高 BDP | Linux 默认(< 4.9) |
| BBR | 估算带宽×RTT,持续探测 | 内核 >= 4.9,长肥管道 |
| DCTCP | 数据中心 ECN 反馈 | 内核启用 |

### 4.3 BBR vs Cubic 实战

```bash
# 启用 BBR
sysctl -w net.ipv4.tcp_congestion_control=bbr
sysctl -w net.core.default_qdisc=fq
lsmod | grep bbr

# 测速对比
iperf3 -c <server> -t 30 -P 4       # BBR
sysctl -w net.ipv4.tcp_congestion_control=cubic
iperf3 -c <server> -t 30 -P 4       # Cubic
```

**经验**:跨国/跨省链路 BBR 提速 20-200%;同一机房内 cubic 也不差;BBR v2 解决了一些公平性问题。

### 4.4 关键 TCP 参数

```bash
# /etc/sysctl.conf
net.ipv4.tcp_rmem = 4096 87380 6291456     # 读缓冲 min/default/max
net.ipv4.tcp_wmem = 4096 65536 6291456     # 写缓冲
net.core.rmem_max = 12582912
net.core.wmem_max = 12582912
net.ipv4.tcp_window_scaling = 1
net.ipv4.tcp_timestamps = 1
net.ipv4.tcp_sack = 1
net.ipv4.tcp_no_metrics_save = 1           # 不缓存上次拥塞信息
net.ipv4.tcp_mtu_probing = 1               # 探测 MTU
net.ipv4.tcp_fastopen = 3                  # TFO,client+server
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_slow_start_after_idle = 0     # 长连接关
```

---

## 五、内核参数全览(大数据机器必备)

### 5.1 内存 & VM

```bash
vm.swappiness = 1              # 几乎不用 swap
vm.dirty_ratio = 10
vm.dirty_background_ratio = 5
vm.dirty_expire_centisecs = 1500
vm.dirty_writeback_centisecs = 100
vm.min_free_kbytes = 524288    # 留 512MB 给内核紧急分配
vm.zone_reclaim_mode = 0       # 跨 NUMA 节点可分配
vm.overcommit_memory = 1       # 允许超分配(JVM 大堆慎用,需评估)
```

### 5.2 文件 & FS

```bash
fs.file-max = 2097152            # 全局 FD 上限
fs.nr_open = 1048576             # 单进程 FD
fs.aio-max-nr = 1048576          # 异步 IO
fs.inotify.max_user_watches = 65536
```

### 5.3 进程 & 信号

```bash
kernel.pid_max = 4194304
kernel.threads-max = 4194304
kernel.randomize_va_space = 2    # ASLR
kernel.yama.ptrace_scope = 1
```

### 5.4 进程数调优(单机百万连接)

```bash
# /etc/security/limits.conf
*    soft    nofile   1048576
*    hard    nofile   1048576
*    soft    nproc    1048576
*    hard    nproc    1048576
root soft    nofile   1048576
root hard    nofile   1048576

# /etc/systemd/system.conf
DefaultLimitNOFILE=1048576
DefaultLimitNPROC=1048576
```

---

## 六、综合案例:Kafka 高吞吐链路

```
Producer
  |
  |  1. sendfile,Page Cache 命中
  v
Broker Disk (顺序写)
  |
  |  2. broker 读 = Page Cache(零拷贝)
  v
Consumer
  |
  |  3. 顺序读 Page Cache
  v
下游存储

性能组合拳:
  - OS: BBR + fq qdisc + Page Cache 调优
  - Disk: NVMe + mq-deadline 调度器
  - App: sendfile / transferTo + 顺序 IO
  - Network: jumbo frame 9000 + TCP 窗口调大
```

---

## 七、磁盘 IO 调优实战

### 7.1 fio 测试模板

```bash
# 顺序读
fio --name=seqread --filename=/data/test --rw=read --bs=1M --size=2G --runtime=30 --numjobs=1 --direct=1 --ioengine=libaio

# 随机写
fio --name=randwrite --filename=/data/test --rw=randwrite --bs=4k --size=2G --runtime=30 --numjobs=4 --direct=1 --ioengine=libaio

# 混合
fio --name=mix --filename=/data/test --rw=randrw --rwmixread=70 --bs=4k --size=2G --runtime=30 --numjobs=4
```

### 7.2 关键指标

| 指标 | 含义 | HDD | SSD | NVMe |
|------|------|-----|-----|------|
| 顺序读 MB/s | 带宽 | 150 | 500 | 3000+ |
| 随机读 IOPS | 4k 随机 | 200 | 50k | 500k+ |
| 延迟 us | 4k 单次 | 5000 | 100 | 30 |

### 7.3 慢盘诊断

```bash
iostat -xz 1          # 看 await / %util
iotop -o              # 看哪个进程 IO 高
blktrace /dev/sda     # 看具体 IO 模式
perf record -e block:block_rq_issue -a   # 内核态分析
```

---

## 八、TCP 抓包诊断

```bash
# 1. 握手/挥手慢
tcpdump -i eth0 -nn -S 'tcp[tcpflags] & (tcp-syn|tcp-fin) != 0' -w /tmp/syn.pcap
tcpdump -r /tmp/syn.pcap -nn

# 2. 重传统计
ss -ti dst 1.2.3.4 | grep -E 'retrans|reorder'

# 3. RST 风暴
tcpdump -i eth0 'tcp[tcpflags] & tcp-rst != 0' -c 100

# 4. 流量构成
iftop -i eth0 -P
nethogs                # 按进程
```

### 关键诊断命令

```bash
# 1. 看连接状态
ss -tan | awk '{print $1}' | sort | uniq -c

# 2. 看丢包/重传
netstat -s | grep -E 'retrans|timeout|reset'

# 3. MTU 问题
ping -M do -s 8972 <dest>    # 大包 DF 位
tracepath <dest>             # 看 MTU 路径

# 4. 单连接速率
iftop -i eth0 -B -P -n -N
```

---

## 实战任务

1. **零拷贝对比**:写 Java 程序分别用 `FileInputStream` 和 `FileChannel.transferTo` 发送 1GB 文件,统计耗时差。
2. **Page Cache 命中率**:用 `cachestat`/`cachetop`(bcc 工具)观察某进程读 10GB 文件前后的命中率。
3. **IO 调度器对比**:同一 SSD,切换 `noop`/`deadline`/`mq-deadline`,跑 fio 随机写,记录 IOPS 差异。
4. **TCP 拥塞对比**:内网 100ms RTT 链路,`iperf3` 跑 `cubic` vs `bbr`,记录带宽和重传。
5. **内核参数全调优**:在测试集群应用本章所有参数,跑 `netperf`/TPC-DS,对比优化前后的吞吐和延迟。
6. **抓包实战**:用 `tcpdump` 抓 Kafka producer→broker 握手,分析 SYN/ACK 间隔,判断是否有建连延迟。

---

## 专家面试题

1. **零拷贝有几种实现方式?分别什么场景?**
   要点:`mmap`(内核 buffer 映射到用户态,适合小块 + 频繁读写)、`sendfile`(全链路零 CPU 拷贝,适合大文件传输)、`splice`(管道场景)、`io_uring`(异步 IO + 零拷贝)。Kafka/RocketMQ 用 sendfile。

2. **Page Cache 什么时候会失效?**
   要点:1) 文件大小 > 内存(无法全部 cache);2) 内存压力,内核主动回收;3) `O_DIRECT` 绕过;4) 进程 `posix_fadvise(POSIX_FADV_DONTNEED)` 主动丢弃。设计容量时预留内存给热点数据。

3. **Cubic 和 BBR 核心差别?**
   要点:Cubic 是基于丢包反馈(被动),BDP 大时增长慢;BBR 主动探测带宽和 RTT,不靠丢包,在长肥管道(高 BDP)上吞吐显著高。

4. **磁盘 IO 高但 iops 低,可能的原因?**
   要点:随机 IO 太多(调度器合并失效)、单盘写满(`%util` 100%)、文件系统碎片、IO 调度器不匹配(NVMe 配 cfq 必慢)。

5. **TCP TIME_WAIT 大量产生原因?怎么解决?**
   要点:短连接 + 高并发 + 服务端主动关闭。优化:连接复用(keepalive)、`tcp_tw_reuse=1`(客户端)、`tcp_tw_recycle=1`(已废弃,勿用)。

6. **生产里怎么定位一次 IO 性能问题?**
   要点:`iostat -xz 1` 看是否 IO bound → `iotop` 看哪个进程 → `blktrace` / `perf` 看 IO 模式(顺序/随机)→ 文件系统层(`xfs_io`)看碎片 → 内核参数(`/sys/block/.../queue/`)调整。

7. **讲一次你用 fio 优化磁盘性能的经历。**
   要点:必讲清场景(数据库/消息队列)→ 基线测试 → 调调度器/队列深度/page cache → 量化收益(IOPS、延迟)。

8. **`vm.swappiness=1` vs `0` 区别?**
   要点:`0` 表示禁用 swap,内存压力时仍 OOM;`1` 几乎不用但紧急情况可换出。生产环境几乎都设 1-10,而不是 0。

---

## 生产经验

- **先 Page Cache 再换 SSD**:多数性能问题 80% 是 cache 命中率低,加内存或预热数据比换盘见效快。
- **BBR 不是银弹**:低 BDP 同机房 cubic 也不差;无线/卫星 BBR 优势明显;BBR v1 在多流公平性有争议,生产慎用单流抢占场景。
- **fio 是大数据工程师好朋友**:磁盘上线、调参、SSD vs HDD 对比都靠它。模板存进公司 wiki,新人直接套用。
- **tcpdump 抓包用 ring buffer**:`tcpdump -i eth0 -w /tmp/cap.pcap -C 100 -W 10`,每个 100MB 保留 10 个,防止爆盘。
- **内核参数调优务必逐步加**:一次全开,出问题难定位。每次只动 1-2 个,观察 24h 再继续。
- **NVMe 队列深度上调至 1024+**:单线程 IO 性能受限于队列,数据库/消息队列应用尤其重要。
- **大文件传输用 sendfile 而不是自己 buffer**:Nginx/Kafka 都用,Java 里是 `FileChannel.transferTo`。