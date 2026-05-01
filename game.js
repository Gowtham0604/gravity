const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- DOM Elements ---
const ui = {
    mainMenu: document.getElementById('mainMenu'),
    gameHud: document.getElementById('gameHud'),
    pauseMenu: document.getElementById('pauseMenu'),
    gameOverMenu: document.getElementById('gameOverMenu'),
    scoreValue: document.getElementById('scoreValue'),
    multiplierValue: document.getElementById('multiplierValue'),
    speedValue: document.getElementById('speedValue'),
    finalScoreValue: document.getElementById('finalScoreValue'),
    finalTimeValue: document.getElementById('finalTimeValue'),
    playerName: document.getElementById('playerName'),
    lbPreviewContent: document.getElementById('lbPreviewContent')
};

// --- Screen Sizing ---
let W, H;
function resize() {
    const container = document.getElementById('app');
    W = container.clientWidth;
    H = container.clientHeight;
    canvas.width = W;
    canvas.height = H;
}
window.addEventListener('resize', resize);
resize();

// --- Audio System (Web Audio API) ---
const AudioSys = {
    ctx: null,
    muted: false,
    bgmOsc: null,
    bgmGain: null,
    
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },
    
    playTone(freq, type, duration, vol = 0.1) {
        if (this.muted || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    
    pickupCoin() { 
        this.playTone(880, 'sine', 0.1, 0.1); 
        setTimeout(() => this.playTone(1760, 'sine', 0.15, 0.1), 50); 
    },
    
    pickupMultiplier() {
        this.playTone(659, 'square', 0.1, 0.1); 
        setTimeout(() => this.playTone(880, 'square', 0.1, 0.1), 100); 
        setTimeout(() => this.playTone(1318, 'square', 0.2, 0.1), 200); 
    },
    
    crash() { 
        this.playTone(150, 'sawtooth', 0.5, 0.3); 
        setTimeout(() => this.playTone(100, 'square', 0.5, 0.3), 100); 
        setTimeout(() => this.playTone(50, 'sawtooth', 0.8, 0.3), 200);
    },
    
    startBGM() {
        if(this.muted || !this.ctx) return;
        this.stopBGM();
        this.bgmOsc = this.ctx.createOscillator();
        this.bgmGain = this.ctx.createGain();
        
        // A low pulsing drone for space vibe
        this.bgmOsc.type = 'triangle';
        this.bgmOsc.frequency.setValueAtTime(65, this.ctx.currentTime); 
        
        // Setup LFO for pulsing effect
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 2; // 2Hz pulse
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 10;
        lfo.connect(lfoGain);
        lfoGain.connect(this.bgmOsc.frequency);
        lfo.start();
        
        this.bgmGain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        
        this.bgmOsc.connect(this.bgmGain);
        this.bgmGain.connect(this.ctx.destination);
        this.bgmOsc.start();
        
        // Store LFO to stop it later
        this.bgmOsc.lfo = lfo;
    },
    
    stopBGM() {
        if(this.bgmOsc) {
            this.bgmOsc.stop();
            if (this.bgmOsc.lfo) this.bgmOsc.lfo.stop();
            this.bgmOsc.disconnect();
            this.bgmGain.disconnect();
            this.bgmOsc = null;
        }
    }
};

document.getElementById('toggleAudioBtnMain').addEventListener('click', (e) => {
    AudioSys.muted = !AudioSys.muted;
    e.target.innerText = AudioSys.muted ? '🔇' : '🔊';
    if (!AudioSys.muted) AudioSys.init();
});

// --- Game Constants & State ---
const TUNNEL_W = 360;
const PLAYER_R = 24;
const BASE_SPEED = 400; // pixels per second

let state = 'MENU'; // MENU, PLAYING, PAUSED, GAMEOVER
let player = { x: W/2, y: H * 0.75 };
let mouseX = W/2;

let tunnel = [];
let entities = []; // Coins, Multipliers, Obstacles
let particles = [];
let trail = [];

let stats = {
    score: 0,
    multiplier: 1,
    multiplierTimer: 0,
    speedMult: 1.0,
    elapsed: 0,
    lastFrameTime: 0
};

let noisePhase = 0;
let lastEntityY = 0;

// --- Leaderboard System ---
const LB_KEY = 'stellar_drift_top_pilots';
let leaderboard = JSON.parse(localStorage.getItem(LB_KEY) || '[]');

function saveScore() {
    const name = ui.playerName.value.trim() || 'Pilot_' + Math.floor(Math.random() * 9999);
    leaderboard.push({ name, score: Math.floor(stats.score) });
    leaderboard.sort((a,b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 5); // Keep top 5
    localStorage.setItem(LB_KEY, JSON.stringify(leaderboard));
}

function renderLeaderboard() {
    if (leaderboard.length === 0) {
        ui.lbPreviewContent.innerHTML = '<div class="lb-row" style="justify-content:center;color:#94a3b8;">No flight logs found</div>';
        return;
    }
    ui.lbPreviewContent.innerHTML = leaderboard.map(entry => `
        <div class="lb-row">
            <span>${entry.name}</span>
            <span class="score">${entry.score.toLocaleString()}</span>
        </div>
    `).join('');
}
renderLeaderboard(); // Init on load

// --- Game Logic ---
function switchState(newState) {
    state = newState;
    
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    
    if (state === 'MENU') {
        ui.mainMenu.classList.add('active');
        renderLeaderboard();
        AudioSys.stopBGM();
    } 
    else if (state === 'PLAYING') {
        ui.gameHud.classList.add('active');
        stats.lastFrameTime = performance.now();
        AudioSys.startBGM();
    } 
    else if (state === 'PAUSED') {
        ui.pauseMenu.classList.add('active');
        ui.gameHud.classList.add('active'); // Keep HUD visible under blur
        AudioSys.stopBGM();
    } 
    else if (state === 'GAMEOVER') {
        ui.gameOverMenu.classList.add('active');
        ui.finalScoreValue.innerText = Math.floor(stats.score).toLocaleString();
        ui.finalTimeValue.innerText = stats.elapsed.toFixed(1) + 's';
        saveScore();
        AudioSys.stopBGM();
    }
}

function initGame() {
    tunnel = [];
    entities = [];
    particles = [];
    trail = [];
    player = { x: W/2, y: H * 0.75 };
    mouseX = W/2;
    
    stats = {
        score: 0,
        multiplier: 1,
        multiplierTimer: 0,
        speedMult: 1.0,
        elapsed: 0,
        lastFrameTime: performance.now()
    };
    
    noisePhase = 0;
    lastEntityY = 0;
    
    // Pre-fill tunnel from bottom to top
    let cx = W/2;
    for(let i = 0; i < H/15 + 20; i++) {
        tunnel.push({ y: H - i*15, cx: cx });
    }
    
    updateHUD();
    AudioSys.init(); // Ensure audio context is ready after user interaction
}

function spawnParticles(x, y, color, count, speed = 2, decay = 0.02) {
    for(let i=0; i<count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (Math.random() * speed) + (speed * 0.5);
        particles.push({
            x, y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: 1,
            decay: decay + Math.random() * 0.02,
            color,
            size: Math.random() * 3 + 1.5
        });
    }
}

function spawnEntity(y, cx) {
    // Prevent spawning too close to each other
    if (y - lastEntityY > -250) return; 
    
    // 60% chance to spawn an entity at this eligible interval
    if (Math.random() > 0.6) return;
    
    lastEntityY = y;
    
    const r = Math.random();
    let type;
    if (r < 0.6) type = 'COIN';
    else if (r < 0.75) type = 'MULTIPLIER';
    else type = 'OBSTACLE';
    
    // Offset from center, keeping it within tunnel bounds
    const maxOffset = (TUNNEL_W / 2) - 30;
    const offset = (Math.random() * 2 - 1) * maxOffset;
    
    entities.push({
        type: type,
        x: cx + offset,
        y: y,
        radius: type === 'OBSTACLE' ? 14 : 10,
        active: true,
        pulse: Math.random() * Math.PI * 2
    });
}

function updateEnvironment(dt) {
    const moveDist = BASE_SPEED * stats.speedMult * dt;
    
    // Move everything down
    for(let t of tunnel) t.y += moveDist;
    for(let e of entities) e.y += moveDist;
    for(let p of particles) {
        p.x += p.vx;
        p.y += p.vy + moveDist * 0.5; // Particles inherit some world velocity
        p.life -= p.decay;
    }
    
    // Cleanup off-screen
    while(tunnel.length > 0 && tunnel[0].y > H + 50) tunnel.shift();
    entities = entities.filter(e => e.y < H + 50 && e.active);
    particles = particles.filter(p => p.life > 0);
    
    // Generate new path at top
    let lastY = tunnel[tunnel.length-1].y;
    while(lastY > -50) {
        lastY -= 15;
        noisePhase += 0.015 * stats.speedMult;
        
        // Complex sine wave for organic pathing
        let wave1 = Math.sin(noisePhase) * (W * 0.25);
        let wave2 = Math.sin(noisePhase * 2.3) * (W * 0.15);
        let wave3 = Math.cos(noisePhase * 0.5) * (W * 0.05);
        
        let targetCx = W/2 + wave1 + wave2 + wave3;
        
        // Clamp to screen padding
        const pad = TUNNEL_W/2 + 20;
        targetCx = Math.max(pad, Math.min(W - pad, targetCx));
        
        tunnel.push({ y: lastY, cx: targetCx });
        
        // Try spawning entities
        spawnEntity(lastY, targetCx);
    }
}

function die() {
    AudioSys.crash();
    // Big explosion
    spawnParticles(player.x, player.y, '#fb7185', 50, 6, 0.015);
    spawnParticles(player.x, player.y, '#ffffff', 30, 4, 0.02);
    spawnParticles(player.x, player.y, '#fcd34d', 20, 3, 0.03);
    
    setTimeout(() => switchState('GAMEOVER'), 1500);
}

function updateGame(dt) {
    stats.elapsed += dt;
    
    // Progressive difficulty
    stats.speedMult = Math.min(1.0 + (stats.elapsed * 0.015), 3.0);
    
    // Multiplier logic
    if (stats.multiplierTimer > 0) {
        stats.multiplierTimer -= dt;
        if (stats.multiplierTimer <= 0) stats.multiplier = 1;
    }
    
    // Passive score over time
    stats.score += (BASE_SPEED * stats.speedMult * dt * 0.1) * stats.multiplier;
    
    updateEnvironment(dt);
    
    // Player Physics (Smooth follow)
    player.x += (mouseX - player.x) * (dt * 15);
    
    // Trail logic
    trail.unshift({ x: player.x, y: player.y });
    if(trail.length > 20) trail.pop();
    
    // Wall Collision Detection
    let closestSeg = tunnel[0];
    let minDist = Infinity;
    for(let s of tunnel) {
        let d = Math.abs(s.y - player.y);
        if(d < minDist) { 
            minDist = d; 
            closestSeg = s; 
        }
    }
    
    if(closestSeg) {
        const leftWall = closestSeg.cx - TUNNEL_W/2;
        const rightWall = closestSeg.cx + TUNNEL_W/2;
        
        if(player.x - PLAYER_R <= leftWall || player.x + PLAYER_R >= rightWall) {
            // Pin to wall to show exact point of death
            player.x = player.x - PLAYER_R <= leftWall ? leftWall + PLAYER_R : rightWall - PLAYER_R;
            die();
            return;
        }
    }
    
    // Entity Collision Detection
    for(let e of entities) {
        if(!e.active) continue;
        const dx = e.x - player.x;
        const dy = e.y - player.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if(dist < PLAYER_R + e.radius) {
            e.active = false; // consume
            
            if(e.type === 'COIN') {
                stats.score += 250 * stats.multiplier;
                AudioSys.pickupCoin();
                spawnParticles(e.x, e.y, '#38bdf8', 15, 3);
            } 
            else if (e.type === 'MULTIPLIER') {
                stats.multiplier = Math.min(stats.multiplier + 1, 10);
                stats.multiplierTimer = 8; // 8 seconds duration
                AudioSys.pickupMultiplier();
                spawnParticles(e.x, e.y, '#c084fc', 20, 4);
            } 
            else if (e.type === 'OBSTACLE') {
                die();
                return;
            }
        }
    }
    
    updateHUD();
}

function updateHUD() {
    ui.scoreValue.innerText = Math.floor(stats.score).toLocaleString();
    ui.multiplierValue.innerText = stats.multiplier + 'x';
    ui.speedValue.innerText = stats.speedMult.toFixed(1) + 'x';
    
    // Highlight multiplier if active
    if (stats.multiplier > 1) {
        ui.multiplierValue.style.color = '#c084fc';
        ui.multiplierValue.style.textShadow = '0 0 10px rgba(192, 132, 252, 0.5)';
    } else {
        ui.multiplierValue.style.color = 'white';
        ui.multiplierValue.style.textShadow = 'none';
    }
}

function draw() {
    ctx.clearRect(0, 0, W, H);
    
    // --- Draw Tunnel ---
    if (tunnel.length > 0) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = 16;
        
        // Left Wall
        ctx.beginPath();
        ctx.moveTo(tunnel[0].cx - TUNNEL_W/2, tunnel[0].y);
        for(let i=1; i<tunnel.length; i++) ctx.lineTo(tunnel[i].cx - TUNNEL_W/2, tunnel[i].y);
        ctx.strokeStyle = '#818cf8';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#818cf8';
        ctx.stroke();
        
        // Right Wall
        ctx.beginPath();
        ctx.moveTo(tunnel[0].cx + TUNNEL_W/2, tunnel[0].y);
        for(let i=1; i<tunnel.length; i++) ctx.lineTo(tunnel[i].cx + TUNNEL_W/2, tunnel[i].y);
        ctx.strokeStyle = '#38bdf8';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#38bdf8';
        ctx.stroke();
        
        ctx.shadowBlur = 0; // reset
        
        // Background Grid/Lines inside tunnel
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for(let i=0; i<tunnel.length; i+=8) {
            ctx.beginPath();
            ctx.moveTo(tunnel[i].cx - TUNNEL_W/2, tunnel[i].y);
            ctx.lineTo(tunnel[i].cx + TUNNEL_W/2, tunnel[i].y);
            ctx.stroke();
        }
    }
    
    // --- Draw Entities ---
    const t = performance.now() / 1000;
    for(let e of entities) {
        if(!e.active) continue;
        
        ctx.beginPath();
        
        if (e.type === 'COIN') {
            // Diamond shape
            ctx.moveTo(e.x, e.y - e.radius);
            ctx.lineTo(e.x + e.radius, e.y);
            ctx.lineTo(e.x, e.y + e.radius);
            ctx.lineTo(e.x - e.radius, e.y);
            ctx.fillStyle = '#38bdf8';
            ctx.shadowColor = '#38bdf8';
        } 
        else if (e.type === 'MULTIPLIER') {
            // Hexagon
            for (let i = 0; i < 6; i++) {
                const a = (i * Math.PI / 3) + t;
                const px = e.x + Math.cos(a) * e.radius;
                const py = e.y + Math.sin(a) * e.radius;
                if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.fillStyle = '#c084fc';
            ctx.shadowColor = '#c084fc';
        } 
        else if (e.type === 'OBSTACLE') {
            // Pulsing Spiked Circle
            const pulseRad = e.radius + Math.sin(t * 8 + e.pulse) * 3;
            for (let i = 0; i < 8; i++) {
                const a = (i * Math.PI / 4) + t;
                const r = i % 2 === 0 ? pulseRad : pulseRad * 0.5;
                const px = e.x + Math.cos(a) * r;
                const py = e.y + Math.sin(a) * r;
                if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.fillStyle = '#fb7185';
            ctx.shadowColor = '#fb7185';
        }
        
        ctx.closePath();
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    // --- Draw Particles ---
    for(let p of particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    // --- Draw Player ---
    if (state === 'PLAYING' || state === 'PAUSED') {
        // Trail
        ctx.beginPath();
        for(let i=0; i<trail.length; i++) {
            const r = 1 - (i/trail.length);
            ctx.lineWidth = PLAYER_R * 2 * r;
            ctx.strokeStyle = `rgba(56, 189, 248, ${r * 0.4})`;
            if(i===0) ctx.moveTo(trail[i].x, trail[i].y);
            else ctx.lineTo(trail[i].x, trail[i].y);
        }
        ctx.stroke();
        
        // Ship Core
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER_R, 0, Math.PI*2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#38bdf8';
        ctx.fill();
        
        // Inner core details
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER_R * 0.5, 0, Math.PI*2);
        ctx.fillStyle = '#818cf8';
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    // Menu background animation
    if (state === 'MENU') {
        // Feed fake dt to keep background moving
        updateEnvironment(0.016);
    }
}

function loop() {
    const now = performance.now();
    // Clamp dt to prevent huge jumps if tab was inactive
    const dt = Math.min((now - stats.lastFrameTime) / 1000, 0.1); 
    stats.lastFrameTime = now;
    
    if (state === 'PLAYING') {
        updateGame(dt);
    }
    
    draw();
    requestAnimationFrame(loop);
}

// --- Input Handling ---
function handleMove(e) {
    if (state !== 'PLAYING') return;
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
        mouseX = e.touches[0].clientX - rect.left;
    } else {
        mouseX = e.clientX - rect.left;
    }
}

document.addEventListener('mousemove', handleMove);
canvas.addEventListener('touchmove', (e) => {
    if (state === 'PLAYING') { 
        e.preventDefault(); 
        handleMove(e); 
    }
}, { passive: false });

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (state === 'PLAYING') {
            switchState('PAUSED');
        } else if (state === 'PAUSED') {
            stats.lastFrameTime = performance.now();
            switchState('PLAYING');
        }
    }
});

// --- Button Listeners ---
document.getElementById('startBtn').addEventListener('click', () => {
    initGame();
    switchState('PLAYING');
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    if (state === 'PLAYING') switchState('PAUSED');
});

document.getElementById('resumeBtn').addEventListener('click', () => {
    stats.lastFrameTime = performance.now();
    switchState('PLAYING');
});

document.getElementById('restartBtnPause').addEventListener('click', () => {
    initGame();
    switchState('PLAYING');
});

document.getElementById('quitBtn').addEventListener('click', () => {
    switchState('MENU');
});

document.getElementById('restartBtnGameOver').addEventListener('click', () => {
    initGame();
    switchState('PLAYING');
});

document.getElementById('menuBtn').addEventListener('click', () => {
    switchState('MENU');
});

// --- Initialization ---
initGame();
switchState('MENU');
stats.lastFrameTime = performance.now();
requestAnimationFrame(loop);
