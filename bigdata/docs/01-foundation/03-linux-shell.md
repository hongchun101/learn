# 第 03 章 Linux 与 Shell

> 生产环境 99% 是 Linux。不会 `vmstat` 看 CPU、看 `iostat` 判磁盘 IO、看 `tcpdump` 抓包,就不可能独立 oncall。本章是数据专家的"急诊室手册"。

---

## 一、进程、文件系统、网络全景图

```
                  +-------------------+
                  |     Kernel        |
                  |  +-------------+  |
                  |  | Scheduler   |  |  CFS / RT
                  |  +-------------+  |
                  |  | VFS         |  |  统一文件系统抽象
                  |  |  - ext4/xfs |  |
                  |  |  - nfs      |  |
                  |  |  - overlay  |  |
                  |  +-------------+  |
                  |  | Net Stack   |  |
                  |  |  - TCP/IP   |  |
                  |  |  - iptables |  |
                  |  +-------------+  |
                  |  | Page Cache  |  |  核心缓存层
                  |  +-------------+  |
                  +---------+---------+
                            ^
                  系统调用  |  syscall
                            v
+---------------------+----------------------+
|  User Space: JVM / Spark / 各类 daemon     |
+--------------------------------------------+
```

理解这张图就理解了一半的 Linux 性能调优:**瓶颈永远在某一层**。CPU 高是 Scheduler 问题,IO 慢是 Page Cache + 文件系统问题,网络抖动是 Net Stack 问题。

---

## 二、进程:生命周期与状态

### 2.1 进程状态机

```
        fork/exec                  调度
  NEW ----------> READY <-----------------> RUNNING
                     |   time slice / IO
                     v                       |
                   WAITING                   |
                  (阻塞IO/信号/锁)          |
                                          terminate
                                            v
                                          ZOMBIE
```

### 2.2 查看命令速查

```bash
ps -efL                # 看线程 -L
top -H -p <pid>        # 看具体线程 CPU
cat /proc/<pid>/status # 状态、线程数、IO
ls /proc/<pid>/fd      # 打开的文件描述符
```

### 2.3 关键指标

| 指标 | 含义 | 健康 |
|------|------|------|
| Load Average | 1/5/15 分钟可运行+不可中断平均 | < CPU 核数 |
| Context Switch | 进程/线程切换次数 | < 50k/s 正常 |
| 僵尸进程 | 已退出未回收 | 应为 0 |
| 线程数 | 单进程线程 | < 1000 |

---

## 三、文件系统

### 3.1 VFS 抽象层

```
        +---------+---------+---------+---------+
        |  ext4   |   xfs   |   nfs   | overlay |
        +----+----+----+----+----+----+----+---+
             |         |         |         |
             +----+----+---------+---------+
                  |
                VFS (统一 API)
                  |
              系统调用
```

### 3.2 ext4 vs xfs(大数据怎么选)

| 维度 | ext4 | xfs |
|------|------|-----|
| 单文件上限 | 16 TB | 8 EB |
| 删除大文件 | 慢(遍历 bitmap) | 快(B+tree) |
| 在线扩容 | 困难 | 默认支持 |
| 适合场景 | 小文件、传统业务 | **HDFS 数据盘必选** |
| 工具 | `e2fsck` | `xfs_repair` |

### 3.3 inode 与磁盘满

```bash
df -i          # 看 inode 使用率
# "磁盘满但 df 看有空间" -> inode 耗尽(几百万小文件)
find /data -type f -name "*.tmp" -delete   # 删小文件
```

---

## 四、性能观测工具

### 4.1 vmstat — 系统整体

```bash
vmstat 1 5
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 1  0      0 123456  1234 678901    0    0     0    12  345  678 12  3 85  0  0
```

| 列 | 含义 | 异常 |
|----|------|------|
| `r` | 运行队列长度 | > CPU 数 → CPU 饱和 |
| `b` | 不可中断睡眠(IO) | > 0 持续 → IO 瓶颈 |
| `si/so` | swap in/out | 非零 → 内存不足 |
| `bi/bo` | 块设备读/写 | 高 + `wa` 高 → IO 瓶颈 |
| `us/sy/id/wa` | 用户/系统/空闲/IO等待 | `wa > 20` → IO 瓶颈 |

### 4.2 iostat — 磁盘 IO

