// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {ECDSA} from "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";

interface AutomationCompatibleInterface {
    function checkUpkeep(bytes calldata checkData) external view returns (bool upkeepNeeded, bytes memory performData);
    function performUpkeep(bytes calldata performData) external;
}

contract GlowStick is Ownable, AutomationCompatibleInterface {
    
    // --- Constants & Config ---
    uint256 public constant ROUND_DURATION = 60 seconds; 
    uint256 public constant FEE_PERCENTAGE = 15; // 1.5% fee (divide by 1000)

    address public authorizer;

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
    address[] public activeUsers;
    mapping(address => uint256) private activeUserIndex;
    mapping(address => bool) private isActiveUser;
    
    // Faucet tracking
    mapping(address => bool) public hasUsedFaucet;
    uint256 public constant FAUCET_AMOUNT = 0.05 ether;

    // --- Events ---
    event BetPlaced(address indexed user, uint256 indexed roundId, bool isUp, uint256 amount, int256 startPrice);
    event RoundResolved(address indexed user, uint256 indexed roundId, int256 startPrice, int256 endPrice, bool won, uint256 payout);
    event Claimed(address indexed user, uint256 indexed roundId, uint256 amount);
    event PayoutSent(address indexed user, uint256 indexed roundId, uint256 amount);
    event PayoutQueued(address indexed user, uint256 indexed roundId, uint256 amount);
    event UserRoundActivated(address indexed user, uint256 indexed roundId);
    event UserRoundDeactivated(address indexed user, uint256 indexed roundId);
    
    constructor(address _authorizer) Ownable(msg.sender) {
        authorizer = _authorizer;
    }

    function setAuthorizer(address _authorizer) external onlyOwner {
        authorizer = _authorizer;
    }

    function _verifySignature(bytes32 dataHash, bytes calldata signature) internal view {
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(dataHash);
        address recoveredSigner = ECDSA.recover(ethSignedMessageHash, signature);
        require(recoveredSigner == authorizer, "Invalid signature");
    }

    function getVaultBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function activeUsersCount() external view returns (uint256) {
        return activeUsers.length;
    }

    function hasActiveRound(address _user) public view returns (bool) {
        UserRound memory r = activeRounds[_user];
        return r.roundId != 0 && !r.settled;
    }

    // --- Betting Function ---
    // User starts a private 60-second prediction round.
    function bet(bool _isUp, int256 _binancePrice, uint256 _deadline, bytes calldata _signature) external payable {
        require(msg.value > 0, "Bet amount must be > 0");
        require(block.timestamp <= _deadline, "Signature expired");

        bytes32 structHash = keccak256(abi.encodePacked(msg.sender, "BET", _isUp, _binancePrice, _deadline));
        _verifySignature(structHash, _signature);

        if (hasActiveRound(msg.sender)) {
            UserRound memory existing = activeRounds[msg.sender];
            require(block.timestamp >= existing.startTime + ROUND_DURATION, "Active round exists");
            _settleRound(msg.sender, _binancePrice);
        }

        uint256 newRoundId = userRoundNonce[msg.sender] + 1;
        userRoundNonce[msg.sender] = newRoundId;

        activeRounds[msg.sender] = UserRound({
            roundId: newRoundId,
            startTime: block.timestamp,
            startPrice: _binancePrice,
            endPrice: 0,
            amount: msg.value,
            isUp: _isUp,
            settled: false,
            won: false
        });

        _activateUser(msg.sender);

        emit BetPlaced(msg.sender, newRoundId, _isUp, msg.value, _binancePrice);
        emit UserRoundActivated(msg.sender, newRoundId);
    }

    // User settles their own round after 60 seconds.
    function settleMyRound(int256 _binancePrice, uint256 _deadline, bytes calldata _signature) external {
        require(block.timestamp <= _deadline, "Signature expired");
        
        UserRound memory r = activeRounds[msg.sender];
        require(r.roundId != 0, "No round found");

        bytes32 structHash = keccak256(abi.encodePacked(msg.sender, r.roundId, "SETTLE", _binancePrice, _deadline));
        _verifySignature(structHash, _signature);

        _settleRound(msg.sender, _binancePrice);
    }

    // Chainlink Automation check is disabled since we rely on signed prices in this version
    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory performData) {
        return (false, bytes(""));
    }

    function performUpkeep(bytes calldata performData) external override {
        revert("Automation Disabled");
    }

    function _settleRound(address _user, int256 finalPrice) internal {
        UserRound storage r = activeRounds[_user];
        require(r.roundId != 0, "No round found");
        require(!r.settled, "Round already settled");
        require(block.timestamp >= r.startTime + ROUND_DURATION, "Round not finished");

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
            _safePayoutOrQueue(_user, r.roundId, payout);
        }

        _deactivateUser(_user);

        emit RoundResolved(_user, r.roundId, r.startPrice, r.endPrice, r.won, payout);
        emit UserRoundDeactivated(_user, r.roundId);
    }

    function _activateUser(address _user) internal {
        if (isActiveUser[_user]) {
            return;
        }
        activeUserIndex[_user] = activeUsers.length;
        activeUsers.push(_user);
        isActiveUser[_user] = true;
    }

    function _deactivateUser(address _user) internal {
        if (!isActiveUser[_user]) {
            return;
        }

        uint256 idx = activeUserIndex[_user];
        uint256 lastIdx = activeUsers.length - 1;

        if (idx != lastIdx) {
            address lastUser = activeUsers[lastIdx];
            activeUsers[idx] = lastUser;
            activeUserIndex[lastUser] = idx;
        }

        activeUsers.pop();
        delete activeUserIndex[_user];
        isActiveUser[_user] = false;
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
