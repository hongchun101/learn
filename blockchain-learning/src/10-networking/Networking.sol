// SPDX-License-Identifier: MIT
// =============================================================================
// 第 10 章 — P2P 网络 (P2P Networking)
// =============================================================================
// 目标：以 Solidity 描述 P2P 网络协议级概念。
//
// 涵盖的概念：
//   1. devp2p（以太坊）和 libp2p（Polkadot / Substrate / Cosmos / IPFS）
//   2. RLPx 传输：基于 secp256k1 ECIES + 16 字节 nonce 握手的加密 TCP
//   3. Discv4 / Discv5 发现（Kademlia）
//   4. Kademlia DHT：XOR 距离、k-bucket、查找算法
//   5. 交易 / 区块 gossip
//   6. 子协议：ETH/67, ETH/68, ETH/69（以太坊），/meshsub/2（libp2p）
//
// 本章合约：
//   - Kademlia 路由表（XOR 距离 + k-bucket）
//   - Gossip 广播（指数级 fan-out）
//   - Discv4 风格 ENR
//
// 注：网络层本身在链下运行；本章合约描述协议结构、消息格式、节点发现算法。
// =============================================================================
pragma solidity ^0.8.24;

/// @title 节点身份
/// @notice 节点 = 256 bit nodeId + 公网端点
/// @dev    nodeId = keccak256(pubkey)；节点之间的距离度量
///         = nodeId 字节的 XOR（Kademlia 标准）。
struct Node {
    bytes32 nodeId;
    address endpoint;   // IP + port 编码到 address（示例）
}

/// @title XOR 距离
/// @notice Kademlia 用 XOR 作为距离度量，满足三角不等式。
/// @dev    距离性质：
///         - d(a, a) = 0
///         - d(a, b) = d(b, a)
///
///         - d(a, b) + d(b, c) >= d(a, c)
///         这样可以把节点放进 k-bucket（按距离高位分组）。
library XorDistance {
    /// @notice 计算两个 256-bit id 的 XOR 距离
    function distance(bytes32 a, bytes32 b) internal pure returns (uint256) {
        return uint256(a) ^ uint256(b);
    }

    /// @notice 给定距离，返回所在 k-bucket 索引
    /// @dev    bucket 0 距离 < 2^1，bucket 1 在 [2^1, 2^2)，...，
    ///         bucket 255 在 [2^255, 2^256)。
    function bucketOf(uint256 d) internal pure returns (uint256) {
        require(d > 0, "self");
        // 取最高位的 1
        uint256 b;
        for (uint256 i = 0; i < 256; i++) {
            if ((d >> (255 - i)) & 1 == 1) { b = 255 - i; break; }
        }
        return b;
    }
}

/// @title Kademlia 路由表
/// @notice k-bucket 树：每个 bucket 保存距离在 [2^i, 2^(i+1)) 的 k 个节点
/// @dev    Kademlia 路由算法：
///         1. 节点查找 → 同时向 α 个最近节点发 FIND_NODE
///         2. 收敛到目标 ID
///         3. 每收到新节点：检查对应 bucket 是否满
///            - 未满：直接加入
///            - 已满：ping 最旧节点；无响应则替换，否则丢弃
library Kademlia {
    uint256 internal constant K = 20;     // 每个 bucket 节点数
    uint256 internal constant ALPHA = 3;  // 并发查询数

    struct Bucket {
        Node[] nodes;
        uint256 lastTouched;
    }

    struct RoutingTable {
        bytes32 localId;
        mapping(uint256 => Bucket) buckets;   // bucket 索引 → bucket
    }

    /// @notice 尝试加入一个新节点
    /// @return inserted 是否真正插入（已满时会 ping 旧节点决定）
    function addNode(RoutingTable storage rt, Node memory n)
        internal
        returns (bool inserted)
    {
        if (n.nodeId == rt.localId) return false;
        uint256 d = XorDistance.distance(n.nodeId, rt.localId);
        uint256 bi = XorDistance.bucketOf(d);
        Bucket storage b = rt.buckets[bi];
        // 已存在？
        for (uint256 i = 0; i < b.nodes.length; i++) {
            if (b.nodes[i].nodeId == n.nodeId) {
                b.lastTouched = block.timestamp;
                return false;
            }
        }
        if (b.nodes.length < K) {
            b.nodes.push(n);
            b.lastTouched = block.timestamp;
            return true;
        }
        // 真实实现：ping b.nodes[0]；若无响应则替换，否则丢弃
        return false;
    }

    /// @notice 查找距离 target 最近的 k 个节点
    function findClosest(RoutingTable storage rt, bytes32 target)
        internal
        view
        returns (Node[] memory closest)
    {
        uint256 d = XorDistance.distance(target, rt.localId);
        uint256 bi = XorDistance.bucketOf(d);
        closest = new Node[](K);
        uint256 count = 0;
        // 从最近 bucket 向外扩展
        for (uint256 off = 0; off < 256 && count < K; off++) {
            if (bi >= off) {
                Bucket storage b = rt.buckets[bi - off];
                for (uint256 i = 0; i < b.nodes.length && count < K; i++) {
                    closest[count++] = b.nodes[i];
                }
            }
            if (bi + off + 1 < 256 && count < K) {
                Bucket storage b = rt.buckets[bi + off + 1];
                for (uint256 i = 0; i < b.nodes.length && count < K; i++) {
                    closest[count++] = b.nodes[i];
                }
            }
        }
    }
}

