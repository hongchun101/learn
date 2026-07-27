// SPDX-License-Identifier: MIT
// =============================================================================
// 第 02 章 — 基于哈希的数据结构 (Hash-Based Data Structures)
// =============================================================================
// 目标：以 Solidity 描述每个链工程师必须掌握的哈希数据结构。
//
// 涵盖的概念：
//   1. 二叉 Merkle 树（比特币、以太坊）。奇数叶子复制最后一个节点。
//   2. Merkle Mountain Range (MMR)：Polkadot / Mina / Filecoin
//      使用的仅追加式证明日志。
//   3. Sparse Merkle Tree (SMT)：以 256 bit key 索引的 key/value 树，
//      用于以太坊 Verkle 迁移路径、Cosmos SDK 存储、Rollup 状态承诺。
//   4. Merkle Patricia Trie（以太坊世界/状态树）。
//   5. 通用 accumulator 接口，便于将来对接 UTXO / 区间证明引擎。
//
// 参考资料：
//   - Bitcoin Merkle tree: Bitcoin Developer Guide
//   - MMR: https://github.com/opentimestamps/opentimestamps-server/blob/master/doc/merkle-mountain-range.md
//   - SMT: https://docs.ethereum.org/en/develop/docs/data-structures-and-encoding/patricia-merkle-trie/
// =============================================================================
pragma solidity ^0.8.24;

/// @title 二叉 Merkle 树
/// @notice 比特币 / 以太坊风格的二叉 Merkle 树实现。
/// @dev    叶子节点使用前缀 0x00 防止第二原像攻击；
///         内部节点使用前缀 0x01 防止叶子伪造成内部节点。
library BinaryMerkle {
    /// @notice 叶子节点前缀常量
    bytes1 internal constant LEAF_PREFIX = 0x00;
    /// @notice 内部节点前缀常量
    bytes1 internal constant NODE_PREFIX = 0x01;

    /// @notice 计算叶子哈希 H(0x00 || data)
    function leafHash(bytes memory data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(LEAF_PREFIX, data));
    }

    /// @notice 计算内部节点哈希 H(0x01 || left || right)
    function nodeHash(bytes32 left, bytes32 right) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(NODE_PREFIX, left, right));
    }

    /// @notice 证明步骤：兄弟节点哈希以及它在父节点中的位置
    struct ProofStep {
        bytes32 sibling;
        bool isLeft;     // true 表示 sibling 在左
    }

    /// @notice 给定叶子列表构建 Merkle 树，奇数层复制最后一个节点
    /// @dev    BTC 风格：若某层节点数为奇数，最后一个节点被复制一次以凑成对。
    /// @return 树层级（每一层是当层节点哈希数组）
    function buildTree(bytes32[] memory leaves)
        internal
        pure
        returns (bytes32[][] memory)
    {
        require(leaves.length > 0, "empty leaves");
        bytes32[][] memory levels = new bytes32[][](_treeHeight(leaves.length));
        levels[0] = leaves;
        uint256 level = 0;
        while (levels[level].length > 1) {
            uint256 n = levels[level].length;
            uint256 next = (n + 1) / 2;
            levels[level + 1] = new bytes32[](next);
            for (uint256 i = 0; i < n / 2; i++) {
                levels[level + 1][i] = nodeHash(levels[level][2 * i], levels[level][2 * i + 1]);
            }
            if (n % 2 == 1) {
                // 奇数：复制最后一个节点
                levels[level + 1][next - 1] = nodeHash(levels[level][n - 1], levels[level][n - 1]);
            }
            level++;
        }
        return levels;
    }

    /// @notice 获取 Merkle 根
    function root(bytes32[] memory leaves) internal pure returns (bytes32) {
        bytes32[][] memory tree = buildTree(leaves);
        return tree[tree.length - 1][0];
    }

    /// @notice 生成位置 index 处叶子的 Merkle 证明
    /// @dev    证明长度 = ceil(log2(N))；每一步携带兄弟节点及方向。
    function proof(bytes32[] memory leaves, uint256 index)
        internal
        pure
        returns (ProofStep[] memory)
    {
        require(index < leaves.length, "index out of bounds");
        bytes32[][] memory tree = buildTree(leaves);
        ProofStep[] memory steps = new ProofStep[](tree.length - 1);
        uint256 idx = index;
        for (uint256 level = 0; level < tree.length - 1; level++) {
            bytes32[] memory layer = tree[level];
            uint256 pairIdx = idx ^ 1;
            if (pairIdx >= layer.length) {
                // 奇数情况：兄弟节点就是自己
                pairIdx = idx;
            }
            steps[level] = ProofStep({sibling: layer[pairIdx], isLeft: idx & 1 == 0});
            idx = idx / 2;
        }
        return steps;
    }

    /// @notice 验证 Merkle 证明
    function verify(
        bytes32 leaf,
        bytes32 rootHash,
        uint256 index,
        ProofStep[] memory steps
    ) internal pure returns (bool) {
        bytes32 current = leaf;
        uint256 idx = index;
        for (uint256 i = 0; i < steps.length; i++) {
            if (steps[i].isLeft) {
                current = nodeHash(steps[i].sibling, current);
            } else {
                current = nodeHash(current, steps[i].sibling);
            }
            idx = idx / 2;
        }
        return current == rootHash;
    }

    /// @dev 计算 Merkle 树的层数
    function _treeHeight(uint256 n) private pure returns (uint256) {
        uint256 h = 0;
        uint256 cur = n;
        while (cur > 1) {
            cur = (cur + 1) / 2;
            h++;
        }
        return h + 1;
    }
}

