// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IMemo
/// @notice Interface for Arc's predeployed Memo contract.
/// @dev Deployed at 0x5294E9927c3306DcBaDb03fe70b92e01cCede505 on both Arc networks.
///      Calling memo() attaches metadata to the current transaction and emits a Memo event.
interface IMemo {
    /// @notice Attach memo metadata to a contract call.
    /// @param target The contract being called in the same transaction.
    /// @param data   Arbitrary bytes (e.g., invoice reference, loan ID).
    function memo(address target, bytes calldata data) external;

    event Memo(address indexed sender, address indexed target, uint256 indexed index, bytes data);
}
