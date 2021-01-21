const RockPaperScissor = artifacts.require("./RockPaperScissor.sol");
const truffleAssert = require("truffle-assertions");

contract("RockPaperScissor", accounts => {
    
    const {soliditySha3, toBN, toWei}       = web3.utils;

    const RUNNING                           = true;
    const WITHDRAW_GAS_LIMIT                = toBN(toWei('2', 'Gwei'));
    const HAND                              = ({NULL:0,ROCK:1,PAPER:2,SCISSOR:3});
    const WIN_STATUS                        = ({NULL:0,PLAYER1:1,PLAYER2:2,PAIR:3});
    const GAME_STATUS                       = ({NULL:0,CREATED:1,BET:2,WAITINGP1:3,WAITINGP2:4,CLOSED:5,STOPPED:6});
    const DEPOSIT_AMOUNT                    = toBN(toWei('1000', 'Gwei'));
    const BET                               = toBN(toWei('100', 'Gwei'));
    const EXPIRATION_TIME                   = 3; //seconds
    const FREE_BET_TIME                     = 1; //seconds
    const ENCRYPT_HAND_KEY                  = ({PLAYER1:soliditySha3("key-player1"),PLAYER2:soliditySha3("key-player2")});
    const PENALITY_RATIO                    = 2;

    let owner, player1, player2, stranger;
    let rockPaperScissor;

    const NULL_BYTES32                      = 0;
    const NULL_ADDRESS                      = 0;

    before("Should Set Accounts", async () => {
        assert.isAtLeast(accounts.length, 4, 'There should be at least 4 accounts to do this test');
        [owner, player1, player2, stranger] = accounts;
    });
    
    beforeEach("New Istance of RockPasperScissor", async () => {
        rockPaperScissor = await RockPaperScissor.new(RUNNING, WITHDRAW_GAS_LIMIT, {from : owner});
    });

    function wait(ms) {
       const date = new Date();
       let curDate = null;
       do {curDate = new Date(); }
       while(curDate-date < ms);
    }
    describe("Init Data", () => {

        it("Player balances have to be null at the begin", async function() {
            assert.strictEqual((await rockPaperScissor.getBalance.call(player1))[0].toString(10), "0"); // --balance
            assert.strictEqual((await rockPaperScissor.getBalance.call(player1))[1].toString(10), "0"); // --locked
            assert.strictEqual((await rockPaperScissor.getBalance.call(player2))[0].toString(10), "0"); // --balance
            assert.strictEqual((await rockPaperScissor.getBalance.call(player2))[1].toString(10), "0"); // --locked
        })
    })

    describe("Unit Testing", () => {
        it("Player Can deposit an amount", async function() {
            const txObj = await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT});
            const balance = (await rockPaperScissor.getBalance.call(player1))[0];
            assert.strictEqual(txObj.logs[0].args.who, player1);
            assert.strictEqual(txObj.logs[0].args.amount.toString(10), DEPOSIT_AMOUNT.toString(10));
            assert.strictEqual(txObj.logs[0].args.amount.toString(10), balance.toString(10));
        });

        it("Encrypt Hand", async function() {
            const encryptHand = await rockPaperScissor.encryptHand(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
            //assert.strictEqual(encryptHand, soliditySha3(player1, HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, rockPaperScissor.address)); --doesn't match
        });

        /*

        To run this test you must put publix the visibility of the function

        it("Decrypt Hand", async function() {
            const encryptHand = await rockPaperScissor.encryptHand(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
            const DecryptHand = await rockPaperScissor.decryptHand(encryptHand, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
            assert.strictEqual(DecryptHand.toString(10), toBN(HAND.ROCK).toString(10)); 
        });

        */

       it("Create Game", async function() {
            assert(await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT}));

            const secretHandP1 = await rockPaperScissor.encryptHand.call(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1}); 
            const txObj = await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1});
            const blockNumber = await web3.eth.getBlockNumber();
            const timestamp = (await web3.eth.getBlock(blockNumber)).timestamp;
            const freeBetTime = timestamp + FREE_BET_TIME;
            const expirationTime = freeBetTime + EXPIRATION_TIME;

            txObj.logs[0].event = "GameChangeStatusLog";
            assert.strictEqual(txObj.logs[0].args.gameID.toString(10), toBN(1).toString(10), "GameID Dismatch"); // --first game
            assert.strictEqual(txObj.logs[0].args.gameStatus.toString(10), toBN(GAME_STATUS.CREATED).toString(10), "GameStatus Dismatch");
            
            txObj.logs[1].event = "GameMetaDataLog";
            assert.strictEqual(txObj.logs[1].args.gameID.toString(10), toBN(1).toString(10), "GameID Dismatch"); // --first game
            assert.strictEqual(txObj.logs[1].args.bet.toString(10), toBN(BET).toString(10), "Bet Dismatch");
            assert.strictEqual(txObj.logs[1].args.player1, player1, "Player1 Dismatch");
            assert.strictEqual(txObj.logs[1].args.player2, player2, "Player2 Dismatch");
            assert.strictEqual(txObj.logs[1].args.expirationTime.toString(10), toBN(expirationTime).toString(10), "ExpirationTime Dismatch");
            assert.strictEqual(txObj.logs[1].args.freeBetTime.toString(10), toBN(freeBetTime).toString(10), "FreeBetTime Dismatch");

            txObj.logs[2].event = "PlayerHashMoveLog";
            assert.strictEqual(txObj.logs[2].args.player, player1, "Player1 Dismatch");
            assert.strictEqual(txObj.logs[2].args.hashMove.toString(10), secretHandP1.toString(10), "SecretHand Dismatch");
            assert.strictEqual(txObj.logs[2].args.gameID.toString(10), toBN(1).toString(10), "GameID Dismatch"); // --first game

            txObj.logs[3].event = "DepositLockedLog";
            assert.strictEqual(txObj.logs[3].args.who, player1, "Player Dismatch");
            assert.strictEqual(txObj.logs[3].args.amount.toString(10), BET.toString(10), "Amount Dismatch");
       });

       it("Matching gameID", async function() {
            assert(await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT}));
            const secretHandP1 = await rockPaperScissor.encryptHand(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1}); 
            const gameID = await rockPaperScissor.createGame.call(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1});
            assert.strictEqual(gameID.toString(10), toBN(1).toString(10), "gameID dismatch");
       });

       it("Challange Accepted", async function() {
            // PLAYER 1 - CREATE GAME
            assert(await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT}));
            const secretHandP1 = await rockPaperScissor.encryptHand.call(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1}); 
            const gameID = (await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1})).logs[0].args.gameID;
            // PLAYER 2 - CHALLANGE ACCEPTED
            assert(await rockPaperScissor.deposit({from : player2, value : DEPOSIT_AMOUNT}));
            const secretHandP2 = await rockPaperScissor.encryptHand.call(HAND.PAPER, ENCRYPT_HAND_KEY.PLAYER2, {from : player2}); 
            const txObj = await rockPaperScissor.challangeAccepted(gameID, secretHandP2, {from : player2});
            // LOG MATCHING
            txObj.logs[0].event = "GameChangeStatusLog";
            assert.strictEqual(txObj.logs[0].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
            assert.strictEqual(txObj.logs[0].args.gameStatus.toString(10), toBN(GAME_STATUS.BET).toString(10), "GameStatus Dismatch");

            txObj.logs[1].event = "PlayerHashMoveLog";
            assert.strictEqual(txObj.logs[1].args.player, player2, "Player2 Dismatch");
            assert.strictEqual(txObj.logs[1].args.hashMove.toString(10), secretHandP2.toString(10), "SecretHand Dismatch");
            assert.strictEqual(txObj.logs[1].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 

            txObj.logs[2].event = "DepositLockedLog";
            assert.strictEqual(txObj.logs[2].args.who, player2, "Player Dismatch");
            assert.strictEqual(txObj.logs[2].args.amount.toString(10), BET.toString(10), "Amount Dismatch");
       });

       it("Show Hand: P1->P2", async function() {
            // PLAYER 1 - CREATE GAME
            assert(await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT}));
            const secretHandP1 = await rockPaperScissor.encryptHand.call(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1}); 
            const gameID = (await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1})).logs[0].args.gameID;
            // PLAYER 2 - CHALLANGE ACCEPTED
            assert(await rockPaperScissor.deposit({from : player2, value : DEPOSIT_AMOUNT}));
            const secretHandP2 = await rockPaperScissor.encryptHand.call(HAND.PAPER, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
            assert(await rockPaperScissor.challangeAccepted(gameID, secretHandP2, {from : player2})); 
            // PLAYER 1 - SHOW HAND
            let txObj = await rockPaperScissor.showHand(gameID, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
            // LOG MATCHING
            txObj.logs[0].event = "PlayerShowHandLog";
            assert.strictEqual(txObj.logs[0].args.player, player1, "player1 Dismatch"); 
            assert.strictEqual(txObj.logs[0].args.hand.toString(10), toBN(HAND.ROCK).toString(10), "PlayerHand Dismatch");
            assert.strictEqual(txObj.logs[0].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch");
            txObj.logs[1].event = "GameChangeStatusLog";
            assert.strictEqual(txObj.logs[1].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
            assert.strictEqual(txObj.logs[1].args.gameStatus.toString(10), toBN(GAME_STATUS.WAITINGP2).toString(10), "GameStatus Dismatch");
            // PLAYER 2 - SHOW HAND
            txObj = await rockPaperScissor.showHand(gameID, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
            // LOG MATCHING
            txObj.logs[0].event = "PlayerShowHandLog";
            assert.strictEqual(txObj.logs[0].args.player, player2, "player2 Dismatch"); 
            assert.strictEqual(txObj.logs[0].args.hand.toString(10), toBN(HAND.PAPER).toString(10), "PlayerHand Dismatch");
            assert.strictEqual(txObj.logs[0].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch");
            txObj.logs[1].event = "VictoryLog";
            assert.strictEqual(txObj.logs[1].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
            assert.strictEqual(txObj.logs[1].args.winStatus.toString(10), toBN(WIN_STATUS.PLAYER2).toString(10), "GameStatus Dismatch"); //P1: ROCK, P2: PAPER
            txObj.logs[2].event = "GameChangeStatusLog";
            assert.strictEqual(txObj.logs[2].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
            assert.strictEqual(txObj.logs[2].args.gameStatus.toString(10), toBN(GAME_STATUS.CLOSED).toString(10), "GameStatus Dismatch");
        });

        it("Show Hand: P2->P1", async function() {
            // PLAYER 1 - CREATE GAME
            assert(await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT}));
            const secretHandP1 = await rockPaperScissor.encryptHand.call(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1}); 
            const gameID = (await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1})).logs[0].args.gameID;
            // PLAYER 2 - CHALLANGE ACCEPTED
            assert(await rockPaperScissor.deposit({from : player2, value : DEPOSIT_AMOUNT}));
            const secretHandP2 = await rockPaperScissor.encryptHand.call(HAND.PAPER, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
            assert(await rockPaperScissor.challangeAccepted(gameID, secretHandP2, {from : player2})); 
            // PLAYER 2- SHOW HAND
            let txObj = await rockPaperScissor.showHand(gameID, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
            // LOG MATCHING
            txObj.logs[0].event = "PlayerShowHandLog";
            assert.strictEqual(txObj.logs[0].args.player, player2, "player2 Dismatch"); 
            assert.strictEqual(txObj.logs[0].args.hand.toString(10), toBN(HAND.PAPER).toString(10), "PlayerHand Dismatch");
            assert.strictEqual(txObj.logs[0].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch");
            txObj.logs[1].event = "GameChangeStatusLog";
            assert.strictEqual(txObj.logs[1].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
            assert.strictEqual(txObj.logs[1].args.gameStatus.toString(10), toBN(GAME_STATUS.WAITINGP1).toString(10), "GameStatus Dismatch");
            // PLAYER 1 - SHOW HAND
            txObj = await rockPaperScissor.showHand(gameID, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
            // LOG MATCHING
            txObj.logs[0].event = "PlayerShowHandLog";
            assert.strictEqual(txObj.logs[0].args.player, player1, "player1 Dismatch"); 
            assert.strictEqual(txObj.logs[0].args.hand.toString(10), toBN(HAND.ROCK).toString(10), "PlayerHand Dismatch");
            assert.strictEqual(txObj.logs[0].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch");
            txObj.logs[1].event = "VictoryLog";
            assert.strictEqual(txObj.logs[1].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
            assert.strictEqual(txObj.logs[1].args.winStatus.toString(10), toBN(WIN_STATUS.PLAYER2).toString(10), "GameStatus Dismatch"); //P1: ROCK, P2: PAPER
            txObj.logs[2].event = "GameChangeStatusLog";
            assert.strictEqual(txObj.logs[2].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
            assert.strictEqual(txObj.logs[2].args.gameStatus.toString(10), toBN(GAME_STATUS.CLOSED).toString(10), "GameStatus Dismatch");
        });

        /*
        -- To run this test make coreLogic Function public.

        const handArray = [HAND.NULL, HAND.ROCK, HAND.PAPER, HAND.SCISSOR];
        handArray.forEach(player1Hand => {
            handArray.forEach(player2Hand => {
                it("Test Core Logic: HandP1: " + player1Hand + " HandP2: " + player2Hand , async function() {
                    let predictedResult;
                    if(player1Hand == player2Hand) predictedResult = WIN_STATUS.PAIR;
                    if(player1Hand == HAND.ROCK && player2Hand == HAND.SCISSOR) predictedResult = WIN_STATUS.PLAYER1;
                    if(player1Hand == HAND.ROCK && player2Hand == HAND.PAPER) predictedResult = WIN_STATUS.PLAYER2;
                    if(player1Hand == HAND.SCISSOR && player2Hand == HAND.ROCK) predictedResult = WIN_STATUS.PLAYER2;
                    if(player1Hand == HAND.SCISSOR && player2Hand == HAND.PAPER) predictedResult = WIN_STATUS.PLAYER1;
                    if(player1Hand == HAND.PAPER && player2Hand == HAND.ROCK) predictedResult = WIN_STATUS.PLAYER1;
                    if(player1Hand == HAND.PAPER && player2Hand == HAND.SCISSOR) predictedResult = WIN_STATUS.PLAYER2;
                    if(player1Hand == HAND.NULL || player2Hand == HAND.NULL) predictedResult = WIN_STATUS.NULL;
                    console.log(predictedResult);
                    //assert.strictEqual(toBN(predictedResult).toString(10), (await rockPaperScissor.coreLogic.call(player1Hand, player2Hand)).toString(10), "CoreLog Dismatch"); 
                })
            })
        })

        */

       it("GameAward -> P1 WIN. Example: P1: ROCK, P2 = SCISSOR", async function() {
        // PLAYER 1 - CREATE GAME
        assert(await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT}));
        const secretHandP1 = await rockPaperScissor.encryptHand.call(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1}); 
        const gameID = (await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1})).logs[0].args.gameID;
        // PLAYER 2 - CHALLANGE ACCEPTED
        assert(await rockPaperScissor.deposit({from : player2, value : DEPOSIT_AMOUNT}));
        const secretHandP2 = await rockPaperScissor.encryptHand.call(HAND.SCISSOR, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
        assert(await rockPaperScissor.challangeAccepted(gameID, secretHandP2, {from : player2})); 
        // PLAYER 1 - SHOW HAND
        await rockPaperScissor.showHand(gameID, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
        // PLAYER 2 - SHOW HAND
        const showHandP2 = await rockPaperScissor.showHand(gameID, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
        const winner = showHandP2.logs[1].args.winStatus;
        assert.strictEqual(winner.toString(10), WIN_STATUS.PLAYER1.toString(10), "Player1 must win in this case");
        // PLAYER 1 TAKE THE AWARD
        const oldBalance = (await rockPaperScissor.getBalance.call(player1))[0];
        const txObj = await rockPaperScissor.GameAward(gameID, {from : player1});
        const newBalance = (await rockPaperScissor.getBalance.call(player1))[0];
        assert.strictEqual(toBN(newBalance).sub(toBN(oldBalance)).toString(10), toBN(BET).toString(10));
        // LOG MATCHING
        txObj.logs[0].event = "AwardsLog";
        assert.strictEqual(txObj.logs[0].args.who, player1, "player1 Dismatch"); 
        assert.strictEqual(txObj.logs[0].args.amount.toString(10), BET.toString(10), "Amount Dismatch");
        assert.strictEqual(txObj.logs[0].args.penality.toString(10), "0", "Penality Dismatch");
        txObj.logs[1].event = "GameChangeStatusLog";
        assert.strictEqual(txObj.logs[1].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
        assert.strictEqual(txObj.logs[1].args.gameStatus.toString(10), toBN(GAME_STATUS.STOPPED).toString(10), "GameStatus Dismatch");
        txObj.logs[2].event = "DepositLockedLog";
        assert.strictEqual(txObj.logs[2].args.who, player1, "Player Dismatch");
        assert.strictEqual(txObj.logs[2].args.amount.toString(10), (await rockPaperScissor.getBalance.call(player1))[1].toString(10), "Amount Dismatch");
        txObj.logs[3].event = "DepositLockedLog";
        assert.strictEqual(txObj.logs[3].args.who, player2, "Player Dismatch");
        assert.strictEqual(txObj.logs[3].args.amount.toString(10), (await rockPaperScissor.getBalance.call(player2))[1].toString(10), "Amount Dismatch");
    });
    
    it("GameAward -> P2 WIN with no penality. Example: P1: ROCK, P2 = PAPER", async function() {
        // PLAYER 1 - CREATE GAME
        assert(await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT}));
        const secretHandP1 = await rockPaperScissor.encryptHand.call(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
        const createGame = await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1});
        const gameID = createGame.logs[0].args.gameID;
        const blockNumberP1 = await web3.eth.getBlockNumber();
        const timestampP1 = (await web3.eth.getBlock(blockNumberP1)).timestamp;
        const freeBetTime = timestampP1 + FREE_BET_TIME;
        const expirationTime = freeBetTime + EXPIRATION_TIME;
        // PLAYER 2 - CHALLANGE ACCEPTED
        assert(await rockPaperScissor.deposit({from : player2, value : DEPOSIT_AMOUNT}));
        const secretHandP2 = await rockPaperScissor.encryptHand.call(HAND.PAPER, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
        await rockPaperScissor.challangeAccepted(gameID, secretHandP2, {from : player2});
        const blockNumberP2 = await web3.eth.getBlockNumber();
        const timestampP2 = (await web3.eth.getBlock(blockNumberP2)).timestamp;
        // PLAYER 1 - SHOW HAND
        await rockPaperScissor.showHand(gameID, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
        // PLAYER 2 - SHOW HAND
        const showHandP2 = await rockPaperScissor.showHand(gameID, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
        const winner = showHandP2.logs[1].args.winStatus;
        assert.strictEqual(winner.toString(10), WIN_STATUS.PLAYER2.toString(10), "Player2 must win in this case");
        // PLAYER 2 TAKE THE AWARD
        const oldBalance = (await rockPaperScissor.getBalance.call(player2))[0];
        const txObj = await rockPaperScissor.GameAward(gameID, {from : player2});
        const newBalance = (await rockPaperScissor.getBalance.call(player2))[0];
        assert.strictEqual((toBN(newBalance).sub(toBN(oldBalance))).toString(10), BET.toString(10));
        // DEFINING NULL PENALITY
        assert(timestampP2 <= freeBetTime);
        // LOG MATCHING
        txObj.logs[0].event = "AwardsLog";
        assert.strictEqual(txObj.logs[0].args.who, player2, "player1 Dismatch"); 
        assert.strictEqual(txObj.logs[0].args.amount.toString(10), BET.toString(10), "Amount Dismatch");
        assert.strictEqual(txObj.logs[0].args.penality.toString(10), "0", "Penality Dismatch");
        assert.strictEqual(toBN(newBalance).sub(toBN(oldBalance)).toString(10), toBN(BET).toString(10));
        txObj.logs[1].event = "GameChangeStatusLog";
        assert.strictEqual(txObj.logs[1].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
        assert.strictEqual(txObj.logs[1].args.gameStatus.toString(10), toBN(GAME_STATUS.STOPPED).toString(10), "GameStatus Dismatch");
        txObj.logs[2].event = "DepositLockedLog";
        assert.strictEqual(txObj.logs[2].args.who, player1, "Player Dismatch");
        assert.strictEqual(txObj.logs[2].args.amount.toString(10), (await rockPaperScissor.getBalance.call(player1))[1].toString(10), "Amount Dismatch");
        txObj.logs[3].event = "DepositLockedLog";
        assert.strictEqual(txObj.logs[3].args.who, player2, "Player Dismatch");
        assert.strictEqual(txObj.logs[3].args.amount.toString(10), (await rockPaperScissor.getBalance.call(player2))[1].toString(10), "Amount Dismatch");
    });

    it("GameAward -> P2 WIN with partial penality. Example: P1: ROCK, P2 = PAPER", async function() {
        // PLAYER 1 - CREATE GAME
        assert(await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT}));
        const secretHandP1 = await rockPaperScissor.encryptHand.call(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
        const createGame = await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1});
        const gameID = createGame.logs[0].args.gameID;
        const blockNumberP1 = await web3.eth.getBlockNumber();
        const timestampP1 = (await web3.eth.getBlock(blockNumberP1)).timestamp;
        const freeBetTime = timestampP1 + FREE_BET_TIME;
        const expirationTime = freeBetTime + EXPIRATION_TIME;
        // PLAYER 2 WAIT
        wait(2000); //2 seconds
        // PLAYER 2 - CHALLANGE ACCEPTED
        assert(await rockPaperScissor.deposit({from : player2, value : DEPOSIT_AMOUNT}));
        const secretHandP2 = await rockPaperScissor.encryptHand.call(HAND.PAPER, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
        await rockPaperScissor.challangeAccepted(gameID, secretHandP2, {from : player2});
        const blockNumberP2 = await web3.eth.getBlockNumber();
        const timestampP2 = (await web3.eth.getBlock(blockNumberP2)).timestamp;
        // PLAYER 1 - SHOW HAND
        await rockPaperScissor.showHand(gameID, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
        // PLAYER 2 - SHOW HAND
        const showHandP2 = await rockPaperScissor.showHand(gameID, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
        const winner = showHandP2.logs[1].args.winStatus;
        assert.strictEqual(winner.toString(10), WIN_STATUS.PLAYER2.toString(10), "Player2 must win in this case");
        // PLAYER 2 TAKE THE AWARD
        const oldBalance = (await rockPaperScissor.getBalance.call(player2))[0];
        const txObj = await rockPaperScissor.GameAward(gameID, {from : player2});
        const newBalance = (await rockPaperScissor.getBalance.call(player2))[0];
        // DEFINING PENALITY
        assert((freeBetTime < timestampP2) && (timestampP2 <= expirationTime));
        const weight = toBN(Math.floor((BET / (expirationTime - freeBetTime)) / PENALITY_RATIO)); //expirationTime > freeBetTime, always
        const penality = (timestampP2 - freeBetTime) * weight;
        // LOG MATCHING
        txObj.logs[0].event = "AwardsLog";
        assert.strictEqual(txObj.logs[0].args.who, player2, "player1 Dismatch"); 
        assert.strictEqual(txObj.logs[0].args.amount.toString(10), BET.toString(10), "Amount Dismatch");
        assert.strictEqual(txObj.logs[0].args.penality.toString(10), penality.toString(10), "Penality Dismatch");
        assert.strictEqual((toBN(newBalance).sub(toBN(oldBalance))).toString(10), toBN(BET).sub(toBN(penality)).toString(10));
        txObj.logs[1].event = "GameChangeStatusLog";
        assert.strictEqual(txObj.logs[1].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
        assert.strictEqual(txObj.logs[1].args.gameStatus.toString(10), toBN(GAME_STATUS.STOPPED).toString(10), "GameStatus Dismatch");
    });

    it("GameAward -> P2 WIN with full penality. Example: P1: ROCK, P2 = PAPER", async function() {
        // PLAYER 1 - CREATE GAME
        assert(await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT}));
        const secretHandP1 = await rockPaperScissor.encryptHand.call(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
        const createGame = await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1});
        const gameID = createGame.logs[0].args.gameID;
        const blockNumberP1 = await web3.eth.getBlockNumber();
        const timestampP1 = (await web3.eth.getBlock(blockNumberP1)).timestamp;
        const freeBetTime = timestampP1 + FREE_BET_TIME;
        const expirationTime = freeBetTime + EXPIRATION_TIME;
        // PLAYER 2 WAIT
        wait(5000); //5 seconds
        // PLAYER 2 - CHALLANGE ACCEPTED
        assert(await rockPaperScissor.deposit({from : player2, value : DEPOSIT_AMOUNT}));
        const secretHandP2 = await rockPaperScissor.encryptHand.call(HAND.PAPER, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
        await rockPaperScissor.challangeAccepted(gameID, secretHandP2, {from : player2});
        const blockNumberP2 = await web3.eth.getBlockNumber();
        const timestampP2 = (await web3.eth.getBlock(blockNumberP2)).timestamp;
        // PLAYER 1 - SHOW HAND
        await rockPaperScissor.showHand(gameID, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
        // PLAYER 2 - SHOW HAND
        const showHandP2 = await rockPaperScissor.showHand(gameID, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
        const winner = showHandP2.logs[1].args.winStatus;
        assert.strictEqual(winner.toString(10), WIN_STATUS.PLAYER2.toString(10), "Player2 must win in this case");
        // PLAYER 2 TAKE THE AWARD
        const oldBalance = (await rockPaperScissor.getBalance.call(player2))[0];
        const txObj = await rockPaperScissor.GameAward(gameID, {from : player2});
        const newBalance = (await rockPaperScissor.getBalance.call(player2))[0];
        // DEFINING PENALITY
        assert((expirationTime < timestampP2));
        const weight = toBN(Math.floor((BET / (expirationTime - freeBetTime)) / PENALITY_RATIO));
        const penality = (expirationTime - freeBetTime) * weight;
        // LOG MATCHING
        txObj.logs[0].event = "AwardsLog";
        assert.strictEqual(txObj.logs[0].args.who, player2, "player1 Dismatch"); 
        assert.strictEqual(txObj.logs[0].args.amount.toString(10), BET.toString(10), "Amount Dismatch");
        assert.strictEqual(txObj.logs[0].args.penality.toString(10), penality.toString(10), "Penality Dismatch");
        assert.strictEqual((toBN(newBalance).sub(toBN(oldBalance))).toString(10), toBN(BET).sub(toBN(penality)).toString(10));
        txObj.logs[1].event = "GameChangeStatusLog";
        assert.strictEqual(txObj.logs[1].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
        assert.strictEqual(txObj.logs[1].args.gameStatus.toString(10), toBN(GAME_STATUS.STOPPED).toString(10), "GameStatus Dismatch");
    });

    it("Game Stop - GameStatus: Created", async function() {
        // PLAYER 1 - CREATE GAME
        assert(await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT}));
        const secretHandP1 = await rockPaperScissor.encryptHand.call(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
        const createGame = await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1});
        const gameID = createGame.logs[0].args.gameID;
        wait(5000) //game expired
        const txObj = await rockPaperScissor.stopGame(gameID, {from : player1});
        
        // LOG MATCHING
        txObj.logs[0].event = "GameChangeStatusLog";
        assert.strictEqual(txObj.logs[0].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
        assert.strictEqual(txObj.logs[0].args.gameStatus.toString(10), toBN(GAME_STATUS.STOPPED).toString(10), "GameStatus Dismatch");
        txObj.logs[1].event = "DepositLockedLog";
        assert.strictEqual(txObj.logs[1].args.who, player1, "Player Dismatch");
        assert.strictEqual(txObj.logs[1].args.amount.toString(10), (await rockPaperScissor.getBalance.call(player2))[1].toString(10), "Amount Dismatch");
    });

    it("Game Stop - GameStatus: Bet", async function() {
        // PLAYER 1 - CREATE GAME
        assert(await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT}));
        const secretHandP1 = await rockPaperScissor.encryptHand.call(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
        const createGame = await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1});
        const gameID = createGame.logs[0].args.gameID;
        // PLAYER 2 - CHALLANGE ACCEPTED
        assert(await rockPaperScissor.deposit({from : player2, value : DEPOSIT_AMOUNT}));
        const secretHandP2 = await rockPaperScissor.encryptHand.call(HAND.PAPER, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
        await rockPaperScissor.challangeAccepted(gameID, secretHandP2, {from : player2});
        wait(5000) //game expired
        const txObj = await rockPaperScissor.stopGame(gameID, {from : player1});
        
        // LOG MATCHING
        txObj.logs[0].event = "GameChangeStatusLog";
        assert.strictEqual(txObj.logs[0].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
        assert.strictEqual(txObj.logs[0].args.gameStatus.toString(10), toBN(GAME_STATUS.STOPPED).toString(10), "GameStatus Dismatch");

        txObj.logs[1].event = "DepositLockedLog";
        assert.strictEqual(txObj.logs[1].args.who, player1, "Player Dismatch");
        assert.strictEqual(txObj.logs[1].args.amount.toString(10), (await rockPaperScissor.getBalance.call(player1))[1].toString(10), "Amount Dismatch");

        txObj.logs[2].event = "DepositLockedLog";
        assert.strictEqual(txObj.logs[2].args.who, player2, "Player Dismatch");
        assert.strictEqual(txObj.logs[2].args.amount.toString(10), (await rockPaperScissor.getBalance.call(player2))[1].toString(10), "Amount Dismatch");
    });

    it("Game Stop - GameStatus: WaitingP2 (from p1)", async function() {
        // PLAYER 1 - CREATE GAME
        assert(await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT}));
        const secretHandP1 = await rockPaperScissor.encryptHand.call(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
        const createGame = await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1});
        const gameID = createGame.logs[0].args.gameID;
        // PLAYER 2 - CHALLANGE ACCEPTED
        assert(await rockPaperScissor.deposit({from : player2, value : DEPOSIT_AMOUNT}));
        const secretHandP2 = await rockPaperScissor.encryptHand.call(HAND.PAPER, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
        await rockPaperScissor.challangeAccepted(gameID, secretHandP2, {from : player2});
         // PLAYER 1 - SHOW HAND
        await rockPaperScissor.showHand(gameID, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
        wait(5000) //game expired
        const txObj = await rockPaperScissor.stopGame(gameID, {from : player1});
        
        // LOG MATCHING
        txObj.logs[0].event = "GameChangeStatusLog";
        assert.strictEqual(txObj.logs[0].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
        assert.strictEqual(txObj.logs[0].args.gameStatus.toString(10), toBN(GAME_STATUS.STOPPED).toString(10), "GameStatus Dismatch");

        txObj.logs[1].event = "DepositLockedLog";
        assert.strictEqual(txObj.logs[1].args.who, player1, "Player Dismatch");
        assert.strictEqual(txObj.logs[1].args.amount.toString(10), (await rockPaperScissor.getBalance.call(player1))[1].toString(10), "Amount Dismatch");

        txObj.logs[2].event = "DepositLockedLog";
        assert.strictEqual(txObj.logs[2].args.who, player2, "Player Dismatch");
        assert.strictEqual(txObj.logs[2].args.amount.toString(10), (await rockPaperScissor.getBalance.call(player2))[1].toString(10), "Amount Dismatch");
    });

    it("Game Stop - GameStatus: WaitingP1 (from p2)", async function() {
        // PLAYER 1 - CREATE GAME
        assert(await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT}));
        const secretHandP1 = await rockPaperScissor.encryptHand.call(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
        const createGame = await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1});
        const gameID = createGame.logs[0].args.gameID;
        // PLAYER 2 - CHALLANGE ACCEPTED
        assert(await rockPaperScissor.deposit({from : player2, value : DEPOSIT_AMOUNT}));
        const secretHandP2 = await rockPaperScissor.encryptHand.call(HAND.PAPER, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
        await rockPaperScissor.challangeAccepted(gameID, secretHandP2, {from : player2});
         // PLAYER 2 - SHOW HAND
        await rockPaperScissor.showHand(gameID, ENCRYPT_HAND_KEY.PLAYER2, {from : player2});
        wait(5000) //game expired
        const txObj = await rockPaperScissor.stopGame(gameID, {from : player2});
        
        // LOG MATCHING
        txObj.logs[0].event = "GameChangeStatusLog";
        assert.strictEqual(txObj.logs[0].args.gameID.toString(10), gameID.toString(10), "GameID Dismatch"); 
        assert.strictEqual(txObj.logs[0].args.gameStatus.toString(10), toBN(GAME_STATUS.STOPPED).toString(10), "GameStatus Dismatch");

        txObj.logs[1].event = "DepositLockedLog";
        assert.strictEqual(txObj.logs[1].args.who, player1, "Player Dismatch");
        assert.strictEqual(txObj.logs[1].args.amount.toString(10), (await rockPaperScissor.getBalance.call(player1))[1].toString(10), "Amount Dismatch");

        txObj.logs[2].event = "DepositLockedLog";
        assert.strictEqual(txObj.logs[2].args.who, player2, "Player Dismatch");
        assert.strictEqual(txObj.logs[2].args.amount.toString(10), (await rockPaperScissor.getBalance.call(player2))[1].toString(10), "Amount Dismatch");
    });

    });

    describe("#Requirements Unit Tests - Fail Cases", () => {
       
        describe("#EncryptHand", () => {

            it("RockPaperScissor.encryptHand, Hand can't be null or 0", async function() {
                let r = false;
                try{
                    await rockPaperScissor.encryptHand(HAND.NULL, ENCRYPT_HAND_KEY.PLAYER1, {from : player1}); // --error
                } catch(e) {
                    r = true; /*console.log(e); */
                } finally {
                    assert(r); 
                }            
            });

            it("RockPaperScissor.encryptHand, Hand can't be null or 0", async function() {
                let r = false;
                try{
                    await rockPaperScissor.encryptHand(HAND.ROCK, NULL_BYTES32, {from : player1}); // --error
                } catch(e) {
                    r = true; /*console.log(e); */
                } finally {
                    assert(r); 
                }             
            });

        });

        describe("#Deposit", () => {

            it("RockPaperScissor.deposit, Address can't be null", async function() {
                let r = false;
                try{
                    await rockPaperScissor.deposit({from : NULL_ADDRESS, value : DEPOSIT_AMOUNT}); // --error
                    assert(false);
                } catch(e) {
                    r = true; /*console.log(e); */
                } finally {
                    assert(r); 
                }             
            });

            it("RockPaperScissor.deposit, msg.value has to be greater than 0", async function() {
                try{
                    await rockPaperScissor.deposit({from : player1, value : 0}); // --error
                    assert(false);
                } catch(e) {
                    assert.strictEqual("RockPaperScissor.deposit, msg.value has to be greater than 0", e.reason)
                }           
            });

        });


        describe("#createGame", () => {

            it("RockPaperScissor.createGame, Sender can't be null", async function() {
                let r = false;
                try{
                    await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : NULL_ADDRESS}); // --error
                } catch(e) {
                    r = true; /*console.log(e); */
                } finally {
                    assert(r); 
                }             
            });

            it("RockPaperScissor.createGame, Opponent can't be null", async function() {
                let r = false;
                try{
                    await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT});
                    const secretHandP1 = await rockPaperScissor.encryptHand(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
                    await rockPaperScissor.createGame(NULL_ADDRESS, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1}); // --error
                } catch(e) {
                    r = true; /*console.log(e); */
                } finally {
                    assert(r); 
                }             
            });

            it("RockPaperScissor.createGame, Sender can't be the opponent", async function() {
                try{
                    await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT});
                    const secretHandP1 = await rockPaperScissor.encryptHand(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
                    await rockPaperScissor.createGame(player1, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1}); // --error
                    assert(false);
                } catch(e) {
                    assert.strictEqual("RockPaperScissor.createGame, Sender can't be the opponent", e.reason)
                }           
            });

            it("RockPaperScissor.createGame, Not enough wei to do this bet", async function() {
                try{
                    const secretHandP1 = await rockPaperScissor.encryptHand(HAND.ROCK, ENCRYPT_HAND_KEY.PLAYER1, {from : player1});
                    await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, secretHandP1, {from : player1}); // --error
                    assert(false);
                } catch(e) {
                    assert.strictEqual("RockPaperScissor.createGame, Not enough wei to do this bet", e.reason)
                }           
            });

            it("RockPaperScissor.createGame, Secret Hand not valid", async function() {
                let r = false;
                try{
                    await rockPaperScissor.deposit({from : player1, value : DEPOSIT_AMOUNT});
                    await rockPaperScissor.createGame(player2, BET, EXPIRATION_TIME, FREE_BET_TIME, NULL_BYTES32, {from : player1}); // --error
                } catch(e) {
                    r = true; /*console.log(e); */
                } finally {
                    assert(r); 
                }             
            });

            //TO BE FINISHED WITH ALL FAIL CASES
        });

       
    });

});