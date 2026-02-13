let winRateChart;

function prizeHtml(isCar) {
    return isCar
        ? '<span class="emoji">🚗</span>'
        : '<span class="emoji">🐐</span>';
}

// Initialize chart
function initChart() {
    const ctx = document.getElementById('winRateChart').getContext('2d');
    winRateChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Taxa de Vitoria',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                tension: 0.1,
                fill: true,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 10,
                    right: 30,
                    top: 10,
                    bottom: 10
                }
            },
            animation: {
                duration: 0
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    borderWidth: 1,
                    titleColor: '#e2e8f0',
                    bodyColor: '#94a3b8'
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Rodada',
                        color: '#64748b',
                        padding: { top: 10 }
                    },
                    ticks: {
                        color: '#64748b',
                        maxTicksLimit: 10,
                        padding: 5
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.08)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Vitoria (%)',
                        color: '#64748b',
                        padding: { bottom: 10 }
                    },
                    ticks: {
                        color: '#64748b',
                        callback: value => value.toFixed(0) + '%',
                        padding: 5
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.08)'
                    },
                    min: 0,
                    max: 100
                }
            }
        }
    });
}

const gameHistory = [];
let currentGame = {
    carDoor: null,
    selectedDoor: null,
    openedDoor: null,
    finalDoor: null,
    switched: false,
    won: false
};

let gamePhase = 'selecting';
let isSimulating = false;
let simulationQueue = [];
let currentSimulation = 0;
let totalSimulations = 0;

const doors = document.querySelectorAll('.door-container:not(.sim-door)');
const simDoors = document.querySelectorAll('.sim-door');
const message = document.getElementById('message');
const simMessage = document.getElementById('sim-message');
const switchBtn = document.getElementById('switchBtn');
const stayBtn = document.getElementById('stayBtn');
const newGameBtn = document.getElementById('newGameBtn');
const simulateBtn = document.getElementById('simulateBtn');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    
    if (tab === 'play') {
        document.querySelector('.tab:nth-child(1)').classList.add('active');
        document.getElementById('play-tab').classList.add('active');
    } else {
        document.querySelector('.tab:nth-child(2)').classList.add('active');
        document.getElementById('simulate-tab').classList.add('active');
    }
}

function initGame() {
    gamePhase = 'selecting';
    currentGame = {
        carDoor: Math.floor(Math.random() * 3),
        selectedDoor: null,
        openedDoor: null,
        finalDoor: null,
        switched: false,
        won: false
    };
    
    doors.forEach((doorContainer) => {
        const door = doorContainer.querySelector('.door');
        const content = doorContainer.querySelector('.door-content');
        
        door.classList.remove('open');
        content.classList.remove('show');
        doorContainer.classList.remove('disabled', 'selected');
    });
    
    setTimeout(() => {
        doors.forEach((doorContainer, index) => {
            const content = doorContainer.querySelector('.door-content');
            content.innerHTML = prizeHtml(index === currentGame.carDoor);
        });
    }, 600);
    
    message.textContent = 'Escolha uma porta';
    switchBtn.style.display = 'none';
    stayBtn.style.display = 'none';
    newGameBtn.disabled = true;
}

function selectDoor(doorIndex) {
    if (gamePhase !== 'selecting') return;
    
    currentGame.selectedDoor = doorIndex;
    doors[doorIndex].classList.add('selected');
    
    const goatDoors = [0, 1, 2].filter(i => 
        i !== currentGame.selectedDoor && i !== currentGame.carDoor
    );
    currentGame.openedDoor = goatDoors[Math.floor(Math.random() * goatDoors.length)];
    
    setTimeout(() => {
        doors[currentGame.openedDoor].querySelector('.door').classList.add('open');
        doors[currentGame.openedDoor].querySelector('.door-content').classList.add('show');
        doors[currentGame.openedDoor].classList.add('disabled');
        
        message.textContent = `Porta ${currentGame.openedDoor + 1} era bode. Trocar ou manter?`;
        switchBtn.style.display = 'inline-block';
        stayBtn.style.display = 'inline-block';
        gamePhase = 'switching';
    }, 500);
}

