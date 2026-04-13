// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

// Minimal Chainlink Interfaces to avoid massive dependency cloning
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);
    function getRoundData(uint80 _roundId) external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

contract GlowStick is Ownable {
    
    // --- Constants & Config ---
    uint256 public constant ROUND_DURATION = 60 seconds; 
    uint256 public constant FEE_PERCENTAGE = 15; // 1.5% fee (divide by 1000)

    AggregatorV3Interface public immutable PRICE_FEED;

    // --- State Variables ---
    uint256 public treasuryFees; // Accumulated fees for the owner
    mapping(address => uint256) public pendingWithdrawals;

    struct UserRound {
        uint256 roundId;
        uint256 startTime;
        int256 startPrice;
        int256 endPrice;
        uint256 amount;
        bool isUp;
        bool settled;
        bool won;
    }

    mapping(address => UserRound) public activeRounds;
    mapping(address => uint256) public userRoundNonce;
    
    // Faucet tracking
    mapping(address => bool) public hasUsedFaucet;
    uint256 public constant FAUCET_AMOUNT = 0.05 ether;

    // --- Events ---
    event BetPlaced(address indexed user, uint256 indexed roundId, bool isUp, uint256 amount, int256 startPrice);
    event RoundResolved(address indexed user, uint256 indexed roundId, int256 startPrice, int256 endPrice, bool won, uint256 payout);
    event Claimed(address indexed user, uint256 indexed roundId, uint256 amount);
    event PayoutSent(address indexed user, uint256 indexed roundId, uint256 amount);
    event PayoutQueued(address indexed user, uint256 indexed roundId, uint256 amount);
    
    // pass the price feed address (Sepolia ETH/USD: 0x694AA1769357215DE4FAC081bf1f309aDC325306)
    constructor(address _priceFeedAddress) Ownable(msg.sender) {
        PRICE_FEED = AggregatorV3Interface(_priceFeedAddress);
    }

    function getLatestPrice() external view returns (int256) {
        (, int256 price, , , ) = PRICE_FEED.latestRoundData();
        return price;
    }

    function hasActiveRound(address _user) public view returns (bool) {
        UserRound memory r = activeRounds[_user];
        return r.roundId != 0 && !r.settled;
    }

    // --- Betting Function ---
    // User starts a private 60-second prediction round.
    function bet(bool _isUp) external payable {
        require(msg.value > 0, "Bet amount must be > 0");
        require(!hasActiveRound(msg.sender), "Active round exists");

        (, int256 price, , , ) = PRICE_FEED.latestRoundData();
        uint256 newRoundId = userRoundNonce[msg.sender] + 1;
        userRoundNonce[msg.sender] = newRoundId;

        activeRounds[msg.sender] = UserRound({
            roundId: newRoundId,
            startTime: block.timestamp,
            startPrice: price,
            endPrice: 0,
            amount: msg.value,
            isUp: _isUp,
            settled: false,
            won: false
        });

        emit BetPlaced(msg.sender, newRoundId, _isUp, msg.value, price);
    }

    // User settles their own round after 60 seconds.
    function settleMyRound() external {
        UserRound storage r = activeRounds[msg.sender];
        require(r.roundId != 0, "No round found");
        require(!r.settled, "Round already settled");
        require(block.timestamp >= r.startTime + ROUND_DURATION, "Round not finished");

        (, int256 finalPrice, , , ) = PRICE_FEED.latestRoundData();
        r.endPrice = finalPrice;
        r.settled = true;

        bool priceUp = finalPrice > r.startPrice;
        bool isDraw = finalPrice == r.startPrice;

        uint256 payout = 0;
        if (isDraw) {
            payout = r.amount;
        } else if (r.isUp == priceUp) {
            r.won = true;
            uint256 fee = (r.amount * FEE_PERCENTAGE) / 1000;
            treasuryFees += fee;
            payout = r.amount + (r.amount - fee);
        } else {
            treasuryFees += r.amount;
        }

        if (payout > 0) {
            _safePayoutOrQueue(msg.sender, r.roundId, payout);
        }

        emit RoundResolved(msg.sender, r.roundId, r.startPrice, r.endPrice, r.won, payout);
    }

    function _safePayoutOrQueue(address _user, uint256 _roundId, uint256 _amount) internal {
        (bool success, ) = _user.call{value: _amount}("");
        if (success) {
            emit PayoutSent(_user, _roundId, _amount);
            return;
        }

        pendingWithdrawals[_user] += _amount;
        emit PayoutQueued(_user, _roundId, _amount);
    }

    // --- Claiming Functions ---
    // Legacy-compatible claim entrypoint: withdraw any queued auto-payouts.
    function claim(uint256 _roundId) external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No pending withdrawals");

        pendingWithdrawals[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Withdraw failed");

        emit Claimed(msg.sender, _roundId, amount);
    }

    function calculateWinPayout(uint256 _amount) public pure returns (uint256) {
        uint256 fee = (_amount * FEE_PERCENTAGE) / 1000;
        return _amount + (_amount - fee);
    }

    // --- Faucet ---
    // Anyone can call this to get a tiny amount of ETH to play, but ONLY ONCE.
    // In production (Frame), we would add an owner-only signed check to prevent sybil bots.
    function faucet() external {
        require(!hasUsedFaucet[msg.sender], "Faucet already used");
        require(address(this).balance >= FAUCET_AMOUNT, "Faucet empty");
        
        hasUsedFaucet[msg.sender] = true;
        (bool success, ) = msg.sender.call{value: FAUCET_AMOUNT}("");
        require(success, "Faucet transfer failed");
    }

    // --- Admin ---
    function withdrawFees() external onlyOwner {
        uint256 amount = treasuryFees;
        treasuryFees = 0;
        (bool success, ) = owner().call{value: amount}("");
        require(success, "Withdraw failed");
    }

    // Fallback to fund the faucet
    receive() external payable {}
}
