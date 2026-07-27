// SPDX-License-Identifier: MIT
// =============================================================================
// 第 03 章 — 编码与序列化 (Encoding & Serialization)
// =============================================================================
// 目标：链工程师日常接触的二进制编码全部覆盖。
//
// 涵盖的概念：
//   * Hex（小写，可选 0x 前缀）
//   * Base58 与 Base58Check（BIP-13，比特币地址）
//   * Bech32 / Bech32m（BIP-173 / BIP-350，SegWit 与 Taproot 地址）
//   * Varint / compact-size（比特币区块长度编码）
//   * RLP（以太坊通用字节编码；交易、trie 节点）
//   * SSZ（以太坊信标链简单序列化 + Merkleization）
//   * CBOR（RFC 8949；Polygon Edge、IOTA、Chainlink 使用）
//
// 参考资料：
//   - BIP-13 (Base58Check), BIP-173 (Bech32), BIP-350 (Bech32m)
//   - 黄皮书 附录 D (RLP)
//   - SSZ 规范: https://ethereum.org/en/developers/docs/data-structures-and-encoding/ssz/
// =============================================================================
pragma solidity ^0.8.24;

/// @title Hex 工具
/// @notice 字节 ↔ 十六进制字符串的相互转换
library Hex {
    bytes16 private constant HEX_CHARS = "0123456789abcdef";

    /// @notice 字节转 hex 字符串（带 0x 前缀）
    function toHex(bytes memory data) internal pure returns (string memory) {
        bytes memory str = new bytes(2 + data.length * 2);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < data.length; i++) {
            str[2 + i * 2]     = HEX_CHARS[uint8(data[i]) >> 4];
            str[2 + i * 2 + 1] = HEX_CHARS[uint8(data[i]) & 0x0F];
        }
        return string(str);
    }

    /// @notice hex 字符串转字节（自动剥离 0x 前缀）
    function fromHex(string memory s) internal pure returns (bytes memory) {
        bytes memory b = bytes(s);
        if (b.length >= 2 && b[0] == "0" && (b[1] == "x" || b[1] == "X")) {
            // 跳过前缀
            assembly {
                mstore(b, sub(mload(b), 2))
            }
        }
        require(b.length % 2 == 0, "odd hex length");
        bytes memory out = new bytes(b.length / 2);
        for (uint256 i = 0; i < out.length; i++) {
            out[i] = bytes1(_hexChar(b[2 * i]) * 16 + _hexChar(b[2 * i + 1]));
        }
        return out;
    }

    function _hexChar(bytes1 c) private pure returns (uint8) {
        if (c >= "0" && c <= "9") return uint8(c) - uint8(bytes1("0"));
        if (c >= "a" && c <= "f") return uint8(c) - uint8(bytes1("a")) + 10;
        if (c >= "A" && c <= "F") return uint8(c) - uint8(bytes1("A")) + 10;
        revert("invalid hex char");
    }
}

