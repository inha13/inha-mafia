const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
app.use(express.static(__dirname));

let players = {}; // 플레이어와 봇 정보
let gameState = {}; // 게임 전체 상태

const ALL_MISSIONS = [
    { id: 1, question: "화장실 2번째 칸에 수건은 몇 개 있을까요?", type: "number", answer: "5" },
    { id: 2, question: "뒷 화장실에 휴지는 있을까요?", type: "ox", answer: "O" },
    { id: 3, question: "인하방에 그리스로마신화는 몇 권 있을까요?", type: "number", answer: "9" },
    { id: 4, question: "채하방에 콘센트는 몇 개가 꼽혀져 있을까요?", type: "number", answer: "3" },
    { id: 5, question: "지금 정수기 상태는 무엇인가요?", type: "choice", options: ["온수", "정수", "냉수"], answer: "any" },
    { id: 6, question: "우리 집 화투는 어디에 있나요?", type: "choice", options: ["거실", "부모님 침대", "부엌", "화장실", "인하방"], answer: "부모님 침대" },
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
    { id: 20, question: "물은 섭씨 몇 도에서 끓을까요?", type: "number", answer: "100" }
];


// 게임 상태 초기화
function resetGame() {
    clearTimeout(gameState.timer);
    gameState = {
        isStarted: false,
        phase: 'ended', // 'night', 'day', 'vote', 'ended'
        day: 0,
        timer: null,
        roles: {},
        missions: [],
        missionSuccessRate: 0,
        mafiaAbilityBlocked: false,
        nightActions: {
            mafia: { target: null, executor: null },
            police: { target: null, executor: null },
            chatterbox: { target: null, executor: null }
        },
        revealedRoles: {},
        chatterboxUsed: false,
    };
    Object.values(players).forEach(p => {
        p.alive = true;
        p.votedFor = null;
    });
    console.log("--- Game Reset ---");
}

// 전체 플레이어에게 게임 상태 전송
function broadcastGameState() {
    const publicGameState = {
        ...gameState,
        roles: {}, // 역할 정보는 개인에게만 전송
        missions: gameState.missions?.map(({ answer, ...rest }) => rest),
        players: Object.values(players).map(({ socket, ...rest }) => rest)
    };
    io.emit('gameStateUpdate', publicGameState);
}

// 게임 시작
function startGame() {
    resetGame();
    gameState.isStarted = true;
    
    const playerIds = Object.keys(players);
    let roles = ['마피아', '경찰', '수다쟁이', '시민'];
    roles = roles.sort(() => Math.random() - 0.5);

    playerIds.forEach((id, index) => {
        gameState.roles[id] = roles[index];
        players[id].role = roles[index];
    });

    // 각 플레이어에게 자신의 역할 전송
    playerIds.forEach(id => {
        if(players[id].socket) {
            players[id].socket.emit('roleInfo', { role: players[id].role });
        }
    });

    startNewDay();
}

// 새 날 시작 (미션 설정)
function startNewDay() {
    gameState.day++;
    gameState.phase = 'day';

    const shuffledMissions = ALL_MISSIONS.sort(() => Math.random() - 0.5);
    gameState.missions = shuffledMissions.slice(0, 7).map(m => ({ ...m, status: 'pending' }));
    
    // 봇들이 10초 내에 랜덤하게 퀴즈를 품
    Object.values(players).filter(p => p.isBot).forEach(bot => {
        setTimeout(() => handleBotQuiz(bot.id), Math.random() * 10000);
    });

    broadcastGameState();
    setPhaseTimer(90, startNightPhase); // 90초 후 밤 시작
}

// 밤 시작
function startNightPhase() {
    gameState.phase = 'night';
    // 미션 성공률 계산
    const totalMissions = gameState.missions.length;
    const successMissions = gameState.missions.filter(m => m.status === 'success').length;
    gameState.missionSuccessRate = totalMissions > 0 ? (successMissions / totalMissions) * 100 : 0;
    gameState.mafiaAbilityBlocked = gameState.missionSuccessRate >= 90;
    
    // 밤 능력 초기화
    gameState.nightActions = { mafia: {}, police: {}, chatterbox: {} };

    broadcastGameState();

    // 봇 능력 사용 처리
    Object.values(players).forEach(player => {
        if(player.isBot && player.alive) {
            handleBotAbility(player.id);
        }
    });

    setPhaseTimer(30, processNightActions); // 30초 후 밤 결과 처리
}

