// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title SteadFiAccessControl
/// @notice Lightweight role-based access control for SteadFi.
///         Four roles:
///         - OWNER: can add/remove markets, transfer roles, set the risk admin.
///         - RISK_ADMIN: can update risk parameters (LTV, caps, rate model, oracle).
///           On mainnet all RISK_ADMIN calls must come through the Timelock.
///         - PAUSE_GUARDIAN: can pause/unpause any market instantly (hot wallet).
///         - LIQUIDATION_EXECUTOR: can call liquidate() on the isolated USYC pool
///           as the protocol fallback.
///
///         Deliberately NOT using OZ AccessControl to keep the footprint small and
///         auditable. All role changes emit events.
contract SteadFiAccessControl {
    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant OWNER_ROLE           = keccak256("OWNER");
    bytes32 public constant RISK_ADMIN_ROLE      = keccak256("RISK_ADMIN");
    bytes32 public constant PAUSE_GUARDIAN_ROLE  = keccak256("PAUSE_GUARDIAN");
    bytes32 public constant LIQ_EXECUTOR_ROLE    = keccak256("LIQUIDATION_EXECUTOR");

    mapping(bytes32 => mapping(address => bool)) private _roles;

    event RoleGranted(bytes32 indexed role, address indexed account, address indexed by);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed by);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address owner) {
        require(owner != address(0), "AC: zero owner");
        _grantRole(OWNER_ROLE, owner);
        _grantRole(RISK_ADMIN_ROLE, owner);
        _grantRole(PAUSE_GUARDIAN_ROLE, owner);
    }

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwner() {
        _checkRole(OWNER_ROLE, msg.sender);
        _;
    }

    modifier onlyRiskAdmin() {
        _checkRole(RISK_ADMIN_ROLE, msg.sender);
        _;
    }

    modifier onlyPauseGuardian() {
        _checkRole(PAUSE_GUARDIAN_ROLE, msg.sender);
        _;
    }

    modifier onlyLiquidationExecutor() {
        _checkRole(LIQ_EXECUTOR_ROLE, msg.sender);
        _;
    }

    // -------------------------------------------------------------------------
    // Role management (OWNER only)
    // -------------------------------------------------------------------------

    function grantRole(bytes32 role, address account) external onlyOwner {
        _grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) external onlyOwner {
        require(
            !(role == OWNER_ROLE && account == msg.sender),
            "AC: cannot revoke own owner role"
        );
        _revokeRole(role, account);
    }

    // -------------------------------------------------------------------------
    // View
    // -------------------------------------------------------------------------

    function hasRole(bytes32 role, address account) public view returns (bool) {
        return _roles[role][account];
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _grantRole(bytes32 role, address account) internal {
        if (!_roles[role][account]) {
            _roles[role][account] = true;
            emit RoleGranted(role, account, msg.sender);
        }
    }

    function _revokeRole(bytes32 role, address account) internal {
        if (_roles[role][account]) {
            _roles[role][account] = false;
            emit RoleRevoked(role, account, msg.sender);
        }
    }

    function _checkRole(bytes32 role, address account) internal view {
        require(_roles[role][account], "AC: caller missing role");
    }
}
