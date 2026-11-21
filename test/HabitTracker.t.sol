// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/HabitTracker.sol";

contract HabitTrackerTest is Test {
    HabitTracker public tracker;
    address public nam = makeAddr("nam");
    address public bot = makeAddr("bot");

    function setUp() public {
        tracker = new HabitTracker();
        vm.deal(nam, 10 ether);
    }

    function _createTask() internal returns (uint256 deadline) {
        deadline = block.timestamp + 1 days;
        vm.prank(nam);
        tracker.createTask{value: 1 ether}("On thi He dieu hanh", deadline);
    }

    // ---------- createTask ----------

    function test_CreateTask() public {
        _createTask();

        assertEq(nam.balance, 9 ether);
        assertEq(address(tracker).balance, 1 ether);

        HabitTracker.Task[] memory tasks = tracker.getTasks(nam);
        assertEq(tasks.length, 1);
        assertEq(tasks[0].stakeAmount, 1 ether);
        assertFalse(tasks[0].isCompleted);
    }

    function test_CreateTask_RevertsWithoutStake() public {
        vm.prank(nam);
        vm.expectRevert("You must stake some AVAX!");
        tracker.createTask("x", block.timestamp + 1 days);
    }

    function test_CreateTask_RevertsIfDeadlineInPast() public {
        vm.warp(1000);
        vm.prank(nam);
        vm.expectRevert("Deadline must be in the future");
        tracker.createTask{value: 1 ether}("x", 999);
    }

    // ---------- completeTask ----------

    function test_CompleteTask_RefundsStake() public {
        _createTask();

        vm.prank(nam);
        tracker.completeTask(0);

        assertEq(nam.balance, 10 ether);
        assertEq(address(tracker).balance, 0);

        HabitTracker.Task[] memory tasks = tracker.getTasks(nam);
        assertTrue(tasks[0].isCompleted);
        assertEq(tasks[0].stakeAmount, 0);
    }

    function test_CompleteTask_RevertsAfterDeadline() public {
        uint256 deadline = _createTask();
        vm.warp(deadline + 1);

        vm.prank(nam);
        vm.expectRevert("Deadline passed! Token slashed.");
        tracker.completeTask(0);
    }

    function test_CompleteTask_RevertsIfCompletedTwice() public {
        _createTask();

        vm.prank(nam);
        tracker.completeTask(0);

        vm.prank(nam);
        vm.expectRevert("Task is already completed");
        tracker.completeTask(0);
    }

    function test_CompleteTask_RevertsIfIndexOutOfRange() public {
        vm.prank(nam);
        vm.expectRevert("task does not exist");
        tracker.completeTask(0);
    }

    // ---------- punishTask ----------

    function test_PunishTask_PaysCaller() public {
        uint256 deadline = _createTask();
        vm.warp(deadline + 1);

        vm.prank(bot);
        tracker.punishTask(nam, 0);

        assertEq(bot.balance, 1 ether);
        assertEq(nam.balance, 9 ether);
        assertEq(address(tracker).balance, 0);
    }

    function test_PunishTask_RevertsBeforeDeadline() public {
        _createTask();

        vm.prank(bot);
        vm.expectRevert("Deadline has not passed yet");
        tracker.punishTask(nam, 0);
    }

    function test_PunishTask_RevertsIfCompleted() public {
        uint256 deadline = _createTask();

        vm.prank(nam);
        tracker.completeTask(0);

        vm.warp(deadline + 1);
        vm.prank(bot);
        vm.expectRevert("Task is already completed!");
        tracker.punishTask(nam, 0);
    }

    function test_PunishTask_RevertsIfPunishedTwice() public {
        uint256 deadline = _createTask();
        vm.warp(deadline + 1);

        vm.prank(bot);
        tracker.punishTask(nam, 0);

        vm.prank(bot);
        vm.expectRevert("No AVAX left to slash");
        tracker.punishTask(nam, 0);
    }
    
    function test_KnownIssue_SelfSlashWithSecondWallet() public {
        address alt = makeAddr("nam-second-wallet");
        uint256 deadline = _createTask();
        vm.warp(deadline + 1);

        vm.prank(alt);
        tracker.punishTask(nam, 0);

        assertEq(alt.balance, 1 ether);
}
}