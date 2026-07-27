// SPDX-License-Identifier: MIT
// =============================================================================
// 第 06 章 — 共识协议 (Consensus Protocols)
// =============================================================================
// 目标：以 Solidity 描述每种主流共识家族。
//
// 涵盖的概念：
//   1. 工作量证明 (PoW) — Hashcash 风格谜题（比特币）
//   2. 权益证明 (PoS) — Casper FFG（以太坊信标链）
//   3. BFT 风格共识 — HotStuff / Tendermint 仲裁投票
//   4. 历史证明 (PoH) — Solana 的可验证延迟函数
//   5. 最终性小工具 — Casper FFG checkpoint, justified vs finalized
//
// 参考资料：
//   - Buterin & Griffith, Casper FFG: https://arxiv.org/abs/1710.09437
//   - Yin et al., HotStuff: https://arxiv.org/abs/1803.05069
//   - Yakovenko, PoH: https://solana.com/solana-whitepaper.pdf
// =============================================================================
pragma solidity ^0.8.24;

/// @title 工作量证明 (PoW)
/// @notice Hashcash 风格：搜索使 hash(header) < target 的 nonce。
/// @dev    链上 PoW 仅用于协议级描述；真实 PoW 在链外进行。
library ProofOfWork {
    /// @notice 挖矿模板
    struct Template {
        int32  version;
        bytes32 prevBlock;
        bytes32 merkleRoot;
        uint32 timestamp;
        uint32 bits;
    }

    /// @notice 挖出的区块
    struct Mined {
        Template template;
        uint32 nonce;
        bytes32 hash;
    }

    /// @notice 序列化挖矿头（不含 nonce）
    function serializeTemplate(Template memory t) internal pure returns (bytes memory) {
        return abi.encodePacked(
            t.version, t.prevBlock, t.merkleRoot, t.timestamp, t.bits
        );
    }

    /// @notice 给定 nonce 序列化完整头
    function serialize(Template memory t, uint32 nonce) internal pure returns (bytes memory) {
        return abi.encodePacked(serializeTemplate(t), nonce);
    }

    /// @notice 一次迭代：给定 nonce 计算哈希并检查是否满足目标
    function check(Template memory t, uint32 nonce, uint256 target) internal view returns (bool ok, bytes32 h) {
        h = sha256(abi.encodePacked(sha256(serialize(t, nonce))));
        ok = uint256(h) <= target;
    }

    /// @notice 链下 PoW 求解（示意）
    /// @dev    真实挖矿需要 ASIC 矿机；这里给出循环接口。
    function mine(Template memory t, uint256 target, uint32 maxIterations)
        internal
        view
        returns (Mined memory)
    {
        for (uint32 n = 0; n < maxIterations; n++) {
            (bool ok, bytes32 h) = check(t, n, target);
            if (ok) {
                return Mined({template: t, nonce: n, hash: h});
            }
        }
        revert("no solution found");
    }
}

/// @title Casper FFG（Finality Gadget）
/// @notice 以太坊信标链中 PoS 的最终性协议；与 LMD-GHOST 一起工作。
/// @dev    关键概念：
///         - Checkpoint = (epoch, block_hash)
///
///         - Justified：2/3 验证者投票支持上一 justified 的直接子节点
///         - Finalized：连续两个 justified 块，第二个即为 finalized
///         - 投票 (source, target) 表示验证者从 source 跳到 target 的合法性
///         罚没（slashing）条件：
///         - 双重投票：同一 target 不同 source
///         - 环绕投票：source/target 与已发投票形成"环绕"
library CasperFfg {
    /// @notice Checkpoint
    struct Checkpoint {
        uint64 epoch;
        bytes32 blockHash;
    }

    /// @notice 验证者投票
    struct Vote {
        bytes32 validator;       // 验证者身份（pubkey hash）
        Checkpoint source;
        Checkpoint target;
    }

    /// @notice FFG 状态
    struct State {
        Checkpoint justified;
        Checkpoint finalized;
        // 验证者集合
        bytes32[] validators;
        uint256 stakePerValidator;
    }

    /// @notice 创建一个新的 FFG 状态
    function newState(bytes32[] memory validators, uint256 stakePerValidator)
        internal
        pure
        returns (State memory)
    {
        return State({
            justified: Checkpoint({epoch: 0, blockHash: bytes32(0)}),
            finalized: Checkpoint({epoch: 0, blockHash: bytes32(0)}),
            validators: validators,
            stakePerValidator: stakePerValidator
        });
    }

    /// @notice 校验单个投票
    /// @dev    合法投票条件：
    ///         - source.height < target.height（同代或递增）
    ///         - source 必须是当前或前一个 justified checkpoint
    ///         - target 必须是 source 的子孙
    function checkVote(State memory s, Vote memory v) internal pure returns (bool) {
        if (v.target.epoch <= v.source.epoch) return false;
        if (v.source.epoch != s.justified.epoch) return false;
        // 真实实现会校验 target 是 source 的子孙
        return true;
    }

    /// @notice 应用一个投票，聚合到 2/3 阈值后 justified / finalized 更新
    /// @return kind "new-justified" | "new-finalized" | null
    function applyVote(State storage s, Vote memory v, uint256 voteStake)
        internal
        returns (string memory kind)
    {
        require(checkVote(s, v), "invalid vote");
        // 简化：单一票即更新 justified
        s.justified = v.target;
        // 若 source 已是 justified，则本轮 target 也 finalized
        if (v.source.epoch == s.finalized.epoch || s.finalized.epoch == 0) {
            s.finalized = v.target;
            return "new-finalized";
        }
        return "new-justified";
    }
}

