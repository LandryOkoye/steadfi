// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Timelock
/// @notice Two-step timelock for RISK_ADMIN parameter changes.
///         - On testnet: 1-hour delay (configurable at deploy).
///         - On mainnet: 48-hour delay.
///         Only the admin (OWNER multisig on mainnet) can queue and execute.
///         Any queued transaction can be cancelled at any time.
contract Timelock {
    uint256 public immutable delay;
    address public admin;
    address public pendingAdmin;

    mapping(bytes32 => bool) public queuedTransactions;

    event NewAdmin(address indexed newAdmin);
    event NewPendingAdmin(address indexed newPendingAdmin);
    event QueueTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint256 value,
        string signature,
        bytes data,
        uint256 eta
    );
    event CancelTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint256 value,
        string signature,
        bytes data,
        uint256 eta
    );
    event ExecuteTransaction(
        bytes32 indexed txHash,
        address indexed target,
        uint256 value,
        string signature,
        bytes data,
        uint256 eta
    );

    /// @notice Grace period after eta during which the tx can still be executed.
    uint256 public constant GRACE_PERIOD = 14 days;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Timelock: caller is not admin");
        _;
    }

    constructor(address _admin, uint256 _delay) {
        require(_admin != address(0), "Timelock: zero admin");
        require(_delay >= 1 hours, "Timelock: delay too short");
        require(_delay <= 30 days, "Timelock: delay too long");
        admin = _admin;
        delay = _delay;
    }

    // -------------------------------------------------------------------------
    // Admin handoff (two-step)
    // -------------------------------------------------------------------------

    function setPendingAdmin(address _pendingAdmin) external onlyAdmin {
        pendingAdmin = _pendingAdmin;
        emit NewPendingAdmin(_pendingAdmin);
    }

    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "Timelock: caller is not pending admin");
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit NewAdmin(admin);
    }

    // -------------------------------------------------------------------------
    // Queue / Cancel / Execute
    // -------------------------------------------------------------------------

    function queueTransaction(
        address target,
        uint256 value,
        string calldata signature,
        bytes calldata data,
        uint256 eta
    ) external onlyAdmin returns (bytes32) {
        require(
            eta >= block.timestamp + delay,
            "Timelock: eta must satisfy delay"
        );
        bytes32 txHash = _txHash(target, value, signature, data, eta);
        queuedTransactions[txHash] = true;
        emit QueueTransaction(txHash, target, value, signature, data, eta);
        return txHash;
    }

    function cancelTransaction(
        address target,
        uint256 value,
        string calldata signature,
        bytes calldata data,
        uint256 eta
    ) external onlyAdmin {
        bytes32 txHash = _txHash(target, value, signature, data, eta);
        queuedTransactions[txHash] = false;
        emit CancelTransaction(txHash, target, value, signature, data, eta);
    }

    function executeTransaction(
        address target,
        uint256 value,
        string calldata signature,
        bytes calldata data,
        uint256 eta
    ) external onlyAdmin returns (bytes memory) {
        bytes32 txHash = _txHash(target, value, signature, data, eta);
        require(queuedTransactions[txHash], "Timelock: tx not queued");
        require(block.timestamp >= eta, "Timelock: tx not ready");
        require(
            block.timestamp <= eta + GRACE_PERIOD,
            "Timelock: tx stale"
        );

        queuedTransactions[txHash] = false;

        bytes memory callData;
        if (bytes(signature).length == 0) {
            callData = data;
        } else {
            callData = abi.encodePacked(bytes4(keccak256(bytes(signature))), data);
        }

        (bool success, bytes memory returnData) = target.call{value: value}(callData);
        require(success, "Timelock: tx execution reverted");

        emit ExecuteTransaction(txHash, target, value, signature, data, eta);
        return returnData;
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _txHash(
        address target,
        uint256 value,
        string memory signature,
        bytes memory data,
        uint256 eta
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(target, value, signature, data, eta));
    }

    receive() external payable {}
}