/// @title Gossip 广播
/// @notice 每轮把消息转发给 fanout 个随机未见过的节点
/// @dev    复杂度：经过 log(N)/log(fanout) 轮覆盖整个网络。
///         抗 Sybil：通过 PoW 签名 / 节点信誉限制。
library Gossip {
    struct State {
        bytes32 eventId;
        mapping(bytes32 => bool) seen;        // nodeId -> 是否见过
        uint256 round;
    }

    /// @notice 一步 gossip：随机选 fanout 个未见过 event 的节点作为目标
    /// @param self      当前节点
    /// @param peers     当前节点的所有 peer
    /// @param state     gossip 状态
    /// @param fanout    每轮转发数
    /// @return targets  本轮应转发的节点列表
    function step(
        bytes32 self,
        bytes32[] memory peers,
        State storage state,
        uint256 fanout
    ) internal returns (bytes32[] memory targets) {
        require(state.seen[self], "self not seen");
        uint256 unseenCount = 0;
        for (uint256 i = 0; i < peers.length; i++) {
            if (!state.seen[peers[i]]) unseenCount++;
        }
        if (unseenCount == 0) return new bytes32[](0);
        uint256 k = fanout < unseenCount ? fanout : unseenCount;
        targets = new bytes32[](k);
        uint256 picked = 0;
        // 简化：顺序取前 k 个未 seen 的节点
        for (uint256 i = 0; i < peers.length && picked < k; i++) {
            if (!state.seen[peers[i]]) {
                state.seen[peers[i]] = true;
                targets[picked++] = peers[i];
            }
        }
        state.round += 1;
    }
}

/// @title ENR (Ethereum Node Record, EIP-706)
/// @notice 节点元数据：签名 || seq || (k,v)+ 用 RLP 编码
/// @dev    字段示例：
///         - id: "v4"（secp256k1 标识）
///         - ip: 公网 IPv4
///         - udp / tcp: 端口
///         - eth2: 共识层数据（如有）
library Enr {
    struct Record {
        bytes signature;
        uint64 seq;
        // (k, v) 对的简化表示
        bytes32[] keys;
        bytes[]   values;
    }

    /// @notice 计算 ENR 的内容哈希
    /// @dev    real ENR: content = rlp([seq, k1, v1, k2, v2, ...])
    ///         signature = sign(keccak256(content))
    function contentHash(Record memory r) internal pure returns (bytes32) {
        return keccak256(abi.encode(r.seq, r.keys, r.values));
    }
}

/// @title RLPx 帧格式
/// @notice devp2p 帧 = 3 字节长度前缀 || 载荷
/// @dev    真实 RLPx 帧 = AES-CTR(cipher) || MAC(16) || len(3) || pad;
///
///         简化：先描述长度前缀与载荷结构。
library Rlpx {
    /// @notice 给定载荷生成 3 字节大端长度前缀
    function frameLengthPrefix(bytes memory payload)
        internal
        pure
        returns (bytes memory)
    {
        uint256 len = payload.length;
        return abi.encodePacked(
            bytes1(uint8(len >> 16)),
            bytes1(uint8(len >> 8)),
            bytes1(uint8(len))
        );
    }
}

/// @title 第 10 章入口
/// @notice 部署一个 Kademlia 路由表，演示节点添加与最近查找
contract Chapter10 {
    using Kademlia for Kademlia.RoutingTable;

    /// @notice 节点 ID（应用层初始化）
    Kademlia.RoutingTable public rt;

    constructor() {
        rt.localId = bytes32(uint256(uint160(msg.sender)));
    }

    /// @notice 加入节点
    function addNode(bytes32 nodeId, address endpoint) external returns (bool) {
        return rt.addNode(Node({nodeId: nodeId, endpoint: endpoint}));
    }

    /// @notice 计算两个节点的距离
    function distance(bytes32 a, bytes32 b) external pure returns (uint256) {
        return XorDistance.distance(a, b);
    }
}
