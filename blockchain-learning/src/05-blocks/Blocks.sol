// SPDX-License-Identifier: MIT
// =============================================================================
// 第 05 章 — 区块与链验证 (Blocks & Chain Validation)
// =============================================================================
// 目标：以 Solidity 描述每个区块/头部模型与验证流程。
//
// 涵盖的概念：
//   * 比特币区块头（80 字节）：
//       version (4) || prev_block (32) || merkle_root (32)
//       || timestamp (4) || bits (4) || nonce (4)
//   * 验证：
//       - merkle_root 必须匹配交易列表
//       - blockHash 必须满足难度目标
//       - timestamp 必须在 median time 范围内
//   * 难度调整：每 2016 个区块（比特币），4 倍钳制
//   * GHOST 分叉选择：选择累计工作量最大的子树
//   * 区块哈希：SHA-256d(80 字节头)
//
// 参考资料：
//   - BIP-9 (version bits)
// =============================================================================
pragma solidity ^0.8.24;

/// @title 比特币风格的区块头与验证
/// @notice 完整描述比特币 80 字节区块头、难度目标、SPV 证明、GHOST 选链。
library BlockHeader {
    /// @notice 区块头（80 字节）
    struct Header {
        int32  version;        // BIP-9 / BIP-90 信号位
        bytes32 prevBlock;     // 上一个区块哈希
        bytes32 merkleRoot;    // 交易列表的 Merkle 根
        uint32 timestamp;      // unix 秒
        uint32 bits;           // 紧凑目标编码
        uint32 nonce;          // PoW 搜索空间
    }

    /// @notice 区块 = 头 + 交易列表
    struct Block {
        Header header;
        bytes32[] txids;
    }

    /// @notice 序列化 80 字节头（小端序）
    function serialize(Header memory h) internal pure returns (bytes memory) {
        return abi.encodePacked(
            h.version,         // 4 字节
            h.prevBlock,       // 32 字节
            h.merkleRoot,      // 32 字节
            h.timestamp,       // 4 字节
            h.bits,            // 4 字节
            h.nonce            // 4 字节
        );
    }

    /// @notice 计算区块哈希：双 SHA-256(80 字节头)
    function blockHash(Header memory h) internal view returns (bytes32) {
        bytes memory ser = serialize(h);
        bytes32 h1 = sha256(ser);
        return sha256(abi.encodePacked(h1));
    }
}

/// @title 紧凑目标编码 (nBits)
/// @notice 比特币的浮点目标编码：mantissa * 256^(exp - 3)
/// @dev    布局（4 字节）：
///         - 高 1 字节：指数 exp
///         - 低 3 字节：尾数 mantissa
///         target = mantissa * 256^(exp - 3)
///         反向：exp = ceil(bitlen(target) / 8)
library CompactTarget {
    /// @notice nBits → target
    function toTarget(uint32 nBits) internal pure returns (uint256) {
        uint256 exp = uint256(uint8(nBits >> 24));
        uint256 mantissa = uint256(nBits & 0x00FFFFFF);
        return mantissa * (256 ** (exp - 3));
    }

    /// @notice target → nBits
    function fromTarget(uint256 target) internal pure returns (uint32) {
        require(target > 0, "zero target");
        // 计算有效位长
        uint256 bitlen = 0;
        uint256 t = target;
        while (t > 0) {
            t >>= 1;
            bitlen++;
        }
        uint256 exp = (bitlen + 7) / 8;
        uint256 mantissa = target >> (8 * (exp - 3));
        // 尾数最高位不能为 1
        if (mantissa & 0x00800000 != 0) {
            mantissa >>= 8;
            exp += 1;
        }
        return uint32((exp << 24) | (mantissa & 0x00FFFFFF));
    }

    /// @notice 将区块哈希解释为大整数（用于 PoW 比较）
    function hashAsBigInt(bytes32 h) internal pure returns (uint256) {
        return uint256(h);
    }

    /// @notice 校验 PoW：blockHash <= target
    function meetsTarget(uint32 bits, bytes32 h) internal pure returns (bool) {
        return hashAsBigInt(h) <= toTarget(bits);
    }
}

/// @title 难度调整（每 2016 块）
/// @notice 通过比较实际出块时间与目标间隔（10 分钟），调整 bits。
/// @dev    公式（来自 Bitcoin Core）：
///         new_target = old_target * (actual_timespan / expected_timespan)
///         expected_timespan = 2016 * 600 = 1,209,600 秒 (两周)
///         钳制：actual ∈ [expected/4, expected*4]
///         异常：如果比例超过 4x 仍不足以让周期翻倍 / 减半。
library DifficultyAdjust {
    /// @notice 每 2016 块调整一次难度
    uint256 internal constant RETARGET_INTERVAL = 2016;
    /// @notice 目标出块间隔（10 分钟）
    uint256 internal constant TARGET_SPACING    = 600;
    /// @notice 最大调整倍数
    uint256 internal constant MAX_ADJUST        = 4;

    /// @notice 计算下一周期的 bits
    /// @param prevBits          上一个 retarget 点的 bits
    /// @param prevTimestamp     上一个 retarget 点的 timestamp
    /// @param firstTimestamp    本周期第一个区块的 timestamp
    function nextBits(
        uint32 prevBits,
        uint32 prevTimestamp,
        uint32 firstTimestamp
    ) internal pure returns (uint32) {
        uint256 oldTarget = CompactTarget.toTarget(prevBits);
        uint256 timespan = uint256(prevTimestamp) - uint256(firstTimestamp);
        uint256 expected = RETARGET_INTERVAL * TARGET_SPACING;
        if (timespan < expected / MAX_ADJUST) timespan = expected / MAX_ADJUST;
        if (timespan > expected * MAX_ADJUST) timespan = expected * MAX_ADJUST;
        uint256 newTarget = (oldTarget * timespan) / expected;
        return CompactTarget.fromTarget(newTarget);
    }
}