```bash
iostat -xz 1   # 关键:-x 扩展,-z 隐藏空闲
Device   r/s    w/s   rkB/s    wkB/s  await r_await w_await  %util
sda     0.5   12.0     8.0    192.0   10.5     1.2    11.2   45.0
nvme0n1  0.0  800.0     0.0  51200.0    0.4     0.0     0.4   32.0
```

| 指标 | 健康 | 异常动作 |
|------|------|---------|
| `await` (ms) | < 10 (SSD < 1) | 检查 IO 调度器、换 SSD |
| `%util` | < 70% | 高则单盘写满 |
| `rkB/s + wkB/s` | < 盘带宽 | 高 + await 高 = 排队 |
| `r/s + w/s` | SSD > 100k OK | HDD > 200 = 极限 |

### 4.3 sar — 周期性采样(回溯神器)

```bash
sar -n DEV 1 5        # 网卡吞吐
sar -n TCP,ETCP 1 5   # TCP 连接、重传
sar -b 1 5            # IO 总体
sar -u 1 5            # CPU
sar -B 1 5            # 换页
```

**`sar -s 14:00:00 -e 15:00:00`** 可以从历史文件 `/var/log/sa/saDD` 取出过去某时段的指标,事故复盘必备。

### 4.4 netstat / ss — 网络

```bash
ss -s                  # 概要(替代 netstat -s)
ss -tan state time-wait | wc -l   # TIME_WAIT 数
ss -tan '( dport = :9092 )' | head   # Kafka 连接
```

### 4.5 strace / lsof / pidstat

```bash
strace -p <pid> -f -T -tt -o /tmp/strace.log   # 系统调用
lsof -p <pid> | wc -l                           # FD 数,过多 -> 泄漏
pidstat -p <pid> -w 1                           # 任务切换 / 线程 CPU
```

### 4.6 perf / bpftrace — 进阶

```bash
perf top -p <pid>              # 热点函数
perf record -g -p <pid>        # 采样 + 调用栈
bpftrace -e 'tracepoint:syscalls:sys_enter_read { @[comm] = count(); }'
```

---

## 五、Shell 进阶

### 5.1 必备技巧

```bash
# 1. set -euo pipefail
set -euo pipefail
# -e 出错即停
# -u 引用未定义变量报错
# -o pipefail 管道中任一环节失败整条失败

# 2. 数组 + 关联数组
declare -A map=( [a]=1 [b]=2 )
arr=(a b c)
echo "${arr[@]:1:2}"   # b c

# 3. 参数展开
${var:-default}     # 默认值
${var#prefix}       # 去前缀
${var%.ext}         # 去后缀
${var//old/new}     # 全替换

# 4. 进程替换
diff <(ls dir1) <(ls dir2)
```

### 5.2 大数据运维脚本套路

```bash
#!/usr/bin/env bash
set -euo pipefail

LOG=/var/log/spark-cleanup.log
HDFS_DIR=/data/warehouse

# 删除 7 天前的临时表
find "${HDFS_DIR}/.tmp" -type d -mtime +7 -exec hdfs dfs -rm -r {} \;

# 重试函数
retry() {
  local n=$1; shift
  local i=0
  until "$@"; do
    i=$((i+1))
    if [ $i -ge $n ]; then return 1; fi
    sleep $((i * 5))
  done
}

retry 3 hdfs dfs -put /local/data.parquet "${HDFS_DIR}/"
```

### 5.3 awk / sed 实战

```bash
# 1. 日志统计:每分钟请求数
awk '{print substr($4, 2, 17)}' access.log | sort | uniq -c

# 2. 大文件 grep 优化(用 LC_ALL=C 提速 5x)
LC_ALL=C grep -F "ERROR" huge.log

# 3. JSON 处理(jq)
cat events.json | jq -r '.records[] | select(.event=="click") | .user'

# 4. 列切割(等价 csvkit)
awk -F',' 'NR>1 {print $1, $5}' data.csv
```

---

## 六、网络内核参数调优

### 6.1 关键文件

```bash
cat /proc/sys/net/ipv4/tcp_tw_reuse      # TIME_WAIT 复用
cat /proc/sys/net/core/somaxconn         # accept 队列
cat /proc/sys/net/ipv4/tcp_max_syn_backlog
cat /proc/sys/net/ipv4/tcp_slow_start_after_idle
```

### 6.2 大数据常用调优

```bash
# /etc/sysctl.conf
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_slow_start_after_idle = 0   # 长连接,关闭慢启动
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.ipv4.tcp_congestion_control = bbr    # 内核 >= 4.9
fs.file-max = 2097152
vm.swappiness = 1                        # 大内存机器
```

