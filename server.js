const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const VOTE_INTERVAL = 90000; // 90초

app.use(express.static('public'));

let players = {};
let gameState = {};

// 퀴즈 목록 (기존 7개 + 신규 25개 = 총 32개)
const ALL_MISSIONS = [
    // 기존 문제
    { id: 1, question: "화장실 2번째 칸에 수건은 몇 개 있을까요?", type: "number", answer: "5" },
    { id: 2, question: "뒷 화장실에 휴지는 있을까요?", type: "ox", answer: "O" },
    { id: 3, question: "인하방에 그리스로마신화는 몇 권 있을까요?", type: "number", answer: "9" },
    { id: 4, question: "채하방에 콘센트는 몇 개가 꼽혀져 있을까요?", type: "number", answer: "3" },
    { id: 5, question: "지금 정수기 상태는 무엇인가요?", type: "choice", options: ["온수", "정수", "냉수"], answer: "any" },
    { id: 6, question: "우리 집 화투는 어디에 있나요?", type: "choice", options: ["거실", "부모님 침대", "부엌", "화장실", "인하방"], answer: "부모님 침대" },
    { id: 7, question: "인하방 프린터기 A4용지는 몇 개 있나요?", type: "number", answer: "5" },
    // 수학 문제
    { id: 8, question: "1부터 100까지 모든 수를 더하면 얼마일까요?", type: "number", answer: "5050" },
    { id: 9, question: "정삼각형의 한 내각의 크기는 몇 도일까요?", type: "number", answer: "60" },
    { id: 10, question: "시속 60km로 90분 동안 달리면 총 몇 km를 갈 수 있을까요?", type: "number", answer: "90" },
    { id: 11, question: "원의 둘레를 원의 지름으로 나눈 값을 무엇이라고 할까요?", type: "choice", options: ["파이", "세타", "알파"], answer: "파이" },
    { id: 12, question: "12의 제곱은 무엇일까요?", type: "number", answer: "144" },
    { id: 13, question: "아버지는 45세, 아들은 15세입니다. 아버지의 나이가 아들 나이의 2배가 되는 것은 몇 년 후일까요?", type: "number", answer: "15" },
    { id: 14, question: "1, 2, 3, 5, 8, 13... 이 수열의 이름은 무엇일까요?", type: "choice", options: ["등차수열", "피보나치 수열", "등비수열"], answer: "피보나치 수열" },
    { id: 15, question: "축구공은 정오각형과 정육각형으로 이루어져 있습니다. 이 중 정오각형의 개수는?", type: "number", answer: "12" },
    { id: 16, question: "1.5L 물통의 2/3는 몇 ml일까요?", type: "number", answer: "1000" },
    { id: 17, question: "세 변의 길이가 각각 3, 4, 5인 삼각형은 무슨 삼각형일까요?", type: "choice", options: ["정삼각형", "예각삼각형", "직각삼각형"], answer: "직각삼각형" },
    { id: 18, question: "소수(Prime Number)이면서 동시에 짝수인 유일한 숫자는?", type: "number", answer: "2" },
    { id: 19, question: "1부터 5까지의 숫자를 한 번씩만 사용해 만들 수 있는 다섯 자리 수는 총 몇 개일까요?", type: "number", answer: "120" },
    // 사회/상식 문제
    { id: 20, question: "대한민국의 수도는 어디일까요?", type: "choice", options: ["부산", "인천", "서울"], answer: "서울" },
    { id: 21, question: "조선 시대의 네 번째 왕은 누구일까요?", type: "choice", options: ["태종", "세종대왕", "성종"], answer: "세종대왕" },
    { id: 22, question: "유엔(UN) 본부가 있는 도시는 어디일까요?", type: "choice", options: ["뉴욕", "파리", "런던"], answer: "뉴욕" },
    { id: 23, question: "'생각하는 사람'을 조각한 예술가는 누구일까요?", type: "choice", options: ["미켈란젤로", "로댕", "레오나르도 다 빈치"], answer: "로댕" },
    { id: 24, question: "우리나라의 국보 1호는 무엇일까요?", type: "choice", options: ["첨성대", "숭례문", "훈민정음 해례본"], answer: "숭례문" },
    { id: 25, question: "삼권분립에서 '삼권'에 해당하지 않는 것은?", type: "choice", options: ["입법부", "사법부", "언론"], answer: "언론" },
    { id: 26, question: "셰익스피어의 4대 비극이 아닌 것은?", type: "choice", options: ["햄릿", "오셀로", "로미오와 줄리엣"], answer: "로미오와 줄리엣" },
    { id: 27, question: "컴퓨터의 중앙처리장치를 무엇이라고 부를까요?", type: "choice", options: ["RAM", "GPU", "CPU"], answer: "CPU" },
    { id: 28, question: "우리나라에서 가장 높은 산은?", type: "choice", options: ["지리산", "설악산", "한라산"], answer: "한라산" },
    { id: 29, question: "세계에서 가장 넓은 나라는 어디일까요?", type: "choice", options: ["중국", "러시아", "캐나다"], answer: "러시아" },
    { id: 30, question: "피카소는 어느 나라 화가일까요?", type: "choice", options: ["프랑스", "이탈리아", "스페인"], answer: "스페인" },
    { id: 31, question: "선거의 4대 원칙에 포함되지 않는 것은?", type: "choice", options: ["보통선거", "공개선거", "직접선거"], answer: "공개선거" },
    { id: 32, question: "물은 섭씨 몇 도에서 끓을까요?", type: "number", answer: "100" }
];

