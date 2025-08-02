const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const ROUND_DURATION = 120; // 라운드 시간 (초)

app.use(express.static(__dirname + '/public'));

let players = {}; 
let gameState = {}; 

function initializeBots() {
    players = {}; 
    for (let i = 1; i <= 3; i++) {
        const botId = `bot_${i}`;
        players[botId] = { id: botId, name: `봇${i}`, isBot: true, alive: true, role: null };
    }
    console.log("Initialized with 3 bots.");
}

const ALL_MISSIONS = [
    { id: 1, question: "거실에 있는 스피커의 브랜드는 무엇일까요?", type: "choice", options: ["Marshall", "JBL", "Bose"], answer: "Marshall" },
    { id: 2, question: "현관문 비밀번호에 숫자 0은 포함될까요?", type: "ox", answer: "X" },
    { id: 3, question: "인하방에 있는 가장 큰 곰인형의 색깔은?", type: "choice", options: ["흰색", "갈색", "분홍색"], answer: "흰색" },
    { id: 4, question: "부엌에 있는 식탁 의자는 총 몇 개일까요?", type: "number", answer: "4" },
    { id: 5, question: "지금 정수기 상태는 무엇인가요?", type: "choice", options: ["온수", "정수", "냉수"], answer: "any" },
    { id: 6, question: "우리 집 화투는 어디에 있나요?", type: "choice", options: ["거실장", "부모님 침대", "신발장"], answer: "부모님 침대" },
    { id: 7, question: "인하방 프린터기 A4용지는 몇 개 있나요?", type: "number", answer: "5" },
    { id: 8, question: "1부터 100까지 모든 수를 더하면 얼마일까요?", type: "number", answer: "5050" },
    { id: 9, question: "정삼각형의 한 내각의 크기는 몇 도일까요?", type: "number", answer: "60" },
    { id: 10, question: "시속 60km로 90분 동안 달리면 총 몇 km를 갈 수 있을까요?", type: "number", answer: "90" },
    { id: 11, question: "원의 둘레를 원의 지름으로 나눈 값을 무엇이라고 할까요?", type: "choice", options: ["파이", "세타", "알파"], answer: "파이" },
    { id: 12, question: "12의 제곱은 무엇일까요?", type: "number", answer: "144" },
    { id: 13, question: "대한민국의 수도는 어디일까요?", type: "choice", options: ["부산", "인천", "서울"], answer: "서울" },
    { id: 14, question: "조선 시대의 네 번째 왕은 누구일까요?", type: "choice", options: ["태종", "세종대왕", "성종"], answer: "세종대왕" },
    { id: 15, question: "'생각하는 사람'을 조각한 예술가는 누구일까요?", type: "choice", options: ["미켈란젤로", "로댕", "레오나르도 다 빈치"], answer: "로댕" },
    { id: 16, question: "우리나라의 국보 1호는 무엇일까요?", type: "choice", options: ["첨성대", "숭례문", "훈민정음 해례본"], answer: "숭례문" },
    { id: 17, question: "컴퓨터의 중앙처리장치를 무엇이라고 부를까요?", type: "choice", options: ["RAM", "GPU", "CPU"], answer: "CPU" },
    { id: 18, question: "우리나라에서 가장 높은 산은?", type: "choice", options: ["지리산", "설악산", "한라산"], answer: "한라산" },
    { id: 19, question: "세계에서 가장 넓은 나라는 어디일까요?", type: "choice", options: ["중국", "러시아", "캐나다"], answer: "러시아" },
    { id: 20, question: "물은 섭씨 몇 도에서 끓을까요?", type: "number", answer: "100" },
    { id: 21, question: "태양계의 행성 중 가장 큰 것은?", type: "choice", options: ["지구", "목성", "토성"], answer: "목성" },
    { id: 22, question: "셰익스피어의 4대 비극이 아닌 것은?", type: "choice", options: ["햄릿", "오셀로", "로미오와 줄리엣"], answer: "로미오와 줄리엣" },
    { id: 23, question: "거북선을 만든 장군의 이름은?", type: "choice", options: ["강감찬", "을지문덕", "이순신"], answer: "이순신" },
    { id: 24, question: "빛의 3원색에 해당하지 않는 것은?", type: "choice", options: ["빨강", "노랑", "파랑"], answer: "노랑" },
    { id: 25, question: "미국의 초대 대통령은 누구일까요?", type: "choice", options: ["링컨", "워싱턴", "루스벨트"], answer: "워싱턴" },
    { id: 26, question: "지구의 자매 행성이라고도 불리는 행성은?", type: "choice", options: ["화성", "수성", "금성"], answer: "금성" },
    { id: 27, question: "축구 경기에서 한 팀의 선수는 총 몇 명일까요?", type: "number", answer: "11" },
    { id: 28, question: "모나리자를 그린 화가는?", type: "choice", options: ["반 고흐", "피카소", "레오나르도 다 빈치"], answer: "레오나르도 다 빈치" },
    { id: 29, question: "세상에서 가장 깊은 바다는?", type: "choice", options: ["태평양", "대서양", "인도양"], answer: "태평양" },
    { id: 30, question: "1년은 총 몇 주일까요?", type: "number", answer: "52" },
];

