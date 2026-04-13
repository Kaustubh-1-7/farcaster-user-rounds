// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MockV3Aggregator {
    uint8 public decimals;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound;
    
    constructor(uint8 _decimals, int256 _initialAnswer) {
        decimals = _decimals;
        answer = _initialAnswer;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
        answeredInRound = 1;
    }

    function updateAnswer(int256 _answer) public {
        answer = _answer;
        updatedAt = block.timestamp;
        answeredInRound += 1;
    }

    function description() external pure returns (string memory) {
        return "v0.8/MockV3Aggregator.sol";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 _roundId) external view returns (uint80 roundId, int256 _answer, uint256 _startedAt, uint256 _updatedAt, uint80 _answeredInRound) {
        return (_roundId, answer, startedAt, updatedAt, answeredInRound);
    }

    function latestRoundData() external view returns (uint80 roundId, int256 _answer, uint256 _startedAt, uint256 _updatedAt, uint80 _answeredInRound) {
        return (answeredInRound, answer, startedAt, updatedAt, answeredInRound);
    }
}