// 밤 행동 결과 처리
function processNightActions() {
    const { mafia, police, chatterbox } = gameState.nightActions;
    let nightEvents = [];

    // 수다쟁이 능력 처리
    if (chatterbox.target && !gameState.chatterboxUsed) {
        gameState.chatterboxUsed = true;
        const targetPlayer = players[chatterbox.target];
        if (targetPlayer) {
            gameState.revealedRoles[chatterbox.target] = targetPlayer.role;
            nightEvents.push(`${targetPlayer.name}님의 직업은 [${targetPlayer.role}] 입니다!`);
        }
    }

    // 마피아 능력 처리
    let killSuccess = false;
    if (mafia.target) {
        if (gameState.mafiaAbilityBlocked) {
            nightEvents.push("미션 성공률이 90% 이상이어서 마피아의 능력이 실패했습니다.");
        } else if (police.target === mafia.executor) {
            nightEvents.push(`경찰이 마피아(${players[mafia.executor].name})를 막아 능력이 실패했습니다.`);
        } else if (police.target === mafia.target) {
            nightEvents.push(`경찰이 마피아의 목표(${players[mafia.target].name})를 보호하여 암살이 실패했습니다.`);
        } else {
            const targetPlayer = players[mafia.target];
            if (targetPlayer && targetPlayer.alive) {
                targetPlayer.alive = false;
                killSuccess = true;
                nightEvents.push(`지난 밤, ${targetPlayer.name}님이 마피아에게 살해당했습니다.`);
            }
        }
    }

    io.emit('nightResult', { events: nightEvents });

    if (checkWinCondition()) return;
    
    setTimeout(() => {
        startVotePhase();
    }, 4000);
}


// 투표 시작
function startVotePhase() {
    gameState.phase = 'vote';
    Object.values(players).forEach(p => p.votedFor = null);
    broadcastGameState();

    // 봇 투표 처리
    Object.values(players).filter(p => p.isBot && p.alive).forEach(bot => {
        setTimeout(() => {
            const alivePlayers = Object.values(players).filter(p => p.alive && p.id !== bot.id);
            if (alivePlayers.length > 0) {
                const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
                handleVote({ voterId: bot.id, targetId: target.id });
            }
        }, Math.random() * 5000);
    });

    setPhaseTimer(30, processVote); // 30초 후 투표 집계
}


// 투표 집계
function processVote() {
    const voteCounts = {};
    const aliveVoters = Object.values(players).filter(p => p.alive);

    aliveVoters.forEach(p => {
        if(p.votedFor) {
            voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
        }
    });

    let maxVotes = 0;
    let eliminatedId = null;
    let isTied = false;

    for (const id in voteCounts) {
        if (voteCounts[id] > maxVotes) {
            maxVotes = voteCounts[id];
            eliminatedId = id;
            isTied = false;
        } else if (voteCounts[id] === maxVotes) {
            isTied = true;
        }
    }

    if (eliminatedId && !isTied) {
        players[eliminatedId].alive = false;
        io.emit('voteResult', { message: `투표 결과, ${players[eliminatedId].name}님이 탈락했습니다.` });
    } else {
        io.emit('voteResult', { message: "투표가 무효 처리되어 아무도 탈락하지 않았습니다." });
    }

    if(checkWinCondition()) return;

    setTimeout(() => {
        startNewDay();
    }, 4000);
}

// 봇 능력 처리
function handleBotAbility(botId) {
    const bot = players[botId];
    if (!bot || !bot.alive) return;

    const alivePlayers = Object.values(players).filter(p => p.alive);
    const otherAlivePlayers = alivePlayers.filter(p => p.id !== botId);
    if (otherAlivePlayers.length === 0) return;

    const target = otherAlivePlayers[Math.floor(Math.random() * otherAlivePlayers.length)];

    switch (bot.role) {
        case '마피아':
            if (!gameState.mafiaAbilityBlocked) {
                gameState.nightActions.mafia = { target: target.id, executor: botId };
            }
            break;
        case '경찰':
            gameState.nightActions.police = { target: target.id, executor: botId };
            break;
        case '수다쟁이':
            if (!gameState.chatterboxUsed && Math.random() < 0.5) { // 50% 확률로 사용
                gameState.nightActions.chatterbox = { target: target.id, executor: botId };
            }
            break;
    }
}