function resetGame() {
    clearTimeout(gameState.timer);
    clearInterval(gameState.interval);
    clearInterval(gameState.botQuizInterval);
    gameState = {
        isStarted: false, round: 0, timer: null, interval: null, botQuizInterval: null,
        roles: {}, missions: [], missionSuccessRate: 0,
        abilityActions: { mafia: null, police: null, chatterbox: null },
        revealedRoles: {}, chatterboxUsed: false,
    };
    Object.values(players).forEach(p => {
        p.alive = true; p.votedFor = null;
    });
    console.log("--- Game State Reset ---");
}

function calculateMissionSuccessRate() {
    if (!gameState.missions || gameState.missions.length === 0) return 0;
    const totalMissions = gameState.missions.length;
    const successMissions = gameState.missions.filter(m => m.status === 'success').length;
    return (successMissions / totalMissions) * 100;
}

function broadcastGameState() {
    gameState.missionSuccessRate = calculateMissionSuccessRate();
    const publicGameState = {
        isStarted: gameState.isStarted, round: gameState.round,
        missions: gameState.missions, missionSuccessRate: gameState.missionSuccessRate,
        revealedRoles: gameState.revealedRoles, chatterboxUsed: gameState.chatterboxUsed,
        players: Object.values(players).map(({ socket, ...rest }) => rest)
    };
    io.emit('gameStateUpdate', publicGameState);
}

function startGame() {
    resetGame();
    gameState.isStarted = true;
    gameState.missions = ALL_MISSIONS.map(m => ({ ...m, status: 'pending', solver: null }));
    
    const playerIds = Object.keys(players);
    let roles = ['마피아', '경찰', '수다쟁이', '시민', '시민', '시민', '시민'];
    roles = roles.sort(() => Math.random() - 0.5);

    playerIds.forEach((id, index) => {
        gameState.roles[id] = roles[index];
        players[id].role = roles[index];
    });

    playerIds.forEach(id => {
        if(players[id].socket) {
            players[id].socket.emit('roleInfo', { role: players[id].role });
        }
    });

    startNewRound();
}

function startNewRound() {
    gameState.round++;
    gameState.abilityActions = { mafia: null, police: null, chatterbox: null };
    Object.values(players).forEach(p => p.votedFor = null);

    clearInterval(gameState.botQuizInterval);
    gameState.botQuizInterval = setInterval(handleBotQuizCycle, 10000);

    setRoundTimer(ROUND_DURATION, startVotePhase);
    broadcastGameState();
}

function startVotePhase() {
    clearInterval(gameState.botQuizInterval);
    io.emit('voteStart');

    Object.values(players).filter(p => p.isBot && p.alive).forEach(bot => {
        setTimeout(() => {
            const alivePlayers = Object.values(players).filter(p => p.alive && p.id !== bot.id);
            if (alivePlayers.length > 0) {
                const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
                handleVote({ voterId: bot.id, targetId: target.id });
            }
        }, Math.random() * 5000);
    });
}

