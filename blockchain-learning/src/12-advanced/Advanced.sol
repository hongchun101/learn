// SPDX-License-Identifier: MIT
// =============================================================================
// 第 12 章 — 进阶主题：MEV、跨链、隐私、DeFi (Advanced Topics)
// =============================================================================
// 目标：以 Solidity 描述资深链工程师必须掌握的系统与原语。
//
// 涵盖的概念：
//   1. MEV（Maximal Extractable Value）：searcher / builder / proposer 供应链、
//      Flashbots 风格 PBS 拍卖
//   2. 跨链消息：轻客户端、IBC relayer、canonical bridge
//   3. 隐私原语：Pedersen 承诺、环签名（Monero）、zk-SNARKs / zk-STARKs
//   4. DeFi 原语：AMM（恒定乘积 x*y=k）、订单簿、借贷池、爆仓
//   5. 治理：ERC-20 snapshot 投票、timelock、多签
//   6. 链上分析：事件日志索引、marks、balance-delta 对账
//
// 本章合约：
//   - MEV 供应链模拟（searcher → builder → proposer）
//   - 恒定乘积 AMM
//   - ERC-20 snapshot 投票
//   - Pedersen 承诺（占位，需 BN128 预编译）
// =============================================================================
pragma solidity ^0.8.24;

/// @title MEV：Searcher → Builder → Proposer 供应链
/// @notice Proposer-Builder Separation (PBS) 拍卖：builder 出最高价赢得 slot
/// @dev    流程：
///         1. Searcher 发现套利机会，提交 bundle（带 bid）
///         2. Builder 聚合 bundles 构造完整 block
///         3. Proposer 选最高价的 block
///         4. Proposer 拿到 builder 支付的费用，扣留 proposerRewardShare 后
///            builder 获得剩余
library Mev {
    /// @notice Searcher 的 bundle 出价
    struct SearcherBid {
        address searcher;
        uint256 bid;          // 报价
        bytes   bundle;       // 要打包的交易（示意）
    }

    /// @notice Builder 构造的 block
    struct BuilderBlock {
        address builder;
        uint256 totalBid;     // 包含的 searcher bid 之和
        bytes   blockPayload; // 完整 payload
    }

    /// @notice 选中 builder 后分配给 proposer
    struct ProposerAssignment {
        address builder;
        address proposer;
        uint256 proposerReward;
    }

    /// @notice 选出最高出价的 builder
    function pbsAuction(
        BuilderBlock[] memory blocks,
        uint256 proposerRewardShare // 以基点计（100 = 1%）
    ) internal pure returns (ProposerAssignment memory best) {
        require(blocks.length > 0, "no blocks");
        best = ProposerAssignment({
            builder: blocks[0].builder,
            proposer: address(0),
            proposerReward: (blocks[0].totalBid * proposerRewardShare) / 10000
        });
        for (uint256 i = 1; i < blocks.length; i++) {
            if (blocks[i].totalBid > blocks[0].totalBid) {
                best = ProposerAssignment({
                    builder: blocks[i].builder,
                    proposer: address(0),
                    proposerReward: (blocks[i].totalBid * proposerRewardShare) / 10000
                });
            }
        }
    }
}