function makeDecision(switched) {
    if (gamePhase !== 'switching') return;
    
    currentGame.switched = switched;
    
    if (switched) {
        const otherDoor = [0, 1, 2].find(i => 
            i !== currentGame.selectedDoor && i !== currentGame.openedDoor
        );
        doors[currentGame.selectedDoor].classList.remove('selected');
        currentGame.finalDoor = otherDoor;
        doors[otherDoor].classList.add('selected');
    } else {
        currentGame.finalDoor = currentGame.selectedDoor;
    }
    
    setTimeout(() => {
        doors.forEach((doorContainer, index) => {
            if (index !== currentGame.openedDoor) {
                doorContainer.querySelector('.door').classList.add('open');
                doorContainer.querySelector('.door-content').classList.add('show');
            }
        });
        
        currentGame.won = currentGame.finalDoor === currentGame.carDoor;
        
        if (currentGame.won) {
            message.textContent = 'Vitoria! Voce acertou o carro.';
        } else {
            message.textContent = 'Derrota. Era um bode.';
        }
        
        gamePhase = 'finished';
        switchBtn.style.display = 'none';
        stayBtn.style.display = 'none';
        newGameBtn.disabled = false;
        
        saveGame();
    }, 500);
}

function startSimulation() {
    if (isSimulating) return;
    
    isSimulating = true;
    simulateBtn.disabled = true;
    progressBar.classList.add('active');
    progressFill.style.width = '0%';
    progressFill.textContent = '0%';
    
    const numSims = parseInt(document.getElementById('num-simulations').value);
    const decision = document.getElementById('decision').value;
    const speed = parseInt(document.getElementById('speed').value);
    
    currentSimulation = 0;
    totalSimulations = numSims;
    simulationQueue = [];
    
    for (let i = 0; i < numSims; i++) {
        simulationQueue.push({
            decision: decision,
            delay: speed
        });
    }
    
    runNextSimulation();
}

function runNextSimulation() {
    if (simulationQueue.length === 0) {
        isSimulating = false;
        simulateBtn.disabled = false;
        progressBar.classList.remove('active');
        document.getElementById('progressText').textContent = '';
        simMessage.textContent = 'Simulacao finalizada';
        return;
    }
    
    const sim = simulationQueue.shift();
    currentSimulation++;
    updateProgress();
    
    const simGame = {
        carDoor: Math.floor(Math.random() * 3),
        selectedDoor: Math.floor(Math.random() * 3),
        openedDoor: null,
        finalDoor: null,
        switched: sim.decision === 'switch',
        won: false
    };
    
    // Reset doors
    simDoors.forEach((doorContainer) => {
        const door = doorContainer.querySelector('.door');
        const content = doorContainer.querySelector('.door-content');
        
        door.classList.remove('open');
        content.classList.remove('show');
        doorContainer.classList.remove('disabled', 'selected');
        
        const index = Array.from(simDoors).indexOf(doorContainer);
        content.innerHTML = prizeHtml(index === simGame.carDoor);
    });

    simDoors[simGame.selectedDoor].classList.add('selected');
    simMessage.textContent = `${currentSimulation}/${totalSimulations} - Porta ${simGame.selectedDoor + 1}`;
    
    const goatDoors = [0, 1, 2].filter(i => 
        i !== simGame.selectedDoor && i !== simGame.carDoor
    );
    simGame.openedDoor = goatDoors[Math.floor(Math.random() * goatDoors.length)];
    
    simDoors[simGame.openedDoor].querySelector('.door').classList.add('open');
    simDoors[simGame.openedDoor].querySelector('.door-content').classList.add('show');
    simDoors[simGame.openedDoor].classList.add('disabled');
    
    if (simGame.switched) {
        const otherDoor = [0, 1, 2].find(i => 
            i !== simGame.selectedDoor && i !== simGame.openedDoor
        );
        simDoors[simGame.selectedDoor].classList.remove('selected');
        simGame.finalDoor = otherDoor;
        simDoors[otherDoor].classList.add('selected');
    } else {
        simGame.finalDoor = simGame.selectedDoor;
    }
    
    simDoors.forEach((doorContainer, index) => {
        if (index !== simGame.openedDoor) {
            doorContainer.querySelector('.door').classList.add('open');
            doorContainer.querySelector('.door-content').classList.add('show');
        }
    });
    
    simGame.won = simGame.finalDoor === simGame.carDoor;
    
    if (simGame.won) {
        simMessage.textContent = `Rodada ${currentSimulation} - Vitoria`;
    } else {
        simMessage.textContent = `Rodada ${currentSimulation} - Derrota`;
    }
    
    gameHistory.push({
        round: gameHistory.length + 1,
        selectedDoor: simGame.selectedDoor + 1,
        openedDoor: simGame.openedDoor + 1,
        switched: simGame.switched,
        finalDoor: simGame.finalDoor + 1,
        carDoor: simGame.carDoor + 1,
        won: simGame.won
    });
    
    updateStats();
    
    setTimeout(runNextSimulation, sim.delay);
}

