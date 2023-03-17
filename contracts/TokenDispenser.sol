// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract TokenDispenser is Ownable {
    error InvalidToken();
    error InvalidReceiver();
    error InvalidMontlyMax();
    error DistributionNotAllowedYet();
    error MonthlyClaimTooHigh();
    error NoTokensLeftToDistribute();
    error PaymentFailed();
    error InvalidClaimCaller();

    uint256 public constant ONE_YEAR = 365 days;
    uint256 public constant ONE_MONTH = ONE_YEAR / 12;
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
        if (msg.sender != receiver) revert InvalidClaimCaller();

        (uint256 maxTokens, bool isNewMonth) = calculateMaxTokensThisMonth();
        if (maxTokens == 0) revert NoTokensLeftToDistribute();
        if (maxTokens < _amount) revert MonthlyClaimTooHigh();

        if (isNewMonth) {
            (, , uint256 newPeriodStartTime) = getTimes();
            lastClaimedPeriodStartTime = newPeriodStartTime;
            claimedThisMonth = _amount;
        }

        emit Claimed(_amount);
        if (!token.transfer(msg.sender, _amount)) revert PaymentFailed();
    }

    function getTimes()
        public
        view
        returns (uint256 currentYear, uint256 claimableMonth, uint256 newPeriodStartTime)
    {
        // TODO: I could change "claimableMonth" to currentMonth
        uint256 elapsedTime = block.timestamp - start;
        // console.log("elapsedTime %s", elapsedTime);
        currentYear = (elapsedTime / ONE_YEAR) + 1;
        console.log("currentYear %s", currentYear);
        claimableMonth = (elapsedTime / ONE_MONTH) + 1;
        console.log("claimableMonth %s", claimableMonth);
        newPeriodStartTime = start + (claimableMonth * ONE_MONTH);
    }

    function getContractBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function calculateMaxTokensThisMonth()
        public
        view
        returns (uint256 maxTokens, bool isNewMonth)
    {
        uint256 amount = _getClaimableAmount();

        assert(monthlyMax >= amount);
        if (amount <= monthlyMin) amount = token.balanceOf(address(this));

        (, , uint256 newPeriodStartTime) = getTimes();
        isNewMonth = newPeriodStartTime > lastClaimedPeriodStartTime;
        if (isNewMonth) maxTokens = amount;
        else maxTokens = amount - claimedThisMonth;
    }

    function _getClaimableAmount() private view returns (uint256) {
        (uint256 currentYear, , ) = getTimes();
        if (currentYear < 5) {
            uint256 percentage = currentYear == 1
                ? 10
                : (currentYear == 2 ? 25 : (currentYear == 3 ? 50 : 100));
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
