// SPDX-License-Identifier: MIT
// =============================================================================
// 第 04 章 — 交易与签名 (Transactions & Signatures)
// =============================================================================
// 目标：以 Solidity 描述每种交易模型与签名方案。
//
// 涵盖的概念：
//   1. UTXO 模型（比特币、Cardano）：
//      - 每个输入消费一个先前的输出
//      - 每个输出生成新的 UTXO
//      - 交易有效性 = 防双花 + 脚本满足 + fee = sum(in) - sum(out)
//   2. 账户模型（以太坊及其分叉）：
//      - 字段：nonce, gasLimit, gasPrice（或 maxFee/maxPriority），to, value, data
//      - 签名 (v, r, s)，EIP-155 通过 chainId 提供重放保护
//   3. 交易类型：
//        - Legacy (EIP-155)         普通转账、合约调用
//        - EIP-2930 (Access List)   冷热存储区分定价
//        - EIP-1559 (Fee Market)    base fee + priority fee
//        - EIP-4844 (Blob)          L2 携带数据，type 0x03
//        - EIP-7702 (Set-Code)      EOA 临时设置执行代码
//   4. ECDSA 签名 + 恢复公钥 → 推导 tx.from
//   5. BIP-32 / BIP-39 HD 钱包：助记词 → seed → 主密钥
//
// 参考资料：
//   - EIP-155, EIP-2930, EIP-1559, EIP-4844, EIP-7702
//   - BIP-32 (HD wallets), BIP-39 (Mnemonic)
// =============================================================================
pragma solidity ^0.8.24;

/// @title UTXO 模型（比特币风格）
/// @notice 每个交易引用先前的输出（txid + vout），并生成新的输出。
/// @dev    UTXO 模型的优势：
///         - 天然支持并行验证
///         - 状态可裁剪（已花费的 UTXO 可丢弃）
///         - 双花检测直接：每个 UTXO 只能被引用一次
library Utxo {
    /// @notice 引用一个先前的输出
    struct Input {
        bytes32 prevTxid;       // 32 字节
        uint32 prevVout;        // 引用的输出索引
        bytes scriptSig;        // 解锁脚本
        uint32 sequence;        // 用于 RBF / CSV / 时间锁
    }

    /// @notice 创建新的 UTXO
    struct Output {
        uint256 value;          // satoshi 数量
        bytes scriptPubKey;     // 锁定脚本
    }

    /// @notice 交易结构
    struct Tx {
        uint32 version;
        Input[] inputs;
        Output[] outputs;
        uint32 lockTime;
    }

    /// @notice 序列化交易为字节（用于计算 txid）
    /// @dev    真实 BTC 序列化使用 varint 长度前缀；本课程版用 abi.encode
    ///         以保证 Solidity 兼容。
    function serialize(Tx memory tx_) internal pure returns (bytes memory) {
        return abi.encode(tx_.version, tx_.inputs, tx_.outputs, tx_.lockTime);
    }

    /// @notice 计算 txid：双 SHA-256(serialize(tx))
    function txid(Tx memory tx_) internal view returns (bytes32) {
        bytes memory ser = serialize(tx_);
        bytes32 h1 = sha256(ser);
        return sha256(abi.encodePacked(h1));
    }

    /// @notice 校验基本形状 + 计算矿工费
    /// @param spentValue 所有输入的累计金额
    /// @return fee 矿工费 = spentValue - sum(outputs.value)
    function validate(Tx memory tx_, uint256 spentValue)
        internal
        pure
        returns (uint256 fee)
    {
        require(tx_.inputs.length > 0, "no inputs");
        require(tx_.outputs.length > 0, "no outputs");
        uint256 outSum;
        for (uint256 i = 0; i < tx_.outputs.length; i++) {
            outSum += tx_.outputs[i].value;
        }
        require(spentValue >= outSum, "spent < out");
        fee = spentValue - outSum;
    }
}

