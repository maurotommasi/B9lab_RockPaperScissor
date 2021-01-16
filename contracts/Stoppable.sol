import "./Owned.sol";

// SPDX-License-Identifier: MIT

pragma solidity 0.6.10;

contract Stoppable is Owned {

    bool private running;

    event RunSwitchLog(address indexed owner, bool switchSetting);

    modifier onlyIfRunning {
        require(running, "Stoppable.onlyIfRunning : It's not running");
        _;
    }

    function isRunning() public view returns(bool){
        return running;
    }

    constructor (bool _running) public {
        running = _running;
    }

    function runSwitch() public onlyOwner returns(bool){
        bool newRunning = !running;
        running = newRunning;
        RunSwitchLog(msg.sender, newRunning);
        return true;
    }

}
