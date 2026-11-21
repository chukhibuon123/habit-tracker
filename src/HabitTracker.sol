// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract HabitTracker {
    struct Task {
        string name;
        uint256 deadline;
        uint256 stakeAmount;
        bool isCompleted;
    }
    mapping(address => Task[]) public userTasks;

    function createTask(string memory _name, uint256 _deadline) public payable {
        require(msg.value > 0, "You must stake some AVAX!");
        require(_deadline > block.timestamp, "Deadline must be in the future");
        userTasks[msg.sender].push(Task({
            name: _name,
            deadline: _deadline,
            stakeAmount: msg.value,
            isCompleted: false
        }));
    }

    function completeTask(uint256 _taskIndex) public {
        Task[] storage myTasks = userTasks[msg.sender];

        require(_taskIndex < myTasks.length, "task does not exist");
        require(!myTasks[_taskIndex].isCompleted, "Task is already completed");
        require(block.timestamp <= myTasks[_taskIndex].deadline, "Deadline passed! Token slashed.");

        myTasks[_taskIndex].isCompleted = true;

        uint256 amountToReturn = myTasks[_taskIndex].stakeAmount;
        myTasks[_taskIndex].stakeAmount = 0;

        (bool success, ) = payable(msg.sender).call{value: amountToReturn}("");
        require(success, "Transfer failed");
    }

    function  punishTask(address _lazyUser, uint256 _taskIndex) public {
        Task[] storage lazyUserTasks = userTasks[_lazyUser];

        require(_taskIndex < lazyUserTasks.length, "Task does not exist");
        require(!lazyUserTasks[_taskIndex].isCompleted, "Task is already completed!");
        require(block.timestamp > lazyUserTasks[_taskIndex].deadline, "Deadline has not passed yet");

        uint256 amountToSlash = lazyUserTasks[_taskIndex].stakeAmount;
        require(amountToSlash > 0, "No AVAX left to slash");

        lazyUserTasks[_taskIndex].stakeAmount = 0;

        (bool success, ) = payable(msg.sender).call{value: amountToSlash}("");
        require(success, "Transfer failed");
    }

    function getTasks(address _user) external view returns (Task[] memory) {
        return userTasks[_user];
    }
}   

