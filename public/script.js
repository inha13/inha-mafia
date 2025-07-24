document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // 화면 요소
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

    // UI 요소
    const nameInput = document.getElementById('name-input');
    const joinBtn = document.getElementById('join-btn');
    const playerCountSpan = document.getElementById('player-count');
    const playerListUl = document.getElementById('player-list');
    const startTimerDisplay = document.getElementById('start-timer-display');
    const myNameSpan = document.getElementById('my-name');
    const myRoleSpan = document.getElementById('my-role');
    const gameTimerSpan = document.getElementById('game-timer');
    const missionListUl = document.getElementById('mission-list');
    const abilityContentDiv = document.getElementById('ability-content');

    let myPlayerInfo = {};
    let missions = [];
    let allPlayers = [];
    let currentQuiz = null;
    let gameTimerInterval = null;

    // --- 유틸리티 함수 ---
    const showScreen = (screenName) => {
        Object.values(screens).forEach(screen => screen.classList.remove('active'));
        screens[screenName].classList.add('active');
    };

    const showModal = (modalName) => {
        modalOverlay.classList.remove('hidden');
        Object.values(modals).forEach(modal => modal.classList.add('hidden'));
        modals[modalName].classList.remove('hidden');
    };

    const hideModals = () => {
        modalOverlay.classList.add('hidden');
    };
    
    const startLobbyCountdown = () => {
        startTimerDisplay.classList.remove('hidden');
        let count = 5;
        startTimerDisplay.textContent = count;
        const interval = setInterval(() => {
            count--;
            startTimerDisplay.textContent = count > 0 ? count : '게임 시작!';
            if (count <= 0) {
                clearInterval(interval);
                startTimerDisplay.classList.add('hidden');
            }
        }, 1000);
    };

    const startGameTimer = (duration) => {
        if (gameTimerInterval) clearInterval(gameTimerInterval);
        let timeLeft = duration;
        gameTimerSpan.textContent = timeLeft;
        gameTimerInterval = setInterval(() => {
            timeLeft--;
            gameTimerSpan.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(gameTimerInterval);
            }
        }, 1000);
    };

    // --- 이벤트 리스너 ---
    joinBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (name) {
            socket.emit('login', name);
            joinBtn.disabled = true;
            joinBtn.textContent = '접속 중...';
        }
    });

    document.querySelector('.tabs').addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-link')) {
            document.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.tab).classList.add('active');
        }
    });

    // --- UI 업데이트 함수 ---
    const updateAbilityTab = () => {
        abilityContentDiv.innerHTML = '';
        if (myPlayerInfo.role === '마피아') {
            const p = document.createElement('p');
            p.textContent = '밤에 제거할 대상을 선택하세요.';
            abilityContentDiv.appendChild(p);
            
            const grid = document.createElement('div');
            grid.className = 'ability-target-grid';
            allPlayers.forEach(player => {
                if (player.id !== myPlayerInfo.id && player.alive) {
                    const btn = document.createElement('button');
                    btn.textContent = player.name;
                    btn.dataset.playerId = player.id;
                    btn.className = 'target-btn';
                    btn.onclick = () => {
                        socket.emit('setMafiaTarget', player.id);
                    };
                    grid.appendChild(btn);
                }
            });
            abilityContentDiv.appendChild(grid);
        } else {
            const p = document.createElement('p');
            p.textContent = '사용할 수 있는 능력이 없습니다.';
            abilityContentDiv.appendChild(p);
        }
    };
    
    const updateMissionList = () => {
        missionListUl.innerHTML = '';
        missions.forEach(mission => {
            const li = document.createElement('li');
            li.classList.add('mission-item');
            li.dataset.missionId = mission.id;

            const title = document.createElement('span');
            title.textContent = `미션 #${mission.id}`;

            const statusSpan = document.createElement('span');
            statusSpan.classList.add('mission-status');
            
            if (mission.status !== 'pending') {
                statusSpan.textContent = mission.status === 'success' ? '성공' : '실패';
                statusSpan.classList.add(mission.status);
                li.classList.add('disabled');
            } else {
                li.addEventListener('click', () => openQuizModal(mission));
            }
            
            li.appendChild(title);
            li.appendChild(statusSpan);
            missionListUl.appendChild(li);
        });
    };
    
    const openQuizModal = (mission) => {
        currentQuiz = mission;
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
                btn.onclick = () => submitQuizAnswer(opt);
                optionsDiv.appendChild(btn);
            });
        }
        showModal('quiz');
    };

    const submitQuizAnswer = (answer) => {
        if (!currentQuiz || !answer) return;
        socket.emit('submitQuiz', { missionId: currentQuiz.id, answer: answer.trim() });
        hideModals();
    };
    
    document.getElementById('submit-quiz-btn').onclick = () => {
        const answer = document.getElementById('quiz-answer-input').value;
        submitQuizAnswer(answer);
    };

    // --- Socket 이벤트 핸들러 ---
    socket.on('connect', () => {
        myPlayerInfo.id = socket.id;
        console.log('Connected to server with ID:', socket.id);
    });

    socket.on('loginSuccess', () => {
        showScreen('lobby'); // 대기실 화면으로 전환
    });

    socket.on('loginError', (message) => {
        alert(message);
        joinBtn.disabled = false;
        joinBtn.textContent = '참가하기';
    });

    socket.on('playerList', (players) => {
        allPlayers = players;
        playerCountSpan.textContent = players.length;
        playerListUl.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
        if (screens.game.classList.contains('active')) {
            updateAbilityTab();
        }
    });

    socket.on('lobbyFull', startLobbyCountdown);

    socket.on('gameStart', ({ roles, missions: serverMissions, players }) => {
        hideModals();
        showScreen('game');
        allPlayers = players;
        myPlayerInfo.name = allPlayers.find(p => p.id === myPlayerInfo.id).name;
        myPlayerInfo.role = roles[myPlayerInfo.id];
        missions = serverMissions;

        myNameSpan.textContent = myPlayerInfo.name;
        myRoleSpan.textContent = myPlayerInfo.role;

        const roleModalName = document.getElementById('role-name');
        const roleModalDesc = document.getElementById('role-description');
        
        roleModalName.textContent = myPlayerInfo.role;
        switch (myPlayerInfo.role) {
            case '마피아': roleModalDesc.textContent = "총알 한 발로 싸우십시오."; break;
            case '시민': roleModalDesc.textContent = "살아남으십시오!"; break;
            case '시장': roleModalDesc.textContent = "비록 능력은 없지만 당신이 생명줄입니다!"; break;
        }
        showModal('role');
        setTimeout(() => {
            if (modals.role.classList.contains('hidden') === false) {
                 hideModals();
            }
        }, 3000);

        updateAbilityTab();
        updateMissionList();
    });

    socket.on('newRound', ({ duration }) => {
        hideModals();
        startGameTimer(duration);
        // 플레이어 상태 업데이트 (예: 죽은 플레이어 표시)
        allPlayers.forEach(p => {
             const playerLi = Array.from(playerListUl.children).find(li => li.textContent === p.name);
             if (playerLi && !p.alive) {
                 playerLi.style.textDecoration = 'line-through';
                 playerLi.style.color = '#888';
             }
        });
        updateAbilityTab();
    });

    socket.on('missionUpdate', ({ missionId, status }) => {
        const mission = missions.find(m => m.id === missionId);
        if (mission) {
            mission.status = status;
            updateMissionList();
        }
    });
    
    socket.on('mafiaTargetConfirmed', (targetId) => {
        document.querySelectorAll('.target-btn').forEach(btn => btn.classList.remove('selected'));
        const selectedBtn = document.querySelector(`.target-btn[data-player-id="${targetId}"]`);
        if(selectedBtn) selectedBtn.classList.add('selected');
    });

    socket.on('voteStart', (alivePlayers) => {
        const voteOptionsDiv = document.getElementById('vote-options');
        voteOptionsDiv.innerHTML = '';
        
        alivePlayers.forEach(player => {
            const btn = document.createElement('button');
            btn.textContent = player.name;
            btn.dataset.playerId = player.id;
            btn.className = 'vote-option-btn';
            btn.onclick = () => {
                document.querySelectorAll('.vote-option-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            };
            voteOptionsDiv.appendChild(btn);
        });
        
        document.getElementById('submit-vote-btn').onclick = () => {
            const selectedBtn = document.querySelector('.vote-option-btn.selected');
            socket.emit('submitVote', selectedBtn ? selectedBtn.dataset.playerId : null);
            document.getElementById('submit-vote-btn').disabled = true;
            document.getElementById('submit-vote-btn').textContent = "투표 완료";
        };
        document.getElementById('submit-vote-btn').disabled = false;
        document.getElementById('submit-vote-btn').textContent = "투표하기";
        showModal('vote');
    });
    
    socket.on('playerDied', ({ eliminatedName, message, role, method }) => {
        let alertMessage = `[${eliminatedName}](이)가 탈락했습니다.`;
        if (method === 'vote') {
            alertMessage = `투표로 인해 [${eliminatedName}] (직업: ${role})(이)가 탈락했습니다.`;
        } else if (method === 'mafia') {
            alertMessage = `밤사이 마피아의 공격으로 [${eliminatedName}](이)가 탈락했습니다.`;
        } else if (message) {
            alertMessage = message;
        }
        alert(alertMessage);

        // 죽은 플레이어 찾아서 상태 업데이트
        const deadPlayer = allPlayers.find(p => p.name === eliminatedName);
        if (deadPlayer) {
            deadPlayer.alive = false;
        }
        // 화면 업데이트
        updateAbilityTab(); 
    });

    socket.on('gameOver', ({ winner, message }) => {
        hideModals();
        document.getElementById('result-title').textContent = `${winner} 팀 승리!`;
        document.getElementById('result-message').textContent = message;
        showModal('result');

        document.getElementById('restart-btn').onclick = () => {
            // 게임 상태 초기화를 위해 새로고침 또는 서버에 로비 복귀 요청
            // 여기서는 간단하게 새로고침 처리
            window.location.reload();
        };
    });
});