/// @title HotStuff / Tendermint BFT 仲裁
/// @notice 领导者驱动的两轮投票协议。
/// @dev    HotStuff 核心：
///         1. 领导 propose 块
///         2. 验证者发送 prepareVote (qc on parent)
///         3. 领导收集 2/3+ 投票 → 形成 prepareQC
///         4. 验证者发送 preCommitVote (qc on block)
///         5. 领导收集 2/3+ → 形成 commitQC → 块 committed
///         Tendermint 类似但有锁替换规则。
library HotStuff {
    /// @notice 仲裁证书：2/3+ 签名集合
    struct QuorumCert {
        bytes32 blockHash;
        uint64 height;
        uint64 round;
        uint256 totalStake;
    }

    /// @notice 投票
    struct Vote {
        bytes32 validator;
        QuorumCert qc;
    }

    /// @notice 仲裁状态（仅可在 storage 中实例化，因为含 mapping）
    struct Quorum {
        uint256 totalStake;
        uint256 threshold;       // 通常 2/3 + 1
        mapping(bytes32 => bool) seen;
        mapping(bytes32 => uint256) stakeOf;
    }

    /// @notice 在 storage 中创建 Quorum 占位
    /// @dev    真实初始化由上层合约的构造函数完成；这里只描述字段。
    function placeholder() internal pure {}

    /// @notice 累加投票并判断是否达到 2/3
    function tally(Quorum storage q, bytes32 validator, uint256 stake)
        internal
        returns (bool)
    {
        require(!q.seen[validator], "double vote");
        q.seen[validator] = true;
        q.stakeOf[validator] = stake;
        uint256 sum = 0;
        // 简化：实际遍历所有 validator 的 stake
        sum += stake;
        return sum >= q.threshold;
    }
}

/// @title Proof of History (PoH) — Solana 风格 VDF
/// @notice 顺序哈希计数器：每个输出都依赖前一个，因此生成 N 个输出至少
///         需要 N 次顺序哈希，无法被并行硬件短路。
/// @dev    真实 PoH 还会周期性嵌入事件 tick；这里给出核心 VDF 接口。
library ProofOfHistory {
    /// @notice PoH 状态
    struct State {
        bytes32 lastHash;
        uint64 tickCount;
    }

    /// @notice 推进一个 tick
    function tick(State storage s) internal {
        s.lastHash = sha256(abi.encodePacked(s.lastHash));
        s.tickCount += 1;
    }

    /// @notice 嵌入一个事件
    function recordEvent(State storage s, bytes32 eventHash) internal {
        // 每 N 个 tick 嵌入一次事件，事件哈希会混入下一次哈希中
        s.lastHash = sha256(abi.encodePacked(s.lastHash, eventHash));
    }

    /// @notice 验证某事件是否在指定 tick 之后被记录
    function verifyAfter(State storage s, bytes32 eventHash, uint64 targetTick)
        internal
        view
        returns (bool)
    {
        if (s.tickCount < targetTick) return false;
        // 真实实现：从 s.lastHash 倒推 targetTick 次，与 eventHash 比对
        return targetTick > 0;
    }
}

/// @title 第 06 章入口
/// @notice 演示 PoW 求解、Casper FFG 状态、HotStuff 仲裁初始化
contract Chapter06 {
    using ProofOfWork for ProofOfWork.Template;
    using ProofOfHistory for ProofOfHistory.State;

    ProofOfHistory.State poh;

    /// @notice 跑一个 PoH tick，演示 VDF
    function pohTick() external returns (bytes32 h) {
        poh.tick();
        h = poh.lastHash;
    }

    /// @notice 嵌入事件
    function pohRecord(bytes32 e) external returns (bytes32 h) {
        poh.recordEvent(e);
        h = poh.lastHash;
    }

    /// @notice PoW 单次校验
    function powCheck(
        ProofOfWork.Template memory t,
        uint32 nonce,
        uint256 target
    ) external view returns (bool ok, bytes32 h) {
        return ProofOfWork.check(t, nonce, target);
    }
}
