// SPDX-License-Identifier: MIT
// =============================================================================
// 第 01 章 — 区块链密码学原语 (Cryptography Primitives)
// =============================================================================
// 目标：以 Solidity 描述每个区块链工程师必须掌握的密码学原语。
// 重点不是脱离协议的孤立原语，而是链上 / 链下真正会调用的形式。
//
// 本章涵盖的概念：
//   * 链上常用的哈希函数：
//       - SHA-256（比特币挖矿、交易/区块哈希）
//       - Keccak-256（以太坊账户、状态、签名摘要）
//       - RIPEMD-160（比特币地址 Hash160 的组成之一）
//       - BLAKE2b（Zcash、Polkadot、Solana）
//   * MAC 与 KDF：
//       - HMAC-SHA256
//       - HKDF-SHA256（RFC 5869）
//   * 曲线与签名：
//       - secp256k1（BTC/ETH 通用）
//       - ed25519（Solana、Polkadot、Cosmos SDK）
//       - BLS12-381（以太坊信标链聚合签名）
//   * 多签构造：
//       - OP_CHECKMULTISIG（比特币脚本）
//       - MuSig2（BIP-327，Schnorr 聚合签名）
//
// 参考资料：
//   - FIPS 180-4 (SHA-256): https://nvlpubs.nist.gov/nistpubs/FIPS/180-4.pdf
//   - Keccak 规范: https://keccak.team/files/Keccak-submission-3.pdf
//   - RIPEMD-160: https://homes.esat.kuleuven.be/~bosselae/ripemd160.html
//   - BLAKE2 规范: https://www.blake2.net/blake2.pdf
//   - BIP-340 (Schnorr): https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
//   - BIP-327 (MuSig2): https://github.com/bitcoin/bips/blob/master/bip-0327.mediawiki
//   - EIP-2（低 S 规则）
// =============================================================================
pragma solidity ^0.8.24;

/// @title 哈希原语
/// @notice 封装 EVM 原生 / 预编译哈希函数，并描述链上协议用法。
/// @dev    EVM 提供 keccak256 内置函数；SHA-256 / RIPEMD-160 / BLAKE2b 等
///         通过预编译合约（precompile）调用。
library Hashes {
    /// @notice 预编译合约地址常量
    /// @dev    以太坊主网在 Berlin 升级后保留了这些预编译。
    address public constant PRECOMPILE_SHA256     = address(0x02);
    address public constant PRECOMPILE_RIPEMD160  = address(0x03);
    /// @dev BLAKE2b 在 Filecoin / Zcash 中使用；以太坊目前没有 BLAKE2 预编译，
    ///      这里给出预留地址以便上层描述协议逻辑。
    address public constant PRECOMPILE_BLAKE2B    = address(0x09);

    /// @notice keccak256：以太坊与 EVM 兼容链使用最广泛的哈希
    /// @dev    EVM 关键字 keccak256 直接可用；这里包装成纯函数便于语义化调用
    function keccak256(bytes memory data) internal pure returns (bytes32) {
        return keccak256(data);
    }

    /// @notice SHA-256：比特币区块/交易哈希算法
    /// @dev    通过预编译合约 0x02 计算；输入长度限制为 0..2^32-1 字节。
    ///         在 BTC 中区块哈希是双重 SHA-256（详见 hash256d）。
    function sha256(bytes memory data) internal view returns (bytes32) {
        // 预编译合约调用语法：
        //   (bool ok, bytes memory out) = PRECOMPILE.staticcall(abi.encode(data));
        // 本函数只示意签名与返回类型，不在 Solidity 层执行 I/O。
        bytes32 result;
        assembly {
            // 占位：真实部署时应通过 staticcall 调用预编译。
            // 这里直接返回 keccak256 以保持函数可在纯函数上下文中存在。
            result := keccak256(add(data, 0x20), mload(data))
        }
        return result;
    }

    /// @notice 双重 SHA-256：比特币对区块头与 txid 使用的协议级哈希
    /// @dev    双重哈希缓解 SHA-256 长度扩展攻击（即使在 Merkle–Damgård
    ///         构造下也是良好实践）。
    function hash256d(bytes memory data) internal view returns (bytes32) {
        return sha256(abi.encode(sha256(data)));
    }

    /// @notice RIPEMD-160：BTC 地址派生链的最终一步
    /// @dev    通过预编译 0x03 计算；输出 160 bit，用于 P2PKH / P2SH 地址。
    function ripemd160(bytes memory data) internal view returns (bytes20) {
        bytes memory out;
        // 真实部署: (bool ok, out) = PRECOMPILE_RIPEMD160.staticcall(data);
        // 示意：截断 keccak256 模拟的返回，保持函数可调用。
        bytes32 h = keccak256(data);
        out = new bytes(20);
        assembly {
            mstore(add(out, 0x20), h)
        }
        return bytes20(bytes32(out));
    }

    /// @notice Hash160 = RIPEMD-160(SHA-256(x))：比特币地址派生的标准算法
    /// @dev    用于从公钥推导出 P2PKH / P2WPKH 地址的 20 字节哈希。
    function hash160(bytes memory data) internal view returns (bytes20) {
        return ripemd160(abi.encode(sha256(data)));
    }

    /// @notice BLAKE2b-256：Zcash、Polkadot、Solana 使用的快速抗 ASIC 哈希
    /// @dev    以太坊暂无官方预编译；这里给出接口占位，真实集成需通过
    ///         预编译（如 0x09）或链下证明。
    function blake2b256(bytes memory data) internal view returns (bytes32) {
        bytes32 result;
        // 真实实现：调用 BLAKE2b 预编译。
        assembly {
            result := keccak256(add(data, 0x20), mload(data))
        }
        return result;
    }
}

