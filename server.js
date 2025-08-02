const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
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

function resetGame() {
    clearTimeout(gameState.timer);
    clearInterval(gameState.interval);
    clearInterval(gameState.botQuizInterval);
    gameState = {
        isStarted: false,
        phase: 'ended', 
        day: 0,
        timer: null,
        interval: null,
        botQuizInterval: null,
        roles: {},
        missions: [],
        missionSuccessRate: 0,
        mafiaAbilityBlocked: false,
        nightActions: {
            mafia: [], 
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
    console.log("--- Game State Reset ---");
}

function broadcastGameState() {
    const publicGameState = {
        ...gameState,
        timer: null,
        interval: null,
        botQuizInterval: null,
        roles: {}, 
        missions: gameState.missions?.map(({ answer, ...rest }) => rest),
        players: Object.values(players).map(({ socket, ...rest }) => rest)
    };
    io.emit('gameStateUpdate', publicGameState);
}

function startGame() {
    resetGame();
    gameState.isStarted = true;
    
    const playerIds = Object.keys(players);
    let roles = ['마피아', '마피아', '경찰', '수다쟁이', '시민', '시민', '시민'];
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

    startNewDay();
}

function startNewDay() {
    gameState.day++;
    gameState.phase = 'day';
    
    clearInterval(gameState.botQuizInterval); // 이전 인터벌 제거
    gameState.botQuizInterval = setInterval(handleBotQuizCycle, 10000); // 10초마다 봇 퀴즈 실행

    const shuffledMissions = ALL_MISSIONS.sort(() => Math.random() - 0.5);
    gameState.missions = shuffledMissions.slice(0, 7).map(m => ({ ...m, status: 'pending' }));
    
    setPhaseTimer(90, startNightPhase);
    broadcastGameState();
}

function startNightPhase() {
    gameState.phase = 'night';
    clearInterval(gameState.botQuizInterval); // 낮 동안의 봇 퀴즈 인터벌 중지
    
    const totalMissions = gameState.missions.length;
    const successMissions = gameState.missions.filter(m => m.status === 'success').length;
    gameState.missionSuccessRate = totalMissions > 0 ? (successMissions / totalMissions) * 100 : 0;
    gameState.mafiaAbilityBlocked = gameState.missionSuccessRate >= 90;
    
    gameState.nightActions = { mafia: [], police: {}, chatterbox: {} };

    Object.values(players).forEach(player => {
        if(player.isBot && player.alive) {
            handleBotAbility(player.id);
        }
    });

    setPhaseTimer(30, processNightActions);
    broadcastGameState();
}

function processNightActions() {
    const { mafia, police, chatterbox } = gameState.nightActions;
    let nightEvents = [];

    if (chatterbox.target && !gameState.chatterboxUsed) {
        gameState.chatterboxUsed = true;
        const targetPlayer = players[chatterbox.target];
        if (targetPlayer) {
            gameState.revealedRoles[chatterbox.target] = targetPlayer.role;
            nightEvents.push(`${targetPlayer.name}님의 직업은 [${targetPlayer.role}] 입니다!`);
        }
    }

    const mafiaTargets = mafia.map(action => action.target);
    const finalMafiaTarget = mafiaTargets.length > 0 ? mafiaTargets[0] : null;

    if (finalMafiaTarget) {
        const mafiaExecutor = mafia[0].executor;
        if (gameState.mafiaAbilityBlocked) {
            nightEvents.push("미션 성공률이 90% 이상이어서 마피아의 능력이 실패했습니다.");
        } else if (police.target === mafiaExecutor) {
            nightEvents.push(`경찰이 마피아(${players[mafiaExecutor].name})를 막아 능력이 실패했습니다.`);
        } else if (police.target === finalMafiaTarget) {
            nightEvents.push(`경찰이 마피아의 목표(${players[finalMafiaTarget].name})를 보호하여 암살이 실패했습니다.`);
        } else {
            const targetPlayer = players[finalMafiaTarget];
            if (targetPlayer && targetPlayer.alive) {
                targetPlayer.alive = false;
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


function startVotePhase() {
    gameState.phase = 'vote';
    Object.values(players).forEach(p => p.votedFor = null);
    
    Object.values(players).filter(p => p.isBot && p.alive).forEach(bot => {
        setTimeout(() => {
            const alivePlayers = Object.values(players).filter(p => p.alive && p.id !== bot.id);
            if (alivePlayers.length > 0) {
                const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
                handleVote({ voterId: bot.id, targetId: target.id });
            }
        }, Math.random() * 5000);
    });

    setPhaseTimer(30, processVote);
    broadcastGameState();
}


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

function handleBotAbility(botId) {
    const bot = players[botId];
    if (!bot || !bot.alive) return;

    const otherAlivePlayers = Object.values(players).filter(p => p.alive && p.id !== botId);
    if (otherAlivePlayers.length === 0) return;

    const target = otherAlivePlayers[Math.floor(Math.random() * otherAlivePlayers.length)];

    switch (bot.role) {
        case '마피아':
            if (!gameState.mafiaAbilityBlocked) {
                gameState.nightActions.mafia.push({ target: target.id, executor: botId });
            }
            break;
        case '경찰':
            gameState.nightActions.police = { target: target.id, executor: botId };
            break;
        case '수다쟁이':
            if (!gameState.chatterboxUsed && Math.random() < 0.5) { 
                gameState.nightActions.chatterbox = { target: target.id, executor: botId };
            }
            break;
    }
}

// 10초마다 봇 중 하나가 퀴즈를 푸는 로직
function handleBotQuizCycle() {
    if (!gameState.isStarted || gameState.phase !== 'day') return;

    const pendingMission = gameState.missions.find(m => m.status === 'pending');
    if (!pendingMission) return; // 풀 미션이 없음

    const solvingBot = Object.values(players).find(p => p.isBot && p.alive);
    if (!solvingBot) return; // 퀴즈를 풀 봇이 없음

    const isCorrect = Math.random() < 2 / 3; 
    pendingMission.status = isCorrect ? 'success' : 'failure';
    console.log(`Bot ${solvingBot.name} solved mission #${pendingMission.id} -> ${pendingMission.status}`);
    broadcastGameState();
}

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
        initializeBots();
        return true;
    }
    return false;
}

// 안정적인 타이머 로직으로 수정
function setPhaseTimer(duration, callback) {
    clearTimeout(gameState.timer);
    clearInterval(gameState.interval);

    let timeLeft = duration;
    io.emit('timerUpdate', { timeLeft, phase: gameState.phase });

    gameState.interval = setInterval(() => {
        timeLeft--;
        io.emit('timerUpdate', { timeLeft, phase: gameState.phase });
        if (timeLeft <= 0) {
            clearInterval(gameState.interval);
        }
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
            clearTimeout(gameState.timer);
            clearInterval(gameState.interval);
            processVote();
        }
    }
}

io.on('connection', (socket) => {
    const currentPlayers = Object.values(players).map(({sock, ...rest}) => rest);
    socket.emit('lobbyUpdate', currentPlayers);

    socket.on('login', (name) => {
        const humanPlayers = Object.values(players).filter(p => !p.isBot);
        if (humanPlayers.length >= 4) {
             return socket.emit('loginError', '방이 가득 찼습니다.');
        }
        if (Object.values(players).some(p => p.name === name)) {
            return socket.emit('loginError', '이미 사용 중인 이름입니다.');
        }

        players[socket.id] = { id: socket.id, name, isBot: false, alive: true, role: null, socket };
        socket.emit('loginSuccess');
        
        const updatedPlayers = Object.values(players).map(({socket, ...rest}) => rest);
        io.emit('lobbyUpdate', updatedPlayers);

        if (Object.keys(players).length === 7) {
            console.log(`7 players ready. Starting game in 5 seconds.`);
            io.emit('gameStartingCountdown');
            setTimeout(startGame, 5000);
        }
    });

    socket.on('abilityAction', ({ ability, targetId }) => {
        const player = players[socket.id];
        if (player && player.alive && player.role.toLowerCase() === ability) {
            if(ability === 'mafia') {
                gameState.nightActions.mafia = gameState.nightActions.mafia.filter(a => a.executor !== socket.id);
                gameState.nightActions.mafia.push({ target: targetId, executor: socket.id });
            } else {
                gameState.nightActions[ability] = { target: targetId, executor: socket.id };
            }
        }
    });
    
    socket.on('submitVote', (targetId) => {
        handleVote({ voterId: socket.id, targetId });
    });
    
    socket.on('submitQuiz', ({ missionId, answer }) => {
        const mission = gameState.missions.find(m => m.id === missionId);
        if (mission && mission.status === 'pending') {
            mission.status = (mission.answer === 'any' || mission.answer.toLowerCase() === answer.toLowerCase()) ? 'success' : 'failure';
            broadcastGameState();
        }
    });

    socket.on('disconnect', () => {
        const disconnectedPlayer = players[socket.id];
        if (disconnectedPlayer) {
            console.log(`Player ${disconnectedPlayer.name} disconnected.`);
            if (gameState.isStarted) {
                io.emit('gameReset');
                resetGame();
                initializeBots();
            } else {
                delete players[socket.id];
                const currentPlayers = Object.values(players).map(({sock, ...rest}) => rest);
                io.emit('lobbyUpdate', currentPlayers);
            }
        }
    });
});

server.listen(PORT, () => {
    initializeBots();
    console.log(`Server running on port ${PORT}`);
});