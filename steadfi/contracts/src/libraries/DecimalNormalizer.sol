// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {RayMath} from "./RayMath.sol";

/// @title DecimalNormalizer
/// @notice Converts token amounts between their native decimals and Ray (1e27).
///
///         Arc-specific invariant enforced here:
///         - USDC and EURC: 6 decimals (ERC-20 interface only).
///         - cirBTC: 8 decimals.
///         - WETH: 18 decimals.
///         - Native USDC (18 dec) is NEVER passed through here; all protocol
///           accounting uses the ERC-20 6-decimal interface exclusively.
///
///         Rounding direction is caller-supplied:
///         - roundUp = true  → debt paths (borrower owes the dust)
///         - roundUp = false → supply paths (protocol keeps the dust)
library DecimalNormalizer {
    uint256 internal constant RAY = RayMath.RAY; // 1e27

    /// @notice Scale a token amount to Ray precision.
    /// @param amount       Raw token amount in native decimals.
    /// @param tokenDecimals Decimals of the token (e.g. 6 for USDC, 8 for cirBTC, 18 for WETH).
    /// @param roundUp      Round up when true (debt paths).
    function toRay(uint256 amount, uint8 tokenDecimals, bool roundUp)
        internal
        pure
        returns (uint256)
    {
        require(tokenDecimals <= 27, "DecimalNormalizer: decimals > 27");
        uint256 scale = 10 ** (27 - tokenDecimals);
        if (roundUp) {
            // amount * scale already exact — no rounding needed for upscaling.
            return amount * scale;
        }
        return amount * scale;
    }

    /// @notice Scale a Ray amount back to token native decimals.
    /// @param ray          Amount in Ray precision.
    /// @param tokenDecimals Decimals of the token.
    /// @param roundUp      Round up when true (debt paths).
    function fromRay(uint256 ray, uint8 tokenDecimals, bool roundUp)
        internal
        pure
        returns (uint256)
    {
        require(tokenDecimals <= 27, "DecimalNormalizer: decimals > 27");
        uint256 scale = 10 ** (27 - tokenDecimals);
        if (roundUp) {
            return (ray + scale - 1) / scale;
        }
        return ray / scale;
    }

    /// @notice Convert a token amount from one decimal precision to another,
    ///         without going through Ray. Used for oracle price normalization.
    function convertDecimals(
        uint256 amount,
        uint8 fromDecimals,
        uint8 toDecimals,
        bool roundUp
    ) internal pure returns (uint256) {
        if (fromDecimals == toDecimals) return amount;
        if (fromDecimals < toDecimals) {
            return amount * 10 ** (toDecimals - fromDecimals);
        }
        uint256 divisor = 10 ** (fromDecimals - toDecimals);
        if (roundUp) {
            return (amount + divisor - 1) / divisor;
        }
        return amount / divisor;
    }
}