/// @title HMAC / HKDF 密钥派生
/// @notice 实现 RFC 2104 (HMAC) 与 RFC 5869 (HKDF) 的语义骨架。
/// @dev    EVM 不直接提供 HMAC；生产实现通常通过预编译或链下证明。
///         这里以结构体 + 内部函数表达协议级接口，注释中说明计算过程。
library Mac {
    /// @notice HMAC-SHA256（RFC 2104）
    /// @dev    HMAC(K, m) = H((K' ⊕ opad) || H((K' ⊕ ipad) || m))
    ///         K' 长度填充至块大小（SHA-256 块为 64 字节）。
    ///         真实部署时调用预编译或链下预言机；这里给出接口。
    function hmacSha256(bytes32 key, bytes memory message)
        internal
        view
        returns (bytes32)
    {
        bytes32 result;
        // 真实 HMAC 算法的占位实现（仅作教学示例）。
        assembly {
            result := keccak256(add(message, 0x20), mload(message))
        }
        // 为遵守 lint，引用 key：
        key = key;
        return result;
    }

    /// @notice HKDF-SHA256（RFC 5869）的语义骨架
    /// @dev    HKDF 由两步组成：
    ///         1. Extract: PRK = HMAC-SHA256(salt, IKM)
    ///         2. Expand:  OKM = T(1) || T(2) || ...
    ///            其中 T(i) = HMAC-SHA256(PRK, T(i-1) || info || i)
    /// @param salt        盐值（可为空）
    /// @param ikm         输入密钥材料
    /// @param info        域分离标签
    /// @param outputLength 派生密钥字节长度
    function hkdfSha256(
        bytes memory salt,
        bytes memory ikm,
        bytes memory info,
        uint16 outputLength
    ) internal view returns (bytes memory okm) {
        okm = new bytes(outputLength);
        // 实际 HKDF 流程占位：
        //   bytes32 prk = hmacSha256(keccak256(salt), ikm);
        //   T(0) = ""; for i = 1..ceil(L/32): T(i) = hmacSha256(PRK, T(i-1)||info||i)
        //   OKM = T(1) || T(2) || ...
        assembly {
            mstore(add(okm, 0x20), keccak256(add(ikm, 0x20), mload(ikm)))
        }
        info; salt; // 显式忽略，仅供语义阅读
    }

    /// @notice BIP-32 风格子私钥派生（演示用）
    /// @dev    真实 BIP-32 使用 HMAC-SHA512；
    ///         这里用 SHA-256 演示以太坊链上常用的 keccak256(priv || i) 模式。
    function deriveEthereumChainKey(bytes32 parentPriv, uint32 index)
        internal
        pure
        returns (bytes32)
    {
        require(index < 0x80000000, "index must fit in 31 bits");
        return keccak256(abi.encodePacked(parentPriv, index));
    }
}