---

## 七、生产事故案例

### 7.1 Kafka Broker IO 慢

```bash
iostat -xz 1   # %util 95+, await 80ms
# 原因:磁盘 RAID 写穿透 + 调度器 cfq
# 解决:
echo deadline > /sys/block/sda/queue/scheduler   # 或 none (NVMe)
mount -o noatime,nodiratime /data
```

### 7.2 Spark Executor TCP 连接耗尽

```bash
ss -s   # 几百万 TIME_WAIT
# 原因:短连接疯狂创建
# 解决:开启 tcp_tw_reuse + 应用层连接池
```

### 7.3 inode 耗尽

```bash
df -i /data    # 100%
# 原因:百万级小文件(Hive 临时表)
# 解决:合并小文件 ORC,定期清理
```

---

## 实战任务

1. **vmstat 解读**:在 VM 里跑 `stress --cpu 4 --io 2 --vm 2 --timeout 60s`,同时 `vmstat 1`,观察 `r/b/si/so/bi/bo/wa` 变化。
2. **iostat 分析**:用 `fio` 跑随机写测试,`fio -filename=/data/test -direct=1 -rw=randwrite -bs=4k -size=1G -runtime=30 -name=test`,观察 `iostat -xz 1` 输出。
3. **sar 历史回放**:故意制造 CPU 高负载,等 5 分钟后 `sar -u -s HH:MM:SS -e HH:MM:SS` 复盘。
4. **Shell 脚本**:写一个自动清理 HDFS 过期日志的脚本,带 `retry` 函数和 `set -euo pipefail`,加 dry-run 开关。
5. **awk 实战**:统计 nginx 日志里每 URL 的 P99 响应时间。
6. **内核参数调优**:在测试集群(3 节点)应用上述 sysctl,跑 YCSB/Hive TPC-DS,对比吞吐变化。

---

## 专家面试题

1. **Load 高但 CPU idle 也高,可能是什么原因?**
   要点:可能是不可中断睡眠(D state)堆积,IO 密集。`vmstat` 的 `b` 列判断;`iostat` 看 `%util`。

2. **怎么排查"磁盘满但 df 看有空间"?**
   要点:inode 耗尽。`df -i` 确认;`find / -type d | wc -l` 看目录数;Hive 小文件常见。

3. **TIME_WAIT 太多怎么办?不会改内核可以吗?**
   要点:首先排查为什么短连接多,加连接池;其次内核 `tcp_tw_reuse=1` + 应用侧 keepalive;**绝对不要** `tcp_tw_recycle`(已废弃,NAT 下会误杀连接)。

4. **`%util` 100% 一定磁盘满吗?**
   要点:不一定。`%util` 是 IO 在跑的时间占比,SSD 随机 IO 吞吐已达上限时也可能 100%。结合 `await`、`r/s+w/s` 看。

5. **大文件 grep 太慢,有哪些优化路径?**
   要点:`LC_ALL=C grep -F` (字面量);固定串用 `ripgrep`;并行 `parallel -j 8 grep`;预 filter by `awk`。

6. **生产里让你印象最深的一次 oncall,你怎么定位的?**
   要点:必须讲清现象 → 用 `vmstat/iostat/sar` 定位到子系统(IO/网络/内存)→ 用 `strace/pidstat` 定位到进程/线程 → 根因 + 修复 + 监控加项。

7. **Linux IO 调度器有哪些?大数据用什么?**
   要点:`cfq`(公平,默认)、`deadline`(截止时间,适合数据库)、`noop`(电梯,SSD/虚拟化)。NVMe 用 `none`(`/sys/block/nvme0n1/queue/scheduler`)。

---

## 生产经验

- **事故现场先 `vmstat 1 5` 看全局,再针对性深挖**:80% 问题在这一步就定位到子系统。
- **`iostat -xz` 比 `iostat` 默认输出价值高 10 倍**:扩展字段能看到 await、%util、队列长度。
- **`sar` 历史文件必须配置保留 7 天**:`/etc/cron.d/sysstat` + `HISTORY=07`,否则事故复盘只能靠回忆。
- **生产内核参数变更用 `sysctl -p`** 而非 echo 写文件,出错有提示。
- **脚本上线前在 staging 跑一遍** `bash -n script.sh`(语法检查)+ `shellcheck script.sh`(静态检查),能挡掉 50% 的低级错误。