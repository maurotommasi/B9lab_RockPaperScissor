// SPDX-License-Identifier: MIT

pragma solidity 0.6.10;

contract Owned {

    address private owner;

    event LogNewOwner(address indexed oldOwner, address indexed newOwner);

    modifier onlyOwner {
        require(msg.sender == owner, "Owned.onlyOwner : Only Owner can run this part");
        _;
    }

    constructor() public {
        owner = msg.sender;
    }

    function getOwner() public view returns(address){
        return owner;
    }

    function changeOwner(address _newOwner) public returns(bool)
    {
        address actualOwner = owner;

        require(msg.sender == actualOwner, "Owned.changeOwner : Only Owner can run this part");

        owner = _newOwner;

        emit LogNewOwner(actualOwner, _newOwner);

        return true;
    }

}