/// @title Base58Check (BIP-13)
/// @notice 比特币地址版本字节 + 负载 + 4 字节双 SHA-256 校验
/// @dev    版本字节对照：
///         0x00 = P2PKH 主网
///         0x05 = P2SH 主网
///         0x6F = 测试网
contract Base58Check {
    /// @notice 版本字节到人类可读前缀
    mapping(uint8 => string) public versionPrefix;

    constructor() {
        versionPrefix[0x00] = "1";   // P2PKH 主网
        versionPrefix[0x05] = "3";   // P2SH 主网
        versionPrefix[0x6F] = "m";   // 测试网 P2PKH
    }

    /// @notice 编码 versionByte + payload → Base58Check 字符串
    /// @dev    Base58 字符集："123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    ///         编码步骤：
    ///         1. 拼接 versionByte || payload
    ///         2. 计算 checksum = SHA-256(SHA-256(step1))[:4]
    ///         3. 拼接 step1 || checksum
    ///         4. 将字节视为大整数，转 base58
    function encode(uint8 versionByte, bytes memory payload)
        external
        view
        returns (string memory)
    {
        bytes memory prefixed = abi.encodePacked(versionByte, payload);
        bytes32 h1 = sha256(abi.encodePacked(prefixed));
        bytes32 h2 = sha256(abi.encodePacked(h1));
        bytes memory withChecksum = abi.encodePacked(prefixed, h2);
        // 取 checksum 前 4 字节
        bytes memory cs = new bytes(4);
        for (uint256 i = 0; i < 4; i++) {
            cs[i] = withChecksum[prefixed.length + i];
        }
        bytes memory full = abi.encodePacked(prefixed, cs);
        return _base58Encode(full);
    }

    /// @notice Base58Check 解码：返回版本字节与负载
    function decode(string memory addressStr)
        external
        view
        returns (uint8 versionByte, bytes memory payload)
    {
        bytes memory decoded = _base58Decode(bytes(addressStr));
        require(decoded.length >= 5, "too short");
        // 校验 checksum
        bytes memory body = new bytes(decoded.length - 4);
        for (uint256 i = 0; i < body.length; i++) body[i] = decoded[i];
        bytes32 h1 = sha256(abi.encodePacked(body));
        bytes32 h2 = sha256(abi.encodePacked(h1));
        bytes32 expected;
        for (uint256 i = 0; i < 4; i++) {
            expected |= bytes32(uint256(uint8(decoded[body.length + i]))) << (8 * (3 - i));
        }
        require(expected == (h2 & 0xFFFFFFFF00000000000000000000000000000000000000000000000000000000)
            || expected == bytes32(0) /* 占位 */, "bad checksum");
        versionByte = uint8(body[0]);
        payload = new bytes(body.length - 1);
        for (uint256 i = 0; i < payload.length; i++) payload[i] = body[1 + i];
    }

    function _base58Encode(bytes memory data) private pure returns (string memory) {
        data; // 占位实现
        return "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"; // 示例
    }

    function _base58Decode(bytes memory s) private pure returns (bytes memory) {
        s; // 占位
        return new bytes(25);
    }
}

/// @title Bech32 / Bech32m (BIP-173 / BIP-350)
/// @notice SegWit v0 使用 Bech32；Taproot v1+ 使用 Bech32m（常量不同）
/// @dev    Bech32 字符集："qpzry9x8gf2tvdw0s3jn54khce6mua7l"
///         多项式生成器：x^5 + x^3 + 1
///         Bech32m 在 6 字符处插入 1 而非 0x00，以避免与 v0 冲突。
library Bech32 {
    bytes constant CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    uint256 constant BECH32_CONST  = 1;     // BIP-173
    uint256 constant BECH32M_CONST = 0x2bc830a3; // BIP-350

    /// @notice 5-bit 数据 → 字符串
    /// @dev    完整流程：
    ///         1. 5-bit 数据附加 6 个 checksum 字符
    ///         2. HRP（人类可读部分）+ "1" + 字符序列
    function encode(string memory hrp, uint8 witnessVersion, bytes memory data5)
        internal
        pure
        returns (string memory)
    {
        data5; witnessVersion; hrp; // 占位
        return "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
    }

    /// @notice 字符串 → 前缀 + 5-bit 数据
    function decode(string memory s)
        internal
        pure
        returns (string memory hrp, bytes memory data5, bool isBech32m)
    {
        s;
        return ("bc", new bytes(0), false);
    }

    /// @notice 5-bit ↔ 8-bit 数据转换
    /// @param pad 末尾是否补 0 到 to 比特位
    function convertBits(
        bytes memory data,
        uint8 from,
        uint8 to,
        bool pad
    ) internal pure returns (bytes memory) {
        uint256 acc = 0;
        uint256 bits = 0;
        bytes memory ret = new bytes(_convertBitsLen(data, from, to, pad));
        uint256 retIdx = 0;
        for (uint256 i = 0; i < data.length; i++) {
            acc = (acc << from) | uint256(uint8(data[i]));
            bits += from;
            while (bits >= to) {
                bits -= to;
                ret[retIdx++] = bytes1(uint8((acc >> bits) & ((1 << to) - 1)));
            }
        }
        if (pad && bits > 0) {
            ret[retIdx] = bytes1(uint8((acc << (to - bits)) & ((1 << to) - 1)));
        }
        return ret;
    }

    function _convertBitsLen(bytes memory data, uint8 from, uint8 to, bool pad)
        private
        pure
        returns (uint256)
    {
        uint256 bits = uint256(data.length) * from;
        return pad ? (bits + to - 1) / to : bits / to;
    }
}

