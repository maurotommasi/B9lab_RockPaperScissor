// SPDX-License-Identifier: MIT
import "./SafeMath.sol";
import "./Stoppable.sol";

pragma solidity 0.6.10;

contract RockPaperScissor is Stoppable{

    using SafeMath for uint;

    uint withdrawGasLimit;
    uint gameID;

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

    mapping(uint => GameMetaData) private games;
    mapping(address => uint) public balances;

    event GameMetaDataLog(uint indexed gameID, uint bet, address indexed player1, address indexed player2, uint expirationTime, uint freeBetTime);
    event GameChangeStatusLog (uint indexed gameID, GameStatus gameStatus);
    event PlayerHashMoveLog(address indexed player, bytes32 hashMove, uint indexed gameID);
    event PlayerShowHandLog(address indexed player, Hand hand, uint gameID);
    event VictoryLog(uint indexed gameID, WinStatus winStatus);
    event DepositLog(address indexed who, uint amount);
    event AwardsLog(address indexed who, uint amount, uint penality);
    event WithdrawBalanceLog(address indexed who, uint amount);

    modifier isGameAvailable(uint _gameID) {
        require(_gameID >= 0 && _gameID <= gameID, "gameID not valid");
        _;
    }

    constructor (bool _running, uint _withdrawGasLimit) public Stoppable(_running) {
        withdrawGasLimit = _withdrawGasLimit;
    }

    function deposit() public payable onlyIfRunning returns(bool){
        require(msg.sender != address(0), "RockPaperScissor.deposit, Address can't be null");
        require(msg.value > uint(0), "RockPaperScissor.deposit, msg.value has to be greater than 0");
        emit DepositLog(msg.sender, msg.value);
        balances[msg.sender] = balances[msg.sender].add(msg.value);
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
        require(balances[msg.sender] >= _bet, "RockPaperScissor.createGame, Not enough wei to do this bet");
        require(_secretHand != bytes32(0), "RockPaperScissor.createGame, Secret Hand not valid");

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

        emit GameChangeStatusLog(newGameID, GameStatus.Created);
        emit GameMetaDataLog(newGameID, game.bet, game.player1, game.player2, game.expirationTime, game.freeBetTime);
        emit PlayerHashMoveLog(game.player1, game.movePlayer1.hashMove, newGameID);

        return newGameID;
    }

 function challangeAccepted(uint _gameID, bytes32 _secretHand) external isGameAvailable(_gameID) onlyIfRunning payable returns(bool){
        GameMetaData memory game = games[_gameID];

        require(_secretHand != bytes32(0), "RockPaperScissor.challangeAccepted, Secret Hand not valid");
        require(balances[msg.sender] >= game.bet, "RockPaperScissor.challangeAccepted, Not enough wei on sender's balance to bet this game");
        require(game.gameStatus == GameStatus.Created, "RockPaperScissor.challangeAccepted, This game is not created yet or challange already accepted");
        require(game.player2 == msg.sender, "RockPaperScissor.challangeAccepted, You must be a declared opponent");

        Move memory movePlayer2 = Move({
            hashMove: _secretHand,
            timestamp: now
        });

        games[_gameID].gameStatus = GameStatus.Bet;
        games[_gameID].movePlayer2 = movePlayer2;

        emit GameChangeStatusLog(_gameID, GameStatus.Bet);
        emit PlayerHashMoveLog(msg.sender, movePlayer2.hashMove, _gameID);

        return true;
    }

    function showHand(uint _gameID, bytes32 _encryptHandKey) external isGameAvailable(_gameID) onlyIfRunning returns(GameStatus, WinStatus){
        require(_encryptHandKey != bytes32(0), "Encrypt Key not valid");

        GameMetaData memory game = games[_gameID];

        require(game.player1==msg.sender || game.player2==msg.sender, "msg.sener is not a player");

        Hand player1Hand = game.handPlayer1;
        Hand player2Hand = game.handPlayer2;
        GameStatus newGameStatus;

        if(game.player1==msg.sender){
            require(game.gameStatus == GameStatus.Bet || game.gameStatus == GameStatus.WaitingP1, "Dismatch Status Game");
            player1Hand = decryptHand(game.movePlayer1.hashMove, _encryptHandKey);
            if(game.gameStatus == GameStatus.Bet){
                newGameStatus = GameStatus.WaitingP2;
            } else {
                newGameStatus = GameStatus.Closed;
            }
            require(player1Hand != Hand.Null, "Incorrect Decrypt key");
            games[_gameID].handPlayer1 = player1Hand;
            emit PlayerShowHandLog(msg.sender, player1Hand, _gameID);
        } else {
            require(game.gameStatus == GameStatus.Bet || game.gameStatus == GameStatus.WaitingP2, "Dismatch Status Game");
            player2Hand = decryptHand(game.movePlayer2.hashMove, _encryptHandKey);
            if(game.gameStatus == GameStatus.Bet){
                newGameStatus = GameStatus.WaitingP1;
            } else {
                newGameStatus = GameStatus.Closed;
            }
            require(player2Hand != Hand.Null, "Incorrect Decrypt key");
            games[_gameID].handPlayer2 = player2Hand;
            emit PlayerShowHandLog(msg.sender, player2Hand, _gameID);
        }

        games[_gameID].gameStatus = newGameStatus;

        WinStatus winStatus;

        if(newGameStatus == GameStatus.Closed){
            winStatus = coreLogic(player1Hand, player2Hand);
            games[_gameID].winStatus = winStatus;
            emit VictoryLog(_gameID, winStatus);
        } 

        emit GameChangeStatusLog(_gameID, newGameStatus);

        return (newGameStatus, winStatus);
    }

    function GameAward(uint _gameID) external isGameAvailable(_gameID) onlyIfRunning returns(bool){
        GameMetaData memory game = games[_gameID];

        require(game.gameStatus == GameStatus.Closed, "Game not over");
        require((game.player1 == msg.sender && game.winStatus == WinStatus.Player1) || (game.player2 == msg.sender && game.winStatus == WinStatus.Player2), "Player 1 address dismatch or Player 1 is not the winner");

        uint penality;
        uint weight = game.bet.div(game.expirationTime.sub(game.freeBetTime)).div(uint(2)); // player2 can lose maximum half of bet

        if(game.winStatus == WinStatus.Player1) {
            balances[game.player1] = balances[game.player1].add(game.bet);
            balances[game.player2] = balances[game.player2].sub(game.bet);
        } else {
            if(game.movePlayer2.timestamp <= game.freeBetTime){
                penality = uint(0);
            } else if(game.freeBetTime < game.movePlayer2.timestamp && game.movePlayer2.timestamp <= game.expirationTime) {
                penality = game.movePlayer2.timestamp.sub(game.freeBetTime);
            } else {
                penality = game.expirationTime.sub(game.freeBetTime);
            }
            penality = penality.mul(weight);
            balances[game.player2] = balances[game.player2].add(game.bet).sub(penality);
            balances[game.player1] = balances[game.player1].sub(game.bet).add(penality);
        }

        emit AwardsLog(msg.sender, game.bet, penality);

        return true;
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

        require(balance != 0, "Remittance.withdrawBalance#001 : Balance can't be equal to 0");

        balances[msg.sender] = uint(0);

        emit WithdrawBalanceLog(msg.sender, balance);

        (success, ) = msg.sender.call{gas: withdrawGasLimit, value : balance}(""); 
        require(success);
    }

    function stopGame(uint _gameID) external isGameAvailable(_gameID) onlyIfRunning returns(bool){
        GameMetaData memory game = games[_gameID];
        require(game.gameStatus != GameStatus.Closed || game.gameStatus != GameStatus.Stopped, "Game already closed or stopped");
        require(game.player1 == msg.sender, "Sender is not a creator");
        games[_gameID].gameStatus = GameStatus.Closed;
        emit GameChangeStatusLog(_gameID, GameStatus.Stopped);
    }

}