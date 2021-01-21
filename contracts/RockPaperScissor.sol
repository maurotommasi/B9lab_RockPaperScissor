// SPDX-License-Identifier: MIT
import "./SafeMath.sol";
import "./Stoppable.sol";

pragma solidity 0.6.10;

contract RockPaperScissor is Stoppable{

    using SafeMath for uint;

    uint public withdrawGasLimit;
    uint public gameID;
    uint constant penalityRatio = uint(2);

    enum Hand       {Null, Rock, Paper, Scissor} 
    enum WinStatus  {Null, Player1, Player2, Pair} 
    enum GameStatus {Null, Created, Bet, WaitingP1, WaitingP2, Closed, Stopped} 

    struct Move {
        bytes32 hashMove;
        uint timestamp;
    }

    struct GameMetaData {
        uint bet;
        address player1;
        address player2;
        uint expirationTime;
        uint freeBetTime;
        Move movePlayer1;
        Move movePlayer2;
        Hand handPlayer1;
        Hand handPlayer2;
        GameStatus gameStatus;
        WinStatus winStatus;
    }

    struct Balance {
        uint balance;
        uint balance_locked;
    }

    mapping(uint => GameMetaData) private games;
    mapping(address => Balance) private balances;
    mapping(bytes32 => bool) public secrets;

    event GameMetaDataLog(uint indexed gameID, uint bet, address indexed player1, address indexed player2, uint expirationTime, uint freeBetTime);
    event GameChangeStatusLog (uint indexed gameID, GameStatus gameStatus);
    event PlayerHashMoveLog(address indexed player, bytes32 hashMove, uint indexed gameID);
    event PlayerShowHandLog(address indexed player, Hand hand, uint gameID);
    event VictoryLog(uint indexed gameID, WinStatus winStatus);
    event DepositLog(address indexed who, uint amount);
    event DepositLockedLog(address indexed who, uint amount);
    event AwardsLog(address indexed who, uint amount, uint penality);
    event WithdrawBalanceLog(address indexed who, uint amount);
    event WithdrawGasLimitChangedLog(address indexed owner, uint maxGas);

    modifier isGameAvailable(uint _gameID) {
        require(_gameID >= 0 && _gameID <= gameID, "gameID not valid");
        _;
    }

    constructor (bool _running, uint _withdrawGasLimit) public Stoppable(_running) {
        withdrawGasLimit = _withdrawGasLimit;
    }

    function getBalance(address _address) public view returns(uint, uint){
        Balance memory balance = balances[_address];
        return (balance.balance, balance.balance_locked);
    }

    function deposit() public payable onlyIfRunning returns(bool){
        require(msg.sender != address(0), "RockPaperScissor.deposit, Address can't be null");
        require(msg.value > uint(0), "RockPaperScissor.deposit, msg.value has to be greater than 0");
        emit DepositLog(msg.sender, msg.value);
        balances[msg.sender].balance = balances[msg.sender].balance.add(msg.value);
    }

    function encryptHand(Hand _hand, bytes32 _encryptHandKey) public view returns(bytes32){
        require(_encryptHandKey != bytes32(0), "RockPaperScissor.encryptHand, Encrypt Hand can't be a null bytes32 data");
        require(_hand != Hand.Null, "RockPaperScissor.encryptHand, Hand can't be null or 0");
        return keccak256(abi.encodePacked(msg.sender, _hand, _encryptHandKey, address(this)));
    }

    function decryptHand(bytes32 _hashSecretHand, bytes32 _encryptHandKey) private view returns(Hand){
        if(keccak256(abi.encodePacked(msg.sender, Hand.Rock, _encryptHandKey, address(this))) == _hashSecretHand) return Hand.Rock;
        if(keccak256(abi.encodePacked(msg.sender, Hand.Paper, _encryptHandKey, address(this))) == _hashSecretHand) return Hand.Paper;
        if(keccak256(abi.encodePacked(msg.sender, Hand.Scissor, _encryptHandKey, address(this))) == _hashSecretHand) return Hand.Scissor;
        return Hand.Null;
    }

    function createGame(address _opponent, uint _bet, uint _expirationTime, uint _freeBetTime, bytes32 _secretHand) external onlyIfRunning returns(uint){
        require(msg.sender != address(0x0), "RockPaperScissor.createGame, Sender can't be null");
        require(msg.sender != _opponent, "RockPaperScissor.createGame, Sender can't be the opponent");
        require(_opponent != address(0x0), "RockPaperScissor.createGame, Opponent can't be null");
        require(balances[msg.sender].balance >= _bet, "RockPaperScissor.createGame, Not enough wei to do this bet");
        require(_secretHand != bytes32(0), "RockPaperScissor.createGame, Secret Hand not valid");
        require(!secrets[_secretHand], "Secret Hand not allowed");

        uint newGameID = gameID.add(uint(1));
        gameID = newGameID;
        GameMetaData memory game = GameMetaData({
            bet:            _bet,
            player1:        msg.sender,
            player2:        _opponent,
            expirationTime: now.add(_freeBetTime).add(_expirationTime),
            freeBetTime:    now.add(_freeBetTime),
            movePlayer1:    Move({
                                hashMove: _secretHand,
                                timestamp: now
                            }),
            movePlayer2 :   Move({
                                hashMove: bytes32(0),
                                timestamp: 0
                            }),
            handPlayer1:    Hand.Null,
            handPlayer2:    Hand.Null,
            gameStatus:     GameStatus.Created,
            winStatus:      WinStatus.Null
        });

        games[newGameID] = game;
        secrets[_secretHand] = true;
        uint newBalanceLocked = balances[msg.sender].balance_locked.add(_bet);
        balances[msg.sender].balance_locked = newBalanceLocked;

        emit GameChangeStatusLog(newGameID, GameStatus.Created);
        emit GameMetaDataLog(newGameID, game.bet, game.player1, game.player2, game.expirationTime, game.freeBetTime);
        emit PlayerHashMoveLog(game.player1, game.movePlayer1.hashMove, newGameID);
        emit DepositLockedLog(msg.sender, newBalanceLocked);
        return newGameID;
    }

 function challangeAccepted(uint _gameID, bytes32 _secretHand) external isGameAvailable(_gameID) onlyIfRunning payable returns(bool){
        GameMetaData memory game = games[_gameID];
        Balance memory balance = balances[msg.sender];
        uint balance_available = balance.balance.sub(balance.balance_locked);
        
        require(_secretHand != bytes32(0), "RockPaperScissor.challangeAccepted, Secret Hand not valid");
        require(balance_available >= game.bet, "RockPaperScissor.challangeAccepted, Not enough wei on sender's balance to bet this game");
        require(game.gameStatus == GameStatus.Created, "RockPaperScissor.challangeAccepted, This game is not created yet or challange already accepted");
        require(game.player2 == msg.sender, "RockPaperScissor.challangeAccepted, You must be a declared opponent");
        require(!secrets[_secretHand], "Secret Hand not allowed");

        Move memory movePlayer2 = Move({
            hashMove: _secretHand,
            timestamp: now
        });

        games[_gameID].gameStatus = GameStatus.Bet;
        games[_gameID].movePlayer2 = movePlayer2;
        secrets[_secretHand] = true;
        uint newBalanceLocked = balances[msg.sender].balance_locked.add(game.bet);
        balances[msg.sender].balance_locked = newBalanceLocked;

        emit GameChangeStatusLog(_gameID, GameStatus.Bet);
        emit PlayerHashMoveLog(msg.sender, movePlayer2.hashMove, _gameID);
        emit DepositLockedLog(msg.sender, newBalanceLocked);

        return true;
    }

    function showHandP1(uint _gameID, bytes32 _encryptHandKey) external isGameAvailable(_gameID) onlyIfRunning returns(GameStatus){
        require(_encryptHandKey != bytes32(0), "Encrypt Key not valid");

        GameMetaData memory game = games[_gameID];

        require(game.gameStatus == GameStatus.Bet || game.gameStatus == GameStatus.WaitingP1, "Dismatch Status Game");
        require(game.player1 == msg.sender, "msg.sender is not a player");

        Hand player1Hand = game.handPlayer1;
        GameStatus newGameStatus;

        player1Hand = decryptHand(game.movePlayer1.hashMove, _encryptHandKey);
        require(player1Hand != Hand.Null, "Incorrect Decrypt key");

        if(game.gameStatus == GameStatus.Bet){
            newGameStatus = GameStatus.WaitingP2;
        } else {
            newGameStatus = GameStatus.Closed;
        }

        games[_gameID].handPlayer1 = player1Hand;
        games[_gameID].gameStatus = newGameStatus;

        emit PlayerShowHandLog(msg.sender, player1Hand, _gameID);
        emit GameChangeStatusLog(_gameID, newGameStatus);

        return newGameStatus;
    }

    function showHandP2(uint _gameID, bytes32 _encryptHandKey) external isGameAvailable(_gameID) onlyIfRunning returns(GameStatus){
        require(_encryptHandKey != bytes32(0), "Encrypt Key not valid");

        GameMetaData memory game = games[_gameID];

        require(game.gameStatus == GameStatus.Bet || game.gameStatus == GameStatus.WaitingP2, "Dismatch Status Game");
        require(game.player2 == msg.sender, "msg.sender is not a player");

        Hand player2Hand = game.handPlayer2;
        GameStatus newGameStatus;

        player2Hand = decryptHand(game.movePlayer2.hashMove, _encryptHandKey);
        require(player2Hand != Hand.Null, "Incorrect Decrypt key");

        if(game.gameStatus == GameStatus.Bet){
            newGameStatus = GameStatus.WaitingP1;
        } else {
            newGameStatus = GameStatus.Closed;
        }

        games[_gameID].handPlayer2 = player2Hand;
        games[_gameID].gameStatus = newGameStatus;

        emit PlayerShowHandLog(msg.sender, player2Hand, _gameID);
        emit GameChangeStatusLog(_gameID, newGameStatus);

        return newGameStatus;
    }

    function getWinner(uint _gameID) external isGameAvailable(_gameID) view returns(WinStatus){
        // useful for UI to know who is the winner
        GameMetaData memory game = games[_gameID];
        return coreLogic(game.handPlayer1, game.handPlayer2);
    }

    function gameAward(uint _gameID) external isGameAvailable(_gameID) onlyIfRunning returns(WinStatus){
        GameMetaData memory game = games[_gameID];

        require(game.gameStatus == GameStatus.Closed, "GameStatus Dismatch");

        WinStatus winStatus = coreLogic(game.handPlayer1, game.handPlayer2);
        //games[_gameID].winStatus = winStatus; // commented cause the game is deleted after all

        Balance memory newBalanceP1;
        Balance memory newBalanceP2;

        require((game.player1 == msg.sender && winStatus == WinStatus.Player1) || (game.player2 == msg.sender && winStatus == WinStatus.Player2), "Sender is not the winner or a player");

        uint penality;
        uint weight = game.bet.div(game.expirationTime.sub(game.freeBetTime)).div(penalityRatio); // player2 can lose maximum 1 / penalityRatio of the bet

        if(winStatus == WinStatus.Player1) {
            newBalanceP1.balance = balances[game.player1].balance.add(game.bet);
            newBalanceP2.balance = balances[game.player2].balance.sub(game.bet);
        } else {
            if(game.movePlayer2.timestamp <= game.freeBetTime){
                penality = uint(0);
            } else if(game.freeBetTime < game.movePlayer2.timestamp && game.movePlayer2.timestamp <= game.expirationTime) {
                penality = game.movePlayer2.timestamp.sub(game.freeBetTime);
            } else {
                penality = game.expirationTime.sub(game.freeBetTime);
            }
            penality = penality.mul(weight);
            newBalanceP2.balance = balances[game.player2].balance.add(game.bet).sub(penality);
            newBalanceP1.balance = balances[game.player1].balance.sub(game.bet).add(penality);
        }

        //games[_gameID].gameStatus = GameStatus.Stopped;
        newBalanceP1.balance_locked = balances[game.player1].balance_locked.sub(game.bet);
        newBalanceP2.balance_locked = balances[game.player2].balance_locked.sub(game.bet);

        balances[game.player1] = newBalanceP1;
        balances[game.player2] = newBalanceP2;

        emit AwardsLog(msg.sender, game.bet, penality);
        emit GameChangeStatusLog(_gameID, GameStatus.Stopped);
        emit DepositLockedLog(game.player1, newBalanceP1.balance_locked);
        emit DepositLockedLog(game.player2, newBalanceP2.balance_locked);
        emit VictoryLog(_gameID, winStatus);

        delete games[_gameID];

        return winStatus;
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
        Balance memory balance = balances[msg.sender];
        uint delta = balance.balance.sub(balance.balance_locked);

        require(delta != uint(0), "RockPaperScissor.withdrawBalance, Delta Balance can't be equal to 0");

        balances[msg.sender].balance = balance.balance_locked;

        emit WithdrawBalanceLog(msg.sender, delta);

        (success, ) = msg.sender.call{gas: withdrawGasLimit, value : delta}(""); 
        require(success);
    }

    function stopGame(uint _gameID) external isGameAvailable(_gameID) onlyIfRunning returns(bool){
        GameMetaData memory game = games[_gameID];

        require(game.gameStatus != GameStatus.Closed && game.gameStatus != GameStatus.Null, "Game already closed or stopped");
        require(game.player1 == msg.sender || game.player2 == msg.sender, "Sender is not a player");
        if(game.player1 == msg.sender) {
            require(game.gameStatus != GameStatus.WaitingP1, "RockPaperScissor.stopGame, Player1 can't stop the game after have known the hand of the other player");
        } else {
            require(game.gameStatus != GameStatus.WaitingP2, "RockPaperScissor.stopGame, Player2 can't stop the game after have known the hand of the other player");
        }
        require(game.expirationTime < now, "RockPaperScissor.stopGame, Game can't be stopped before the expirationTime");

        //games[_gameID].gameStatus = GameStatus.Stopped;

        emit GameChangeStatusLog(_gameID, GameStatus.Stopped);

        if(game.gameStatus == GameStatus.Created){
            // Unlock only player1 balance
            uint newBalanceLockedP1 = balances[game.player1].balance_locked.sub(game.bet);
            balances[game.player1].balance_locked = newBalanceLockedP1;
            emit DepositLockedLog(game.player1, newBalanceLockedP1);
        } else {
            uint newBalanceLockedP1 = balances[game.player1].balance_locked.sub(game.bet);
            uint newBalanceLockedP2 = balances[game.player2].balance_locked.sub(game.bet);
            balances[game.player1].balance_locked = newBalanceLockedP1;
            balances[game.player2].balance_locked = newBalanceLockedP2;
            emit DepositLockedLog(game.player1, newBalanceLockedP1);
            emit DepositLockedLog(game.player2, newBalanceLockedP2);
        }

        delete games[_gameID];

    }

    function changeWithdrawGasLimit(uint _withdrawGasLimit) public onlyOwner returns(bool){
        uint currectWithdrawGasLimit = withdrawGasLimit;
        require(currectWithdrawGasLimit != _withdrawGasLimit, "Can't have the same gas");
        withdrawGasLimit = _withdrawGasLimit;
        emit WithdrawGasLimitChangedLog(msg.sender, _withdrawGasLimit);
    }


}