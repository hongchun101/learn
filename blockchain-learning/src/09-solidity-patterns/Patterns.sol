// SPDX-License-Identifier: MIT
// =============================================================================
// 第 09 章 — 智能合约模式与安全 (Smart-Contract Patterns & Security)
// =============================================================================
// 目标：以 Solidity 实现每个常见合约模式与安全防护。
//
// 涵盖的概念：
//   1. ERC-20（同质化代币）
//   2. ERC-721（NFT）
//   3. ERC-1155（多代币标准）
//   4. ERC-4626（代币化金库）
//   5. 重入锁 + checks-effects-interactions 模式
//   6. Pull payment（拉取支付）
//   7. 访问控制：Ownable、Role-Based
//   8. 可升级性：UUPS、Transparent
//   9. 内存安全汇编
//  10. 常见陷阱：整数溢出（pre-0.8.0）、unchecked return、
//      tx.origin 鉴权、对不受信任代码 delegatecall、ERC-20 hooks
//
// 参考资料：
//   - ERC-20, ERC-721, ERC-1155, ERC-4626
//   - OpenZeppelin Contracts
//   - Trail of Bits / Consensys 安全模式
// =============================================================================
pragma solidity ^0.8.24;

/// @title ERC-20 同质化代币
/// @notice 标准接口：balanceOf, transfer, transferFrom, approve, allowance
/// @dev    关键事件：
///         - Transfer(from, to, value)   必须触发
///         - Approval(owner, spender, value) 必须触发
///         关键防护：
///         - 转账前检查余额
///         - approve 应支持"先归零再设置"，避免 race condition
contract ERC20 {
    string public name;
    string public symbol;
    uint8  public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @notice 初始化铸币
    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    /// @notice 公开 mint 函数（教学用，生产应仅 minter 角色可调）
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice 内部铸币
    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    /// @notice 转账：先检查后修改（checks-effects-interactions）
    function transfer(address to, uint256 amount) external returns (bool) {
        require(to != address(0), "to zero");
        require(balanceOf[msg.sender] >= amount, "insufficient");
        unchecked {
            balanceOf[msg.sender] -= amount;
            balanceOf[to] += amount;
        }
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    /// @notice 授权
    /// @dev    推荐做法：调用方先把 amount 设为 0，再设为新值，
    ///         以兼容部分钱包的"先比较再发送"逻辑，避免 race。
    function approve(address spender, uint256 amount) external returns (bool) {
        require(spender != address(0), "spender zero");
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @notice 代理转账
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(to != address(0), "to zero");
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        unchecked {
            allowance[from][msg.sender] -= amount;
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
        return true;
    }
}

/// @title ERC-721 NFT
/// @notice 关键接口：ownerOf, approve, getApproved, setApprovalForAll
///         transferFrom, safeTransferFrom
/// @dev    关键防护：
///         - tokenId 不能复用
///         - safeTransferFrom 需检查接收方实现 IERC721Receiver
contract ERC721 {
    string public name;
    string public symbol;

    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    constructor(string memory n, string memory s) {
        name = n; symbol = s;
    }

    /// @notice 公开 mint 函数（教学用）
    function mint(address to, uint256 id) external {
        _mint(to, id);
    }

    function _mint(address to, uint256 id) internal {
        require(to != address(0), "to zero");
        require(ownerOf[id] == address(0), "exists");
        ownerOf[id] = to;
        unchecked { balanceOf[to] += 1; }
        emit Transfer(address(0), to, id);
    }

    function approve(address to, uint256 id) external {
        address owner = ownerOf[id];
        require(msg.sender == owner || isApprovedForAll[owner][msg.sender], "not owner");
        getApproved[id] = to;
        emit Approval(owner, to, id);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 id) public {
        address owner = ownerOf[id];
        require(owner == from, "wrong from");
        require(
            msg.sender == owner || msg.sender == getApproved[id]
            || isApprovedForAll[owner][msg.sender],
            "not authorized"
        );
        require(to != address(0), "to zero");
        delete getApproved[id];
        unchecked {
            balanceOf[from] -= 1;
            balanceOf[to] += 1;
        }
        ownerOf[id] = to;
        emit Transfer(from, to, id);
    }
}

/// @title ERC-1155 多代币标准
/// @notice 单个合约同时管理多种代币（fungible + NFT）
/// @dev    safeBatchTransferFrom 要求接收方实现 IERC1155Receiver
contract ERC1155 {
    // holder => tokenId => balance
    mapping(address => mapping(uint256 => uint256)) public balanceOf;
    // holder => operator => approved
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event TransferSingle(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 id,
        uint256 value
    );
    event TransferBatch(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256[] ids,
        uint256[] values
    );
    event URI(string value, uint256 indexed id);

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external {
        require(
            msg.sender == from || isApprovedForAll[from][msg.sender],
            "not authorized"
        );
        require(to != address(0), "to zero");
        unchecked {
            balanceOf[from][id] -= amount;
            balanceOf[to][id] += amount;
        }
        emit TransferSingle(msg.sender, from, to, id, amount);
        data; // 真实实现：检查 to.code.length > 0 → 调用 onERC1155Received
    }
}

/// @title ERC-4626 代币化金库
/// @notice 存款人存入基础资产，获得按比例分配的份额代币
/// @dev    核心公式：
///         - exchangeRate = totalAssets / totalSupply（无舍入）
///         - convertToShares(assets)   = assets * supply / totalAssets
///         - convertToAssets(shares)   = shares * totalAssets / supply
///         重要规则（InflationAttack 防护）：
///         - 首次 deposit 时空投"死份额"或要求最小存款额
contract ERC4626 {
    ERC20 public immutable asset;
    ERC20 public share;   // 用 ERC20 作为份额代币

    uint256 public totalAssets;
    uint256 public totalSupply;

    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    constructor(ERC20 _asset, ERC20 _share) {
        asset = _asset;
        share = _share;
    }

    /// @notice 兑换份额：assets * totalSupply / totalAssets
    function convertToShares(uint256 assets) public view returns (uint256) {
        if (totalAssets == 0 || totalSupply == 0) return assets;
        return (assets * totalSupply) / totalAssets;
    }

    /// @notice 兑换底层资产
    function convertToAssets(uint256 shares) public view returns (uint256) {
        if (totalSupply == 0) return shares;
        return (shares * totalAssets) / totalSupply;
    }

    /// @notice 存款：用户转入 assets，得到对应份额
    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        shares = convertToShares(assets);
        require(shares > 0, "zero shares");
        asset.transferFrom(msg.sender, address(this), assets);
        unchecked {
            totalAssets += assets;
            totalSupply += shares;
        }
        share.mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /// @notice 提取：销毁 shares，按比例取回 assets
    function withdraw(uint256 assets, address receiver, address owner)
        external
        returns (uint256 shares)
    {
        shares = (assets * totalSupply + totalAssets - 1) / totalAssets; // 向上取整
        if (msg.sender != owner) {
            // 真实实现：扣减 allowance
        }
        share.transferFrom(owner, address(this), shares);
        unchecked {
            totalAssets -= assets;
            totalSupply -= shares;
        }
        asset.transfer(receiver, assets);
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }
}

/// @title 重入锁（Reentrancy Guard）
/// @notice 在状态修改过程中禁止再次进入同一函数
/// @dev    状态机：NOT_ENTERED → ENTERED → NOT_ENTERED
///         使用 transient storage (EIP-1153) 可使 lock 在 tx 结束时自动清除。
abstract contract ReentrancyGuard {
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private _status = NOT_ENTERED;

    modifier nonReentrant() {
        require(_status != ENTERED, "reentrant");
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }
}

/// @title Pull Payment（拉取支付）
/// @notice 与"主动推送"对比：让收款方主动调用 withdraw()
/// @dev    优势：
///         - 失败不会 revert 整个 tx
///         - 避免对方 receive() 实现有 revert / gas 问题导致资金卡住
///         - 天然抗 DoS
contract PullPayment {
    mapping(address => uint256) public payments;

    event PaymentReceived(address from, uint256 amount);
    event PaymentWithdrawn(address to, uint256 amount);

    /// @notice 合约 owner 调用，记录某地址可提取的金额
    function _asyncTransfer(address dest, uint256 amount) internal {
        payments[dest] += amount;
        emit PaymentReceived(dest, amount);
    }

    /// @notice 收款方主动提取
    /// @dev    标记为 virtual 以便子类重写（添加重入锁、额外校验等）
    function withdraw() external virtual {
        uint256 payment = payments[msg.sender];
        require(payment > 0, "nothing to withdraw");
        payments[msg.sender] = 0;
        payable(msg.sender).transfer(payment);
        emit PaymentWithdrawn(msg.sender, payment);
    }
}

/// @title 访问控制：Ownable
/// @notice 单所有者模式；多角色应使用 AccessControl (RBAC)
contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previous, address indexed next);

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}

