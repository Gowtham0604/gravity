const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const uiLayer = document.getElementById('uiLayer');
const hud = document.getElementById('hud');
const startBtn = document.getElementById('startBtn');
const playerNameInput = document.getElementById('playerName');

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

// Game Constants
const TUNNEL_W = 150; // Width of the safe zone
const PLAYER_R = 7;
const GRAVITY = 0.65;
const MAX_SPEED = 14;

// Game State
let state = 'INIT'; // INIT, MENU, PLAYING, GAMEOVER
let player = { x: W/2, y: H * 0.75, vx: 0 };
let gravDir = 1; // 1 = right, -1 = left
let tunnel = [];
let speed = 4;
let elapsed = 0;
let flips = 0;
let startTime = 0;
let score = 0;
let animId;
let particles = [];
let trail = [];

// Leaderboard Logic
const lbKey = 'neon_gravity_lb';
let lb = JSON.parse(localStorage.getItem(lbKey) || '[]');
document.getElementById('bestValue').innerText = (lb[0]?.score || 0).toFixed(1);

function initTunnel() {
    tunnel = [];
    let cx = W / 2;
    // Pre-fill tunnel from top to bottom
    for(let i = 0; i < H/12 + 30; i++) {
        tunnel.push({ y: H - i*12, cx: cx });
    }
}

// Tunnel generation logic
let targetCx = W / 2;
let noisePhase = 0;

function updateTunnel() {
    // Move all segments down
    for(let i=0; i<tunnel.length; i++) {
        tunnel[i].y += speed;
    }
    
    // Remove segments that passed the bottom
    while(tunnel.length > 0 && tunnel[0].y > H + 30) {
        tunnel.shift();
    }
    
    // Add new segments at the top
    let lastY = tunnel[tunnel.length-1].y;
    while(lastY > -30) {
        lastY -= 12;
        
        // Dynamic path calculation
        noisePhase += 0.015 * (speed / 5);
        
        // Base sine wave
        let wave1 = Math.sin(noisePhase) * (W * 0.32);
        // Secondary wave for unpredictability
        let wave2 = Math.sin(noisePhase * 2.7) * (W * 0.12);
        
        targetCx = (W/2) + wave1 + wave2;
        
        // Constrain tunnel within screen bounds
        const padding = TUNNEL_W/2 + 20;
        targetCx = Math.max(padding, Math.min(W - padding, targetCx));
        
        tunnel.push({ y: lastY, cx: targetCx });
    }
}

// Particle System
function spawnParticles(x, y, color, count, speedMulti = 1) {
    for(let i=0; i<count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const velocity = (Math.random() * 5 + 2) * speedMulti;
        particles.push({
            x: x, y: y,
            vx: Math.cos(angle) * velocity,
            vy: Math.sin(angle) * velocity,
            life: 1,
            decay: Math.random() * 0.02 + 0.015,
            color: color,
            size: Math.random() * 4 + 1.5
        });
    }
}