function resetGame() {
    if (gameState.voteTimer) clearInterval(gameState.voteTimer);
    gameState = {
        gameStarted: false,
        roles: {},
        alivePlayers: [],
        missions: [],
        voteTimer: null,
        mafiaTarget: null,
        votes: {},
    };
    Object.values(players).forEach(p => p.votedFor = null);
    console.log("Game state has been reset.");
}

function checkWinCondition(context) {
    const aliveRoles = gameState.alivePlayers.map(id => gameState.roles[id]);
    const mayorAlive = aliveRoles.includes('시장');
    const mafiaAlive = aliveRoles.includes('마피아');
    const citizenCount = aliveRoles.filter(role => role === '시민' || role === '시장').length;

    let winner = null;
    let message = "";

    if (!mafiaAlive) {
        winner = '시민';
        message = "마피아가 제거되어 시민 팀이 승리했습니다!";
    } else if (!mayorAlive) {
        winner = '마피아';
        message = "시장이 제거되어 마피아 팀이 승리했습니다!";
    } else if (citizenCount <= 1 && mafiaAlive) { // 마피아와 시민(시장포함)이 1:1이 된 경우
         winner = '마피아';
         message = "시민의 수가 마피아와 같아져 마피아 팀이 승리했습니다!";
    }
    
    if (winner) {
        console.log(`Win condition met by ${context}: ${winner} wins.`)
        io.emit('gameOver', { winner, message });
        resetGame();
        return true;
    }
    return false;
}

function startRound() {
    if (gameState.voteTimer) clearInterval(gameState.voteTimer);
    
    gameState.mafiaTarget = null;
    gameState.votes = {};
    io.emit('newRound', { duration: VOTE_INTERVAL / 1000 });
    console.log("New round started.");

    gameState.voteTimer = setTimeout(processVoting, VOTE_INTERVAL);
}

function processVoting() {
    io.emit('voteStart', gameState.alivePlayers.map(id => players[id]));
    console.log("Voting has started.");
}