/// @title Merkle Mountain Range (MMR)
/// @notice 仅追加式证明日志；Polkadot / Mina / Filecoin 使用。
/// @dev    每座 "山" 是一个完美二叉子树。山峰随追加增长。
///         MMR 的核心优势：
///         - 追加 O(log n)
//         - 生成历史元素证明 O(log n) 且证明大小 O(log n)
//         - 不需要重建整棵树
library Mmr {
    /// @notice MMR 节点结构
    struct Node {
        bytes32 hash;
        uint64 height;     // 该节点位于的层高（0 = 叶子）
        uint64 pos;        // 节点位置编号
    }

    struct MmrState {
        Node[] nodes;          // 全部节点
        uint64[] peaks;        // 当前山峰的位置
    }

    /// @notice 追加一个叶子，返回该叶子位置
    function append(MmrState storage state, bytes32 leaf) internal returns (uint64) {
        uint64 pos = uint64(state.nodes.length);
        state.nodes.push(Node({hash: leaf, height: 0, pos: pos}));
        // 当两个相邻的同高度节点形成父节点时，将其合并
        uint64 height = 0;
        uint64 left = pos;
        while (_isPerfectParent(state.peaks.length, height)) {
            uint64 sibling = state.peaks[state.peaks.length - 1];
            bytes32 parentHash = BinaryMerkle.nodeHash(state.nodes[sibling].hash, leaf);
            uint64 parentPos = uint64(state.nodes.length);
            state.nodes.push(Node({hash: parentHash, height: height + 1, pos: parentPos}));
            state.peaks.pop();
            left = parentPos;
            height++;
        }
        state.peaks.push(left);
        return pos;
    }

    /// @notice 计算 MMR 根：山峰按 height 升序拼接后做 fold
    /// @dev    真实实现会用 "bag the peaks" 算法将山峰递归配对。
    function root(MmrState storage state) internal view returns (bytes32) {
        if (state.peaks.length == 0) return bytes32(0);
        bytes32 acc = state.nodes[state.peaks[0]].hash;
        for (uint256 i = 1; i < state.peaks.length; i++) {
            acc = BinaryMerkle.nodeHash(acc, state.nodes[state.peaks[i]].hash);
        }
        return acc;
    }

    /// @dev 判断是否应与前一个山峰合并
    function _isPerfectParent(uint256 peakCount, uint64 height)
        private
        pure
        returns (bool)
    {
        // 简化规则：若 (peakCount & (1 << height)) != 0，则左兄弟存在
        return (peakCount >> height) & 1 == 1;
    }
}