function updateParticles() {
    for(let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if(p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles() {
    for(let p of particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function startGame() {
    const name = playerNameInput.value.trim() || 'Guest';
    playerNameInput.dataset.name = name;
    
    uiLayer.classList.add('hidden');
    hud.classList.remove('hidden');
    
    resize();
    initTunnel();
    player = { x: W/2, y: H * 0.75, vx: 0 };
    gravDir = 1;
    speed = 5.5;
    elapsed = 0;
    flips = 0;
    particles = [];
    trail = [];
    startTime = Date.now();
    state = 'PLAYING';
    
    document.getElementById('flipsValue').innerText = '0';
    document.getElementById('timeValue').innerText = '0.0';
    
    if(animId) cancelAnimationFrame(animId);
    loop();
}

function flipGravity() {
    if(state !== 'PLAYING') return;
    gravDir *= -1;
    flips++;
    document.getElementById('flipsValue').innerText = flips;
    
    // Visual feedback for flip
    const color = gravDir > 0 ? '#00f3ff' : '#ff00ea';
    spawnParticles(player.x, player.y, color, 8, 0.8);
}

function die() {
    state = 'GAMEOVER';
    
    // Death explosion
    spawnParticles(player.x, player.y, '#ffffff', 30, 2);
    spawnParticles(player.x, player.y, '#ff00ea', 20, 1.5);
    spawnParticles(player.x, player.y, '#00f3ff', 20, 1.5);
    
    setTimeout(showGameOver, 1200);
}

function showGameOver() {
    const score = Math.round(elapsed * 10) / 10;
    const name = playerNameInput.dataset.name || 'Guest';
    
    lb.push({ name, score });
    lb.sort((a, b) => b.score - a.score);
    lb.splice(5); // Keep top 5
    localStorage.setItem(lbKey, JSON.stringify(lb));
    
    document.getElementById('bestValue').innerText = (lb[0]?.score || 0).toFixed(1);
    
    hud.classList.add('hidden');
    uiLayer.classList.remove('hidden');
    
    // Update UI elements for Game Over state
    const logoWrapper = uiLayer.querySelector('.logo-wrapper');
    logoWrapper.innerHTML = `<h1 id="statusMsg">SYSTEM FAILURE</h1><p class="crash-stats">${score.toFixed(1)}s SURVIVED &nbsp;•&nbsp; ${flips} FLIPS</p>`;
    uiLayer.querySelector('.subtitle').style.display = 'none';
    
    startBtn.querySelector('span').innerText = 'REBOOT SYSTEM';
    
    const lbDiv = document.getElementById('leaderboard');
    lbDiv.classList.remove('hidden');
    
    const lbContent = document.getElementById('lbContent');
    lbContent.innerHTML = lb.map((entry, i) => `
        <div class="lb-row ${entry.name === name && entry.score === score ? 'me' : ''}">
            <span class="lb-rank">#${i+1}</span>
            <span>${entry.name}</span>
            <span class="lb-score">${entry.score.toFixed(1)}s</span>
        </div>
    `).join('');
}

function drawTunnel() {
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    
    // Left Wall
    ctx.beginPath();
    ctx.moveTo(tunnel[0].cx - TUNNEL_W/2, tunnel[0].y);
    for(let i=1; i<tunnel.length; i++) {
        ctx.lineTo(tunnel[i].cx - TUNNEL_W/2, tunnel[i].y);
    }
    ctx.strokeStyle = '#ff00ea'; // Magenta
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff00ea';
    ctx.stroke();
    
    // Right Wall
    ctx.beginPath();
    ctx.moveTo(tunnel[0].cx + TUNNEL_W/2, tunnel[0].y);
    for(let i=1; i<tunnel.length; i++) {
        ctx.lineTo(tunnel[i].cx + TUNNEL_W/2, tunnel[i].y);
    }
    ctx.strokeStyle = '#00f3ff'; // Cyan
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#00f3ff';
    ctx.stroke();
    
    ctx.shadowBlur = 0; // Reset
    
    // Draw motion grid lines inside the tunnel
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for(let i=0; i<tunnel.length; i+=6) {
        ctx.beginPath();
        ctx.moveTo(tunnel[i].cx - TUNNEL_W/2 + 5, tunnel[i].y);
        ctx.lineTo(tunnel[i].cx + TUNNEL_W/2 - 5, tunnel[i].y);
        ctx.stroke();
    }
}

function loop() {
    // Solid background clear
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, W, H);
    
    if(state === 'PLAYING') {
        elapsed = (Date.now() - startTime) / 1000;
        speed = Math.min(5.5 + elapsed * 0.12, MAX_SPEED);
        
        document.getElementById('timeValue').innerText = elapsed.toFixed(1);
        document.getElementById('speedValue').innerText = (speed / 5).toFixed(1) + 'x';
        
        updateTunnel();
        
        // Player Physics
        player.vx += gravDir * GRAVITY;
        player.vx *= 0.90; // Friction
        player.x += player.vx;
        
        // Trail updating
        trail.unshift({x: player.x, y: player.y});
        if(trail.length > 20) trail.pop();
        
        // Collision Detection
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
                // Pin player to wall exactly at moment of death
                player.x = player.x - PLAYER_R <= leftWall ? leftWall + PLAYER_R : rightWall - PLAYER_R;
                die();
            }
        }
    } else if (state === 'MENU' || state === 'INIT') {
        // Menu animation
        speed = 3.5;
        updateTunnel();
    }
    
    drawTunnel();
    
    if(state === 'PLAYING') {
        // Draw Player Trail
        ctx.beginPath();
        for(let i=0; i<trail.length; i++) {
            const pt = trail[i];
            const ratio = 1 - (i / trail.length);
            ctx.lineWidth = PLAYER_R * 2.5 * ratio;
            ctx.strokeStyle = gravDir > 0 ? `rgba(0,243,255,${ratio * 0.6})` : `rgba(255,0,234,${ratio * 0.6})`;
            if(i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        
        // Draw Player Core
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER_R, 0, Math.PI*2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 15;
        ctx.shadowColor = gravDir > 0 ? '#00f3ff' : '#ff00ea';
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Draw Direction Indicators (Arrows)
        ctx.beginPath();
        const dirOffset = (PLAYER_R + 6) * gravDir;
        ctx.moveTo(player.x + dirOffset, player.y);
        ctx.lineTo(player.x + dirOffset - (4 * gravDir), player.y - 4);
        ctx.lineTo(player.x + dirOffset - (4 * gravDir), player.y + 4);
        ctx.fillStyle = gravDir > 0 ? '#00f3ff' : '#ff00ea';
        ctx.fill();
    }
    
    updateParticles();
    drawParticles();
    
    animId = requestAnimationFrame(loop);
}

// Event Listeners for Interaction
startBtn.addEventListener('click', startGame);

function handleInput(e) {
    if(state !== 'PLAYING') return;
    if(e.type === 'keydown' && e.code !== 'Space') return;
    if(e.type === 'keydown') e.preventDefault();
    flipGravity();
}

document.addEventListener('keydown', handleInput);
canvas.addEventListener('mousedown', handleInput);
canvas.addEventListener('touchstart', (e) => {
    // Only prevent default if we're touching the canvas during gameplay
    // This allows clicking inputs and buttons in the UI
    if(state === 'PLAYING') {
        e.preventDefault();
        handleInput(e);
    }
}, {passive: false});

// Initialization
state = 'INIT';
initTunnel();
loop();
