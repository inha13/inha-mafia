document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const screens = {
        login: document.getElementById('login-screen'),
        lobby: document.getElementById('lobby-screen'),
        game: document.getElementById('game-screen'),
    };
    const modalOverlay = document.getElementById('modal-overlay');
    const modals = {
        role: document.getElementById('role-modal'),
        quiz: document.getElementById('quiz-modal'),
        vote: document.getElementById('vote-modal'),
        result: document.getElementById('result-modal'),
    };
    const joinBtn = document.getElementById('join-btn');
    const nameInput = document.getElementById('name-input');
    
    const playerCountSpan = document.getElementById('player-count');
    const playerListUl = document.getElementById('player-list');
    const startTimerDisplay = document.getElementById('start-timer-display');

    const myNameSpan = document.getElementById('my-name');
    const myRoleSpan = document.getElementById('my-role');
    const dayNightStatusSpan = document.getElementById('day-night-status');
    const gameTimerSpan = document.getElementById('game-timer');
    const statusBoardUl = document.getElementById('status-board');
    const abilityContentDiv = document.getElementById('ability-content');
    const abilityConfirmBtn = document.getElementById('ability-confirm-btn');
    const missionListUl = document.getElementById('mission-list');
    const missionSuccessRateSpan = document.getElementById('mission-success-rate');
    
    let myPlayer = {};
    let gameState = {};
    let selectedTargetId = null;

    const showScreen = (screenName) => {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[screenName].classList.add('active');
    };
    const showModal = (modalName) => {
        modalOverlay.classList.remove('hidden');
        Object.values(modals).forEach(m => m.classList.add('hidden'));
        modals[modalName].classList.remove('hidden');
    };
    const hideModals = () => modalOverlay.classList.add('hidden');

    document.querySelector('.tabs').addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-link')) {
            document.querySelectorAll('.tab-link, .tab-content').forEach(el => el.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.tab).classList.add('active');
        }
    });

    function updateLobbyUI(players) {
        playerCountSpan.textContent = players.length;
        playerListUl.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
    }

    function updateGameUI() {
        if (!gameState.isStarted) return;
        
        myPlayer = gameState.players.find(p => p.id === socket.id);
        if (!myPlayer) return;

        if (screens.game.classList.contains('active') === false) {
            showScreen('game');
        }

        myNameSpan.textContent = myPlayer.name;
        myRoleSpan.textContent = myPlayer.role;

        updateStatusBoard();
        updateMissionTab();
        updateAbilityTab();

        if (gameState.phase === 'vote' && myPlayer.alive) {
            updateVoteModal();
            showModal('vote');
        } else {
            if(modals.vote.classList.contains('hidden') === false) {
                hideModals();
            }
        }
    }

    // 상황판 UI 그리는 함수 수정
    function updateStatusBoard() {
        statusBoardUl.innerHTML = '';
        gameState.players.forEach(player => {
            const li = document.createElement('li');
            li.className = `status-item ${!player.alive ? 'dead' : ''}`;
            
            const icon = document.createElement('i');
            icon.className = `player-icon fas ${player.isBot ? 'fa-robot' : 'fa-user'}`;
            li.appendChild(icon);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';
            nameSpan.textContent = player.name;
            li.appendChild(nameSpan);

            if (gameState.revealedRoles[player.id]) {
                const roleSpan = document.createElement('span');
                roleSpan.className = 'revealed-role';
                roleSpan.textContent = `(${gameState.revealedRoles[player.id]})`;
                li.appendChild(roleSpan);
            }
            statusBoardUl.appendChild(li);
        });
    }

    function updateMissionTab() {
        missionSuccessRateSpan.textContent = gameState.missionSuccessRate.toFixed(1);
        missionListUl.innerHTML = '';
        gameState.missions.forEach(mission => {
            const li = document.createElement('li');
            li.className = 'mission-item';
            li.dataset.missionId = mission.id;
            
            const title = document.createElement('span');
            title.textContent = `미션 #${mission.id}`;
            li.appendChild(title);
            
            const statusSpan = document.createElement('span');
            statusSpan.className = 'mission-status';
            if (mission.status !== 'pending') {
                li.classList.add('disabled');
                statusSpan.textContent = mission.status === 'success' ? '성공' : '실패';
                statusSpan.classList.add(mission.status);
            } else {
                li.onclick = () => openQuizModal(mission);
            }
            li.appendChild(statusSpan);
            missionListUl.appendChild(li);
        });
    }

    function updateAbilityTab() {
        abilityContentDiv.innerHTML = '';
        abilityConfirmBtn.classList.add('hidden');
        selectedTargetId = null;

        const canUseAbility = myPlayer.alive && gameState.phase === 'night';
        const abilityRole = myPlayer.role ? myPlayer.role.toLowerCase() : '';

        let description = '사용할 수 있는 능력이 없습니다.';
        let targets = [];

        if(canUseAbility) {
            switch(abilityRole) {
                case '마피아':
                    if (gameState.mafiaAbilityBlocked) {
                        description = '미션 성공률이 높아 능력을 사용할 수 없습니다.';
                    } else {
                        description = '밤에 제거할 대상을 선택하세요.';
                        targets = gameState.players.filter(p => p.alive && p.role !== '마피아');
                    }
                    break;
                case '경찰':
                    description = '능력을 막을 대상을 선택하세요.';
                    targets = gameState.players.filter(p => p.id !== myPlayer.id);
                    break;
                case '수다쟁이':
                    if (gameState.chatterboxUsed) {
                        description = '이미 능력을 사용했습니다.';
                    } else {
                        description = '직업을 공개할 대상을 선택하세요.';
                        targets = gameState.players;
                    }
                    break;
            }
        }
        
        const p = document.createElement('p');
        p.textContent = description;
        abilityContentDiv.appendChild(p);

        if (targets.length > 0) {
            const grid = document.createElement('div');
            grid.className = 'ability-target-grid';
            targets.forEach(player => {
                const btn = document.createElement('button');
                btn.textContent = player.name;
                btn.className = 'target-btn';
                btn.dataset.playerId = player.id;
                btn.onclick = () => {
                    document.querySelectorAll('.target-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    selectedTargetId = player.id;
                    abilityConfirmBtn.disabled = false;
                };
                grid.appendChild(btn);
            });
            abilityContentDiv.appendChild(grid);
            abilityConfirmBtn.classList.remove('hidden');
            abilityConfirmBtn.disabled = true;
        }
    }

    function updateVoteModal() {
        const voteOptionsDiv = document.getElementById('vote-options');
        voteOptionsDiv.innerHTML = '';
        const alivePlayers = gameState.players.filter(p => p.alive);

        alivePlayers.forEach(player => {
            if (player.id === myPlayer.id) return;
            const btn = document.createElement('button');
            btn.textContent = player.name;
            btn.className = 'vote-option-btn';
            btn.onclick = () => {
                document.querySelectorAll('.vote-option-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                document.getElementById('submit-vote-btn').dataset.targetId = player.id;
            };
            voteOptionsDiv.appendChild(btn);
        });
    }

    function openQuizModal(mission) {
        document.getElementById('quiz-title').textContent = `미션 #${mission.id}`;
        document.getElementById('quiz-question').textContent = mission.question;
        const answerInput = document.getElementById('quiz-answer-input');
        const optionsDiv = document.getElementById('quiz-options');
        optionsDiv.innerHTML = '';
        answerInput.value = '';
        answerInput.style.display = 'block';

        if (mission.type === 'choice' || mission.type === 'ox') {
            answerInput.style.display = 'none';
            const options = mission.type === 'ox' ? ['O', 'X'] : mission.options;
            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.textContent = opt;
                btn.className = 'quiz-option-btn';
                btn.onclick = () => submitQuizAnswer(mission.id, opt);
                optionsDiv.appendChild(btn);
            });
        }
        document.getElementById('submit-quiz-btn').onclick = () => submitQuizAnswer(mission.id, answerInput.value);
        showModal('quiz');
    }
    
    function submitQuizAnswer(missionId, answer) {
        if (!answer) return;
        socket.emit('submitQuiz', { missionId, answer: answer.trim() });
        hideModals();
    }

    joinBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (name) {
            joinBtn.disabled = true;
            joinBtn.textContent = '참가 중...';
            socket.emit('login', name);
        }
    });

    abilityConfirmBtn.addEventListener('click', () => {
        if (selectedTargetId) {
            socket.emit('abilityAction', {
                ability: myPlayer.role.toLowerCase(),
                targetId: selectedTargetId
            });
            abilityContentDiv.innerHTML = '<p>능력 사용을 완료했습니다.</p>';
            abilityConfirmBtn.classList.add('hidden');
        }
    });

    document.getElementById('submit-vote-btn').addEventListener('click', (e) => {
        const targetId = e.target.dataset.targetId;
        if (targetId) {
            socket.emit('submitVote', targetId);
            hideModals();
        }
    });

    socket.on('loginSuccess', () => showScreen('lobby'));
    socket.on('loginError', (msg) => {
        alert(msg);
        joinBtn.disabled = false;
        joinBtn.textContent = '참가하기';
    });

    socket.on('lobbyUpdate', (players) => {
        updateLobbyUI(players);
    });

    socket.on('gameStartingCountdown', () => {
        startTimerDisplay.classList.remove('hidden');
        let count = 5;
        startTimerDisplay.textContent = `게임이 ${count}초 후에 시작됩니다`;
        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                startTimerDisplay.textContent = `게임이 ${count}초 후에 시작됩니다`;
            } else {
                startTimerDisplay.textContent = '게임 시작!';
                clearInterval(interval);
            }
        }, 1000);
    });

    socket.on('gameStateUpdate', (newGameState) => {
        gameState = newGameState;
        updateGameUI();
    });

    socket.on('roleInfo', ({ role }) => {
        myPlayer.role = role;
        myRoleSpan.textContent = role;
        
        const roleDesc = {
            '마피아': '매일 밤 한 명을 암살할 수 있습니다. 시민 팀과 수가 같아지면 승리합니다.',
            '경찰': '매일 밤 한 명을 지목해 능력을 사용하지 못하게 합니다.',
            '수다쟁이': '게임당 한 번, 한 명의 직업을 모두에게 공개할 수 있습니다.',
            '시민': '특별한 능력은 없지만, 투표를 통해 마피아를 찾아내야 합니다.'
        };
        document.getElementById('role-name').textContent = role;
        document.getElementById('role-description').textContent = roleDesc[role] || '';
        showModal('role');
        setTimeout(hideModals, 4000);
    });

    socket.on('timerUpdate', ({ timeLeft, phase }) => {
        const phaseKorean = { 'day': '낮', 'night': '밤', 'vote': '투표' };
        dayNightStatusSpan.textContent = phaseKorean[phase] || '';
        gameTimerSpan.textContent = timeLeft;
    });



    socket.on('nightResult', ({ events }) => {
        alert('밤이 지났습니다.\n\n' + events.join('\n'));
    });

    socket.on('voteResult', ({ message }) => {
        alert(message);
    });

    socket.on('gameOver', ({ winner, message }) => {
        hideModals();
        document.getElementById('result-title').textContent = `${winner} 팀 승리!`;
        document.getElementById('result-message').textContent = message;
        document.getElementById('restart-btn').onclick = () => window.location.reload();
        showModal('result');
    });

    socket.on('gameReset', () => {
        alert("플레이어의 연결이 끊겨 게임이 초기화됩니다.");
        window.location.reload();
    });
});