function updateProgress() {
    const percentage = Math.round((currentSimulation / totalSimulations) * 100);
    progressFill.style.width = percentage + '%';
    document.getElementById('progressText').textContent = `${currentSimulation} / ${totalSimulations}`;
}

function saveGame() {
    gameHistory.push({
        round: gameHistory.length + 1,
        selectedDoor: currentGame.selectedDoor + 1,
        openedDoor: currentGame.openedDoor + 1,
        switched: currentGame.switched,
        finalDoor: currentGame.finalDoor + 1,
        carDoor: currentGame.carDoor + 1,
        won: currentGame.won
    });
    
    updateStats();
}

function updateStats() {
    const tbody = document.querySelector('#gameHistory tbody');
    const lastGame = gameHistory[gameHistory.length - 1];
    
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${lastGame.round}</td>
        <td>${lastGame.selectedDoor}</td>
        <td>${lastGame.openedDoor}</td>
        <td>${lastGame.switched ? 'Sim' : 'Não'}</td>
        <td>${lastGame.finalDoor}</td>
        <td>${lastGame.carDoor}</td>
        <td class="${lastGame.won ? 'win' : 'lose'}">${lastGame.won ? 'Vitoria' : 'Derrota'}</td>
    `;
    tbody.insertBefore(row, tbody.firstChild);
    
    while (tbody.children.length > 50) {
        tbody.removeChild(tbody.lastChild);
    }
    
    const totalGames = gameHistory.length;
    const totalWins = gameHistory.filter(g => g.won).length;
    const switchedGames = gameHistory.filter(g => g.switched);
    const stayedGames = gameHistory.filter(g => !g.switched);
    const switchedWins = switchedGames.filter(g => g.won).length;
    const stayedWins = stayedGames.filter(g => g.won).length;
    
    document.getElementById('totalGames').textContent = totalGames;
    document.getElementById('totalWins').textContent = totalWins;
    document.getElementById('winRate').textContent = 
        totalGames > 0 ? Math.round((totalWins / totalGames) * 100) + '%' : '0%';
    document.getElementById('switchWinRate').textContent = 
        switchedGames.length > 0 ? Math.round((switchedWins / switchedGames.length) * 100) + '%' : '0%';
    document.getElementById('stayWinRate').textContent = 
        stayedGames.length > 0 ? Math.round((stayedWins / stayedGames.length) * 100) + '%' : '0%';
    
    let wins = 0;
    const chartData = gameHistory.map((game, index) => {
        if (game.won) wins++;
        return (wins / (index + 1)) * 100;
    });
    
    winRateChart.data.labels = gameHistory.map((_, index) => index + 1);
    winRateChart.data.datasets[0].data = chartData;
    winRateChart.update();
}

// Initialize chart when page loads
initChart();

// Event listeners for play mode
doors.forEach((doorContainer, index) => {
    doorContainer.addEventListener('click', () => {
        if (gamePhase === 'selecting' && !doorContainer.classList.contains('disabled')) {
            selectDoor(index);
        }
    });
});

switchBtn.addEventListener('click', () => makeDecision(true));
stayBtn.addEventListener('click', () => makeDecision(false));
newGameBtn.addEventListener('click', initGame);

// Initialize first game
initGame();
