// SPDX-License-Identifier: MIT
// =============================================================================
// 第 08 章 — EVM 深入 (EVM Deep Dive)
// =============================================================================
// 目标：以 Solidity 描述 EVM 协议级概念。
//
// 涵盖的概念：
//   1. 操作码：256-bit 栈机、字节码布局、stop / 算术 / 比较 / 位运算
//      / 内存 / 存储 / 控制流
//   2. Gas 计量：每操作码成本、tx 内在成本、SSTORE/SLOAD 动态成本
//   3. 内存模型：线性字节，按字数二次方扩展成本
//   4. 瞬态存储（EIP-1153）：TLOAD/TSTORE 按 tx 清除
//   5. 预编译合约：ecRecover, sha256, ripemd160, identity, modExp, bn128
//   6. 合约创建：CREATE / CREATE2 地址
//   7. SELFDESTRUCT 与存储退款
//   8. EOF（EIP-3540）：代码拆分为带容器的 header
//
// 参考资料：
//   - EVM Yellow Paper: https://ethereum.github.io/yellowpaper/paper.pdf
//   - EIP-150, EIP-1559, EIP-2929, EIP-1153, EIP-3540, EIP-4844, EIP-7702
// =============================================================================
pragma solidity ^0.8.24;

/// @title EVM 操作码
/// @notice 描述每个操作码的语义与协议级分类
/// @dev    关键范围：
///         - 0x00-0x0F：停机与算术
///         - 0x10-0x1F：比较与位运算
///         - 0x20-0x2F：SHA3 / KECCAK
///         - 0x30-0x3F：环境信息
///         - 0x40-0x4F：块信息
///         - 0x50-0x5F：栈 / 内存 / 存储 / 流控
///         - 0x60-0x7F：PUSH
///         - 0x80-0x8F：DUP
///         - 0x90-0x9F：SWAP
///         - 0xA0-0xA4：LOG
///         - 0xF0-0xFF：系统操作（CREATE / CALL / SELFDESTRUCT）
library Op {
    uint8 internal constant STOP       = 0x00;
    uint8 internal constant ADD        = 0x01;
    uint8 internal constant MUL        = 0x02;
    uint8 internal constant SUB        = 0x03;
    uint8 internal constant DIV        = 0x04;
    uint8 internal constant SDIV       = 0x05;
    uint8 internal constant MOD        = 0x06;
    uint8 internal constant SMOD       = 0x07;
    uint8 internal constant ADDMOD     = 0x08;
    uint8 internal constant MULMOD     = 0x09;
    uint8 internal constant EXP        = 0x0A;
    uint8 internal constant SIGNEXTEND = 0x0B;

    uint8 internal constant LT     = 0x10;
    uint8 internal constant GT     = 0x11;
    uint8 internal constant SLT    = 0x12;
    uint8 internal constant SGT    = 0x13;
    uint8 internal constant EQ     = 0x14;
    uint8 internal constant ISZERO = 0x15;
    uint8 internal constant AND    = 0x16;
    uint8 internal constant OR     = 0x17;
    uint8 internal constant XOR    = 0x18;
    uint8 internal constant NOT    = 0x19;
    uint8 internal constant BYTE   = 0x1A;
    uint8 internal constant SHL    = 0x1B;
    uint8 internal constant SHR    = 0x1C;
    uint8 internal constant SAR    = 0x1D;

    uint8 internal constant KECCAK256 = 0x20;

    uint8 internal constant ADDRESS      = 0x30;
    uint8 internal constant BALANCE      = 0x31;
    uint8 internal constant ORIGIN       = 0x32;
    uint8 internal constant CALLER       = 0x33;
    uint8 internal constant CALLVALUE    = 0x34;
    uint8 internal constant CALLDATALOAD = 0x35;
    uint8 internal constant CALLDATASIZE = 0x36;
    uint8 internal constant CALLDATACOPY = 0x37;
    uint8 internal constant CODESIZE     = 0x38;
    uint8 internal constant CODECOPY     = 0x39;
    uint8 internal constant GASPRICE     = 0x3A;
    uint8 internal constant EXTCODESIZE  = 0x3B;
    uint8 internal constant EXTCODECOPY  = 0x3C;
    uint8 internal constant RETURNDATASIZE = 0x3D;
    uint8 internal constant RETURNDATACOPY = 0x3E;
    uint8 internal constant EXTCODEHASH  = 0x3F;

    uint8 internal constant BLOCKHASH   = 0x40;
    uint8 internal constant COINBASE    = 0x41;
    uint8 internal constant TIMESTAMP   = 0x42;
    uint8 internal constant NUMBER      = 0x43;
    uint8 internal constant DIFFICULTY  = 0x44;
    uint8 internal constant GASLIMIT    = 0x45;
    uint8 internal constant CHAINID     = 0x46;
    uint8 internal constant SELFBALANCE = 0x47;
    uint8 internal constant BASEFEE     = 0x48;
    uint8 internal constant BLOBHASH    = 0x49;
    uint8 internal constant BLOBBASEFEE = 0x4A;

    uint8 internal constant POP      = 0x50;
    uint8 internal constant MLOAD    = 0x51;
    uint8 internal constant MSTORE   = 0x52;
    uint8 internal constant MSTORE8  = 0x53;
    uint8 internal constant SLOAD    = 0x54;
    uint8 internal constant SSTORE   = 0x55;
    uint8 internal constant JUMP     = 0x56;
    uint8 internal constant JUMPI    = 0x57;
    uint8 internal constant PC       = 0x58;
    uint8 internal constant MSIZE    = 0x59;
    uint8 internal constant GAS      = 0x5A;
    uint8 internal constant JUMPDEST = 0x5B;
    uint8 internal constant TLOAD    = 0x5C;   // EIP-1153
    uint8 internal constant TSTORE   = 0x5D;   // EIP-1153
    uint8 internal constant MCOPY    = 0x5E;   // EIP-5656

    uint8 internal constant PUSH0  = 0x5F;     // EIP-3855
    uint8 internal constant PUSH_BASE = 0x60;  // PUSH1..PUSH32 = 0x60..0x7F
    uint8 internal constant PUSH_END  = 0x80;
    uint8 internal constant DUP_BASE = 0x80;  // DUP1..DUP16 = 0x80..0x8F
    uint8 internal constant SWAP_BASE = 0x90; // SWAP1..SWAP16 = 0x90..0x9F
    uint8 internal constant LOG_BASE = 0xA0;  // LOG0..LOG4 = 0xA0..0xA4

    uint8 internal constant CREATE       = 0xF0;
    uint8 internal constant CALL         = 0xF1;
    uint8 internal constant CALLCODE     = 0xF2;
    uint8 internal constant RETURN       = 0xF3;
    uint8 internal constant DELEGATECALL = 0xF4;
    uint8 internal constant CREATE2      = 0xF5;
    uint8 internal constant STATICCALL   = 0xFA;
    uint8 internal constant REVERT       = 0xFD;
    uint8 internal constant INVALID      = 0xFE;
    uint8 internal constant SELFDESTRUCT = 0xFF;

    /// @notice 操作码是否属于 PUSH 范围（消耗 1 + pushSize 字节）
    function isPush(uint8 op_) internal pure returns (bool) {
        return op_ >= PUSH_BASE && op_ < PUSH_END;
    }

    /// @notice PUSH 操作码携带的字节数
    function pushSize(uint8 op_) internal pure returns (uint256) {
        return uint256(op_) - uint256(PUSH_BASE) + 1;
    }

    function isDup(uint8 op_) internal pure returns (bool) {
        return op_ >= DUP_BASE && op_ < DUP_BASE + 16;
    }

    function isSwap(uint8 op_) internal pure returns (bool) {
        return op_ >= SWAP_BASE && op_ < SWAP_BASE + 16;
    }

    function isLog(uint8 op_) internal pure returns (bool) {
        return op_ >= LOG_BASE && op_ <= LOG_BASE + 4;
    }

    function logTopicCount(uint8 op_) internal pure returns (uint256) {
        return uint256(op_) - uint256(LOG_BASE);
    }
}