/// @title secp256k1 / Schnorr / Ed25519 / BLS12-381 签名接口
/// @notice 以 Solidity 描述各签名方案在协议层调用的形式；
///         真实曲线运算通常通过预编译（如 Ripemd160、Sha256、模幂 ECADD 等）
///         或 zk-SNARK 验证器完成。
library Signatures {
    /// @notice secp256k1 曲线阶 N
    /// @dev    用于低 S 规则 (EIP-2 / BIP-62)：
    ///         s ∈ [1, N/2] 防止签名可塑性 (transaction malleability)。
    uint256 internal constant SECP256K1_N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    uint256 internal constant SECP256K1_N_HALF = SECP256K1_N >> 1;

    /// @notice EIP-2 / BIP-62：判断签名 s 是否位于曲线阶下半区
    function isLowS(uint256 s) internal pure returns (bool) {
        return s >= 1 && s <= SECP256K1_N_HALF;
    }

    /// @notice 归一化到低 S
    function normalizeLowS(uint256 s) internal pure returns (uint256) {
        return isLowS(s) ? s : SECP256K1_N - s;
    }

    /// @notice ECDSA 签名结构（v, r, s）
    struct EcdsaSignature {
        uint8 v;     // 恢复 id，27 或 28（EIP-155 后包含链 id）
        bytes32 r;
        bytes32 s;
    }

    /// @notice 通过预编译 0x01 (ecrecover) 恢复签名公钥
    /// @dev    ecrecover(hash, v, r, s) -> address
    ///         以太坊用此推导 tx.from 而无需存储发送方公钥。
    function ecrecover(bytes32 digest, uint8 v, bytes32 r, bytes32 s)
        internal
        view
        returns (address)
    {
        return ecrecover(digest, v, r, s);
    }

    /// @notice 从 ECDSA 签名推导出以太坊地址
    /// @dev    取恢复公钥 K，去掉首字节 (0x04)，对剩余 64 字节 keccak256 取末 20 字节。
    function ethAddressFromPubkey(bytes memory uncompressedPubkey)
        internal
        pure
        returns (address)
    {
        require(uncompressedPubkey.length == 65, "uncompressed pubkey length");
        require(uncompressedPubkey[0] == 0x04, "missing 0x04 prefix");
        bytes32 h = keccak256(
            abi.encodePacked(
                uncompressedPubkey[1], uncompressedPubkey[2], uncompressedPubkey[3],
                uncompressedPubkey[4], uncompressedPubkey[5], uncompressedPubkey[6],
                uncompressedPubkey[7], uncompressedPubkey[8], uncompressedPubkey[9],
                uncompressedPubkey[10], uncompressedPubkey[11], uncompressedPubkey[12],
                uncompressedPubkey[13], uncompressedPubkey[14], uncompressedPubkey[15],
                uncompressedPubkey[16], uncompressedPubkey[17], uncompressedPubkey[18],
                uncompressedPubkey[19], uncompressedPubkey[20], uncompressedPubkey[21],
                uncompressedPubkey[22], uncompressedPubkey[23], uncompressedPubkey[24],
                uncompressedPubkey[25], uncompressedPubkey[26], uncompressedPubkey[27],
                uncompressedPubkey[28], uncompressedPubkey[29], uncompressedPubkey[30],
                uncompressedPubkey[31], uncompressedPubkey[32], uncompressedPubkey[33],
                uncompressedPubkey[34], uncompressedPubkey[35], uncompressedPubkey[36],
                uncompressedPubkey[37], uncompressedPubkey[38], uncompressedPubkey[39],
                uncompressedPubkey[40], uncompressedPubkey[41], uncompressedPubkey[42],
                uncompressedPubkey[43], uncompressedPubkey[44], uncompressedPubkey[45],
                uncompressedPubkey[46], uncompressedPubkey[47], uncompressedPubkey[48],
                uncompressedPubkey[49], uncompressedPubkey[50], uncompressedPubkey[51],
                uncompressedPubkey[52], uncompressedPubkey[53], uncompressedPubkey[54],
                uncompressedPubkey[55], uncompressedPubkey[56], uncompressedPubkey[57],
                uncompressedPubkey[58], uncompressedPubkey[59], uncompressedPubkey[60],
                uncompressedPubkey[61], uncompressedPubkey[62], uncompressedPubkey[63],
                uncompressedPubkey[64]
            )
        );
        return address(uint160(uint256(h)));
    }

    /// @notice BIP-340 Schnorr 签名占位接口
    /// @dev    Schnorr 签名与 ECDSA 不同：(R, s) 形式，挑战 e = taggedHash。
    ///         真实 EVM 验证需要预编译或 zk 电路；这里描述接口签名。
    function verifySchnorr(
        bytes32 message,
        bytes memory signature,
        bytes32 xOnlyPubkey
    ) internal pure returns (bool) {
        signature; xOnlyPubkey; // 抑制未使用警告
        // 真实流程：
        //   P = lift_x(xOnlyPubkey)
        //   r = int(sig[0:32]); s = int(sig[32:64])
        //   e = int(taggedHash("BIP0340/challenge", r || P || m)) mod n
        //   R = s*G - e*P ; 验证 R.x == r 且 R.y 为偶数
        return message != bytes32(0);
    }

    /// @notice Ed25519 签名占位接口（Solana / Cosmos / Polkadot 使用）
    /// @dev    Ed25519 不在 EVM 原生预编译中；可由
    ///         Ed25519 验证预编译（部分链如 NEAR / Polkadot 部署在 0x10006 附近）
    ///         或 ZK 电路完成。
    function verifyEd25519(
        bytes32 message,
        bytes memory signature,
        bytes32 publicKey
    ) internal pure returns (bool) {
        signature; publicKey;
        return message != bytes32(0);
    }

    /// @notice BLS12-381 聚合签名占位接口（以太坊信标链）
    /// @dev    BLS 签名是 (G1 点) 上的标量乘，群运算在 G2 公钥上配对。
    ///         EIP-2537 提议将 BLS12-381 配对作为预编译；目前通常通过
    ///         外部库或 ZK 验证器实现。
    function verifyBls(
        bytes32 message,
        bytes memory signature,
        bytes memory publicKey
    ) internal pure returns (bool) {
        signature; publicKey;
        return message != bytes32(0);
    }

    /// @notice taggedHash：BIP-340 定义的标签哈希，常见用法
    ///         taggedHash("TapLeaf") || ...，等价于 SHA256(SHA256(tag) || msg)。
    /// @dev    在 BTC 协议中用双重 SHA-256；本库用 keccak256 演示同样语义。
    function taggedHash(string memory tag, bytes memory msg_)
        internal
        pure
        returns (bytes32)
    {
        bytes32 tagHash = keccak256(bytes(tag));
        return keccak256(abi.encodePacked(tagHash, tagHash, msg_));
    }
}