/// @title 以太坊账户模型交易
/// @notice 描述 Legacy / EIP-2930 / EIP-1559 / EIP-4844 / EIP-7702 的字段。
/// @dev    以太坊交易类型的第一个字节（type byte）区分种类：
///         - 无 type byte：Legacy (EIP-155)
///
///         - 0x01：EIP-2930 Access List 交易
///         - 0x02：EIP-1559 Fee Market 交易
///         - 0x03：EIP-4844 Blob 交易
///         - 0x04：EIP-7702 Set-Code 交易
library AccountTx {
    /// @notice Legacy 交易未签名形式
    struct LegacyUnsigned {
        uint256 nonce;
        uint256 gasPrice;
        uint256 gasLimit;
        address to;            // 0 表示合约创建
        uint256 value;
        bytes data;
        uint256 chainId;
    }

    /// @notice Legacy 交易已签名形式
    struct LegacySigned {
        LegacyUnsigned unsigned;
        uint8 v;               // 27/28 或 EIP-155 后的 (chainId * 2 + 35 + yParity)
        bytes32 r;
        bytes32 s;
    }

    /// @notice EIP-1559 交易
    struct Eip1559 {
        uint256 chainId;
        uint256 nonce;
        uint256 maxPriorityFeePerGas;
        uint256 maxFeePerGas;
        uint256 gasLimit;
        address to;
        uint256 value;
        bytes data;
        AccessListEntry[] accessList;
        uint8 yParity;
        bytes32 r;
        bytes32 s;
    }

    /// @notice EIP-2930 access list 单项
    struct AccessListEntry {
        address addr;
        bytes32[] storageKeys;
    }

    /// @notice EIP-4844 Blob 交易（额外字段）
    struct Eip4844 {
        Eip1559 base;
        uint256 maxFeePerBlobGas;
        bytes32[] blobVersionedHashes;
    }

    /// @notice EIP-7702 授权
    struct Eip7702Auth {
        uint256 chainId;
        address contractAddr;
        uint64 nonce;
        uint8 yParity;
        bytes32 r;
        bytes32 s;
    }

    /// @notice 从公钥推导以太坊地址
    /// @dev    取恢复公钥 K (65 字节) 去掉首字节 (0x04)，
    ///         keccak256 剩余 64 字节，取末 20 字节。
    function ethAddressFromPubkey(bytes memory uncompressed)
        internal
        pure
        returns (address)
    {
        require(uncompressed.length == 65, "len");
        require(uncompressed[0] == 0x04, "prefix");
        bytes32 h = keccak256(_slice(uncompressed, 1, 64));
        return address(uint160(uint256(h)));
    }

    /// @notice 计算 EIP-155 签名摘要
    /// @dev    keccak256(rlp([nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0]))
    function eip155Hash(LegacyUnsigned memory tx_)
        internal
        view
        returns (bytes32)
    {
        bytes[] memory items = new bytes[](9);
        items[0] = Rlp.encodeBytes(abi.encodePacked(tx_.nonce));
        items[1] = Rlp.encodeBytes(abi.encodePacked(tx_.gasPrice));
        items[2] = Rlp.encodeBytes(abi.encodePacked(tx_.gasLimit));
        items[3] = Rlp.encodeBytes(abi.encodePacked(tx_.to));
        items[4] = Rlp.encodeBytes(abi.encodePacked(tx_.value));
        items[5] = Rlp.encodeBytes(abi.encodePacked(keccak256(tx_.data)));
        items[6] = Rlp.encodeBytes(abi.encodePacked(tx_.chainId));
        items[7] = Rlp.encodeBytes(abi.encodePacked(uint256(0)));
        items[8] = Rlp.encodeBytes(abi.encodePacked(uint256(0)));
        return keccak256(Rlp.encodeList(items));
    }

    /// @notice 通过 ecrecover 推导 tx.from
    function recoverSigner(LegacySigned memory signed)
        internal
        view
        returns (address)
    {
        bytes32 digest = eip155Hash(signed.unsigned);
        return ecrecover(digest, signed.v, signed.r, signed.s);
    }

    function _slice(bytes memory b, uint256 start, uint256 n)
        private
        pure
        returns (bytes memory)
    {
        bytes memory out = new bytes(n);
        for (uint256 i = 0; i < n; i++) out[i] = b[start + i];
        return out;
    }
}