function startGame() {
    if (gameState.gameStarted) return;
    resetGame();
    gameState.gameStarted = true;
    
    const playerIds = Object.keys(players);
    gameState.alivePlayers = [...playerIds];

    let roles = ['마피아', '시민', '시민', '시장'];
    roles = roles.sort(() => Math.random() - 0.5);

    playerIds.forEach((id, index) => {
        gameState.roles[id] = roles[index];
    });

    const shuffledMissions = ALL_MISSIONS.sort(() => Math.random() - 0.5);
    gameState.missions = shuffledMissions.slice(0, 7).map(m => ({ ...m, status: 'pending' }));
    
    io.emit('gameStart', {
        roles: gameState.roles,
        missions: gameState.missions.map(({ answer, ...rest }) => rest),
        players: Object.values(players)
    });
    console.log("Game started with roles: ", gameState.roles);
    startRound();
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('login', (name) => {
        if (Object.keys(players).length >= 4) {
            return socket.emit('loginError', '방이 가득 찼습니다.');
        }
        if (Object.values(players).some(p => p.name === name)) {
            return socket.emit('loginError', '이미 사용 중인 이름입니다.');
        }
        players[socket.id] = { id: socket.id, name, alive: true };
        
        // 로그인한 클라이언트에게 성공했다는 신호를 보냄
        socket.emit('loginSuccess');

        io.emit('playerList', Object.values(players));
        
        if (Object.keys(players).length === 4) {
            io.emit('lobbyFull');
            setTimeout(startGame, 5000);
        }
    });
    
    socket.on('submitQuiz', ({ missionId, answer }) => {
        const mission = gameState.missions.find(m => m.id === missionId);
        if (!mission || mission.status !== 'pending') return;

        let isCorrect = (mission.answer === 'any') || (mission.answer.toLowerCase() === answer.toLowerCase());
        
        mission.status = isCorrect ? 'success' : 'failure';
        
        io.emit('missionUpdate', { missionId: mission.id, status: mission.status });
    });
    
    socket.on('setMafiaTarget', (targetId) => {
        if (gameState.roles[socket.id] !== '마피아' || !gameState.alivePlayers.includes(targetId)) return;
        gameState.mafiaTarget = targetId;
        socket.emit('mafiaTargetConfirmed', targetId);
        console.log(`Mafia [${players[socket.id].name}] targeted [${players[targetId].name}]`);
    });

    socket.on('submitVote', (votedId) => {
        if (!gameState.alivePlayers.includes(socket.id)) return;
        gameState.votes[socket.id] = votedId;
        const votedCount = Object.keys(gameState.votes).length;
        const aliveCount = gameState.alivePlayers.length;

        if (votedCount === aliveCount) {
            const voteCounts = {};
            Object.values(gameState.votes).forEach(id => {
                if(id) voteCounts[id] = (voteCounts[id] || 0) + 1;
            });

            let maxVotes = 0;
            let eliminatedId = null;
            for (const id in voteCounts) {
                if (voteCounts[id] > maxVotes) {
                    maxVotes = voteCounts[id];
                    eliminatedId = id;
                }
            }
            
            const tied = Object.values(voteCounts).filter(v => v === maxVotes).length > 1;

            if (eliminatedId && !tied) {
                const eliminatedPlayer = players[eliminatedId];
                eliminatedPlayer.alive = false;
                gameState.alivePlayers = gameState.alivePlayers.filter(id => id !== eliminatedId);
                io.emit('playerDied', { 
                    eliminatedId, 
                    eliminatedName: eliminatedPlayer.name,
                    role: gameState.roles[eliminatedId],
                    method: 'vote'
                });
                console.log(`Player [${eliminatedPlayer.name}] eliminated by vote.`);
                if (checkWinCondition('after vote')) return;
            } else {
                io.emit('voteResult', { message: "투표가 동률이거나 무효 처리되어 아무도 탈락하지 않았습니다." });
            }

            // 마피아 킬 처리
            const mafiaTargetId = gameState.mafiaTarget;
            if (mafiaTargetId && gameState.alivePlayers.includes(mafiaTargetId)) {
                const targetPlayer = players[mafiaTargetId];
                targetPlayer.alive = false;
                gameState.alivePlayers = gameState.alivePlayers.filter(id => id !== mafiaTargetId);
                io.emit('playerDied', {
                    eliminatedId: mafiaTargetId,
                    eliminatedName: targetPlayer.name,
                    role: gameState.roles[mafiaTargetId],
                    method: 'mafia'
                });
                console.log(`Player [${targetPlayer.name}] eliminated by Mafia.`);
                if (checkWinCondition('after mafia kill')) return;
            }
            
            // 모든 처리가 끝나고 다음 라운드 시작
            startRound();
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        const disconnectedPlayer = players[socket.id];
        if (!disconnectedPlayer) return;

        delete players[socket.id];
        
        if (gameState.gameStarted) {
            const wasAlive = gameState.alivePlayers.includes(socket.id);
            gameState.alivePlayers = gameState.alivePlayers.filter(id => id !== socket.id);
            if(wasAlive) {
                 io.emit('playerDied', { 
                    eliminatedId: socket.id, 
                    eliminatedName: disconnectedPlayer.name,
                    message: "연결이 끊겨 탈락했습니다."
                });
                checkWinCondition('after disconnect');
            }
        }
        
        io.emit('playerList', Object.values(players));
        
        if (Object.keys(players).length === 0 && gameState.gameStarted) {
            console.log("All players left. Resetting game.");
            resetGame();
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});