/// @title Gas 计量（Berlin+ 基线）
/// @notice 描述每个操作码的 gas 成本
/// @dev    基线常量：
///         - ZERO = 0；VERYLOW = 3（ADD, SUB, NOT 等）
///         - LOW = 5（MUL, DIV, AND 等）
///         - MID = 8（ADDMOD, MULMOD）
///         - HIGH = 10（KECCAK256 base）
///         - SSTORE_SET = 20000（新值）
///         - SSTORE_RESET = 2900（已存在）
///         - SSTORE_CLEARS_REFUND = 4800（清零退款）
///         - CALL = 700
///         - LOG_BASE = 375
library Gas {
    uint256 internal constant ZERO    = 0;
    uint256 internal constant VERYLOW = 3;
    uint256 internal constant LOW     = 5;
    uint256 internal constant MID     = 8;
    uint256 internal constant HIGH    = 10;
    uint256 internal constant WARM    = 100;     // EIP-2929
    uint256 internal constant COLD    = 2600;    // EIP-2929
    uint256 internal constant SSTORE_SET   = 20000;
    uint256 internal constant SSTORE_RESET = 2900;
    uint256 internal constant SSTORE_CLEARS_REFUND = 4800;
    uint256 internal constant CALL   = 700;
    uint256 internal constant LOG_BASE = 375;
    uint256 internal constant KECCAK256_BASE = 30;
    uint256 internal constant KECCAK256_WORD = 6;

    /// @notice 计算操作码的基础 gas 成本
    /// @dev    真实实现还要考虑动态成本（如 KECCAK256 按字字数计费）。
    function cost(uint8 op_) internal pure returns (uint256 base) {
        if (op_ == Op.STOP || op_ == Op.ADD || op_ == Op.SUB
            || op_ == Op.NOT || op_ == Op.LT || op_ == Op.GT
            || op_ == Op.EQ || op_ == Op.ISZERO) return VERYLOW;
        if (op_ == Op.MUL || op_ == Op.DIV || op_ == Op.SDIV
            || op_ == Op.MOD || op_ == Op.SMOD
            || op_ == Op.AND || op_ == Op.OR || op_ == Op.XOR
            || op_ == Op.BYTE || op_ == Op.SHL || op_ == Op.SHR
            || op_ == Op.SAR) return LOW;
        if (op_ == Op.ADDMOD || op_ == Op.MULMOD) return MID;
        if (op_ == Op.KECCAK256) return KECCAK256_BASE;  // + 6/字
        if (op_ == Op.BALANCE || op_ == Op.EXTCODESIZE
            || op_ == Op.EXTCODEHASH) return COLD;       // 简化为冷访问
        if (op_ == Op.SLOAD) return COLD;
        if (op_ == Op.SSTORE) return SSTORE_SET;        // 简化为新值
        if (op_ == Op.JUMP || op_ == Op.JUMPI) return MID;
        if (op_ == Op.JUMPDEST) return 1;
        if (op_ >= Op.PUSH_BASE && op_ < Op.PUSH_END) return 3;
        if (op_ >= Op.DUP_BASE && op_ < Op.DUP_BASE + 16) return 3;
        if (op_ >= Op.SWAP_BASE && op_ < Op.SWAP_BASE + 16) return 3;
        if (op_ == Op.CALL) return CALL;
        if (op_ == Op.CREATE || op_ == Op.CREATE2) return 32000;
        if (op_ == Op.SELFDESTRUCT) return 5000;
        return 1;
    }
}

