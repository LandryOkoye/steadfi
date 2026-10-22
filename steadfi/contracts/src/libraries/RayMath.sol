// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title RayMath
/// @notice Fixed-point arithmetic at 27-decimal Ray precision (1e27).
///         All SteadFi internal accounting uses Ray. Token amounts are scaled to
///         Ray on entry and unscaled on exit. Rounding direction:
///         - mulRayDown / divRayDown: truncate (rounds toward zero) — used for supply shares
///           (protocol keeps the dust).
///         - mulRayUp / divRayUp: round up — used for debt shares (borrower owes the dust).
library RayMath {
    uint256 internal constant RAY = 1e27;
    uint256 internal constant HALF_RAY = 0.5e27;

    /// @notice Multiply two Ray values, rounding down.
    function mulRayDown(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * b) / RAY;
    }

    /// @notice Multiply two Ray values, rounding up.
    function mulRayUp(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 prod = a * b;
        // Add RAY - 1 before dividing to round up.
        return (prod + RAY - 1) / RAY;
    }

    /// @notice Divide two Ray values, rounding down.
    function divRayDown(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * RAY) / b;
    }

    /// @notice Divide two Ray values, rounding up.
    function divRayUp(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * RAY + b - 1) / b;
    }

    /// @notice Raise a Ray value to a power using repeated squaring.
    ///         Used for per-second compound interest: (1 + ratePerSecond)^seconds.
    ///         Returns RAY (1) for exp == 0.
    function rayPow(uint256 base, uint256 exp) internal pure returns (uint256) {
        if (exp == 0) return RAY;
        if (base == 0) return 0;

        uint256 result = RAY;
        while (exp > 0) {
            if (exp & 1 == 1) {
                result = mulRayDown(result, base);
            }
            base = mulRayDown(base, base);
            exp >>= 1;
        }
        return result;
    }
}
