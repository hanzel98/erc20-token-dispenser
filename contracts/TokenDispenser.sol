// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenDispenser is Ownable {
    error InvalidToken();
    error InvalidReceiver();
    error InvalidMontlyMax();
    error DistributionNotAllowedYet();
    error MonthlyClaimTooHigh();
    error NoTokensLeftToDistribute();
    error PaymentFailed();

    uint256 public constant ONE_YEAR = 365 days;
    IERC20 public immutable token;
    uint256 public immutable monthlyMin;
    uint256 public immutable monthlyMax;
    uint256 public immutable start;
    address public receiver;
    uint256 public claimedThisMonth;
    uint256 public lastClaimedPeriodStartTime;

    event Claimed(uint256 amount);
    event ReceiverChanged(address oldReceiver, address newReceiver);

    constructor(IERC20 _token, uint256 _monthlyMin, uint256 _monthlyMax, address _receiver) {
        if (address(_token) == address(0)) revert InvalidToken();
        if (_monthlyMax == 0) revert InvalidMontlyMax();
        if (_receiver == address(0)) revert InvalidReceiver();

        token = _token;
        monthlyMin = _monthlyMin;
        monthlyMax = _monthlyMax;
        receiver = _receiver;
        start = block.timestamp;
        lastClaimedPeriodStartTime = block.timestamp;
    }

    function claim(uint256 _amount) external {
        // Steps
        // 1- Verify that the claimable amount is equal or greater than the input amount
        // 2- Discount any previously claimed amounts from the claimable amount
        // 3- Add the new claimed to the previous claimed amount of the month
        // 4- Transfer the final amount of tokens to the user
        // TODO: Validate if it should count the time from the start not from the previous

        uint256 elapsedTime = block.timestamp - start;
        uint256 elapsedMonths = elapsedTime / (ONE_YEAR / 12);
        if (elapsedMonths == 0) return;
        uint256 newPeriodStartTime = elapsedMonths * (ONE_YEAR / 12);

        (uint256 claimable, bool isLeftOver) = calculateMaxTokensThisMonth();
        if (claimable == 0) revert NoTokensLeftToDistribute();

        bool isNewMonth = newPeriodStartTime > lastClaimedPeriodStartTime;
        if (isNewMonth) {
            lastClaimedPeriodStartTime = newPeriodStartTime;
            if (isLeftOver) _amount = claimable;
            claimedThisMonth = _amount;
        } else {
            if (claimable < (_amount + claimedThisMonth)) revert MonthlyClaimTooHigh();
        }

        emit Claimed(_amount);
        if (!token.transfer(msg.sender, _amount)) revert PaymentFailed();
    }

    function getContractBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function calculateMaxTokensThisMonth() public view returns (uint256 amount, bool isLeftOver) {
        amount = _getClaimableAmount();
        assert(monthlyMax >= amount);
        if (amount <= monthlyMin) {
            amount = token.balanceOf(address(this));
            isLeftOver = true;
        }
    }

    function _getClaimableAmount() private view returns (uint256) {
        uint256 currentYear = (block.timestamp - start) / ONE_YEAR;
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
