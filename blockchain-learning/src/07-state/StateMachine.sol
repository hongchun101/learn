// SPDX-License-Identifier: MIT
// =============================================================================
// 第 07 章 — 状态机：账户、存储、快照 (State Machine)
// =============================================================================
// 目标：以 Solidity 描述链如何表示世界状态、Journal-and-revert、
//       快照与提交/重放。
//
// 涵盖的概念：
//   1. 账户状态：nonce, balance, codeHash, storageRoot
//   2. 存储树：每个账户一个 MPT
//   3. 世界状态树：32 字节地址 → 4 元组（账户 RLP）
//   4. Journal-and-revert：每个 tx 累积 touched/deleted/orig 列表
//   5. 快照与 commit/replay
//   6. 裁剪：state expiry、weak subjectivity、历史裁剪
// =============================================================================
pragma solidity ^0.8.24;

/// @title 账户状态
/// @notice 以太坊账户的四元组：nonce / balance / codeHash / storageRoot
/// @dev    编码：rlp([nonce, balance, storageRoot, codeHash])
///         编码后做 keccak256 即得账户在状态树中的节点哈希。
struct Account {
    uint64  nonce;
    uint256 balance;
    bytes32 codeHash;
    bytes32 storageRoot;
}

/// @title 存储
/// @notice 每个账户的 256-bit key → 256-bit value 映射
/// @dev    真实实现通过 SSTORE / SLOAD 写/读 EVM 存储；
///         这里是协议级描述。
contract Storage {
    /// @notice 账户存储：bytes32 key → bytes32 value
    mapping(address => mapping(bytes32 => bytes32)) private _slots;

    /// @notice 单个存储槽的修改记录
    struct SlotDiff {
        bytes32 key;
        bytes32 prevValue;     // 修改前的值，用于 revert
    }

    /// @notice 每个账户的修改日志
    mapping(address => SlotDiff[]) private _logs;

    /// @notice SSTORE 协议语义：写入一个槽并记录旧值
    function sstore(address account, bytes32 key, bytes32 newValue) public {
        bytes32 prev = _slots[account][key];
        _slots[account][key] = newValue;
        // 仅在确实变化时记录日志（节省 revert 成本）
        if (prev != newValue) {
            _logs[account].push(SlotDiff({key: key, prevValue: prev}));
        }
    }

    /// @notice SLOAD 协议语义
    function sload(address account, bytes32 key) public view returns (bytes32) {
        return _slots[account][key];
    }

    /// @notice 拿到账户当前的修改日志
    function diffFor(address account) internal view returns (SlotDiff[] memory) {
        return _logs[account];
    }
}

/// @title Journal：跨账户的全局修改日志
/// @notice 累积 SSTORE / balance / nonce 变化，用于 revert
/// @dev    每条 entry 记录 type 与 previous value；
///         revert 时按相反顺序回放。
contract Journal {
    enum Kind { Sstore, Balance, Nonce, Suicide, Log }

    struct Entry {
        Kind kind;
        address account;
        bytes32 key;            // 当 kind == Sstore 时
        uint256 prev;           // 当 kind == Balance / Nonce 时
    }

    Entry[] private _entries;

    /// @notice 记录一次 SSTORE
    function recordSstore(address account, bytes32 key) external {
        _entries.push(Entry({kind: Kind.Sstore, account: account, key: key, prev: 0}));
    }

    /// @notice 记录 balance 变化
    function recordBalance(address account, uint256 prev) external {
        _entries.push(Entry({kind: Kind.Balance, account: account, key: bytes32(0), prev: prev}));
    }

    /// @notice 拿到底层 entries（外部可遍历）
    function entries() external view returns (Entry[] memory) {
        return _entries;
    }

    /// @notice 回滚全部修改
    /// @dev    真实回滚：按 entries 顺序反向应用 prev 值。
    function revertAll() external {
        delete _entries;
    }
}

/// @title 快照
/// @notice 在执行前记录状态根，commit / revert 即可恢复。
/// @dev    真实以太坊使用 EIP-1153 瞬态存储 (TSTORE/TLOAD) 来实现
///         O(1) snapshot，无需磁盘重放。
contract Snapshot {
    struct Snap {
        bytes32 worldRoot;
        uint256 journalIndex;
        mapping(address => uint256) nonce;
        mapping(address => uint256) balance;
        mapping(address => mapping(bytes32 => bytes32)) storage_;
    }

    Snap[] private _stack;

    /// @notice 推送一个空快照（应用层应当保存当前根与 journal 长度）
    function push() internal {
        _stack.push();
    }

    /// @notice 弹出并返回（应用层决定 commit 或 revert）
    function pop() internal returns (Snap storage) {
        require(_stack.length > 0, "empty stack");
        Snap storage s = _stack[_stack.length - 1];
        delete _stack[_stack.length - 1];
        _stack.pop();
        return s;
    }
}

/// @title 弱主观性与状态裁剪
/// @notice 当新节点加入网络时，它需要一个"信任锚点" (weak subjectivity checkpoint)
///         才能安全裁剪历史。
/// @dev    弱主观性原则：
///         - 节点离线超过 N 个区块后，必须从受信 checkpoint 重新同步
///         - 否则可能遭受长程攻击 (long-range attack)
///         常见做法：定期发布已 finalized 区块的哈希作为锚点。
contract WeakSubjectivity {
    /// @notice 裁剪策略
    struct PruningPolicy {
        uint256 keepRecentBlocks;     // 保留多少个最近区块
        uint256 checkpointInterval;   // 每多少区块做一个 checkpoint
    }

    /// @notice 默认策略：保留最近 128k 区块，每 1024 块做 checkpoint
    uint256 public constant DEFAULT_KEEP_RECENT = 128_000;
    uint256 public constant DEFAULT_CHECKPOINT_INTERVAL = 1024;

    /// @notice 计算某个区块的 checkpoint 哈希
    /// @dev    真实实现：用 SSZ Merkleization 编码区块内容
    function checkpointHash(uint256 blockNumber, bytes32 blockRoot)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(blockNumber, blockRoot));
    }
}

/// @title 第 07 章入口
/// @notice 演示账户四元组、SSTORE 语义、Journal 接口
contract Chapter07 {
    Storage public store;

    /// @notice 演示一次 SSTORE：写入一个槽位
    function sstoreDemo(address account, bytes32 key, bytes32 value)
        external
        returns (bytes32 prev)
    {
        prev = store.sload(account, key);
        store.sstore(account, key, value);
    }

    /// @notice 演示读 SLOAD
    function sloadDemo(address account, bytes32 key) external view returns (bytes32) {
        return store.sload(account, key);
    }
}