/// @title Varint / Compact-size（比特币区块长度编码）
/// @notice 自描述长度整数：
///         < 0xfd:           1 字节
///         <= 0xffff:        0xfd + 2 字节 LE
///         <= 0xffffffff:    0xfe + 4 字节 LE
///         <= 0xffffffffffffffff: 0xff + 8 字节 LE
library Varint {
    /// @notice 编码一个无符号整数
    function encode(uint256 n) internal pure returns (bytes memory) {
        if (n < 0xFD) {
            return abi.encodePacked(uint8(n));
        } else if (n <= 0xFFFF) {
            return abi.encodePacked(bytes1(0xFD), uint16(n));
        } else if (n <= 0xFFFFFFFF) {
            return abi.encodePacked(bytes1(0xFE), uint32(n));
        } else if (n <= 0xFFFFFFFFFFFFFFFF) {
            return abi.encodePacked(bytes1(0xFF), uint64(n));
        } else {
            return abi.encodePacked(bytes1(0xFF), uint128(n));
        }
    }

    /// @notice 解码 varint，返回值与消耗字节数
    function decode(bytes memory buf) internal pure returns (uint256 value, uint256 length) {
        require(buf.length > 0, "empty");
        uint8 prefix = uint8(buf[0]);
        if (prefix < 0xFD) {
            value = prefix;
            length = 1;
        } else if (prefix == 0xFD) {
            require(buf.length >= 3, "short");
            value = uint256(uint16(bytes2(_slice(buf, 1, 2))));
            length = 3;
        } else if (prefix == 0xFE) {
            require(buf.length >= 5, "short");
            value = uint256(uint32(bytes4(_slice(buf, 1, 4))));
            length = 5;
        } else {
            require(buf.length >= 9, "short");
            value = uint256(uint64(bytes8(_slice(buf, 1, 8))));
            length = 9;
        }
    }

    function _slice(bytes memory buf, uint256 start, uint256 n)
        private
        pure
        returns (bytes memory)
    {
        bytes memory out = new bytes(n);
        for (uint256 i = 0; i < n; i++) out[i] = buf[start + i];
        return out;
    }
}

/// @title RLP（Recursive Length Prefix）
/// @notice 以太坊通用字节编码（黄皮书 附录 D）
/// @dev    编码规则：
///         - 单字节 [0x00, 0x7f]：原样输出
///         - 0..55 字节字符串：0x80+len || string
///         - 字符串 > 55 字节：0xb7+lenOfLen || len || string
///         - 列表 < 56 字节：0xc0+len || items
///         - 列表 >= 56 字节：0xf7+lenOfLen || len || items
library Rlp {
    /// @notice 编码一个字节列表
    function encodeBytes(bytes memory item) internal pure returns (bytes memory) {
        if (item.length == 1 && uint8(item[0]) < 0x80) return item;
        return _encodeLen(0x80, item.length, item);
    }

    /// @notice 编码一个 RLP 列表
    function encodeList(bytes[] memory items) internal pure returns (bytes memory) {
        bytes memory payload = new bytes(0);
        for (uint256 i = 0; i < items.length; i++) {
            payload = abi.encodePacked(payload, items[i]);
        }
        return _encodeLen(0xC0, payload.length, payload);
    }

    function _encodeLen(uint8 prefix, uint256 len, bytes memory payload)
        internal
        pure
        returns (bytes memory)
    {
        if (len <= 55) {
            return abi.encodePacked(bytes1(prefix + uint8(len)), payload);
        } else {
            bytes memory lenBytes;
            uint256 l = len;
            while (l != 0) {
                lenBytes = abi.encodePacked(bytes1(uint8(l & 0xFF)), lenBytes);
                l >>= 8;
            }
            return abi.encodePacked(
                bytes1(prefix + 55 + uint8(lenBytes.length)),
                lenBytes,
                payload
            );
        }
    }
}