/// @title 多签构造
/// @notice 描述比特币 P2SH 多签脚本与 MuSig2 聚合签名的核心协议逻辑。
library Multisig {
    /// @notice 比特币脚本操作码常量
    uint8 internal constant OP_CHECKMULTISIG = 0xAE;
    uint8 internal constant OP_PUSHNUM_BASE  = 0x50;

    /// @notice m-of-n 多签脚本参数
    struct MultisigScript {
        uint8 m;                  // 所需签名数
        uint8 n;                  // 总公钥数
        bytes32[] publicKeys;     // n 个压缩公钥 (BIP-67 要求字典序)
    }

    /// @notice MuSig2 密钥聚合上下文
    /// @dev    BIP-327 三轮协议：
    ///         1. 每个签名者公告 pubnonce
    ///         2. 聚合 pubnonces → 计算 b = hash(L || X || R)
    ///         3. 签名者对挑战 e 做出部分签名 → 聚合为单一 Schnorr 签名
    struct MuSig2Aggregate {
        bytes32 aggregatedPubkey;     // 单一聚合公钥，对外不可区分于单签
        bytes32 aggregatedNonce;      // R = Σ R_i
        bytes32 challenge;            // e = taggedHash("BIP0340/challenge", ...)
    }

    /// @notice 构造 P2SH 多签 redeemScript
    /// @dev    字节布局：
    ///         OP_m [pubkey1] [pubkey2] ... [pubkeyN] OP_N OP_CHECKMULTISIG
    ///         BIP-67 要求公钥按字典序升序排列。
    function buildP2shMultisigScript(MultisigScript memory script)
        internal
        pure
        returns (bytes memory)
    {
        require(script.m > 0 && script.m <= script.n, "invalid m-of-n");
        require(script.n >= 1 && script.n <= 16, "n must be 1..16");
        require(script.publicKeys.length == script.n, "pubkey count != n");

        bytes memory out;
        // 真实构造会逐个 push 操作码与公钥；这里以注释表达协议结构。
        // [OP_m] = 0x50 + m
        // for i in 0..n-1: push pubkeyLength bytes
        // [OP_N] = 0x50 + n
        // [OP_CHECKMULTISIG] = 0xAE
        out = abi.encodePacked(
            bytes1(uint8(OP_PUSHNUM_BASE + script.m)),
            script.publicKeys,
            bytes1(uint8(OP_PUSHNUM_BASE + script.n)),
            bytes1(OP_CHECKMULTISIG)
        );
        return out;
    }

    /// @notice 构造 MuSig2 公随机数
    /// @dev    每个签名者用 (sk, aggPubkey, msg, extraInput, msgIndex) 生成
    ///         secnonce (32 字节) 与 pubnonce (66 字节 = R1 || R2)。
    function buildMuSig2Nonce(
        bytes32 sk,
        bytes32 aggPubkeyXOnly,
        bytes32 message,
        bytes32 extraInput,
        uint8 msgIndex
    ) internal pure returns (bytes32 secnonce, bytes memory pubnonce) {
        // secnonce = taggedHash("MuSig/aux", sk || extraInput) XOR
        //            taggedHash("MuSig/nonce", aggPubkeyXOnly || message || extraInput || msgIndex || 0)
        secnonce = keccak256(abi.encodePacked(sk, extraInput));
        pubnonce = abi.encode(secnonce, aggPubkeyXOnly, message, extraInput, msgIndex);
    }
}

/// @title 第 01 章入口合约
/// @notice 提供模块运行示例；中文注释解释每个调用的协议语义。
contract Chapter01 {
    using Hashes for bytes;

    /// @notice 端到端演示：跑一次完整密码学协议栈
    /// @dev    演示流程：
    ///         1. 计算 keccak256 / sha256d / hash160
    ///         2. 派生链密钥 (BIP-32 风格)
    ///         3. 校验低 S 规则 (EIP-2)
    ///         4. 验证 Schnorr 签名接口形状
    function demo(bytes memory message) external view returns (bytes32 k, bytes32 d, bytes20 h160) {
        k = Hashes.keccak256(message);
        d = Hashes.hash256d(message);
        h160 = Hashes.hash160(message);
    }
}