/// @title 内存模型
/// @notice EVM 内存 = 线性字节，扩展成本 = 3 * words + words^2 / 512
/// @dev    words = ceil(size/32)。每次 MLOAD/MSTORE 触发 memory expansion 时
///         按新 words 计算额外成本。
library Memory {
    /// @notice 内存扩展成本
    /// @return gas 此次扩展的 gas
    /// @return words 扩展后的字数
    function expansionCost(uint256 size, uint256 prevWords)
        internal
        pure
        returns (uint256 gas, uint256 words)
    {
        words = (size + 31) / 32;
        if (words <= prevWords) {
            return (0, prevWords);
        }
        gas = 3 * words + (words * words) / 512
            - (3 * prevWords + (prevWords * prevWords) / 512);
    }
}

/// @title 预编译合约
/// @notice 以太坊在执行层注册的 native 实现：高效执行常见密码学操作。
/// @dev    当前预编译：
///         0x01 ecRecover    — ECDSA 公钥恢复
///         0x02 SHA256       — SHA-256 哈希
///         0x03 RIPEMD160    — RIPEMD-160 哈希
///         0x04 Identity     — 数据拷贝（用作 memory 回填）
///         0x05 ModExp       — 大数模幂
///         0x06 ECAdd        — BN128 椭圆曲线点加
///         0x07 ECMul        — BN128 标量乘
///         0x08 ECPairing    — BN128 配对（双线性映射）
///         0x09 Blake2F      — BLAKE2b 压缩
///         0x0A PointEval    — EIP-4844 KZG 承诺评估
library Precompile {
    address public constant ECRECOVER = address(0x01);
    address public constant SHA256    = address(0x02);
    address public constant RIPEMD160 = address(0x03);
    address public constant IDENTITY  = address(0x04);
    address public constant MODEXP    = address(0x05);
    address public constant ECADD     = address(0x06);
    address public constant ECMUL     = address(0x07);
    address public constant ECPAIRING = address(0x08);
    address public constant BLAKE2F   = address(0x09);
    address public constant POINT_EVAL = address(0x0A);

    /// @notice 各预编译合约的 gas 成本（基础部分）
    /// @dev    大部分预编译 = base + dynamic(inputLen)
    function baseGas(address precompile) internal pure returns (uint256) {
        if (precompile == ECRECOVER) return 3000;
        if (precompile == SHA256)    return 60;
        if (precompile == RIPEMD160) return 600;
        if (precompile == IDENTITY)  return 15;
        if (precompile == MODEXP)    return 0;       // 复杂，依赖输入
        if (precompile == ECADD)     return 150;
        if (precompile == ECMUL)     return 6000;
        if (precompile == ECPAIRING) return 113000;  // base
        if (precompile == BLAKE2F)   return 0;       // 依赖 rounds
        if (precompile == POINT_EVAL) return 50000;
        return 0;
    }
}

