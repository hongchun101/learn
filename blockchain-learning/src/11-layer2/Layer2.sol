// SPDX-License-Identifier: MIT
// =============================================================================
// 第 11 章 — Layer 2 与扩容 (Layer 2 & Scaling)
// =============================================================================
// 目标：以 Solidity 描述每种 L2 架构。
//
// 涵盖的概念：
//   1. Optimistic Rollup — 欺诈证明、争议博弈、挑战期
//   2. ZK Rollup — 简洁有效性证明、递归证明聚合
//   3. 状态通道 — 单向支付通道、Lightning 风格可撤销承诺
//   4. Plasma — 退出博弈、批量退出、数据可用性挑战
//   5. 跨链桥 — 轻客户端、多签、通用消息传递
//   6. 数据可用性 — DAS、采样、纠删码
//
// 本章合约：
//   - Optimistic Rollup 争议解决
//   - 状态通道承诺与争议
//   - Validium 风格 DA 委员会
//   - 简化欺诈证明 / 有效性证明状态机
//   - IBC 风格 Merkle 证明（跨链消息）
// =============================================================================
pragma solidity ^0.8.24;

/// @title Optimistic Rollup
/// @notice Sequencer 提交 batch，验证者可在挑战期内提交欺诈证明
/// @dev    状态机：
///         Pending → Challenged → Finalized
///         - sequencer 提交 batch + 保证金
///         - 验证者 7 天内可挑战
///         - 挑战成功：sequencer 保证金被罚没
///         - 挑战失败：挑战者保证金被罚没
contract OptimisticRollup {
    enum BatchStatus { Pending, Challenged, Finalized }

    struct Batch {
        bytes32 batchHash;
        uint64  timestamp;
        address sequencer;
        uint256 bond;
        BatchStatus status;
    }

    /// @notice 挑战期
    uint256 public constant CHALLENGE_PERIOD = 7 days;

    Batch[] public batches;
    mapping(uint256 => address) public challenger;  // batch index → challenger

    event BatchProposed(uint256 indexed index, bytes32 batchHash, address sequencer, uint256 bond);
    event BatchChallenged(uint256 indexed index, address challenger);
    event BatchFinalized(uint256 indexed index);

    /// @notice 提交新批次
    function proposeBatch(bytes32 batchHash) external payable {
        require(msg.value >= 1 ether, "insufficient bond");
        batches.push(Batch({
            batchHash: batchHash,
            timestamp: uint64(block.timestamp),
            sequencer: msg.sender,
            bond: msg.value,
            status: BatchStatus.Pending
        }));
        emit BatchProposed(batches.length - 1, batchHash, msg.sender, msg.value);
    }

    /// @notice 挑战
    /// @param index 批次索引
    /// @param proof 欺诈证明：证明 sequencer 状态转换有误
    function challenge(uint256 index, bytes memory proof) external payable {
        require(msg.value >= 0.5 ether, "insufficient challenger bond");
        require(batches[index].status == BatchStatus.Pending, "not pending");
        require(block.timestamp < batches[index].timestamp + CHALLENGE_PERIOD, "expired");
        require(_verifyFraudProof(proof), "invalid proof");
        batches[index].status = BatchStatus.Challenged;
        challenger[index] = msg.sender;
        emit BatchChallenged(index, msg.sender);
    }

    /// @notice 挑战期结束，无挑战则 final
    function finalize(uint256 index) external {
        require(batches[index].status == BatchStatus.Pending, "not pending");
        require(block.timestamp >= batches[index].timestamp + CHALLENGE_PERIOD, "still challengeable");
        batches[index].status = BatchStatus.Finalized;
        payable(batches[index].sequencer).transfer(batches[index].bond);
        emit BatchFinalized(index);
    }

    /// @notice 校验欺诈证明（占位）
    /// @dev    真实实现：单步执行（single-step proof）模式：
    ///         1. 验证者声明"在状态 S 时，tx T 的执行应该走到 S' 但实际走到了 S''"
    ///         2. 链上合约单步执行 T，比较结果
    function _verifyFraudProof(bytes memory proof) internal pure returns (bool) {
        // 真实实现会比较状态根 + 单步执行
        proof;
        return true;
    }
}

/// @title ZK Rollup
/// @notice Sequencer 提交 batch + 简洁有效性证明（zk-SNARK / zk-STARK）
/// @dev    优势：不需要挑战期；劣势：证明生成成本高
///         关键流程：
///         1. 链下聚合 N 笔交易得到新状态根
///         2. 生成证明 π：s.t. Verify(public_inputs, π) = true
///         3. 链上 verify() 合约检查 π 后立即 finalize
abstract contract ZkRollup {
    struct Batch {
        bytes32 newStateRoot;
        bytes32 oldStateRoot;
        bytes   proof;        // 简洁证明
    }

    Batch[] public batches;
    address public verifier;  // zk 验证器合约地址

    /// @notice 提交新批次 + 证明
    function submitBatch(Batch calldata b) external {
        require(_verifyProof(b), "invalid proof");
        batches.push(b);
    }

    /// @notice 抽象：实际验证器接口（PLONK / Groth16 / STARK）
    function _verifyProof(Batch calldata) internal view virtual returns (bool);
}

/// @title Groth16 风格 ZK 验证器（接口示意）
/// @dev    真实实现：调用 verifier.sol（由 snarkjs 等工具生成）
contract Groth16Verifier is ZkRollup {
    function _verifyProof(Batch calldata b) internal view override returns (bool) {
        // 真实实现：调用 IVerifier(verifier).verifyProof(a, b, c, publicInputs)
        verifier; b;
        return true;
    }
}