/// @title Sparse Merkle Tree (SMT)
/// @notice 以 256 bit key 索引的 key/value 树；空子树使用预计算的常量。
/// @dev    关键性质：相同 key 集合产生唯一根 → 可作为状态承诺。
library SparseMerkle {
    /// @notice 空子树的根（所有位都未设置）
    bytes32 public constant EMPTY_ROOT = bytes32(0);

    /// @notice 叶子结构
    struct Leaf {
        bytes32 key;
        bytes32 valueHash;
    }

    /// @notice SMT 状态（用 mapping 模拟 key → value）
    struct SmtState {
        mapping(bytes32 => bytes32) leaves;   // key → value
        bytes32 root;                          // 当前根（应用层缓存）
    }

    /// @notice 写入或删除一个 key
    function set(SmtState storage state, bytes32 key, bytes32 value) internal {
        if (value == bytes32(0)) {
            delete state.leaves[key];
        } else {
            state.leaves[key] = value;
        }
        // 真实实现：沿位逐层重算路径；这里更新根占位。
        state.root = keccak256(abi.encodePacked(key, value));
    }

    /// @notice 读取一个 key
    function get(SmtState storage state, bytes32 key) internal view returns (bytes32) {
        return state.leaves[key];
    }

    /// @notice SMT 包含证明 (inclusion proof)
    /// @dev    证明长度 = 256（每层 1 个兄弟节点），极大约 8KB。
    ///        优化方案：基于 Poseidon / Pedersen hash 的 zk-friendly SMT。
    function proveMembership(
        SmtState storage state,
        bytes32 key,
        bytes32 value
    ) internal view returns (bool) {
        return state.leaves[key] == value;
    }
}

/// @title Hexary Merkle Patricia Trie（以太坊状态树）
/// @notice 16 叉基数树，叶子 / 扩展 / 分支三类节点。
/// @dev    实际以太坊实现是 Hex-Patricia 树：
///         - 分支节点：16 个子节点 + value
///         - 扩展节点：偶数 nibble 的共享前缀
///         - 叶子节点：奇数 nibble 终止 + value
///         全部节点使用 RLP 编码，根哈希为 keccak256(rlp(node))。
library HexaryPatricia {
    /// @notice 分支节点（16 + value）
    struct Branch {
        bytes32[16] children;   // 16 个子节点哈希
        bytes32 value;          // 当前节点是否承载 value
    }

    /// @notice 扩展节点（共享前缀 + 下一节点哈希）
    struct Extension {
        bytes nibbles;          // 偶数 nibble 的前缀
        bytes32 child;
    }

    /// @notice 叶子节点（奇数终止前缀 + value）
    struct Leaf {
        bytes nibbles;          // 奇数 nibble 的路径
        bytes32 value;
    }

    /// @notice 节点类型枚举
    enum NodeKind { Empty, Branch, Extension, Leaf }

    /// @notice 通用节点包装
    struct Node {
        NodeKind kind;
        bytes32 branchHash;     // 当 kind == Branch 时
        bytes nibblesExt;       // 当 kind == Extension / Leaf 时
        bytes32 childOrValue;
    }

    /// @notice 状态入口：地址 → 账户 RLP 编码
    /// @dev    世界状态树根 = keccak256(rlp(rootNode))
    ///         存储树根    = keccak256(rlp(storageRootNode))
    ///         账户编码    = rlp([nonce, balance, storageRoot, codeHash])
    struct WorldState {
        mapping(address => bytes32) accountRoot;   // 地址 → 账户 RLP 的 keccak256
    }

    /// @notice 计算账户 RLP 编码并更新根
    function putAccount(
        WorldState storage ws,
        address addr,
        uint64 nonce,
        uint256 balance,
        bytes32 storageRoot,
        bytes32 codeHash
    ) internal {
        bytes memory rlp = abi.encode(nonce, balance, storageRoot, codeHash);
        ws.accountRoot[addr] = keccak256(rlp);
    }
}

/// @title 第 02 章入口
/// @notice 演示二叉 Merkle、SMT、空根等关键调用
contract Chapter02 {
    using BinaryMerkle for bytes32[];

    /// @notice 端到端演示：构造 5 笔交易的 Merkle 根并生成位置 2 的证明
    /// @return rootHash  Merkle 根
    /// @return proofSize 证明长度（期望为 ceil(log2(5)) = 3）
    /// @return verified 证明验证结果
    function demo(bytes32[] memory leaves)
        external
        pure
        returns (bytes32 rootHash, uint256 proofSize, bool verified)
    {
        require(leaves.length == 5, "demo needs 5 leaves");
        rootHash = leaves.root();
        BinaryMerkle.ProofStep[] memory p = leaves.proof(2);
        proofSize = p.length;
        verified = BinaryMerkle.verify(leaves[2], rootHash, 2, p);
    }
}
