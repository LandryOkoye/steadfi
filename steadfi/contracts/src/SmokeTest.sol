// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title SmokeTest
/// @notice Trivial contract deployed to Arc Testnet to verify the toolchain works end-to-end.
/// @dev Phase 0 smoke test only. Has no protocol logic.
contract SmokeTest {
    // -------------------------------------------------------------------------
    // Arc-verified constants (sourced from docs.arc.io 2026-10-22)
    // -------------------------------------------------------------------------

    /// @notice ERC-20 USDC address on Arc (both testnet and mainnet).
    address public constant USDC = 0x3600000000000000000000000000000000000000;

    /// @notice EURC address on Arc Testnet.
    address public constant EURC_TESTNET = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;

    /// @notice cirBTC address on Arc Testnet.
    address public constant CIR_BTC_TESTNET = 0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF;

    /// @notice Arc Multicall3From (preserves msg.sender, both networks).
    address public constant MULTICALL3_FROM = 0x522fAf9A91c41c443c66765030741e4AaCe147D0;

    /// @notice Arc Memo contract (both networks).
    address public constant MEMO = 0x5294E9927c3306DcBaDb03fe70b92e01cCede505;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    string public name = "SteadFi Phase 0 SmokeTest";
    uint256 public deployedAt;
    address public deployer;

    event Deployed(address indexed deployer, uint256 timestamp, string message);

    constructor() {
        deployedAt = block.timestamp;
        deployer = msg.sender;
        emit Deployed(msg.sender, block.timestamp, "SteadFi Phase 0 smoke test deployed successfully");
    }

    /// @notice Returns the Arc testnet chain ID this contract expects.
    function expectedChainId() external pure returns (uint256) {
        return 5042002;
    }

    /// @notice Confirms the toolchain is connected to Arc Testnet.
    function ping() external view returns (string memory, uint256 chainId, uint256 timestamp) {
        assembly {
            chainId := chainid()
        }
        return ("SteadFi smoke test OK", chainId, block.timestamp);
    }
}