/// @title UUPS 升级（简化）
/// @notice Universal Upgradeable Proxy Standard (EIP-1822)
/// @dev    关键不变量：
///         - 升级函数由实现合约自身提供，不在代理合约中
///         - 升级前 _authorizeUpgrade 校验 caller
///         - 升级后必须调用 _upgradeToAndCallUUPS
abstract contract UUPSUpgradeable {
    address internal _implementation;

    function _authorizeUpgrade(address newImpl) internal virtual;

    function upgradeToAndCall(address newImpl, bytes memory data) external payable virtual {
        _authorizeUpgrade(newImpl);
        _implementation = newImpl;
        // 真实实现：ERC-1967 槽位 + delegatecall
        (bool ok, ) = newImpl.delegatecall(data);
        require(ok, "init failed");
    }
}

/// @title 安全：Checks-Effects-Interactions 示例
/// @notice 拉取支付 + 重入锁 + checks-effects-interactions 共同防御
contract SecureVault is ReentrancyGuard, PullPayment, Ownable {
    mapping(address => uint256) public deposits;

    /// @notice 存款：先记录状态，再尝试 ETH 转账
    function deposit() external payable {
        deposits[msg.sender] += msg.value;
    }

    /// @notice 取款：重入锁 + 状态先清零 + 再转账
    /// @dev    override 重写父合约的 withdraw，叠加非重入保护
    function withdraw() external override nonReentrant {
        uint256 amount = deposits[msg.sender];
        require(amount > 0, "no deposit");
        // 1. Effects：先清零
        deposits[msg.sender] = 0;
        // 2. Interactions：最后转账
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
    }
}

/// @title 第 09 章入口
/// @notice 部署一个 ERC-20 + 一个 NFT，演示常见模式
contract Chapter09 {
    ERC20 public token;
    ERC721 public nft;
    ERC1155 public multi;

    constructor() {
        token = new ERC20("DemoToken", "DMK", 18);
        nft = new ERC721("DemoNFT", "DNFT");
        multi = new ERC1155();
        // 给部署者铸 1000 枚
        token.mint(msg.sender, 1000 ether);
        // 铸造 3 个 NFT
        nft.mint(msg.sender, 1);
        nft.mint(msg.sender, 2);
        nft.mint(msg.sender, 3);
    }
}
