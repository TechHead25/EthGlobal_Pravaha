// Sources flattened with hardhat v2.29.1 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts/utils/introspection/IERC165.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/IERC165.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}


// File @openzeppelin/contracts/interfaces/IERC165.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC165.sol)

pragma solidity >=0.4.16;


// File @openzeppelin/contracts/token/ERC20/IERC20.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}


// File @openzeppelin/contracts/interfaces/IERC20.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC20.sol)

pragma solidity >=0.4.16;


// File @openzeppelin/contracts/interfaces/IERC1363.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC1363.sol)

pragma solidity >=0.6.2;


/**
 * @title IERC1363
 * @dev Interface of the ERC-1363 standard as defined in the https://eips.ethereum.org/EIPS/eip-1363[ERC-1363].
 *
 * Defines an extension interface for ERC-20 tokens that supports executing code on a recipient contract
 * after `transfer` or `transferFrom`, or code on a spender contract after `approve`, in a single transaction.
 */
interface IERC1363 is IERC20, IERC165 {
    /*
     * Note: the ERC-165 identifier for this interface is 0xb0202a11.
     * 0xb0202a11 ===
     *   bytes4(keccak256('transferAndCall(address,uint256)')) ^
     *   bytes4(keccak256('transferAndCall(address,uint256,bytes)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256,bytes)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256,bytes)'))
     */

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @param data Additional data with no specified format, sent in call to `spender`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}


// File @openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.5.0) (token/ERC20/utils/SafeERC20.sol)

pragma solidity ^0.8.20;


/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    /**
     * @dev An operation with an ERC-20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        if (!_safeTransfer(token, to, value, true)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        if (!_safeTransferFrom(token, from, to, value, true)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Variant of {safeTransfer} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransfer(IERC20 token, address to, uint256 value) internal returns (bool) {
        return _safeTransfer(token, to, value, false);
    }

    /**
     * @dev Variant of {safeTransferFrom} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransferFrom(IERC20 token, address from, address to, uint256 value) internal returns (bool) {
        return _safeTransferFrom(token, from, to, value, false);
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     *
     * NOTE: If the token implements ERC-7674, this function will not modify any temporary allowance. This function
     * only sets the "standard" allowance. Any temporary allowance will remain active, in addition to the value being
     * set here.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        if (!_safeApprove(token, spender, value, false)) {
            if (!_safeApprove(token, spender, 0, true)) revert SafeERC20FailedOperation(address(token));
            if (!_safeApprove(token, spender, value, true)) revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferAndCall, with a fallback to the simple {ERC20} transfer if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that relies on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            safeTransfer(token, to, value);
        } else if (!token.transferAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferFromAndCall, with a fallback to the simple {ERC20} transferFrom if the target
     * has no code. This can be used to implement an {ERC721}-like safe transfer that relies on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferFromAndCallRelaxed(
        IERC1363 token,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            safeTransferFrom(token, from, to, value);
        } else if (!token.transferFromAndCall(from, to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} approveAndCall, with a fallback to the simple {ERC20} approve if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * NOTE: When the recipient address (`to`) has no code (i.e. is an EOA), this function behaves as {forceApprove}.
     * Oppositely, when the recipient address (`to`) has code, this function only attempts to call {ERC1363-approveAndCall}
     * once without retrying, and relies on the returned value to be true.
     *
     * Reverts if the returned value is other than `true`.
     */
    function approveAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            forceApprove(token, to, value);
        } else if (!token.approveAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity `token.transfer(to, value)` call, relaxing the requirement on the return value: the
     * return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param to The recipient of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeTransfer(IERC20 token, address to, uint256 value, bool bubble) private returns (bool success) {
        bytes4 selector = IERC20.transfer.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(to, shr(96, not(0))))
            mstore(0x24, value)
            success := call(gas(), token, 0, 0x00, 0x44, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
        }
    }

    /**
     * @dev Imitates a Solidity `token.transferFrom(from, to, value)` call, relaxing the requirement on the return
     * value: the return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param from The sender of the tokens
     * @param to The recipient of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeTransferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 value,
        bool bubble
    ) private returns (bool success) {
        bytes4 selector = IERC20.transferFrom.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(from, shr(96, not(0))))
            mstore(0x24, and(to, shr(96, not(0))))
            mstore(0x44, value)
            success := call(gas(), token, 0, 0x00, 0x64, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
            mstore(0x60, 0)
        }
    }

    /**
     * @dev Imitates a Solidity `token.approve(spender, value)` call, relaxing the requirement on the return value:
     * the return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param spender The spender of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeApprove(IERC20 token, address spender, uint256 value, bool bubble) private returns (bool success) {
        bytes4 selector = IERC20.approve.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(spender, shr(96, not(0))))
            mstore(0x24, value)
            success := call(gas(), token, 0, 0x00, 0x44, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
        }
    }
}


// File @openzeppelin/contracts/utils/StorageSlot.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/StorageSlot.sol)
// This file was procedurally generated from scripts/generate/templates/StorageSlot.js.

pragma solidity ^0.8.20;

/**
 * @dev Library for reading and writing primitive types to specific storage slots.
 *
 * Storage slots are often used to avoid storage conflict when dealing with upgradeable contracts.
 * This library helps with reading and writing to such slots without the need for inline assembly.
 *
 * The functions in this library return Slot structs that contain a `value` member that can be used to read or write.
 *
 * Example usage to set ERC-1967 implementation slot:
 * ```solidity
 * contract ERC1967 {
 *     // Define the slot. Alternatively, use the SlotDerivation library to derive the slot.
 *     bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
 *
 *     function _getImplementation() internal view returns (address) {
 *         return StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value;
 *     }
 *
 *     function _setImplementation(address newImplementation) internal {
 *         require(newImplementation.code.length > 0);
 *         StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value = newImplementation;
 *     }
 * }
 * ```
 *
 * TIP: Consider using this library along with {SlotDerivation}.
 */
