
const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d', { alpha: true });
let W, H, DPR;
function resize(){
  DPR = window.devicePixelRatio || 1;
  W = Math.floor(window.innerWidth * DPR);
  H = Math.floor(window.innerHeight * DPR);
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
}
resize();
window.addEventListener('resize', resize);

// PWA: register service worker
if ('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(console.error);
}

// UI elements
const folderBtn = document.getElementById('folderBtn');
const folderInput = document.getElementById('folderInput');
const focusBtn  = document.getElementById('focusBtn');
const trackDisplay = document.getElementById('track');
const timerDisplay = document.getElementById('timer');
const player = document.getElementById('player');

// World state
let islands = [];
let current = null;
let time = 0;

const ship = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  speed: 0.25,
  trail: []
};

let focusMode = false;
let focusEnd = 0;

// Input
const keys = {};
window.addEventListener('keydown', e => { keys[e.key] = true; });
window.addEventListener('keyup', e => { keys[e.key] = false; });

// Touch joystick for mobile
let touchActive = false;
let touchStart = null;
canvas.addEventListener('touchstart', e => {
  const t = e.touches[0];
  touchActive = true;
  touchStart = { x: t.clientX, y: t.clientY };
});
canvas.addEventListener('touchmove', e => {
  if (!touchActive || !touchStart) return;
  const t = e.touches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  const dead = 8;
  let ax = 0, ay = 0;
  if (Math.abs(dx) > dead) ax = dx;
  if (Math.abs(dy) > dead) ay = dy;
  const len = Math.hypot(ax, ay) || 1;
  ax /= len; ay /= len;
  // simulate keys via vector
  ship.vx += ax * ship.speed * 0.4;
  ship.vy += ay * ship.speed * 0.4;
});
canvas.addEventListener('touchend', () => {
  touchActive = false;
  touchStart = null;
});

// Folder selection
folderBtn.onclick = () => {
  // iOS Safari does not support webkitdirectory; fallback to multi-file selection
  folderInput.removeAttribute('webkitdirectory');
  folderInput.removeAttribute('directory');
  folderInput.multiple = true;
  folderInput.click();
};

folderInput.onchange = e => {
  const files = [...e.target.files].filter(f => /\.(mp3|wav|ogg|m4a|flac)$/i.test(f.name));
  if (!files.length) return;
  generateWorld(files);
};

focusBtn.onclick = () => {
  if (!focusMode) {
    focusMode = true;
    focusEnd = Date.now() + 25 * 60 * 1000;
    focusBtn.textContent = "Exit Focus";
  } else {
    focusMode = false;
    focusBtn.textContent = "Focus Mode";
    timerDisplay.textContent = "";
  }
};

function generateWorld(files){
  islands = [];
  const cx = 0;
  const cy = 0;
  const baseRadius = 1800;
  const n = files.length;

  files.forEach((file, i) => {
    const angleBase = (i / n) * Math.PI * 2;
    const angleJitter = (Math.random() - 0.5) * (Math.PI / 36);
    const angle = angleBase + angleJitter;
    const radiusJitter = (Math.random() - 0.5) * 160;
    const r = baseRadius + radiusJitter;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;

    islands.push({
      id: i,
      file,
      name: file.name.replace(/\.[^/.]+$/, ''),
      baseX: x,
      baseY: y,
      orbitAmp: 6 + Math.random() * 10,
      orbitSpeed: 0.1 + Math.random() * 0.25,
      orbitPhase: Math.random() * Math.PI * 2,
      radius: 70,
      hue: (i / n) * 360,
    });
  });

  ship.x = 0;
  ship.y = 0;
  ship.vx = 0;
  ship.vy = 0;
  ship.trail = [];
  current = null;
  trackDisplay.textContent = "Sail to an island to begin...";
}

// Update loop
function update(dt){
  // movement input (keyboard)
  let ax = 0, ay = 0;
  if (keys['w'] || keys['ArrowUp']) ay -= 1;
  if (keys['s'] || keys['ArrowDown']) ay += 1;
  if (keys['a'] || keys['ArrowLeft']) ax -= 1;
  if (keys['d'] || keys['ArrowRight']) ax += 1;

  if (ax !== 0 || ay !== 0){
    const len = Math.hypot(ax, ay) || 1;
    ax /= len; ay /= len;
    ship.vx += ax * ship.speed;
    ship.vy += ay * ship.speed;
  }

  // friction
  ship.vx *= 0.985;
  ship.vy *= 0.985;

  ship.x += ship.vx * dt * 60;
  ship.y += ship.vy * dt * 60;

  // keep a trail of last positions
  ship.trail.push({x: ship.x, y: ship.y, t: time});
  if (ship.trail.length > 60){
    ship.trail.shift();
  }

  // focus timer
  if (focusMode){
    const remaining = focusEnd - Date.now();
    if (remaining <= 0){
      focusMode = false;
      focusBtn.textContent = "Focus Mode";
      timerDisplay.textContent = "Session complete ✨";
    } else {
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining / 1000) % 60);
      timerDisplay.textContent = `Focus: ${m}:${s.toString().padStart(2,'0')}`;
    }
  }

  // island collision
  for (const isl of islands){
    const pos = getIslandPosition(isl);
    const dist = Math.hypot(ship.x - pos.x, ship.y - pos.y);
    if (dist < isl.radius * 0.9){
      if (!current || current.id !== isl.id){
        playIsland(isl);
      }
    }
  }
}

function playIsland(isl){
  current = isl;
  trackDisplay.textContent = isl.name;
  const url = URL.createObjectURL(isl.file);
  player.src = url;
  player.play();
}

