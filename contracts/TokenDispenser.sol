// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenDispenser is Ownable {
    IERC20 private immutable token;
    uint256 public monthlyMin;
    uint256 public monthlyMax;
    uint256 public start;
    address public receiver;

    error InvalidToken();
    error InvalidReceiver();
    error InvalidMontlyMax();
    event ReceiverChanged(address oldReceiver, address newReceiver);

    constructor(
        IERC20 _token,
        uint256 _monthlyMin,
        uint256 _monthlyMax,
        uint256 _start,
        address _receiver
    ) {
        if (address(_token) == address(0)) revert InvalidToken();
        if (receiver == address(0)) revert InvalidReceiver();
        if (receiver == address(0)) revert InvalidReceiver();
        if (monthlyMax == 0) revert InvalidMontlyMax();

        token = _token;
        monthlyMin = _monthlyMin;
        monthlyMax = _monthlyMax;
        start = _start;
        receiver = _receiver;
    }

    function getClaimableAmount() public view returns (uint256) {
        uint256 amount = _getClaimableAmount();
        if (amount > monthlyMin) return amount;
        return token.balanceOf(address(this));
    }

    function _getClaimableAmount() private view returns (uint256) {
        uint256 year = 365 days;
        uint256 currentYear = (block.timestamp - start) / year;
        // TODO: Delete if not needed (Just in case)
        // if (currentYear == 0) return 0;
        // if (currentYear == 1) return (monthlyMax * 10) / 100;
        if (currentYear <= 1) return (monthlyMax * 10) / 100;
        if (currentYear < 5) {
            uint256 percentage = (currentYear == 2 ? 25 : (currentYear == 3 ? 50 : 100));
            return (monthlyMax * percentage) / 100;
        }
        bool modulo4IsZero = ((100 * currentYear) / 4) % 100 == 0;
        uint256 exponential = modulo4IsZero ? (currentYear / 4 - 1) : (currentYear / 4);
        return monthlyMax / 2 ** exponential;
    }

    function changeReceiver(address _receiver) external onlyOwner {
        if (_receiver == address(0)) revert InvalidReceiver();
        address oldReceiver = receiver;
        receiver = _receiver;
        emit ReceiverChanged(oldReceiver, _receiver);
    }
}
