// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/GlowStick.sol";

contract GlowStickTest is Test {
    GlowStick public game;

    uint256 authorizerPrivateKey = 0x12345;
    address authorizer = vm.addr(authorizerPrivateKey);

    address public alice = address(0x1);
    address public bob = address(0x2);

    function setUp() public {
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);

        // Deploy main contract
        game = new GlowStick(authorizer);

        // Fund contract to support payouts and faucet.
        vm.deal(address(game), 100 ether);
    }

    function _getBetSig(address user, bool isUp, int256 binancePrice, uint256 deadline) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encodePacked(user, "BET", isUp, binancePrice, deadline));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(authorizerPrivateKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function _getSettleSig(address user, uint256 roundId, int256 binancePrice, uint256 deadline) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encodePacked(user, roundId, "SETTLE", binancePrice, deadline));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(authorizerPrivateKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function test_InitialState() public {
        assertFalse(game.hasActiveRound(alice));
        assertEq(game.userRoundNonce(alice), 0);
    }

    function test_Betting() public {
        uint256 deadline = block.timestamp + 120;
        bytes memory sig = _getBetSig(alice, true, 3000 * 1e8, deadline);

        vm.prank(alice);
        game.bet{value: 1 ether}(true, 3000 * 1e8, deadline, sig);

        (uint256 roundId, uint256 startTime, int256 startPrice, int256 endPrice, uint256 amount, bool isUp, bool settled, bool won) = game.activeRounds(alice);

        assertEq(roundId, 1);
        assertGt(startTime, 0);
        assertEq(startPrice, 3000 * 1e8);
        assertEq(endPrice, 0);
        assertEq(amount, 1 ether);
        assertTrue(isUp);
        assertFalse(settled);
        assertFalse(won);
    }

    function test_RevertWhen_BettingWithActiveRound_Before60s() public {
        uint256 deadline = block.timestamp + 120;
        bytes memory sig1 = _getBetSig(alice, true, 3000 * 1e8, deadline);
        vm.prank(alice);
        game.bet{value: 1 ether}(true, 3000 * 1e8, deadline, sig1);

        bytes memory sig2 = _getBetSig(alice, false, 3000 * 1e8, deadline);
        vm.prank(alice);
        vm.expectRevert("Active round exists");
        game.bet{value: 1 ether}(false, 3000 * 1e8, deadline, sig2);
    }

    function test_BettingWithActiveRound_After60sAutoSettles() public {
        uint256 deadline = block.timestamp + 120;
        bytes memory sig1 = _getBetSig(alice, true, 3000 * 1e8, deadline);
        vm.prank(alice);
        game.bet{value: 1 ether}(true, 3000 * 1e8, deadline, sig1);

        vm.warp(block.timestamp + 60 seconds);
        uint256 newDeadline = block.timestamp + 120;
        
        uint256 beforeRebet = alice.balance;

        bytes memory sig2 = _getBetSig(alice, false, 3500 * 1e8, newDeadline);
        vm.prank(alice);
        game.bet{value: 0.5 ether}(false, 3500 * 1e8, newDeadline, sig2);

        uint256 afterRebet = alice.balance;
        // Auto-settle previous winning round (1.985 ETH), then place 0.5 ETH new bet.
        assertEq(afterRebet - beforeRebet, 1.485 ether);

        (uint256 roundId, , , , uint256 amount, bool isUp, bool settled, ) = game.activeRounds(alice);
        assertEq(roundId, 2);
        assertEq(amount, 0.5 ether);
        assertFalse(isUp);
        assertFalse(settled);
    }

    function test_RevertWhen_SettleTooEarly() public {
        uint256 deadline = block.timestamp + 120;
        bytes memory betSig = _getBetSig(alice, true, 3000 * 1e8, deadline);
        vm.prank(alice);
        game.bet{value: 1 ether}(true, 3000 * 1e8, deadline, betSig);

        bytes memory settleSig = _getSettleSig(alice, 1, 3500 * 1e8, deadline);
        vm.prank(alice);
        vm.expectRevert("Round not finished");
        game.settleMyRound(3500 * 1e8, deadline, settleSig);
    }

    function test_RevertWhen_SettleBeforeDuration() public {
        uint256 deadline = block.timestamp + 120;
        bytes memory betSig = _getBetSig(alice, true, 3000 * 1e8, deadline);
        vm.prank(alice);
        game.bet{value: 1 ether}(true, 3000 * 1e8, deadline, betSig);

        vm.warp(block.timestamp + 59 seconds);

        bytes memory settleSig = _getSettleSig(alice, 1, 3500 * 1e8, deadline);
        vm.prank(alice);
        vm.expectRevert("Round not finished");
        game.settleMyRound(3500 * 1e8, deadline, settleSig);
    }

    function test_WinPayout_AutoSent() public {
        uint256 deadline = block.timestamp + 120;
        bytes memory betSig = _getBetSig(alice, true, 3000 * 1e8, deadline);
        vm.prank(alice);
        game.bet{value: 1 ether}(true, 3000 * 1e8, deadline, betSig);

        uint256 aliceAfterBet = alice.balance;

        vm.warp(block.timestamp + 60 seconds);

        uint256 newDeadline = block.timestamp + 120;
        bytes memory settleSig = _getSettleSig(alice, 1, 3500 * 1e8, newDeadline); // UP => Alice wins

        vm.prank(alice);
        game.settleMyRound(3500 * 1e8, newDeadline, settleSig);

        uint256 aliceAfterSettle = alice.balance;
        assertEq(aliceAfterSettle - aliceAfterBet, 1.985 ether);

        assertEq(game.treasuryFees(), 0.015 ether);
        assertEq(game.pendingWithdrawals(alice), 0);

        (, , , int256 endPrice, , , bool settled, bool won) = game.activeRounds(alice);
        assertTrue(settled);
        assertTrue(won);
        assertEq(endPrice, 3500 * 1e8);
    }

    function test_LosePayout_None() public {
        uint256 deadline = block.timestamp + 120;
        bytes memory betSig = _getBetSig(bob, true, 3000 * 1e8, deadline);
        vm.prank(bob);
        game.bet{value: 1 ether}(true, 3000 * 1e8, deadline, betSig);

        uint256 bobAfterBet = bob.balance;

        vm.warp(block.timestamp + 60 seconds);

        uint256 newDeadline = block.timestamp + 120;
        bytes memory settleSig = _getSettleSig(bob, 1, 2500 * 1e8, newDeadline); // DOWN => Bob loses

        vm.prank(bob);
        game.settleMyRound(2500 * 1e8, newDeadline, settleSig);

        uint256 bobAfterSettle = bob.balance;
        assertEq(bobAfterSettle, bobAfterBet);
        assertEq(game.treasuryFees(), 1 ether);
    }

    function test_Draw_RefundsStake() public {
        uint256 deadline = block.timestamp + 120;
        bytes memory betSig = _getBetSig(alice, false, 3000 * 1e8, deadline);
        vm.prank(alice);
        game.bet{value: 1 ether}(false, 3000 * 1e8, deadline, betSig);

        uint256 aliceAfterBet = alice.balance;

        vm.warp(block.timestamp + 60 seconds);

        uint256 newDeadline = block.timestamp + 120;
        bytes memory settleSig = _getSettleSig(alice, 1, 3000 * 1e8, newDeadline); // unchanged => draw

        vm.prank(alice);
        game.settleMyRound(3000 * 1e8, newDeadline, settleSig);

        uint256 aliceAfterSettle = alice.balance;
        assertEq(aliceAfterSettle - aliceAfterBet, 1 ether);
        assertEq(game.treasuryFees(), 0);
    }

    function test_CanBetAgainAfterSettlement() public {
        uint256 deadline = block.timestamp + 120;
        bytes memory betSig = _getBetSig(alice, true, 3000 * 1e8, deadline);
        vm.prank(alice);
        game.bet{value: 1 ether}(true, 3000 * 1e8, deadline, betSig);

        vm.warp(block.timestamp + 60 seconds);
        uint256 settleDeadline = block.timestamp + 120;
        bytes memory settleSig = _getSettleSig(alice, 1, 3500 * 1e8, settleDeadline);

        vm.prank(alice);
        game.settleMyRound(3500 * 1e8, settleDeadline, settleSig);

        uint256 newBetDeadline = block.timestamp + 120;
        bytes memory betSig2 = _getBetSig(alice, false, 3500 * 1e8, newBetDeadline);
        vm.prank(alice);
        game.bet{value: 0.5 ether}(false, 3500 * 1e8, newBetDeadline, betSig2);

        (uint256 roundId, , , , uint256 amount, bool isUp, bool settled, ) = game.activeRounds(alice);
        assertEq(roundId, 2);
        assertEq(amount, 0.5 ether);
        assertFalse(isUp);
        assertFalse(settled);
    }
}
