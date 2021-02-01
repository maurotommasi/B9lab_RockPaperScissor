// SPDX-License-Identifier: MIT
import "./SafeMath.sol";
import "./Stoppable.sol";

pragma solidity 0.6.10;

contract RockPaperScissor is Stoppable{

    using SafeMath for uint;

    uint public withdrawGasLimit;
    uint public gameID;
    uint public blockDuration;

    enum Hand       {Null, Rock, Paper, Scissor} 
    enum WinStatus  {Null, Player1, Player2, Pair} 
    enum GameStatus {Null, Created, Accepted, Stopped} 

    struct Move {
        bytes32 hashMove;       
        uint timestamp;
    }

    struct GameMetaData {
        uint bet;               
        address player1;        
        address player2;        
        uint expirationBlock;          
        Hand handPlayer2;       
        GameStatus gameStatus;
    }

    mapping(bytes32 => GameMetaData) private games;
    mapping(address => uint) public balances;

    event GameMetaDataLog(uint indexed gameHash, uint bet, address indexed player1, address indexed player2, uint expirationTime, uint freeBetTime);
    event GameChangeStatusLog (uint indexed gameHash, GameStatus gameStatus);
    event GameAcceptedLog (uint indexed gameHash, Hand handPlayer2);
    event VictoryLog(uint indexed gameHash, address revealer, uint bet, WinStatus winStatus);
    event GameStoppedLog(bytes32 gameHash, address player);
    event DepositLog(address indexed who, uint amount);
    event WithdrawBalanceLog(address indexed who, uint amount);
    event WithdrawGasLimitChangedLog(address indexed owner, uint maxGas);
    event ChangedBlockDuration(address indexed owner, uint blockDuration);

    constructor (bool _running, uint _withdrawGasLimit, uint _blockDuration) public Stoppable(_running) {
        withdrawGasLimit = _withdrawGasLimit;
        blockDuration = _blockDuration;
    }

    function deposit() public payable onlyIfRunning returns(bool){
        require(msg.sender != address(0), "RockPaperScissor.deposit, Address can't be null");
        require(msg.value > uint(0), "RockPaperScissor.deposit, msg.value has to be greater than 0");
        emit DepositLog(msg.sender, msg.value);
        balances[msg.sender] = balances[msg.sender].add(msg.value);
    }

    function gameHash(Hand _hand, bytes32 _encryptHandKey) public view returns(bytes32){
        require(_encryptHandKey != bytes32(0), "RockPaperScissor.encryptHand, Encrypt Hand can't be a null bytes32 data");
        require(_hand != Hand.Null, "RockPaperScissor.encryptHand, Hand can't be null or 0");
        return keccak256(abi.encodePacked(msg.sender, _hand, _encryptHandKey, address(this)));
    }

    function changeExpirationBlock(uint _blockDuration) public onlyOwner returns(bool){
        uint currentBlockDuration = blockDuration;
        require(_blockDuration != currentBlockDuration, "The value is already set");
        blockDuration = _blockDuration;
        emit ChangedBlockDuration(msg.sender, _blockDuration);
    }

    function createGame(bytes32 _gameHash, address _opponent, uint _bet) external onlyIfRunning returns(uint){
        uint balance = balances[msg.sender];

        require(msg.sender != _opponent, "RockPaperScissor.createGame, Sender can't be the opponent");
        require(_opponent != address(0x0), "RockPaperScissor.createGame, Opponent can't be null");
        require(_bet <= balance, "RockPaperScissor.createGame, Not enough wei to do this bet");
        require(game[_gameHash] == GameStatus.Null, "RockPaperScissor.createGame, Game already created");

        GameMetaData memory game = GameMetaData({
            bet:            _bet,
            player1:        msg.sender,
            player2:        _opponent,
            expirationTime: block.number.add(_freeBetTime).add(_expirationTime),
            freeBetTime:    block.number.add(_freeBetTime),
            handPlayer2:    Hand.Null,
            gameStatus:     GameStatus.Created,
            winStatus:      WinStatus.Null
        });

        games[_gameHash] = game;
        balances[msg.sender] = balance.sub(_bet);
        emit GameChangeStatusLog(_gameHash, GameStatus.Created);
        emit GameMetaDataLog(_gameHash, game.bet, game.player1, game.player2, game.expirationTime, game.freeBetTime);
        emit PlayerHashMoveLog(game.player1, game.movePlayer1.hashMove, newGameID);

        return newGameID;
    }

 function challangeAccepted(bytes32 _gameHash, bytes32 _hand) external onlyIfRunning payable returns(bool){
        uint balance = balances[msg.sender];
        uint bet = games[_gameHash].bet;

        require(_secretHand != bytes32(0), "RockPaperScissor.challangeAccepted, Secret Hand not valid");
        require(bet <= balance, "RockPaperScissor.challangeAccepted, Not enough wei on sender's balance to bet this game");
        require(game.gameStatus == GameStatus.Created, "RockPaperScissor.challangeAccepted, This game is not created yet or challange already accepted");
        require(game.player2 == msg.sender, "RockPaperScissor.challangeAccepted, You must be a declared opponent");

        games[_gameID].gameStatus   = GameStatus.Accepted;
        games[_gameID].handPlayer2  = _hand;

        balances[msg.sender].balance = balance.sub(bet);

        emit GameChangeStatusLog(_gameHash, GameStatus.Accepted);
        emit GameAcceptedLog(_gameHash, _hand);

        return true;
    }

    function closeGame(Hand _hand, bytes32 _encryptHandKey) external view returns(WinStatus){
        require(_hand != Hand.Null, "Hand can't be null");
        require(_encryptHandKey != bytes32(0));

        bytes32 gameHash = gameHash(_hand, _encryptHandKey);

        require(game[gameHash].gameStatus == GameStatus.Accepted, "Game not created or not accepted");

        address player1     = game[gameHash].player1;
        address player2     = game[gameHash].player2;
        Hand opponentHand   = game[gameHash].handPlayer2;
        uint bet            = game[gameHash].bet;

        WinStatus winner = coreLogic(game.handPlayer1, game.handPlayer2);

        if(winner == WinStatus.Player1) balances[player1] = balances[player1].add(bet.mul(2));
        if(winner == WinStatus.Player2) balances[player2] = balances[player2].add(bet.mul(2));
        if(winner == WinStatus.Pair) {
            balances[player1] = balances[player1].add(bet);
            balances[player2] = balances[player2].add(bet);
        }
        if(winner == WinStatus.Null) revert();

        delete games[gameHash];

        emit VictoryLog(gameHash, msg.sender, bet, winner);
    }

    function coreLogic(Hand _hand1, Hand _hand2) private onlyIfRunning view returns(WinStatus){
        if(_hand1 == _hand2) return WinStatus.Pair;
        if(_hand1 == Hand.Rock && _hand2 == Hand.Scissor) return WinStatus.Player1;
        if(_hand1 == Hand.Rock && _hand2 == Hand.Paper) return WinStatus.Player2;
        if(_hand1 == Hand.Scissor && _hand2 == Hand.Rock) return WinStatus.Player2;
        if(_hand1 == Hand.Scissor && _hand2 == Hand.Paper) return WinStatus.Player1;
        if(_hand1 == Hand.Paper && _hand2 == Hand.Rock) return WinStatus.Player1;
        if(_hand1 == Hand.Paper && _hand2 == Hand.Scissor) return WinStatus.Player2;
        if(_hand1 == Hand.Null || _hand2 == Hand.Null) return WinStatus.Null;
    }

    function withdrawBalance() public returns(bool success){
        uint balance = balances[msg.sender];
       
        require(balance != uint(0), "RockPaperScissor.withdrawBalance, Delta Balance can't be equal to 0");

        balances[msg.sender] = uint(0);

        emit WithdrawBalanceLog(msg.sender, balance);

        (success, ) = msg.sender.call{gas: withdrawGasLimit, value : balance}(""); 
        require(success);
    }

    function stopGame(bytes32 _gameHash) external onlyIfRunning returns(bool){
        require(games[_gameHash].expirationBlock < block.number, "Can't stop the game before the deadline");

        GameStatus gameStatus = games[_gameHash].gameStatus;

        if(gameStatus == GameStatus.Created){
            require(games[_gameHash].player1 == msg.sender, "Only player1 can stop the game");
            balances[msg.sender] = balances[msg.sender].add(games[_gameHash].bet); //refund bet for player 1
        }
        if(gameStatus == GameStatus.Accepted){
            require(games[_gameHash].player2 == msg.sender, "Only player2 can stop the game");
            balances[msg.sender] = balances[msg.sender].add(games[_gameHash].bet); //refund bet for player 2
        }
        if(gameStatus != GameStatus.Created || gameStatus != GameStatus.Accepted) revert();

        delete games[_gamehash];

        emit GameStoppedLog(_gameHash, msg.sender);

        return true;
    }

    function changeWithdrawGasLimit(uint _withdrawGasLimit) public onlyOwner returns(bool){
        uint currectWithdrawGasLimit = withdrawGasLimit;
        require(currectWithdrawGasLimit != _withdrawGasLimit, "Can't have the same gas");
        withdrawGasLimit = _withdrawGasLimit;
        emit WithdrawGasLimitChangedLog(msg.sender, _withdrawGasLimit);
    }


}