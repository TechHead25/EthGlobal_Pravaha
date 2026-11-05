// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @notice Standard 6-decimal ERC-20 token simulating USDC for OpenAid Protocol on Arc / local EVM testbeds.
 */
contract MockUSDC is ERC20 {
    uint8 private constant _DECIMALS = 6;

    constructor() ERC20("USD Coin", "USDC") {
        // Mint initial 1,000,000 USDC to deployer
        _mint(msg.sender, 1_000_000 * 10 ** _DECIMALS);
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /**
     * @notice Mint tokens for testing/demo faucet.
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