function processRoundResolution() {
    let resolutionEvents = [];
    const { mafia, police, chatterbox } = gameState.abilityActions;

    // 투표 집계
    const voteCounts = {};
    Object.values(players).filter(p => p.alive).forEach(p => {
        if(p.votedFor) { voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1; }
    });
    let maxVotes = 0, eliminatedId = null, isTied = false;
    for (const id in voteCounts) {
        if (voteCounts[id] > maxVotes) {
            maxVotes = voteCounts[id];
            eliminatedId = id;
            isTied = false;
        } else if (voteCounts[id] === maxVotes) { isTied = true; }
    }
    if (eliminatedId && !isTied) {
        players[eliminatedId].alive = false;
        resolutionEvents.push(`투표 결과, ${players[eliminatedId].name}님이 탈락했습니다.`);
    } else {
        resolutionEvents.push("투표가 무효 처리되어 아무도 탈락하지 않았습니다.");
    }
    if(checkWinCondition()) return;

    // 능력 처리
    if (chatterbox && !gameState.chatterboxUsed) {
        gameState.chatterboxUsed = true;
        const targetPlayer = players[chatterbox];
        if (targetPlayer) {
            gameState.revealedRoles[chatterbox] = targetPlayer.role;
            resolutionEvents.push(`수다쟁이가 ${targetPlayer.name}님의 정체를 밝혔습니다. 그의 직업은 [${targetPlayer.role}] 입니다!`);
        }
    }
    if (mafia) {
        if (gameState.missionSuccessRate >= 90) {
            resolutionEvents.push("미션 성공률이 90% 이상이어서 마피아의 능력이 실패했습니다.");
        } else if (players[mafia]?.role === '마피아') {
            resolutionEvents.push(`마피아는 다른 마피아를 공격할 수 없습니다.`);
        } else if (police === mafia) {
            resolutionEvents.push(`경찰이 마피아의 목표(${players[mafia].name})를 보호하여 암살이 실패했습니다.`);
        } else {
            const targetPlayer = players[mafia];
            if (targetPlayer && targetPlayer.alive) {
                targetPlayer.alive = false;
                resolutionEvents.push(`${targetPlayer.name}님이 처참한 모습으로 발견되었습니다.`);
            }
        }
    }
    
    io.emit('roundResult', { events: resolutionEvents });
    if (checkWinCondition()) return;

    setTimeout(startNewRound, 5000);
}

function handleBotAbility(botId) {
    const bot = players[botId];
    if (!bot || !bot.alive) return;
    const otherAlivePlayers = Object.values(players).filter(p => p.alive && p.id !== botId);
    if (otherAlivePlayers.length === 0) return;
    const target = otherAlivePlayers[Math.floor(Math.random() * otherAlivePlayers.length)];

    switch (bot.role) {
        case '마피아':
            if (gameState.missionSuccessRate < 90 && target.role !== '마피아') {
                gameState.abilityActions.mafia = target.id;
            }
            break;
        case '경찰': gameState.abilityActions.police = target.id; break;
        case '수다쟁이':
            if (!gameState.chatterboxUsed && Math.random() < 0.5) { 
                gameState.abilityActions.chatterbox = target.id;
            }
            break;
    }
}

function handleBotQuizCycle() {
    if (!gameState.isStarted) return;
    const pendingMission = gameState.missions.find(m => m.status === 'pending');
    if (!pendingMission) { clearInterval(gameState.botQuizInterval); return; }

    const solvingBot = Object.values(players).find(p => p.isBot && p.alive);
    if (!solvingBot) return;

    const isCorrect = Math.random() < 2 / 3; 
    pendingMission.status = isCorrect ? 'success' : 'failure';
    pendingMission.solver = solvingBot.name;
    console.log(`Bot ${solvingBot.name} solved mission #${pendingMission.id} -> ${pendingMission.status}`);
    broadcastGameState();
}

