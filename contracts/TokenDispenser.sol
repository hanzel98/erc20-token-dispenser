// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenDispenser is Ownable {
    error InvalidToken();
    error InvalidReceiver();
    error InvalidMontlyMax();

    IERC20 private immutable token;
    uint256 public immutable monthlyMin;
    uint256 public immutable monthlyMax;
    uint256 public immutable start;
    address public receiver;

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

    function claim(uint256 _amount) external {
        // TODO: Steps
        // 1- Verify that the claimable amount is equal or greater than the input amount
        // 2- Discount any previously claimed amounts from the claimable amount
        // 3- Add the new claimed to the previous claimed amount of the month
        // 4- Transfer the final amount of tokens to the user
    }

    function getContractBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function getClaimableAmount() public view returns (uint256) {
        uint256 amount = _getClaimableAmount();
        assert(monthlyMax >= amount);
        if (amount > monthlyMin) return amount;
        return token.balanceOf(address(this));
    }

    function _getClaimableAmount() private view returns (uint256) {
        uint256 year = 365 days;
        uint256 currentYear = (block.timestamp - start) / year;
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