/// @title 简化版 RLP（与 Ch03 共享语义；此处声明以避免循环依赖）
library Rlp {
    function encodeBytes(bytes memory item) internal pure returns (bytes memory) {
        if (item.length == 1 && uint8(item[0]) < 0x80) return item;
        return abi.encodePacked(bytes1(0x80 + uint8(item.length)), item);
    }

    function encodeList(bytes[] memory items) internal pure returns (bytes memory) {
        bytes memory payload;
        for (uint256 i = 0; i < items.length; i++) {
            payload = abi.encodePacked(payload, items[i]);
        }
        return abi.encodePacked(bytes1(0xC0 + uint8(payload.length)), payload);
    }
}

/// @title BIP-32 / BIP-39 HD 钱包
/// @notice 助记词 → seed → 主密钥 → 派生子密钥
/// @dev    BIP-39：助记词 + 可选 passphrase → PBKDF2-HMAC-SHA512 → 64 字节 seed
///         BIP-32：seed → HMAC-SHA512(key="Bitcoin seed", data=seed) → master
///         路径 m/44'/60'/0'/0/0 即以太坊 BIP-44 标准地址。
library HdWallet {
    /// @notice BIP-44 路径常量：m/44'/60'/0'/0/0
    /// @dev    44' = BIP-44 协议；60' = 以太坊 coin type；0' = 第一个账户；
    ///         0 = 外部链（接收地址）；0 = 第一个地址索引。
    function ethereumDerivationPath()
        internal
        pure
        returns (uint32[5] memory)
    {
        return [uint32(0x8000002C), uint32(0x8000003C), uint32(0x80000000), 0, 0];
    }

    /// @notice 通过 PBKDF2-HMAC-SHA512 把助记词转为 64 字节 seed
    /// @dev    真实实现需要 HMAC-SHA512；这里给出接口签名与协议流程。
    function mnemonicToSeed(string memory mnemonic, string memory passphrase)
        internal
        pure
        returns (bytes memory)
    {
        // 真实算法：
        //   salt = "mnemonic" + passphrase
        //   seed = PBKDF2-HMAC-SHA512(mnemonic_normalized_NFKD, salt, 2048 iters, 64 bytes)
        mnemonic; passphrase;
        bytes memory seed = new bytes(64);
        return seed;
    }

    /// @notice 沿 BIP-44 路径派生第一个以太坊私钥
    /// @return 32 字节私钥
    function deriveEthereumMasterKey(bytes memory seed, uint256 index)
        internal
        pure
        returns (bytes32)
    {
        // 实际算法：
        //   I = HMAC-SHA512(key="Bitcoin seed", data=seed) → IL||IR
        //   沿路径 [44', 60', 0', 0, index] 逐步 HMAC-SHA512 派生
        seed; index;
        return bytes32(0);
    }
}

/// @title 第 04 章入口
/// @notice 演示 UTXO txid 计算、Legacy 交易摘要签名、BIP-44 派生接口
contract Chapter04 {
    using Utxo for Utxo.Tx;
    using AccountTx for AccountTx.LegacyUnsigned;
    using AccountTx for AccountTx.LegacySigned;

    /// @notice 端到端演示：
    ///         1. 计算 UTXO txid
    ///         2. 计算 Legacy 交易摘要
    ///         3. 展示 BIP-44 派生路径
    function demo(
        uint256 nonce,
        uint256 gasPrice,
        uint256 gasLimit,
        address to,
        uint256 value,
        uint256 chainId
    ) external view returns (bytes32 legacyDigest, uint32[5] memory path) {
        AccountTx.LegacyUnsigned memory tx_ = AccountTx.LegacyUnsigned({
            nonce: nonce,
            gasPrice: gasPrice,
            gasLimit: gasLimit,
            to: to,
            value: value,
            data: new bytes(0),
            chainId: chainId
        });
        legacyDigest = tx_.eip155Hash();
        path = HdWallet.ethereumDerivationPath();
    }
}
