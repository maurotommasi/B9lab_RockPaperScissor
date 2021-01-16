const RockPaperScissor = artifacts.require("RockPaperScissor");

module.exports = function(deployer, network, accounts) {
    let owner = accounts[0];
    const running = true;
    const withdrawGasLimit = 2000000;
  
    if (network == "ropsten") {
      owner = ""; // TODO: Fill with your address
    }
  
    deployer.deploy(RockPaperScissor, running, withdrawGasLimit, {from: owner});
  };
  