library StorageSlot {
    struct AddressSlot {
        address value;
    }

    struct BooleanSlot {
        bool value;
    }

    struct Bytes32Slot {
        bytes32 value;
    }

    struct Uint256Slot {
        uint256 value;
    }

    struct Int256Slot {
        int256 value;
    }

    struct StringSlot {
        string value;
    }

    struct BytesSlot {
        bytes value;
    }

    /**
     * @dev Returns an `AddressSlot` with member `value` located at `slot`.
     */
    function getAddressSlot(bytes32 slot) internal pure returns (AddressSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `BooleanSlot` with member `value` located at `slot`.
     */
    function getBooleanSlot(bytes32 slot) internal pure returns (BooleanSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Bytes32Slot` with member `value` located at `slot`.
     */
    function getBytes32Slot(bytes32 slot) internal pure returns (Bytes32Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Uint256Slot` with member `value` located at `slot`.
     */
    function getUint256Slot(bytes32 slot) internal pure returns (Uint256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Int256Slot` with member `value` located at `slot`.
     */
    function getInt256Slot(bytes32 slot) internal pure returns (Int256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `StringSlot` with member `value` located at `slot`.
     */
    function getStringSlot(bytes32 slot) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `StringSlot` representation of the string storage pointer `store`.
     */
    function getStringSlot(string storage store) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }

    /**
     * @dev Returns a `BytesSlot` with member `value` located at `slot`.
     */
    function getBytesSlot(bytes32 slot) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `BytesSlot` representation of the bytes storage pointer `store`.
     */
    function getBytesSlot(bytes storage store) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }
}


// File @openzeppelin/contracts/utils/ReentrancyGuard.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.5.0) (utils/ReentrancyGuard.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 *
 * IMPORTANT: Deprecated. This storage-based reentrancy guard will be removed and replaced
 * by the {ReentrancyGuardTransient} variant in v6.0.
 *
 * @custom:stateless
 */
abstract contract ReentrancyGuard {
    using StorageSlot for bytes32;

    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.ReentrancyGuard")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant REENTRANCY_GUARD_STORAGE =
        0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00;

    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    /**
     * @dev A `view` only version of {nonReentrant}. Use to block view functions
     * from being called, preventing reading from inconsistent contract state.
     *
     * CAUTION: This is a "view" modifier and does not change the reentrancy
     * status. Use it only on view functions. For payable or non-payable functions,
     * use the standard {nonReentrant} modifier instead.
     */
    modifier nonReentrantView() {
        _nonReentrantBeforeView();
        _;
    }

    function _nonReentrantBeforeView() private view {
        if (_reentrancyGuardEntered()) {
            revert ReentrancyGuardReentrantCall();
        }
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        _nonReentrantBeforeView();

        // Any calls to nonReentrant after this point will fail
        _reentrancyGuardStorageSlot().getUint256Slot().value = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _reentrancyGuardStorageSlot().getUint256Slot().value == ENTERED;
    }

    function _reentrancyGuardStorageSlot() internal pure virtual returns (bytes32) {
        return REENTRANCY_GUARD_STORAGE;
    }
}


// File contracts/core/OpenAidEscrow.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.24;
/**
 * @title OpenAidEscrow
 * @notice Purpose-bound USDC escrow and conditional settlement engine for OpenAid Protocol.
 *         Implements Arc-compliant advanced stablecoin logic:
 *         - Purpose-bound donor capital allocation
 *         - Sealed commitΓÇôreveal procurement auction
 *         - Delivery evidence commitment anchoring
 *         - Independent 3-of-5 validator quorum with anti-double-voting
 *         - Staged settlement (70% Tranche 1 on quorum, 30% Tranche 2 post-challenge)
 *         - Timelock challenge window and dispute freezing
 *         - Pull-over-push proportional donor refunds
 *         - Zero arbitrary withdrawal/sweep backdoors
 */
contract OpenAidEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- ENUMS & STRUCTS ---

    enum CampaignState {
        FundingActive,        // 0: Donors depositing USDC
        FundingFailed,        // 1: Deadline passed before budget reached
        BiddingCommit,        // 2: Vendors submitting sealed bid hashes
        BiddingReveal,        // 3: Vendors revealing plain bid amounts
        AuctionFailed,        // 4: Zero valid reveals submitted
        AwaitingDelivery,     // 5: Winning vendor fulfilling delivery
        DeliveryFailed,       // 6: Delivery deadline expired without evidence
        VerificationPending,  // 7: Evidence committed; validators voting
        VerificationFailed,   // 8: Rejected by validators or voting timeout
        InChallengePeriod,    // 9: Stage 1 paid; 72h/demo timelock window open
        Disputed,             // 10: Fraud challenge filed; Stage 2 locked
        Completed,            // 11: Final settlement completed (30% disbursed or refunded)
        Refunded              // 12: Terminal refund state
    }

    struct Campaign {
        uint256 id;
        address creator;
        uint256 budgetCeiling;
        uint256 totalDeposited;
        uint64 fundingDeadline;
        uint64 deliveryDeadline;
        string metadataCid;
        CampaignState state;
        address winningVendor;
        uint256 winningBidAmount;
        string evidenceIpfsCid;
        uint64 evidenceSubmittedAt;
        uint8 affirmativeVotes;
        uint8 negativeVotes;
        bool stage1Paid;
        bool stage2Paid;
        uint64 challengeExpiry;
        bool isDisputed;
        string disputeEvidenceCid;
        address challenger;
    }

    struct BidCommitment {
        bytes32 commitHash;
        uint256 bondAmount;
        bool revealed;
        uint256 revealedAmount;
        uint64 revealedAt;
    }

    // --- IMMUTABLE & CONFIGURATION STATE ---

    IERC20 public immutable usdcToken;
    address public immutable owner;

    uint8 public constant QUORUM_THRESHOLD = 3;
    uint8 public constant TOTAL_VALIDATORS = 5;
    uint256 public constant STAGE1_PERCENT = 70;
    uint256 public constant STAGE2_PERCENT = 30;
    uint256 public constant BOND_BASIS_POINTS = 500; // 5% bid bond
    uint256 public constant BASIS_POINTS_DENOMINATOR = 10000;

    uint256 public campaignCount;

    // --- STORAGE MAPPINGS ---

    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => mapping(address => uint256)) public donorDeposits;
    mapping(uint256 => mapping(address => bool)) public hasClaimedRefund;

    // Auction storage: campaignId => vendor => Commitment
    mapping(uint256 => mapping(address => BidCommitment)) public bidCommitments;
    mapping(uint256 => address[]) internal _campaignVendors;
    mapping(uint256 => uint64) public commitDeadlines;
    mapping(uint256 => uint64) public revealDeadlines;

    // Validator registry: address => isAuthorized
    mapping(address => bool) public isValidator;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => bool)) public validatorVote; // true = approve, false = reject

    // Surplus & Refund accounting
    mapping(uint256 => uint256) public unspentSurplus;

    // --- EVENTS ---

    event CampaignCreated(uint256 indexed campaignId, address indexed creator, uint256 budgetCeiling, string metadataCid, uint64 fundingDeadline, uint64 deliveryDeadline);
    event FundsDeposited(uint256 indexed campaignId, address indexed donor, uint256 amount);
    event CampaignFullyFunded(uint256 indexed campaignId, uint256 totalAmount);
    event AuctionOpened(uint256 indexed campaignId, uint64 commitDeadline, uint64 revealDeadline);
    event BidCommitted(uint256 indexed campaignId, address indexed vendor, bytes32 commitHash, uint256 bondAmount);
    event BidRevealed(uint256 indexed campaignId, address indexed vendor, uint256 amount);
    event AuctionFinalized(uint256 indexed campaignId, address indexed winningVendor, uint256 winningAmount);
    event EvidenceSubmitted(uint256 indexed campaignId, address indexed vendor, string ipfsCid, uint64 timestamp);
    event VoteCast(uint256 indexed campaignId, address indexed validator, bool approved);
    event QuorumReached(uint256 indexed campaignId, uint8 affirmativeCount);
    event Stage1Settled(uint256 indexed campaignId, address indexed vendor, uint256 payoutAmount);
    event Stage2Settled(uint256 indexed campaignId, address indexed vendor, uint256 payoutAmount);
    event DisputeRaised(uint256 indexed campaignId, address indexed challenger, string counterEvidenceCid);
    event DisputeResolved(uint256 indexed campaignId, bool upheld);
    event RefundClaimed(uint256 indexed campaignId, address indexed donor, uint256 amount);
    event StateTransition(uint256 indexed campaignId, CampaignState previousState, CampaignState newState);

    // --- CUSTOM ERRORS ---

    error ZeroAddress();
    error ZeroAmount();
    error InvalidState(CampaignState current, CampaignState expected);
    error DeadlinePassed();
    error DeadlineNotPassed();
    error BudgetCeilingExceeded();
    error Unauthorized();
    error AlreadyCommitted();
    error InvalidCommitment();
    error BidExceedsBudget();
    error NoValidBids();
    error NotAnAuthorizedValidator();
    error AlreadyVoted();
    error EvidenceAlreadySubmitted();
    error Stage1AlreadyPaid();
    error ChallengePeriodActive();
    error DisputePending();
    error NoRefundDue();
    error TransferFailed();
    error InsufficientBond();

    // --- MODIFIERS ---

    modifier onlyValidator() {
        if (!isValidator[msg.sender]) revert NotAnAuthorizedValidator();
        _;
    }

    // --- CONSTRUCTOR ---

    constructor(address _usdcToken, address[] memory _initialValidators) {
        if (_usdcToken == address(0)) revert ZeroAddress();
        usdcToken = IERC20(_usdcToken);
        owner = msg.sender;

        for (uint256 i = 0; i < _initialValidators.length; i++) {
            if (_initialValidators[i] != address(0)) {
                isValidator[_initialValidators[i]] = true;
            }
        }
    }

    // --- CAMPAIGN MANAGEMENT ---

    /**
     * @notice Create a purpose-bound humanitarian procurement campaign.
     */
    function createCampaign(
        uint256 budgetCeiling,
        uint64 fundingDurationSeconds,
        uint64 deliveryDurationSeconds,
        string calldata metadataCid
    ) external returns (uint256 campaignId) {
        if (budgetCeiling == 0) revert ZeroAmount();

        campaignId = ++campaignCount;
        uint64 fundingDeadline = uint64(block.timestamp) + fundingDurationSeconds;
        uint64 deliveryDeadline = fundingDeadline + deliveryDurationSeconds;

        campaigns[campaignId] = Campaign({
            id: campaignId,
            creator: msg.sender,
            budgetCeiling: budgetCeiling,
            totalDeposited: 0,
            fundingDeadline: fundingDeadline,
            deliveryDeadline: deliveryDeadline,
            metadataCid: metadataCid,
            state: CampaignState.FundingActive,
            winningVendor: address(0),
            winningBidAmount: 0,
            evidenceIpfsCid: "",
            evidenceSubmittedAt: 0,
            affirmativeVotes: 0,
            negativeVotes: 0,
            stage1Paid: false,
            stage2Paid: false,
            challengeExpiry: 0,
            isDisputed: false,
            disputeEvidenceCid: "",
            challenger: address(0)
        });

        emit CampaignCreated(campaignId, msg.sender, budgetCeiling, metadataCid, fundingDeadline, deliveryDeadline);
    }

    // --- DONOR FUNDING ---

    /**
     * @notice Deposit USDC directly into the purpose-bound escrow.
     */
    function depositFunds(uint256 campaignId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.FundingActive) revert InvalidState(c.state, CampaignState.FundingActive);
        if (block.timestamp > c.fundingDeadline) revert DeadlinePassed();
        if (c.totalDeposited + amount > c.budgetCeiling) revert BudgetCeilingExceeded();

        // Checks-Effects-Interactions
        c.totalDeposited += amount;
        donorDeposits[campaignId][msg.sender] += amount;

        usdcToken.safeTransferFrom(msg.sender, address(this), amount);

        emit FundsDeposited(campaignId, msg.sender, amount);

        if (c.totalDeposited == c.budgetCeiling) {
            c.state = CampaignState.BiddingCommit;
            emit CampaignFullyFunded(campaignId, c.totalDeposited);
            emit StateTransition(campaignId, CampaignState.FundingActive, CampaignState.BiddingCommit);
        }
    }

    /**
     * @notice Handle funding timeout if target budget was not reached.
     */
    function triggerFundingTimeout(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.FundingActive) revert InvalidState(c.state, CampaignState.FundingActive);
        if (block.timestamp <= c.fundingDeadline) revert DeadlineNotPassed();

        c.state = CampaignState.FundingFailed;
        emit StateTransition(campaignId, CampaignState.FundingActive, CampaignState.FundingFailed);
    }

    // --- PROCUREMENT AUCTION (COMMITΓÇôREVEAL) ---

    /**
     * @notice Configure commit and reveal window deadlines once campaign is funded.
     */
    function openAuction(uint256 campaignId, uint64 commitDuration, uint64 revealDuration) external {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.BiddingCommit) revert InvalidState(c.state, CampaignState.BiddingCommit);
        if (commitDeadlines[campaignId] != 0) revert InvalidState(c.state, CampaignState.BiddingCommit);

        commitDeadlines[campaignId] = uint64(block.timestamp) + commitDuration;
        revealDeadlines[campaignId] = uint64(block.timestamp) + commitDuration + revealDuration;

        emit AuctionOpened(campaignId, commitDeadlines[campaignId], revealDeadlines[campaignId]);
    }

    /**
     * @notice Commit a sealed bid hash with mandatory bid bond collateral.
     *         commitHash = keccak256(abi.encodePacked(bidAmount, salt, msg.sender))
     */
    function commitBid(uint256 campaignId, bytes32 commitHash) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.BiddingCommit) revert InvalidState(c.state, CampaignState.BiddingCommit);
        if (block.timestamp > commitDeadlines[campaignId]) revert DeadlinePassed();
        if (bidCommitments[campaignId][msg.sender].commitHash != bytes32(0)) revert AlreadyCommitted();

        uint256 requiredBond = (c.budgetCeiling * BOND_BASIS_POINTS) / BASIS_POINTS_DENOMINATOR;

        bidCommitments[campaignId][msg.sender] = BidCommitment({
            commitHash: commitHash,
            bondAmount: requiredBond,
            revealed: false,
            revealedAmount: 0,
            revealedAt: 0
        });
        _campaignVendors[campaignId].push(msg.sender);

        usdcToken.safeTransferFrom(msg.sender, address(this), requiredBond);

        emit BidCommitted(campaignId, msg.sender, commitHash, requiredBond);
    }

    /**
     * @notice Transition from commit window to reveal window.
     */
    function advanceToReveal(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.BiddingCommit) revert InvalidState(c.state, CampaignState.BiddingCommit);
        if (block.timestamp <= commitDeadlines[campaignId]) revert DeadlineNotPassed();

        if (_campaignVendors[campaignId].length == 0) {
            c.state = CampaignState.AuctionFailed;
            emit StateTransition(campaignId, CampaignState.BiddingCommit, CampaignState.AuctionFailed);
        } else {
            c.state = CampaignState.BiddingReveal;
            emit StateTransition(campaignId, CampaignState.BiddingCommit, CampaignState.BiddingReveal);
        }
    }

    /**
     * @notice Reveal a previously committed sealed bid.
     */
    function revealBid(uint256 campaignId, uint256 bidAmount, bytes32 salt) external {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.BiddingReveal) revert InvalidState(c.state, CampaignState.BiddingReveal);
        if (block.timestamp > revealDeadlines[campaignId]) revert DeadlinePassed();

        BidCommitment storage b = bidCommitments[campaignId][msg.sender];
        if (b.commitHash == bytes32(0)) revert Unauthorized();
        if (b.revealed) revert AlreadyCommitted();

        bytes32 expectedHash = keccak256(abi.encodePacked(bidAmount, salt, msg.sender));
        if (expectedHash != b.commitHash) revert InvalidCommitment();
        if (bidAmount > c.budgetCeiling) revert BidExceedsBudget();

        b.revealed = true;
        b.revealedAmount = bidAmount;
        b.revealedAt = uint64(block.timestamp);

        emit BidRevealed(campaignId, msg.sender, bidAmount);
    }

    /**
     * @notice Finalize the auction: pick lowest valid revealed bidder.
     */
    function finalizeAuction(uint256 campaignId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.BiddingReveal) revert InvalidState(c.state, CampaignState.BiddingReveal);
        if (block.timestamp <= revealDeadlines[campaignId]) revert DeadlineNotPassed();

        address[] memory vendors = _campaignVendors[campaignId];
        address winningVendor = address(0);
        uint256 lowestBid = type(uint256).max;
        uint64 earliestReveal = type(uint64).max;

        for (uint256 i = 0; i < vendors.length; i++) {
            address v = vendors[i];
            BidCommitment storage b = bidCommitments[campaignId][v];
            if (b.revealed && b.revealedAmount > 0) {
                if (b.revealedAmount < lowestBid) {
                    lowestBid = b.revealedAmount;
                    winningVendor = v;
                    earliestReveal = b.revealedAt;
                } else if (b.revealedAmount == lowestBid && b.revealedAt < earliestReveal) {
                    // Tie-breaker: earliest valid reveal
                    winningVendor = v;
                    earliestReveal = b.revealedAt;
                }
            } else {
                // Non-revealed vendor bond slashed to campaign surplus pool
                b.bondAmount = 0;
            }
        }

        if (winningVendor == address(0)) {
            c.state = CampaignState.AuctionFailed;
            emit StateTransition(campaignId, CampaignState.BiddingReveal, CampaignState.AuctionFailed);
            return;
        }

        c.winningVendor = winningVendor;
        c.winningBidAmount = lowestBid;
        c.state = CampaignState.AwaitingDelivery;

        // Refund bid bonds for non-winning revealed vendors
        for (uint256 i = 0; i < vendors.length; i++) {
            address v = vendors[i];
            if (v != winningVendor && bidCommitments[campaignId][v].revealed) {
                uint256 bond = bidCommitments[campaignId][v].bondAmount;
                if (bond > 0) {
                    bidCommitments[campaignId][v].bondAmount = 0;
                    usdcToken.safeTransfer(v, bond);
                }
            }
        }

        // Calculate surplus (budgetCeiling - winningBid)
        if (c.budgetCeiling > lowestBid) {
            unspentSurplus[campaignId] = c.budgetCeiling - lowestBid;
        }

        emit AuctionFinalized(campaignId, winningVendor, lowestBid);
        emit StateTransition(campaignId, CampaignState.BiddingReveal, CampaignState.AwaitingDelivery);
    }

    // --- DELIVERY EVIDENCE SUBMISSION ---

    /**
     * @notice Winning vendor submits the IPFS CID of delivery evidence manifest.
     */
    function submitDeliveryEvidence(uint256 campaignId, string calldata ipfsCid) external {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.AwaitingDelivery) revert InvalidState(c.state, CampaignState.AwaitingDelivery);
        if (msg.sender != c.winningVendor) revert Unauthorized();
        if (block.timestamp > c.deliveryDeadline) revert DeadlinePassed();
        if (bytes(ipfsCid).length == 0) revert ZeroAmount();

        c.evidenceIpfsCid = ipfsCid;
        c.evidenceSubmittedAt = uint64(block.timestamp);
        c.state = CampaignState.VerificationPending;

        emit EvidenceSubmitted(campaignId, msg.sender, ipfsCid, uint64(block.timestamp));
        emit StateTransition(campaignId, CampaignState.AwaitingDelivery, CampaignState.VerificationPending);
    }

    /**
     * @notice Trigger failure if delivery deadline expires without evidence submission.
     */
    function triggerDeliveryTimeout(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.AwaitingDelivery) revert InvalidState(c.state, CampaignState.AwaitingDelivery);
        if (block.timestamp <= c.deliveryDeadline) revert DeadlineNotPassed();

        c.state = CampaignState.DeliveryFailed;
        // Vendor bond is slashed (stays in escrow for donors)
        bidCommitments[campaignId][c.winningVendor].bondAmount = 0;

        emit StateTransition(campaignId, CampaignState.AwaitingDelivery, CampaignState.DeliveryFailed);
    }

    // --- VALIDATOR QUORUM & STAGED SETTLEMENT ---

    /**
     * @notice Registered validator casts one vote (approve or reject) on delivery evidence.
     *         Reaching 3 affirmative votes triggers Stage 1 (70%) payment immediately.
     */
    function castVote(uint256 campaignId, bool approve, uint64 challengeWindowSeconds) external onlyValidator nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.VerificationPending) revert InvalidState(c.state, CampaignState.VerificationPending);
        if (hasVoted[campaignId][msg.sender]) revert AlreadyVoted();

        hasVoted[campaignId][msg.sender] = true;
        validatorVote[campaignId][msg.sender] = approve;

        if (approve) {
            c.affirmativeVotes++;
        } else {
            c.negativeVotes++;
        }

        emit VoteCast(campaignId, msg.sender, approve);

        // Check rejection threshold (3 negative votes)
        if (c.negativeVotes >= QUORUM_THRESHOLD) {
            c.state = CampaignState.VerificationFailed;
            emit StateTransition(campaignId, CampaignState.VerificationPending, CampaignState.VerificationFailed);
            return;
        }

        // Check affirmative quorum threshold (3 affirmative votes)
        if (c.affirmativeVotes >= QUORUM_THRESHOLD && !c.stage1Paid) {
            _executeStage1(campaignId, challengeWindowSeconds);
        }
    }

    function _executeStage1(uint256 campaignId, uint64 challengeWindowSeconds) internal {
        Campaign storage c = campaigns[campaignId];
        c.stage1Paid = true;
        c.state = CampaignState.InChallengePeriod;
        c.challengeExpiry = uint64(block.timestamp) + (challengeWindowSeconds > 0 ? challengeWindowSeconds : 72 hours);

        uint256 stage1Amount = (c.winningBidAmount * STAGE1_PERCENT) / 100;

        emit QuorumReached(campaignId, c.affirmativeVotes);
        emit Stage1Settled(campaignId, c.winningVendor, stage1Amount);
        emit StateTransition(campaignId, CampaignState.VerificationPending, CampaignState.InChallengePeriod);

        usdcToken.safeTransfer(c.winningVendor, stage1Amount);
    }

    // --- CHALLENGE & DISPUTE MECHANISM ---

    /**
     * @notice Raise a fraud/delivery dispute during the challenge window.
     */
    function raiseDispute(uint256 campaignId, string calldata counterEvidenceCid) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.InChallengePeriod) revert InvalidState(c.state, CampaignState.InChallengePeriod);
        if (block.timestamp > c.challengeExpiry) revert DeadlinePassed();

        uint256 disputeBond = (c.winningBidAmount * 10) / 100; // 10% dispute bond
        c.isDisputed = true;
        c.disputeEvidenceCid = counterEvidenceCid;
        c.challenger = msg.sender;
        c.state = CampaignState.Disputed;

        usdcToken.safeTransferFrom(msg.sender, address(this), disputeBond);

        emit DisputeRaised(campaignId, msg.sender, counterEvidenceCid);
        emit StateTransition(campaignId, CampaignState.InChallengePeriod, CampaignState.Disputed);
    }

    /**
     * @notice Resolve an active dispute via validator quorum.
     */
    function resolveDispute(uint256 campaignId, bool upholdDispute) external onlyValidator nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.Disputed) revert InvalidState(c.state, CampaignState.Disputed);

        c.state = CampaignState.Completed;

        uint256 disputeBond = (c.winningBidAmount * 10) / 100;

        if (upholdDispute) {
            // Dispute upheld: Vendor loses 30% and performance bond; Challenger gets bond + reward
            uint256 vendorBond = bidCommitments[campaignId][c.winningVendor].bondAmount;
            bidCommitments[campaignId][c.winningVendor].bondAmount = 0;

            usdcToken.safeTransfer(c.challenger, disputeBond + (vendorBond / 2));

            emit DisputeResolved(campaignId, true);
        } else {
            // Dispute dismissed: Challenger loses bond; Vendor gets Stage 2
            c.stage2Paid = true;
            uint256 stage2Amount = (c.winningBidAmount * STAGE2_PERCENT) / 100;
            uint256 vendorBond = bidCommitments[campaignId][c.winningVendor].bondAmount;
            bidCommitments[campaignId][c.winningVendor].bondAmount = 0;

            usdcToken.safeTransfer(c.winningVendor, stage2Amount + vendorBond + (disputeBond / 2));

            emit DisputeResolved(campaignId, false);
            emit Stage2Settled(campaignId, c.winningVendor, stage2Amount);
        }
    }

    // --- FINAL STAGE 2 SETTLEMENT ---

    /**
     * @notice Finalize Stage 2 (30%) payment after challenge period expires cleanly.
     */
    function finalizeSettlement(uint256 campaignId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.InChallengePeriod) revert InvalidState(c.state, CampaignState.InChallengePeriod);
        if (block.timestamp <= c.challengeExpiry) revert ChallengePeriodActive();
        if (c.isDisputed) revert DisputePending();
        if (c.stage2Paid) revert Stage1AlreadyPaid(); // Stage 2 guard

        c.stage2Paid = true;
        c.state = CampaignState.Completed;

        uint256 stage2Amount = (c.winningBidAmount * STAGE2_PERCENT) / 100;
        uint256 vendorBond = bidCommitments[campaignId][c.winningVendor].bondAmount;
        bidCommitments[campaignId][c.winningVendor].bondAmount = 0;

        emit Stage2Settled(campaignId, c.winningVendor, stage2Amount);
        emit StateTransition(campaignId, CampaignState.InChallengePeriod, CampaignState.Completed);

        usdcToken.safeTransfer(c.winningVendor, stage2Amount + vendorBond);
    }

    // --- DONOR PULL REFUNDS ---

    /**
     * @notice Donors claim proportional refund if campaign fails or has unspent surplus.
     */
    function claimRefund(uint256 campaignId) external nonReentrant returns (uint256 refundAmount) {
        Campaign storage c = campaigns[campaignId];
        uint256 deposit = donorDeposits[campaignId][msg.sender];
        if (deposit == 0) revert NoRefundDue();
        if (hasClaimedRefund[campaignId][msg.sender]) revert NoRefundDue();

        if (
            c.state == CampaignState.FundingFailed ||
            c.state == CampaignState.AuctionFailed ||
            c.state == CampaignState.DeliveryFailed ||
            c.state == CampaignState.VerificationFailed
        ) {
            // 100% full refund
            refundAmount = deposit;
        } else if (c.state == CampaignState.Completed) {
            // Proportional surplus refund
            uint256 surplus = unspentSurplus[campaignId];
            if (c.isDisputed && !c.stage2Paid) {
                // If dispute was upheld, the unpaid 30% is also added to surplus
                surplus += (c.winningBidAmount * STAGE2_PERCENT) / 100;
            }
            if (surplus > 0) {
                refundAmount = (surplus * deposit) / c.totalDeposited;
            } else {
                revert NoRefundDue();
            }
        } else {
            revert InvalidState(c.state, CampaignState.Completed);
        }

        if (refundAmount == 0) revert NoRefundDue();

        hasClaimedRefund[campaignId][msg.sender] = true;

        emit RefundClaimed(campaignId, msg.sender, refundAmount);

        usdcToken.safeTransfer(msg.sender, refundAmount);
    }

    // --- VIEW / QUERY HELPERS ---

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }

    function getCommitment(uint256 campaignId, address vendor) external view returns (BidCommitment memory) {
        return bidCommitments[campaignId][vendor];
    }

    function getVendors(uint256 campaignId) external view returns (address[] memory) {
        return _campaignVendors[campaignId];
    }
}