// 봇 퀴즈 처리
function handleBotQuiz(botId) {
    if(!gameState.isStarted) return;
    const mission = gameState.missions.find(m => m.status === 'pending');
    if(!mission) return;

    const isCorrect = Math.random() < 2 / 3; // 2/3 확률
    mission.status = isCorrect ? 'success' : 'failure';
    broadcastGameState();
}


// 승리 조건 확인
function checkWinCondition() {
    const alivePlayers = Object.values(players).filter(p => p.alive);
    const aliveRoles = alivePlayers.map(p => p.role);
    
    const mafiaCount = aliveRoles.filter(r => r === '마피아').length;
    const citizenTeamCount = aliveRoles.length - mafiaCount;

    let winner = null;
    let message = "";

    if (mafiaCount === 0) {
        winner = '시민';
        message = "모든 마피아가 제거되어 시민 팀이 승리했습니다!";
    } else if (mafiaCount >= citizenTeamCount) {
        winner = '마피아';
        message = "마피아의 수가 시민 팀의 수와 같거나 많아져 마피아 팀이 승리했습니다!";
    }

    if (winner) {
        io.emit('gameOver', { winner, message });
        resetGame();
        return true;
    }
    return false;
}

// 페이즈 타이머 설정
function setPhaseTimer(duration, callback) {
    clearTimeout(gameState.timer);
    let timeLeft = duration;

    function tick() {
        io.emit('timerUpdate', { timeLeft, phase: gameState.phase });
        timeLeft--;
        if (timeLeft >= 0) {
            gameState.timer = setTimeout(tick, 1000);
        } else {
            callback();
        }
    }
    tick();
}

// 투표 처리 핸들러
function handleVote({voterId, targetId}) {
    const voter = players[voterId];
    if (voter && voter.alive) {
        voter.votedFor = targetId;
        // 모든 생존자가 투표했는지 확인
        const alivePlayers = Object.values(players).filter(p => p.alive);
        const allVoted = alivePlayers.every(p => p.votedFor !== null);
        if (allVoted) {
            clearTimeout(gameState.timer); // 타이머 멈추고 즉시 집계
            processVote();
        }
    }
}

io.on('connection', (socket) => {
    socket.on('login', (name) => {
        if (Object.values(players).some(p => !p.isBot)) {
            return socket.emit('loginError', '이미 플레이어가 접속해있습니다.');
        }

        const humanPlayerId = socket.id;
        players[humanPlayerId] = { id: humanPlayerId, name, isBot: false, socket };

        // 봇 3명 추가
        for (let i = 1; i <= 3; i++) {
            const botId = `bot_${i}`;
            players[botId] = { id: botId, name: `봇${i}`, isBot: true };
        }
        
        socket.emit('loginSuccess');
        console.log(`Player ${name} connected. Starting game with 3 bots.`);
        startGame();
    });

    socket.on('submitQuiz', ({ missionId, answer }) => {
        const mission = gameState.missions.find(m => m.id === missionId);
        if (mission && mission.status === 'pending') {
            mission.status = (mission.answer === 'any' || mission.answer.toLowerCase() === answer.toLowerCase()) ? 'success' : 'failure';
            broadcastGameState();
        }
    });

    socket.on('abilityAction', ({ ability, targetId }) => {
        const player = players[socket.id];
        if (player && player.alive && player.role.toLowerCase() === ability) {
            gameState.nightActions[ability] = { target: targetId, executor: socket.id };
        }
    });
    
    socket.on('submitVote', (targetId) => {
        handleVote({ voterId: socket.id, targetId });
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            console.log(`Player ${players[socket.id].name} disconnected. Resetting game.`);
            players = {};
            resetGame();
            io.emit('gameReset'); // 모든 클라이언트에게 게임 리셋 알림
        }
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));