/// @title 合约创建地址
/// @notice CREATE 与 CREATE2 的地址推导
/// @dev    CREATE:    addr = keccak256(rlp([deployer, nonce]))[12:]
///         CREATE2:   addr = keccak256(0xff ++ deployer ++ salt
///                                    ++ keccak256(initCode))[12:]
///         CREATE2 使地址可预测（用于 channel / L2 状态预计算）。
library CreateAddress {
    /// @notice CREATE 部署地址
    function create(address deployer, uint256 nonce) internal pure returns (address) {
        // 真实实现：keccak256(rlp([deployer, nonce]))
        // 这里用 RLP 简化：直接 keccak256(abi.encode(deployer, nonce))
        bytes32 h = keccak256(abi.encodePacked(deployer, nonce));
        return address(uint160(uint256(h)));
    }

    /// @notice CREATE2 部署地址
    function create2(
        address deployer,
        bytes32 salt,
        bytes memory initCode
    ) internal pure returns (address) {
        bytes32 h = keccak256(
            abi.encodePacked(
                bytes1(0xFF),
                deployer,
                salt,
                keccak256(initCode)
            )
        );
        return address(uint160(uint256(h)));
    }
}

/// @title EOF（EIP-3540）
/// @notice 字节码结构：magic + version + header + body
/// @dev    EOF 不允许 SELFDESTRUCT 与动态跳转；
///         字节码开头为 0xEF0001 00 0X 0X 0X 0X...
library Eof {
    bytes2 public constant EOF_MAGIC = 0xEF00;
    uint8  public constant EOF_VERSION = 1;

    /// @notice 校验字节码是否以 EOF 魔数开头
    function isEof(bytes memory code) internal pure returns (bool) {
        if (code.length < 4) return false;
        return code[0] == 0xEF && code[1] == 0x00
            && code[2] == 0x01 && code[3] == 0x00;
    }
}

/// @title 第 08 章入口
/// @notice 演示操作码判定、Gas 计算、CREATE2 地址
contract Chapter08 {
    using Op for uint8;
    using Gas for uint8;
    using CreateAddress for address;

    /// @notice 端到端演示：操作码分类 + 基础 gas 成本
    function describe(uint8 op_)
        external
        pure
        returns (string memory kind, uint256 baseGas)
    {
        if (op_.isPush()) kind = "PUSH";
        else if (op_.isDup()) kind = "DUP";
        else if (op_.isSwap()) kind = "SWAP";
        else if (op_.isLog()) kind = "LOG";
        else if (op_ == Op.STOP) kind = "STOP";
        else if (op_ == Op.SSTORE) kind = "SSTORE";
        else if (op_ == Op.CALL) kind = "CALL";
        else if (op_ == Op.SELFDESTRUCT) kind = "SELFDESTRUCT";
        else kind = "OTHER";
        baseGas = op_.cost();
    }

    /// @notice CREATE2 地址推导
    function predictCreate2(
        address deployer,
        bytes32 salt,
        bytes memory initCode
    ) external pure returns (address) {
        return deployer.create2(salt, initCode);
    }
}
