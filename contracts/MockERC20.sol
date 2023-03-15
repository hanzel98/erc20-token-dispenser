// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20("Mocked Token", "MTK") {
    constructor(address receiver) {
        _mint(receiver, 700_000 ether);
    }
}
