// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenDispenser is Ownable {
    error InvalidToken();
    error InvalidReceiver();
    error InvalidMontlyMax();
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
    uint256 public lastClaimedPeriodStartTime;
    address public receiver;
    uint256 public claimedThisMonth;

    /// @notice Emitted when the receiver claims
    event Claimed(uint256 amount);

    /// @notice Emmited when the owner changes the receiver
    event ReceiverChanged(address oldReceiver, address newReceiver);

    /// @notice Contructor of the contract, initialize the contract state
    /// @param token_ Address of the token to distribute
    /// @param monthlyMin_ Minimum amount of tokens to distribute each month
    /// @param monthlyMax_ Maximum amount of tokens to distribute each month
    /// @param receiver_ Address of the receiver of the tokens that can claim
    constructor(IERC20 token_, uint256 monthlyMin_, uint256 monthlyMax_, address receiver_) {
        if (address(token_) == address(0)) revert InvalidToken();
        if (monthlyMax_ == 0) revert InvalidMontlyMax();
        if (receiver_ == address(0)) revert InvalidReceiver();

        token = token_;
        monthlyMin = monthlyMin_;
        monthlyMax = monthlyMax_;
        receiver = receiver_;
        start = block.timestamp;
        lastClaimedPeriodStartTime = block.timestamp;
    }

    /// @notice Allows the owner to change the receiver address
    /// @dev The new address can not be zero
    /// @param receiver_ Address of the new receiver
    function changeReceiver(address receiver_) external onlyOwner {
        if (receiver_ == address(0)) revert InvalidReceiver();
        address oldReceiver = receiver;
        receiver = receiver_;
        emit ReceiverChanged(oldReceiver, receiver_);
    }

    /// @notice Allows the receiver to claim and receive the corresponding amount of tokens for the month
    /// @dev The caller needs to be the receiver
    /// @dev If the monthlyMin amount of tokens is reached, the contract will transfer the leftover tokens
    /// @param amount_ Amount of tokens to claim, recommended to first call calculateMaxTokensThisMonth()
    function claim(uint256 amount_) external {
        if (msg.sender != receiver) revert InvalidClaimCaller();

        (uint256 maxTokens, bool isNewMonth) = calculateMaxTokensThisMonth();
        if (maxTokens == 0) revert NoTokensLeftToDistribute();
        if (maxTokens < amount_) revert MonthlyClaimTooHigh();

        if (isNewMonth) {
            (, , uint256 newPeriodStartTime) = getTimes();
            lastClaimedPeriodStartTime = newPeriodStartTime;
            claimedThisMonth = amount_;
        }

        emit Claimed(amount_);
        if (!token.transfer(msg.sender, amount_)) revert PaymentFailed();
    }

    /// @notice Makes it easy for users to see the balance of the contract
    function getContractBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /// @notice Gets information about the times of the contract like current year, month, newPeriodStartTime
    /// @return currentYear Current year, starts at 1, and increases every 365 days since the start of the contract
    /// @return currentMonth Current month, starts at 1, and increases every 365 days/12 since the start of the contract
    /// @return newPeriodStartTime Time in seconds when the newest active period starts
    function getTimes()
        public
        view
        returns (uint256 currentYear, uint256 currentMonth, uint256 newPeriodStartTime)
    {
        uint256 elapsedTime = block.timestamp - start;
        currentYear = (elapsedTime / ONE_YEAR) + 1;
        currentMonth = (elapsedTime / ONE_MONTH) + 1;
        newPeriodStartTime = start + (currentMonth * ONE_MONTH);
    }

    /// @notice Shows the max amount claimabled this month considering prevoous claims during the same month
    /// @dev The function will resturn the leftovers if the monthlyMin is reached
    /// @return maxTokens Maximum claimable amount
    /// @return isNewMonth Returns true if the receiver has not claimed in the current month
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

    /// @dev Applies the formula to calculate the percentage from the max monthly amount according to the current month
    /// @return Max claimable amount of the month ignoring any already claimed tokens
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
}