/// @title 区块验证结果
/// @notice 校验头 + 交易列表 + 时间戳 + PoW 的整体函数
library BlockValidation {
    enum Verdict { Valid, BadMerkleRoot, BadTimestamp, BadPoW, BadVersion }

    struct Result {
        Verdict verdict;
        bytes32 blockHash;
    }

    /// @notice 验证一个完整区块
    /// @param b              候选区块
    /// @param previousMedianTime 上一个区块的中位时间（11 个区块的中位数）
    function validate(BlockHeader.Block memory b, uint32 previousMedianTime)
        internal
        view
        returns (Result memory)
    {
        bytes32 h = BlockHeader.blockHash(b.header);
        // 1. 校验 Merkle 根：调用 BinaryMerkle.root
        bytes32 computed = _merkleRoot(b.txids);
        if (computed != b.header.merkleRoot) {
            return Result({verdict: Verdict.BadMerkleRoot, blockHash: h});
        }
        // 2. 校验时间戳：必须严格大于 previousMedianTime
        if (b.header.timestamp <= previousMedianTime) {
            return Result({verdict: Verdict.BadTimestamp, blockHash: h});
        }
        // 3. 校验 PoW
        if (!CompactTarget.meetsTarget(b.header.bits, h)) {
            return Result({verdict: Verdict.BadPoW, blockHash: h});
        }
        return Result({verdict: Verdict.Valid, blockHash: h});
    }

    /// @notice 用 BinaryMerkle 计算根
    function _merkleRoot(bytes32[] memory leaves) private pure returns (bytes32) {
        if (leaves.length == 0) return bytes32(0);
        if (leaves.length == 1) return leaves[0];
        bytes32[] memory cur = leaves;
        while (cur.length > 1) {
            uint256 n = cur.length;
            uint256 next = (n + 1) / 2;
            bytes32[] memory nxt = new bytes32[](next);
            for (uint256 i = 0; i < n / 2; i++) {
                nxt[i] = sha256(abi.encodePacked(bytes1(0x01), cur[2 * i], cur[2 * i + 1]));
            }
            if (n % 2 == 1) {
                nxt[next - 1] = sha256(abi.encodePacked(bytes1(0x01), cur[n - 1], cur[n - 1]));
            }
            cur = nxt;
        }
        return cur[0];
    }
}

/// @title SPV 证明（简单支付验证）
/// @notice 轻客户端只下载区块头，需要验证某交易被包含。
/// @dev    步骤：
///         1. 拿到交易 txid
///         2. 拿到 merkleProof（一连串兄弟节点）
///         3. 用 leaf + proof 重算 root，与 header.merkleRoot 比对
///         4. 再把 header 与最长链头比对
library SpvProof {
    /// @notice 证明结构
    struct Proof {
        BlockHeader.Header header;
        bytes32 txid;
        uint256 txIndex;
        // Merkle 证明：每一层的兄弟节点
        bytes32[] siblings;
        bool[]   isLeft;
    }

    /// @notice 校验 SPV 证明
    function verify(Proof memory p) internal view returns (bool) {
        // 1. 用兄弟节点重算根
        bytes32 cur = p.txid;
        uint256 idx = p.txIndex;
        for (uint256 i = 0; i < p.siblings.length; i++) {
            if (p.isLeft[i]) {
                cur = sha256(abi.encodePacked(bytes1(0x01), p.siblings[i], cur));
            } else {
                cur = sha256(abi.encodePacked(bytes1(0x01), cur, p.siblings[i]));
            }
            idx >>= 1;
        }
        // 2. 比对 merkleRoot
        return cur == p.header.merkleRoot;
    }
}

/// @title GHOST 分叉选择
/// @notice 选择累计工作量最大的子树作为主链。
/// @dev    与最长链规则不同，GHOST 把孤块（uncle）的工作量计入主链，
///         在高区块间隔 / 低出块时间场景下更安全（早期以太坊使用）。
library Ghost {
    /// @notice 树节点：包含区块 + 累计工作量
    struct TreeNode {
        BlockHeader.Block block;
        bytes32 blockHash;
        uint256 cumulativeWork;
        TreeNode[] children;
    }

    /// @notice 递归：选累计工作量最大的子树
    function heaviestTip(TreeNode memory node)
        internal
        view
        returns (TreeNode memory best)
    {
        best = node;
        for (uint256 i = 0; i < node.children.length; i++) {
            TreeNode memory child = heaviestTip(node.children[i]);
            if (_workGte(child.cumulativeWork, best.cumulativeWork)) {
                best = child;
            }
        }
    }

    /// @dev 累计工作量比较（PoW 难度倒数之和）
    function _workGte(uint256 a, uint256 b) private pure returns (bool) {
        return a >= b;
    }
}

/// @title 第 05 章入口
/// @notice 演示区块哈希、PoW 校验、难度调整接口
contract Chapter05 {
    using BlockHeader for BlockHeader.Header;
    using CompactTarget for uint32;
    using DifficultyAdjust for uint32;

    /// @notice 端到端演示：序列化头 → 计算哈希 → 校验 PoW → 调整难度
    function demo(
        BlockHeader.Header memory h,
        bytes32[] memory txids
    ) external view returns (bytes32 h256, bool valid, uint32 nextBits) {
        // 1. 区块哈希
        h256 = h.blockHash();
        // 2. PoW 校验
        valid = h.bits.meetsTarget(h256);
        // 3. 难度调整（占位：实际需要两个 retarget 点的 timestamp）
        nextBits = h.bits.nextBits(h.timestamp, h.timestamp - 1);
        txids; // 引用以消除警告
    }
}