/// @title 恒定乘积 AMM（Uniswap V2 风格）
/// @notice x * y = k；每次 swap 维持不变量
/// @dev    swap 公式（考虑 0.3% 手续费）：
///         - amountInWithFee = amountIn * 997
///         - numerator       = amountInWithFee * reserveOut
///         - denominator     = reserveIn * 1000 + amountInWithFee
///         - amountOut       = numerator / denominator
contract ConstantProductAmm {
    address public token0;
    address public token1;
    uint256 public reserve0;
    uint256 public reserve1;
    uint256 public totalSupply;          // LP token 总供应
    mapping(address => uint256) public balanceOf;   // LP token 余额

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );

    /// @notice 添加流动性
    function addLiquidity(uint256 amount0, uint256 amount1) external returns (uint256 shares) {
        // 第一次添加：shares = sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY
        // 后续添加：shares = min(amount0 * totalSupply / reserve0,
        //                       amount1 * totalSupply / reserve1)
        if (totalSupply == 0) {
            shares = _sqrt(amount0 * amount1) - 1000;
            balanceOf[address(0)] += 1000;  // MINIMUM_LIQUIDITY 永久锁仓
        } else {
            shares = _min(
                (amount0 * totalSupply) / reserve0,
                (amount1 * totalSupply) / reserve1
            );
        }
        require(shares > 0, "zero shares");
        balanceOf[msg.sender] += shares;
        totalSupply += shares;
        reserve0 += amount0;
        reserve1 += amount1;
        emit Mint(msg.sender, amount0, amount1);
    }

    /// @notice 移除流动性
    function removeLiquidity(uint256 shares) external returns (uint256 amount0, uint256 amount1) {
        amount0 = (shares * reserve0) / totalSupply;
        amount1 = (shares * reserve1) / totalSupply;
        balanceOf[msg.sender] -= shares;
        totalSupply -= shares;
        reserve0 -= amount0;
        reserve1 -= amount1;
        emit Burn(msg.sender, amount0, amount1, msg.sender);
    }

    /// @notice token0 → token1
    function swap0For1(uint256 amount0In, uint256 minAmountOut) external returns (uint256 out) {
        out = _getAmountOut(amount0In, reserve0, reserve1);
        require(out >= minAmountOut, "slippage");
        reserve0 += amount0In;
        reserve1 -= out;
        // 真实实现：transferFrom 转入 amount0In，转出 amount1Out
        emit Swap(msg.sender, amount0In, 0, 0, out, msg.sender);
    }

    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256)
    {
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        return numerator / denominator;
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        y = x;
        uint256 z = (x + 1) / 2;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}

/// @title 借贷池的爆仓判定
/// @notice 健康因子 = collateral * liquidationThreshold / debt
///         当 healthFactor < 1 时可被爆仓
/// @dev    关键不变量：
///         - collateralAdjusted = collateral * liquidationThreshold
///         - debtAdjusted       = debt
///         - HF < 1 → 可爆仓
library Liquidation {
    struct Position {
        uint256 collateral;            // 抵押品价值（USD 计价）
        uint256 debt;                  // 借款（USD 计价）
        uint256 liquidationThreshold;  // 抵押品可借比例（基点，8000 = 80%）
    }

    /// @notice 判断一个头寸是否可被爆仓
    function isLiquidatable(Position memory p) internal pure returns (bool) {
        if (p.debt == 0) return false;
        // HF < 1 等价于 collateral * threshold < debt * 10000
        return p.collateral * p.liquidationThreshold < p.debt * 10000;
    }

    /// @notice 爆仓奖励：爆仓者获得抵押品的一定比例作为激励
    /// @param p            头寸
    /// @param closeFactor  关闭比例（基点，5000 = 50%）
    /// @return seized      爆仓者可获得的抵押品
    function liquidateAmount(Position memory p, uint256 closeFactor)
        internal
        pure
        returns (uint256 seized)
    {
        uint256 maxClose = (p.debt * closeFactor) / 10000;
        // seized = closeDebt * (collateral / debt) ≈ closeDebt / ltv
        seized = (maxClose * p.collateral) / p.debt;
    }
}

/// @title ERC-20 Snapshot 投票
/// @notice 治理合约常用：在某个 block 快照代币余额，按比例计票
/// @dev    snapshot() 由 governance 角色在投票开始时调用，
///         之后通过 getPriorVotes(voter, blockNumber) 查询历史票数。
contract SnapshotVoting {
    struct Snapshot {
        mapping(address => uint256) votes;
        uint64 blockNumber;
    }

    address public token;                  // 治理代币
    mapping(uint256 => Snapshot) public snapshots; // proposalId → snapshot
    uint256 public proposalCount;

    event ProposalCreated(uint256 indexed id, uint64 snapshotBlock);
    event VoteCast(uint256 indexed id, address indexed voter, bool support, uint256 weight);

    constructor(address _token) {
        token = _token;
    }

    /// @notice 创建提案并记录快照块号
    function createProposal(uint64 snapshotBlock) external returns (uint256 id) {
        id = proposalCount++;
        snapshots[id].blockNumber = snapshotBlock;
        emit ProposalCreated(id, snapshotBlock);
    }

    /// @notice 投票
    function castVote(uint256 id, bool support, uint256 weight) external {
        require(snapshots[id].blockNumber > 0, "no proposal");
        snapshots[id].votes[msg.sender] = weight;
        emit VoteCast(id, msg.sender, support, weight);
    }

    /// @notice 计票
    function tally(uint256 id, address[] memory voters)
        external
        view
        returns (uint256 yes, uint256 no)
    {
        for (uint256 i = 0; i < voters.length; i++) {
            uint256 w = snapshots[id].votes[voters[i]];
            // 简化：用最后一位决定 yes/no
            if (w & 1 == 0) yes += w;
            else no += w;
        }
    }
}

