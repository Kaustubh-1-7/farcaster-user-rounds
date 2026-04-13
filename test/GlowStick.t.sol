// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/GlowStick.sol";
import "./MockV3Aggregator.sol";

contract GlowStickTest is Test {
    GlowStick public game;
    MockV3Aggregator public mockPriceFeed;

    address public alice = address(0x1);
    address public bob = address(0x2);

    function setUp() public {
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);

        // Start ETH price at $3,000 (with 8 decimals from Chainlink)
        mockPriceFeed = new MockV3Aggregator(8, 3000 * 1e8);
        
        // Deploy main contract
        game = new GlowStick(address(mockPriceFeed));

        // Fund contract to support payouts and faucet.
        vm.deal(address(game), 100 ether);
    }

    function test_InitialState() public {
        assertFalse(game.hasActiveRound(alice));
        assertEq(game.userRoundNonce(alice), 0);
    }

    function test_Betting() public {
        vm.prank(alice);
        game.bet{value: 1 ether}(true);

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

    function test_RevertWhen_BettingWithActiveRound() public {
        vm.prank(alice);
        game.bet{value: 1 ether}(true);

        vm.prank(alice);
        vm.expectRevert("Active round exists");
        game.bet{value: 1 ether}(false);
    }

    function test_RevertWhen_SettleTooEarly() public {
        vm.prank(alice);
        game.bet{value: 1 ether}(true);

        vm.warp(block.timestamp + 60 seconds);

        vm.prank(alice);
        game.settleMyRound();
    }

    function test_RevertWhen_SettleBeforeDuration() public {
        vm.prank(alice);
        game.bet{value: 1 ether}(true);

        vm.warp(block.timestamp + 59 seconds);

        vm.prank(alice);
        vm.expectRevert("Round not finished");
        game.settleMyRound();
    }

    function test_WinPayout_AutoSent() public {
        vm.prank(alice);
        game.bet{value: 1 ether}(true);

        uint256 aliceAfterBet = alice.balance;

        vm.warp(block.timestamp + 60 seconds);
        mockPriceFeed.updateAnswer(3500 * 1e8); // UP => Alice wins

        vm.prank(alice);
        game.settleMyRound();

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
        vm.prank(bob);
        game.bet{value: 1 ether}(true);

        uint256 bobAfterBet = bob.balance;

        vm.warp(block.timestamp + 60 seconds);
        mockPriceFeed.updateAnswer(2500 * 1e8); // DOWN => Bob loses

        vm.prank(bob);
        game.settleMyRound();

        uint256 bobAfterSettle = bob.balance;
        assertEq(bobAfterSettle, bobAfterBet);
        assertEq(game.treasuryFees(), 1 ether);
    }

    function test_Draw_RefundsStake() public {
        vm.prank(alice);
        game.bet{value: 1 ether}(false);

        uint256 aliceAfterBet = alice.balance;

        vm.warp(block.timestamp + 60 seconds);
        mockPriceFeed.updateAnswer(3000 * 1e8); // unchanged => draw

        vm.prank(alice);
        game.settleMyRound();

        uint256 aliceAfterSettle = alice.balance;
        assertEq(aliceAfterSettle - aliceAfterBet, 1 ether);
        assertEq(game.treasuryFees(), 0);
    }

    function test_CanBetAgainAfterSettlement() public {
        vm.prank(alice);
        game.bet{value: 1 ether}(true);

        vm.warp(block.timestamp + 60 seconds);
        mockPriceFeed.updateAnswer(3500 * 1e8);
        vm.prank(alice);
        game.settleMyRound();

        vm.prank(alice);
        game.bet{value: 0.5 ether}(false);

        (uint256 roundId, , , , uint256 amount, bool isUp, bool settled, ) = game.activeRounds(alice);
        assertEq(roundId, 2);
        assertEq(amount, 0.5 ether);
        assertFalse(isUp);
        assertFalse(settled);
    }
}