/// @title 状态通道
/// @notice Lightning 风格：双方各自签名递增的 commitment，撤掉旧 commitment
/// @dev    关键概念：
///         - 双方共同签署的最新 commitment 视为有效状态
///         - 关闭通道：提交最新 commitment + 双方签名
///         - 挑战：对方可提交更新版本的 commitment（revoked 列表内）→ 罚没
contract StateChannel {
    struct Channel {
        address participant0;
        address participant1;
        uint256 balance0;     // 关闭后 participant0 提取的金额
        uint256 balance1;     // 关闭后 participant1 提取的金额
        bytes32 latestState;  // 最新 commitment 哈希
        bool closed;
        uint64 challengeUntil;
    }

    struct Commitment {
        address participant0;
        address participant1;
        uint256 balance0;
        uint256 balance1;
        uint64 nonce;        // 单调递增
    }

    mapping(bytes32 => Channel) public channels;          // channelId → channel
    mapping(bytes32 => mapping(uint64 => bool)) public revoked; // channelId, nonce → 是否已撤销

    event ChannelOpened(bytes32 indexed id, address p0, address p1);
    event ChannelClosed(bytes32 indexed id, uint256 balance0, uint256 balance1);
    event CommitmentRevoked(bytes32 indexed id, uint64 nonce);

    /// @notice 计算 channelId
    function channelId(address p0, address p1) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(p0, p1));
    }

    /// @notice 打开通道
    function openChannel(address p0, address p1) external returns (bytes32 id) {
        id = channelId(p0, p1);
        require(channels[id].participant0 == address(0), "exists");
        channels[id] = Channel({
            participant0: p0,
            participant1: p1,
            balance0: 0,
            balance1: 0,
            latestState: bytes32(0),
            closed: false,
            challengeUntil: 0
        });
        emit ChannelOpened(id, p0, p1);
    }

    /// @notice 提交一个 commitment（双方签名），关闭通道
    /// @dev    真实实现：用 ecrecover 验证双方签名。
    function closeChannel(
        bytes32 id,
        Commitment calldata c,
        bytes calldata sig0,
        bytes calldata sig1
    ) external {
        Channel storage ch = channels[id];
        require(!ch.closed, "closed");
        require(_verify(c, sig0, ch.participant0) && _verify(c, sig1, ch.participant1), "sig");
        require(revoked[id][c.nonce] == false, "revoked");
        ch.balance0 = c.balance0;
        ch.balance1 = c.balance1;
        ch.latestState = keccak256(abi.encode(c));
        ch.closed = true;
        emit ChannelClosed(id, c.balance0, c.balance1);
    }

    /// @notice 撤销旧 commitment
    function revoke(bytes32 id, uint64 nonce) external {
        revoked[id][nonce] = true;
        emit CommitmentRevoked(id, nonce);
    }

    function _verify(Commitment calldata, bytes calldata, address) internal pure returns (bool) {
        return true;  // 占位
    }
}

/// @title Validium：DA 委员会
/// @notice 数据可用性由委员会签名保障，而非链上 calldata
/// @dev    优势：成本低；劣势：依赖委员会诚实性
library DaCommittee {
    struct Committee {
        address[] members;
    }

    struct Attestation {
        address member;
        bytes32 dataHash;
        bytes signature;
    }

    /// @notice 校验 attestation 集合是否构成 quorum
    /// @param c            委员会
    /// @param atts         收到的 attestation
    /// @param expectedHash 期望的数据哈希
    function quorum(
        Committee storage c,
        Attestation[] memory atts,
        bytes32 expectedHash
    ) internal view returns (bool) {
        uint256 count = 0;
        for (uint256 i = 0; i < atts.length; i++) {
            if (atts[i].dataHash != expectedHash) continue;
            if (!_isMember(c, atts[i].member)) continue;
            count++;
        }
        // 简化：需要 2/3
        return count * 3 >= c.members.length * 2;
    }

    function _isMember(Committee storage c, address m) internal view returns (bool) {
        for (uint256 i = 0; i < c.members.length; i++) {
            if (c.members[i] == m) return true;
        }
        return false;
    }
}

/// @title 跨链桥：IBC 风格轻客户端
/// @notice 通过 Merkle 证明验证跨链消息
/// @dev    验证步骤：
///         1. 验证源链共识客户端已 commit 到了某 root
///         2. 验证 packet 在该 root 之下的 key 上
///         3. 验证 packet 的源链地址 / 时间戳等元数据
library IbcBridge {
    struct Packet {
        uint64 sourceChannel;
        uint64 destChannel;
        bytes  data;
        uint64 timeoutTimestamp;
    }

    /// @notice 校验跨链消息的包含证明
    /// @param root  源链的共识根
    /// @param key   packet 的存储 key
    /// @param value 期望的 packet 编码
    /// @param proof Merkle 证明
    function verifyPacket(
        bytes32 root,
        bytes32 key,
        bytes32 value,
        bytes32[] memory proof
    ) internal pure returns (bool) {
        bytes32 cur = keccak256(abi.encodePacked(key, value));
        for (uint256 i = 0; i < proof.length; i++) {
            cur = _hashPair(cur, proof[i]);
        }
        return cur == root;
    }

    function _hashPair(bytes32 a, bytes32 b) private pure returns (bytes32) {
        return a < b
            ? keccak256(abi.encodePacked(a, b))
            : keccak256(abi.encodePacked(b, a));
    }
}

/// @title 第 11 章入口
/// @notice 部署一个 Optimistic Rollup 演示合约
contract Chapter11 {
    OptimisticRollup public rollup;

    constructor() {
        rollup = new OptimisticRollup();
    }

    /// @notice 提交一个批次
    function submit(bytes32 batchHash) external payable {
        rollup.proposeBatch{value: msg.value}(batchHash);
    }
}