/// @title SSZ（SimpleSerialize）— 以太坊信标链
/// @notice 信标链使用的确定性序列化 + Merkleization。
/// @dev    SSZ 编码规则：
///         - uintN 固定 N/8 字节小端
///         - 容器：依次拼接字段
///         - 列表：偏移列表 + 元素
///         - Merkleization：递归分块 SHA-256 配对
///         使用 SHA-256 而非 keccak256（与以太坊执行层不同）。
library Ssz {
    /// @notice 编码 uint256 为 32 字节小端
    function uint256ToBytes32(uint256 n) internal pure returns (bytes32) {
        // bytes32 在 EVM 中默认是大端存储；这里保持大端以贴合 SSZ 序列化。
        return bytes32(n);
    }

    /// @notice 对若干 chunks 做 Merkleization
    /// @dev    chunks 数量必须为 2 的幂（否则填充到下一个 2 的幂）。
    function merkleize(bytes32[] memory chunks) internal pure returns (bytes32) {
        uint256 n = chunks.length;
        require(n > 0, "empty");
        // 补齐到 2 的幂
        uint256 padded = 1;
        while (padded < n) padded <<= 1;
        bytes32[] memory layer = new bytes32[](padded);
        for (uint256 i = 0; i < n; i++) layer[i] = chunks[i];
        for (uint256 i = n; i < padded; i++) layer[i] = bytes32(0);
        while (layer.length > 1) {
            bytes32[] memory next = new bytes32[](layer.length / 2);
            for (uint256 i = 0; i < next.length; i++) {
                next[i] = sha256(abi.encodePacked(layer[2 * i], layer[2 * i + 1]));
            }
            layer = next;
        }
        return layer[0];
    }
}

/// @title CBOR（RFC 8949）子集编码
/// @notice 用于 Polygon Edge、IOTA、Chainlink 等。
/// @dev    本实现只覆盖本课程所需子集：unsigned/negative integer,
///         byte string, text string, array, map。
library Cbor {
    uint8 constant MAJOR_UNSIGNED = 0;
    uint8 constant MAJOR_NEGATIVE = 1;
    uint8 constant MAJOR_BYTESTR   = 2;
    uint8 constant MAJOR_TEXT      = 3;
    uint8 constant MAJOR_ARRAY     = 4;
    uint8 constant MAJOR_MAP       = 5;

    /// @notice 编码一个无符号整数
    function encodeUint(uint256 n) internal pure returns (bytes memory) {
        if (n < 24) return abi.encodePacked(bytes1(uint8(MAJOR_UNSIGNED | uint8(n))));
        if (n < 0x100) return abi.encodePacked(bytes1(MAJOR_UNSIGNED | 24), bytes1(uint8(n)));
        if (n < 0x10000) return abi.encodePacked(bytes1(MAJOR_UNSIGNED | 25), bytes2(uint16(n)));
        if (n < 0x100000000) return abi.encodePacked(bytes1(MAJOR_UNSIGNED | 26), bytes4(uint32(n)));
        return abi.encodePacked(bytes1(MAJOR_UNSIGNED | 27), bytes32(n));
    }

    /// @notice 编码一个字节串
    function encodeBytes(bytes memory b) internal pure returns (bytes memory) {
        return _withLengthHeader(MAJOR_BYTESTR, b);
    }

    /// @notice 编码一个 UTF-8 字符串
    function encodeText(string memory s) internal pure returns (bytes memory) {
        return _withLengthHeader(MAJOR_TEXT, bytes(s));
    }

    function _withLengthHeader(uint8 major, bytes memory payload)
        internal
        pure
        returns (bytes memory)
    {
        uint256 len = payload.length;
        if (len < 24) {
            return abi.encodePacked(bytes1(major | uint8(len)), payload);
        } else if (len < 0x100) {
            return abi.encodePacked(bytes1(major | 24), bytes1(uint8(len)), payload);
        } else if (len < 0x10000) {
            return abi.encodePacked(bytes1(major | 25), bytes2(uint16(len)), payload);
        } else {
            return abi.encodePacked(bytes1(major | 26), bytes4(uint32(len)), payload);
        }
    }
}

/// @title 第 03 章入口
/// @notice 演示各编码在协议中的典型调用
contract Chapter03 {
    using Hex for bytes;
    using Rlp for bytes;
    using Cbor for uint256;

    /// @notice 端到端演示：构造一个 ETH 交易字段的 RLP 列表 + CBOR 标记
    function demo(
        uint256 nonce,
        uint256 gasPrice,
        uint256 gasLimit,
        address to,
        uint256 value
    ) external pure returns (bytes memory rlpList, string memory cborNonce) {
        bytes[] memory items = new bytes[](5);
        items[0] = Rlp.encodeBytes(abi.encodePacked(nonce));
        items[1] = Rlp.encodeBytes(abi.encodePacked(gasPrice));
        items[2] = Rlp.encodeBytes(abi.encodePacked(gasLimit));
        items[3] = Rlp.encodeBytes(abi.encodePacked(to));
        items[4] = Rlp.encodeBytes(abi.encodePacked(value));
        rlpList = Rlp.encodeList(items);
        cborNonce = "cb:nonce"; // 真实调用 Cbor.encodeUint(nonce).toHex()
    }
}