function checkWinCondition() {
    const alivePlayers = Object.values(players).filter(p => p.alive);
    const aliveRoles = alivePlayers.map(p => p.role);
    const mafiaCount = aliveRoles.filter(r => r === '마피아').length;
    const citizenTeamCount = aliveRoles.length - mafiaCount;
    let winner = null, message = "";

    if (mafiaCount === 0) {
        winner = '시민'; message = "모든 마피아가 제거되어 시민 팀이 승리했습니다!";
    } else if (mafiaCount >= citizenTeamCount) {
        winner = '마피아'; message = "마피아의 수가 시민 팀의 수와 같거나 많아져 마피아 팀이 승리했습니다!";
    }

    if (winner) {
        io.emit('gameOver', { winner, message });
        resetGame(); initializeBots();
        return true;
    }
    return false;
}

function setRoundTimer(duration, callback) {
    clearTimeout(gameState.timer); clearInterval(gameState.interval);
    let timeLeft = duration;
    io.emit('timerUpdate', { timeLeft });
    gameState.interval = setInterval(() => {
        timeLeft--; io.emit('timerUpdate', { timeLeft });
        if (timeLeft <= 0) { clearInterval(gameState.interval); }
    }, 1000);
    gameState.timer = setTimeout(callback, duration * 1000);
}

function handleVote({voterId, targetId}) {
    const voter = players[voterId];
    if (voter && voter.alive) {
        voter.votedFor = targetId;
        const alivePlayers = Object.values(players).filter(p => p.alive);
        const allVoted = alivePlayers.every(p => p.votedFor !== null);
        if (allVoted) {
            clearTimeout(gameState.timer); clearInterval(gameState.interval);
            processRoundResolution();
        }
    }
}

io.on('connection', (socket) => {
    socket.emit('lobbyUpdate', Object.values(players).map(({sock, ...rest}) => rest));

    socket.on('login', (name) => {
        if (Object.values(players).filter(p => !p.isBot).length >= 4) {
             return socket.emit('loginError', '방이 가득 찼습니다.');
        }
        if (Object.values(players).some(p => p.name === name)) {
            return socket.emit('loginError', '이미 사용 중인 이름입니다.');
        }
        players[socket.id] = { id: socket.id, name, isBot: false, alive: true, role: null, socket };
        socket.emit('loginSuccess');
        io.emit('lobbyUpdate', Object.values(players).map(({socket, ...rest}) => rest));
        if (Object.keys(players).length === 7) {
            io.emit('gameStartingCountdown');
            setTimeout(startGame, 5000);
        }
    });

    socket.on('abilityAction', ({ ability, targetId }) => {
        const player = players[socket.id];
        if (player && player.alive && player.role.toLowerCase() === ability) {
            gameState.abilityActions[ability] = targetId;
        }
    });
    
    socket.on('submitVote', (targetId) => handleVote({ voterId: socket.id, targetId }));
    
    socket.on('submitQuiz', ({ missionId, answer }) => {
        const mission = gameState.missions.find(m => m.id === missionId);
        const player = players[socket.id];
        if (mission && mission.status === 'pending' && player) {
            mission.status = (mission.answer === 'any' || mission.answer.toLowerCase() === answer.toLowerCase()) ? 'success' : 'failure';
            mission.solver = player.name;
            broadcastGameState();
        }
    });

    socket.on('disconnect', () => {
        const disconnectedPlayer = players[socket.id];
        if (disconnectedPlayer) {
            console.log(`Player ${disconnectedPlayer.name} disconnected.`);
            if (gameState.isStarted) {
                io.emit('gameReset'); resetGame(); initializeBots();
            } else {
                delete players[socket.id];
                io.emit('lobbyUpdate', Object.values(players).map(({sock, ...rest}) => rest));
            }
        }
    });
});

server.listen(PORT, () => {
    initializeBots();
    console.log(`Server running on port ${PORT}`);
});