// compute island position including its orbit
function getIslandPosition(isl){
  const t = time * isl.orbitSpeed + isl.orbitPhase;
  const ox = Math.cos(t) * isl.orbitAmp;
  const oy = Math.sin(t) * isl.orbitAmp;
  return { x: isl.baseX + ox, y: isl.baseY + oy };
}

// Drawing helpers
function drawBackground(){
  ctx.save();
  ctx.scale(DPR, DPR);

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // starry sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, vh);
  sky.addColorStop(0, '#0c1530');
  sky.addColorStop(0.5, '#050b18');
  sky.addColorStop(1, '#02040a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, vw, vh);

  // simple starfield
  const starCount = 80;
  for (let i = 0; i < starCount; i++){
    const sx = (i * 97 % vw);
    const sy = (i * 53 % vh);
    const twinkle = 0.5 + 0.5 * Math.sin(time * 0.8 + i);
    ctx.fillStyle = `rgba(255,255,255,${0.08 * twinkle})`;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }

  // ocean layer (parallax)
  const waveOffset = time * 12;
  const grad = ctx.createLinearGradient(0, vh*0.4, 0, vh);
  grad.addColorStop(0, '#061729');
  grad.addColorStop(1, '#020910');
  ctx.fillStyle = grad;
  ctx.fillRect(0, vh*0.4, vw, vh*0.6);

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  const waveHeight = 18;
  const waveLength = 220;
  ctx.moveTo(0, vh*0.55);
  for (let x = 0; x <= vw; x += 10){
    const y = vh*0.55 + Math.sin((x + waveOffset) / waveLength) * waveHeight;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(vw, vh);
  ctx.lineTo(0, vh);
  ctx.closePath();
  ctx.fillStyle = '#0b2740';
  ctx.fill();
  ctx.restore();

  // vignette
  const vg = ctx.createRadialGradient(vw/2, vh/2, Math.min(vw,vh)/4, vw/2, vh/2, Math.max(vw,vh)/1.1);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0,0,vw,vh);

  ctx.restore();
}

function drawWorld(){
  drawBackground();

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  ctx.save();
  ctx.scale(DPR, DPR);

  // camera centered on ship
  const camX = ship.x - vw / 2;
  const camY = ship.y - vh / 2;

  // soft fog
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const fogGrad = ctx.createRadialGradient(vw/2, vh/2, 0, vw/2, vh/2, Math.min(vw,vh)*0.9);
  fogGrad.addColorStop(0, 'rgba(100,180,255,0.08)');
  fogGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0,0,vw,vh);
  ctx.restore();

  // islands
  for (const isl of islands){
    const pos = getIslandPosition(isl);
    const sx = pos.x - camX;
    const sy = pos.y - camY;

    const pulse = 0.15 * Math.sin(time * 1.3 + isl.id) + 0.85;
    const r = isl.radius * pulse;
    const baseHue = isl.hue;

    // glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glowGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r*2.2);
    const sat = (current && current.id === isl.id) ? 90 : 70;
    glowGrad.addColorStop(0, `hsla(${baseHue},${sat}%,70%,0.95)`);
    glowGrad.addColorStop(0.3, `hsla(${baseHue},${sat}%,45%,0.45)`);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(sx-r*2.2, sy-r*2.2, r*4.4, r*4.4);
    ctx.restore();

    // island body
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = (current && current.id === isl.id)
      ? `hsl(${baseHue},85%,80%)`
      : `hsl(${baseHue},75%,65%)`;
    ctx.fill();

    // inner ring
    ctx.beginPath();
    ctx.arc(sx, sy, r*0.7, 0, Math.PI*2);
    ctx.fillStyle = `hsla(${baseHue},55%,82%,0.9)`;
    ctx.fill();

    // label
    ctx.fillStyle = '#020611';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = isl.name.length > 16 ? isl.name.slice(0,15) + '…' : isl.name;
    ctx.fillText(label, sx, sy);
  }

  // ship trail
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < ship.trail.length; i++){
    const p = ship.trail[i];
    const age = time - p.t;
    const alpha = Math.max(0, 1 - age * 1.5);
    if (alpha <= 0) continue;
    const sx = p.x - camX;
    const sy = p.y - camY;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI*2);
    ctx.fillStyle = `rgba(120,200,255,${alpha*0.25})`;
    ctx.fill();
  }
  ctx.restore();

  // ship
  const shipScreenX = vw / 2;
  const shipScreenY = vh / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const coreGrad = ctx.createRadialGradient(shipScreenX, shipScreenY, 0, shipScreenX, shipScreenY, 26);
  coreGrad.addColorStop(0, 'rgba(255,255,255,1)');
  coreGrad.addColorStop(0.3, 'rgba(195,230,255,0.95)');
  coreGrad.addColorStop(1, 'rgba(60,160,255,0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(shipScreenX, shipScreenY, 26, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(shipScreenX, shipScreenY, 8, 0, Math.PI*2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // directional hint
  const velMag = Math.hypot(ship.vx, ship.vy);
  if (velMag > 0.01){
    const dx = (ship.vx / velMag) * 18;
    const dy = (ship.vy / velMag) * 18;
    ctx.beginPath();
    ctx.moveTo(shipScreenX + dx, shipScreenY + dy);
    ctx.lineTo(shipScreenX + dx*0.3 - dy*0.4, shipScreenY + dy*0.3 + dx*0.4);
    ctx.lineTo(shipScreenX + dx*0.3 + dy*0.4, shipScreenY + dy*0.3 - dx*0.4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
  }

  ctx.restore();
}

// main loop
let lastTime = performance.now();
function loop(now){
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  time += dt;

  update(dt);
  drawWorld();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
