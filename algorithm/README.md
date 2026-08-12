# 算法教程 · 通往 LeetCode 2000 题的完整指南

> 一份包罗万象的算法教程。学完本教程,你将系统掌握计算机算法与数据结构的全部核心知识,具备独立解决 LeetCode 上 2000+ 道题目的能力。

---

## 目录结构

```
algorithm/
├── README.md                    ← 你正在阅读(总览与学习方法)
├── 00-methodology.md            解题方法论:四步思考法
├── 01-complexity.md             复杂度分析:大 O、均摊、势能
├── 02-math-bit.md               数学与位运算基础
│
├── data-structure/
│   ├── 01-array-string.md       数组与字符串
│   ├── 02-linked-list.md        链表
│   ├── 03-stack-queue.md        栈与队列
│   ├── 04-hash.md               哈希表与哈希函数
│   ├── 05-tree.md               树与二叉树
│   ├── 06-heap.md               堆与优先队列
│   ├── 07-trie.md               字典树 Trie
│   ├── 08-union-find.md         并查集
│   ├── 09-segment-tree.md       线段树
│   ├── 10-binary-indexed-tree.md  树状数组 BIT
│   ├── 11-balanced-tree.md      平衡树(AVL/红黑树/Treap/Splay)
│   ├── 12-monotonic.md          单调栈/单调队列
│   └── 13-skiplist.md          跳表
│
├── algorithm/
│   ├── 01-sort.md               排序全家桶
│   ├── 02-binary-search.md      二分查找全集
│   ├── 03-two-pointer.md        双指针
│   ├── 04-sliding-window.md     滑动窗口
│   ├── 05-prefix-diff.md        前缀和与差分
│   ├── 06-divide-conquer.md     分治法
│   ├── 07-dfs-bfs.md            深度/广度优先搜索
│   ├── 08-backtrack.md          回溯
│   ├── 09-greedy.md             贪心
│   ├── 10-dp-basic.md           动态规划基础
│   ├── 11-dp-advanced.md        动态规划进阶
│   ├── 12-dp-optimization.md    DP 优化(单调队列/斜率/四边形)
│   ├── 13-graph.md              图论基础与高级
│   ├── 14-network-flow.md       网络流
│   ├── 15-string.md             字符串算法
│   ├── 16-number-theory.md      数论
│   ├── 17-combinatorics.md      组合数学
│   ├── 18-probability.md        概率与期望
│   ├── 19-game-theory.md        博弈论(SG/极大极小)
│   ├── 20-geometry.md           计算几何
│   └── 21-matrix-random.md      矩阵快速幂与随机化
│
└── practice/
    ├── problem-list.md          LeetCode 2000 题分类清单
    ├── templates.md             80+ 高频代码模板
    └── interview-curve.md       面试出题规律与刷题路线图
```

---

## 学习路线图

### 阶段一:地基(第 1–2 周)
1. `00-methodology.md` — 学会"看懂题—建模—选型—编码"的四步法
2. `01-complexity.md` — 能算时间/空间复杂度,识别最优解范围
3. `02-math-bit.md` — 位运算速算、GCD/质数、模运算

### 阶段二:数据结构(第 3–5 周)
按以下顺序刷完 13 个数据结构章节,每章"原理 → 模板 → 5 道 LeetCode":
1. 数组/字符串 → 链表 → 栈/队列 → 哈希
2. 树 → 堆 → Trie → 并查集
3. 线段树 → BIT → 平衡树 → 单调结构 → 跳表

### 阶段三:核心算法(第 6–10 周)
按以下顺序,每个算法从模板到变式:
1. 排序 → 二分 → 双指针 → 滑动窗口
2. 前缀和/差分 → 分治 → DFS/BFS → 回溯 → 贪心
3. **动态规划**(花 3 周,这是 LeetCode 题量最大的板块)
4. 图论全套 → 网络流
5. 字符串全套 → 数学全套

### 阶段四:实战(第 11+ 周)
- 分类刷完 `practice/problem-list.md` 中 2000 题
- 背诵 `practice/templates.md` 的 80+ 模板
- 每周一次模拟面试,使用 `practice/interview-curve.md` 的出题规律

---

## 为什么这份教程能让你"解决 2000 题"

LeetCode 2000+ 题的本质是 **约 80 个核心模式**(patterns)的排列组合。本教程:

1. **模式穷举**:每个章节给出"该类问题的本质模型"
2. **模板复用**:80+ 模板覆盖 90% 的题目骨架,改条件即可
3. **思维方法论**:`00-methodology.md` 教你识别"这道题属于哪个模式"
4. **题单覆盖**:`practice/problem-list.md` 按模式分类,涵盖 LeetCode 全题库
5. **举一反三**:每个算法都给出"边界变式"(如二分的 11 种写法、回溯的 6 种剪枝)

**核心信念**:刷 2000 题不需要 2000 种解法,只需要 **80 个模式 × 25 道变式题 = 2000**。

---

## 如何使用本教程

| 角色 | 建议路径 |
|------|---------|
| 完全新手 | 按目录顺序逐章学,每章做课后 5 题 |
| 有基础 | 跳过数据结构原理,直接看模板,刷题补缺 |
| 面试冲刺 | 只看 `practice/templates.md` + `interview-curve.md` |
| 算法竞赛 | 重点看 `12-dp-optimization`、`13-graph`、`14-network-flow`、`15-string` 进阶部分 |

每章末尾有 **"思维导图"** 与 **"5 道课后题"**,确保学完即练。

---

## 配套使用

- **代码实现**:每段伪代码都附带 Python 与 C++ 双版本核心代码
- **图示**:复杂结构(如线段树、Suffix Automaton)用 ASCII 图辅助理解
- **复杂度表格**:每种算法/数据结构给出"何时用、何时不用"的判断矩阵

---

**下一步**:打开 `00-methodology.md`,先掌握解题方法论。