/// @title Pedersen 承诺（占位）
/// @notice 隐私交易的基础原语
/// @dev    commitment = value * H + blinding * G
///         其中 G、H 是椭圆曲线上的独立生成元。
///         同 (value, blinding) → 同 commitment；不同 (value, blinding) → 几乎必不同。
///         给定 commitment 无法推出 value；持有 (value, blinding) 可验证。
library Pedersen {
    /// @notice 提交承诺
    /// @dev    真实实现：调用 BN128 预编译（ECMul）
    ///         这里仅描述接口
    function commit(uint256 value, uint256 blinding)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(value, blinding));
    }

    /// @notice 验证承诺
    function verify(bytes32 commitment, uint256 value, uint256 blinding)
        internal
        pure
        returns (bool)
    {
        return commitment == keccak256(abi.encodePacked(value, blinding));
    }
}

/// @title Timelock：延迟管理操作
/// @notice 治理合约的"延迟执行"原语
/// @dev    任何 admin 操作：
///         1. 提议（propose）→ 记录目标 / 数据 / eta
///         2. 等待 delay（最少 2 天）
///         3. 执行（execute）→ 调用目标合约
///         任何时候可取消（cancel）
contract Timelock {
    address public admin;
    uint256 public delay;            // 最小延迟（秒）
    mapping(bytes32 => bool) public queued;  // txHash → 是否排队

    event Queued(bytes32 indexed txHash, uint256 eta);
    event Executed(bytes32 indexed txHash);
    event Cancelled(bytes32 indexed txHash);

    constructor(uint256 _delay) {
        admin = msg.sender;
        delay = _delay;
    }

    /// @notice 排队：现在时间 + delay 后可执行
    function queue(address target, bytes memory data) external {
        require(msg.sender == admin, "not admin");
        bytes32 txHash = keccak256(abi.encode(target, data));
        uint256 eta = block.timestamp + delay;
        queued[txHash] = true;
        emit Queued(txHash, eta);
    }

    /// @notice 执行
    function execute(address target, bytes memory data) external {
        require(msg.sender == admin, "not admin");
        bytes32 txHash = keccak256(abi.encode(target, data));
        require(queued[txHash], "not queued");
        queued[txHash] = false;
        (bool ok, ) = target.call(data);
        require(ok, "exec failed");
        emit Executed(txHash);
    }

    /// @notice 取消
    function cancel(address target, bytes memory data) external {
        require(msg.sender == admin, "not admin");
        bytes32 txHash = keccak256(abi.encode(target, data));
        queued[txHash] = false;
        emit Cancelled(txHash);
    }
}

/// @title 链上分析：事件日志索引（简化）
/// @notice 通过 events 提供给后端 / The Graph 索引
/// @dev    The Graph 用 subgraph 定义事件 schema；
///         合约层只需要 emit 标准事件即可。
contract Analytics {
    /// @notice 用户充提事件（供 The Graph 索引）
    event BalanceChange(
        address indexed user,
        int256  delta,        // 正数=充值，负数=提取
        uint256 newBalance,
        bytes   reason
    );

    mapping(address => uint256) public balanceOf;

    /// @notice 充值
    function deposit(bytes calldata reason) external payable {
        balanceOf[msg.sender] += msg.value;
        emit BalanceChange(msg.sender, int256(msg.value), balanceOf[msg.sender], reason);
    }

    /// @notice 提取
    function withdraw(uint256 amount, bytes calldata reason) external {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
        emit BalanceChange(msg.sender, -int256(amount), balanceOf[msg.sender], reason);
    }
}

/// @title 第 12 章入口
/// @notice 部署一个 AMM + 一个 Timelock，演示常见 DeFi / 治理模式
contract Chapter12 {
    ConstantProductAmm public amm;
    Timelock public timelock;

    constructor() {
        amm = new ConstantProductAmm();
        timelock = new Timelock(2 days);
    }
}
