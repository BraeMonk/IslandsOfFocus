
const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d', { alpha: true });
const mini = document.getElementById('minimap');
const miniCtx = mini.getContext('2d');

let DPR, W, H;
function resize(){
  DPR = window.devicePixelRatio || 1;
  W = Math.floor(window.innerWidth * DPR);
  H = Math.floor(window.innerHeight * DPR);
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";

  const miniSize = mini.clientWidth * DPR;
  mini.width = miniSize;
  mini.height = miniSize;
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
const audioBtn  = document.getElementById('audioBtn');
const relaxBtn  = document.getElementById('relaxBtn');
const enterBtn  = document.getElementById('enterBtn');
const splash    = document.getElementById('splash');
const trackDisplay = document.getElementById('track');
const timerDisplay = document.getElementById('timer');
const player = document.getElementById('player');

// NEW: transport controls
const prevBtn = document.getElementById('prevBtn');
const playPauseBtn = document.getElementById('playPauseBtn');
const nextBtn = document.getElementById('nextBtn');

// Audio graph
let audioCtx = null;
let analyser = null;
let dataArray = null;
let audioUnlocked = false;
let audioLevel = 0;

function initAudioGraph(){
  if (!audioCtx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    const source = audioCtx.createMediaElementSource(player);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    dataArray = new Uint8Array(analyser.fftSize);
  }
  if (audioCtx.state === 'suspended'){
    audioCtx.resume();
  }
}

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
let relaxMode = false;
let shuffleMode = false;

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
  if (!touchActive || !touchStart || relaxMode) return;
  const t = e.touches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  const dead = 8;
  let ax = 0, ay = 0;
  if (Math.abs(dx) > dead) ax = dx;
  if (Math.abs(dy) > dead) ay = dy;
  const len = Math.hypot(ax, ay) || 1;
  ax /= len; ay /= len;
  ship.vx += ax * ship.speed * 0.4;
  ship.vy += ay * ship.speed * 0.4;
});
canvas.addEventListener('touchend', () => {
  touchActive = false;
  touchStart = null;
});

// Splash
enterBtn.onclick = () => {
  splash.style.opacity = '0';
  setTimeout(() => splash.style.display = 'none', 320);
};

// Folder selection
folderBtn.onclick = () => {
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

audioBtn.onclick = () => {
  if (!islands.length && !current){
    trackDisplay.textContent = "Choose music first";
    return;
  }

  initAudioGraph();

  if (!current && islands.length){
    current = islands[0];
    trackDisplay.textContent = current.name;
    player.src = URL.createObjectURL(current.file);
  }

  player.play().then(() => {
    audioUnlocked = true;
    audioBtn.style.display = 'none';
  }).catch(err => {
    console.error('Audio play blocked:', err);
  });
};

relaxBtn.onclick = () => {
  if (!relaxMode){
    if (!islands.length){
      trackDisplay.textContent = "Choose music first";
      return;
    }

    relaxMode = true;
    shuffleMode = true;
    relaxBtn.classList.add('on');
    relaxBtn.textContent = "Relax Mode: On";
    mini.style.opacity = 0.25;

    if (!audioUnlocked){
      initAudioGraph();
      if (!current){
        current = islands[0];
        trackDisplay.textContent = current.name;
        player.src = URL.createObjectURL(current.file);
      }
      player.play().then(() => {
        audioUnlocked = true;
        audioBtn.style.display = 'none';
        playRandomIsland();
      }).catch(err => console.error('Audio play blocked in relax:', err));
    } else {
      playRandomIsland();
    }
  } else {
    relaxMode = false;
    shuffleMode = false;
    relaxBtn.classList.remove('on');
    relaxBtn.textContent = "Relax Mode";
    mini.style.opacity = 1;
    player.onended = null;
  }
};

// ---------- Transport helpers ----------

function getCurrentIndex(){
  if (!current || !islands.length) return -1;
  return islands.findIndex(i => i.id === current.id);
}

function playByIndex(index){
  if (!islands.length) return;

  const wrapped = (index % islands.length + islands.length) % islands.length;
  const isl = islands[wrapped];
  playIsland(isl);
}

// If the user uses transport, exit Relax/Shuffle mode
function exitRelaxModeIfNeeded(){
  if (!relaxMode) return;
  relaxMode = false;
  shuffleMode = false;
  if (relaxBtn){
    relaxBtn.classList.remove('on');
    relaxBtn.textContent = "Relax Mode";
  }
  mini.style.opacity = 1;
  player.onended = null;
}

// ---------- Transport buttons ----------

if (prevBtn){
  prevBtn.onclick = () => {
    if (!islands.length){
      trackDisplay.textContent = "Choose music first";
      return;
    }
    exitRelaxModeIfNeeded();
    let idx = getCurrentIndex();
    if (idx === -1) idx = 0;
    else idx = idx - 1;
    playByIndex(idx);

    // ensure audio is unlocked / playing
    if (!audioUnlocked){
      initAudioGraph();
      player.play().then(() => {
        audioUnlocked = true;
        if (audioBtn) audioBtn.style.display = 'none';
      }).catch(console.error);
    }
  };
}

if (nextBtn){
  nextBtn.onclick = () => {
    if (!islands.length){
      trackDisplay.textContent = "Choose music first";
      return;
    }
    exitRelaxModeIfNeeded();
    let idx = getCurrentIndex();
    if (idx === -1) idx = 0;
    else idx = idx + 1;
    playByIndex(idx);

    if (!audioUnlocked){
      initAudioGraph();
      player.play().then(() => {
        audioUnlocked = true;
        if (audioBtn) audioBtn.style.display = 'none';
      }).catch(console.error);
    }
  };
}

if (playPauseBtn){
  playPauseBtn.onclick = () => {
    if (!audioUnlocked){
      // First-time unlock / start
      if (!islands.length){
        trackDisplay.textContent = "Choose music first";
        return;
      }
      if (!current){
        current = islands[0];
        trackDisplay.textContent = current.name;
        player.src = URL.createObjectURL(current.file);
      }
      exitRelaxModeIfNeeded();
      initAudioGraph();
      player.play().then(() => {
        audioUnlocked = true;
        if (audioBtn) audioBtn.style.display = 'none';
        playPauseBtn.textContent = "Pause";
      }).catch(console.error);
      return;
    }

    // toggle play / pause
    exitRelaxModeIfNeeded();
    if (player.paused){
      player.play().then(() => {
        playPauseBtn.textContent = "Pause";
      }).catch(console.error);
    } else {
      player.pause();
      playPauseBtn.textContent = "Play";
    }
  };
}

// Keep Play/Pause button label in sync with actual audio state
player.addEventListener('play', () => {
  if (playPauseBtn) playPauseBtn.textContent = "Pause";
});
player.addEventListener('pause', () => {
  if (playPauseBtn) playPauseBtn.textContent = "Play";
});

function clusterKeyForFile(file){
  if (file.webkitRelativePath){
    const parts = file.webkitRelativePath.split(/[\\/]/);
    if (parts.length >= 2){
      return parts[parts.length - 2] || "Unknown";
    }
    return parts[0] || "Unknown";
  }
  const name = file.name || "Unknown";
  const dash = name.indexOf("-");
  const base = (dash > 0 ? name.slice(0, dash) : name).trim();
  return base || "Unknown";
}

function generateWorld(files){
  islands = [];
  const cx = 0;
  const cy = 0;
  const baseRadius = 1900;

  const clustersMap = new Map();
  for (const file of files){
    const key = clusterKeyForFile(file);
    if (!clustersMap.has(key)) clustersMap.set(key, []);
    clustersMap.get(key).push(file);
  }

  const clusterKeys = Array.from(clustersMap.keys());
  const clusterCount = clusterKeys.length || 1;
  const clusterArc = (Math.PI * 2) / clusterCount;

  clusterKeys.forEach((key, ci) => {
    const clusterFiles = clustersMap.get(key);
    const centerAngle = ci * clusterArc;
    const hueBase = (ci / clusterCount) * 360;

    clusterFiles.forEach((file, i) => {

      // Spread islands more variably across the arc.
      const localT = (i + Math.random()*0.5) / clusterFiles.length;
      const angle = centerAngle + (localT - 0.5) * clusterArc * (0.6 + Math.random()*0.4);
    
      // HUGE improvement: clusters spawn at different radii.
      const clusterRadius = baseRadius 
        + (Math.random() - 0.5) * 900      // major ring variation
        + (ci % 2 === 0 ? Math.random()*500 : -Math.random()*500); // alternating bias
    
      // Each island also gets its own little offset around the cluster radius.
      const radialOffset = (Math.random() - 0.5) * 450;
    
      const r = clusterRadius + radialOffset;
    
      // Convert polar coords
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
    
      // Add subtle Z-depth illusion (affects glow + brightness)
      const depth = Math.random()*0.6 + 0.7; // 0.7—1.3 range
    
      islands.push({
        id: islands.length,
        file,
        name: file.name.replace(/\.[^/.]+$/, ''),
        baseX: x,
        baseY: y,
        orbitAmp: 20 + Math.random()*40,      // larger, slower floating
        orbitSpeed: 0.03 + Math.random()*0.12,
        orbitPhase: Math.random() * Math.PI * 2,
        radius: 55 + Math.random()*35,        // some bigger, some smaller
        depth,
        hue: (hueBase + (i * 18) + Math.random()*20) % 360,
        cluster: key
      });
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

function playRandomIsland(){
  if (!islands.length) return;
  const isl = islands[Math.floor(Math.random() * islands.length)];
  playIsland(isl);

  if (shuffleMode){
    player.onended = () => {
      if (shuffleMode) playRandomIsland();
    };
  } else {
    player.onended = null;
  }
}

// Update loop
function update(dt){
  if (!relaxMode){
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

    ship.vx *= 0.985;
    ship.vy *= 0.985;

    ship.x += ship.vx * dt * 60;
    ship.y += ship.vy * dt * 60;
  }

  ship.trail.push({x: ship.x, y: ship.y, t: time});
  if (ship.trail.length > 60){
    ship.trail.shift();
  }

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

  if (analyser && dataArray){
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++){
      const v = (dataArray[i] - 128) / 128;
      sum += v*v;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const level = Math.min(1, rms * 4);
    audioLevel = audioLevel * 0.8 + level * 0.2;
  } else {
    audioLevel = audioLevel * 0.9;
  }

  if (!relaxMode){
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
}

function playIsland(isl){
  current = isl;
  trackDisplay.textContent = isl.name;
  const url = URL.createObjectURL(isl.file);
  player.src = url;

  if (audioUnlocked){
    initAudioGraph();
    player.play().catch(err => console.error('Play error:', err));
  }

  // keep the transport UI in sync
  if (playPauseBtn && audioUnlocked){
    playPauseBtn.textContent = "Pause";
  }
}

function getIslandPosition(isl){
  const t = time * isl.orbitSpeed + isl.orbitPhase;
  const ox = Math.cos(t) * isl.orbitAmp;
  const oy = Math.sin(t) * isl.orbitAmp;
  return { x: isl.baseX + ox, y: isl.baseY + oy };
}

function drawBackground(){
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  ctx.save();
  ctx.scale(DPR, DPR);

  // day-night-like modulation but spacey
  const cycle = (time * 0.01) % 1;
  const nightFactor = 0.5 - 0.5 * Math.cos(cycle * 2 * Math.PI); // 0..1

  // layered nebula gradients
  const sky = ctx.createLinearGradient(0, 0, 0, vh);
  sky.addColorStop(0, `hsl(${230 - nightFactor*10}, 55%, ${16 + nightFactor*6}%)`);
  sky.addColorStop(0.4, `hsl(${260 - nightFactor*20}, 55%, ${10 + nightFactor*4}%)`);
  sky.addColorStop(1, `hsl(${220 - nightFactor*5}, 55%, ${4 + nightFactor*2}%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, vw, vh);

  // big nebula bands
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const nebula1 = ctx.createRadialGradient(
    vw * 0.3, vh * 0.2, 0,
    vw * 0.1, vh * 0.0, vh * 0.8
  );
  nebula1.addColorStop(0, 'rgba(180,120,255,0.32)');
  nebula1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = nebula1;
  ctx.fillRect(0, 0, vw, vh);

  const nebula2 = ctx.createRadialGradient(
    vw * 0.8, vh * 0.6, 0,
    vw * 1.0, vh * 0.9, vh * 0.9
  );
  nebula2.addColorStop(0, 'rgba(120,200,255,0.26)');
  nebula2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = nebula2;
  ctx.fillRect(0, 0, vw, vh);

  ctx.restore();

  // a LOT more stars (3 layers for parallax)
  const baseStars = 140;
  const parallaxLayers = 3;
  for (let layer = 0; layer < parallaxLayers; layer++){
    const depth = (layer + 1) / parallaxLayers;
    const count = baseStars + layer * 40;
    const twinkleScale = 0.5 + depth * 0.7;

    for (let i = 0; i < count; i++){
      const offset = i * 97 * (layer + 3);
      const sx = offset % vw;
      const sy = (i * 53 * (layer + 5)) % vh;
      const twinkle = 0.5 + 0.5 * Math.sin(time * (0.6 + depth*0.8) + offset);
      const alpha = (0.03 + nightFactor * 0.18) * twinkle * twinkleScale;
      const size = layer === 0 ? 1 : layer === 1 ? 1.5 : 2;

      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(sx, sy, size, size);
    }
  }

  // ✨ CONSTELLATION LINES ✨
  // Deterministic pseudo-random positions, stable across frames
  const CONST_COUNT = 28;
  const constPoints = [];
  const centerX = vw / 2;
  const centerY = vh / 2;
  const baseRadius = Math.min(vw, vh) * 0.25;
  const radiusJitter = Math.min(vw, vh) * 0.18;

  for (let i = 0; i < CONST_COUNT; i++){
    const ang = (i / CONST_COUNT) * Math.PI * 2 + i * 0.37;
    const r = baseRadius + radiusJitter * ((Math.sin(i * 1.31) + 1) * 0.5);
    const x = centerX + Math.cos(ang) * r;
    const y = centerY + Math.sin(ang) * r;
    constPoints.push({ x, y });
  }

  ctx.save();
  ctx.globalAlpha = 0.35 * (0.4 + nightFactor * 0.6); // stronger at "night"
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = 'rgba(180,210,255,0.85)';

  // connect in soft "chains" to feel like constellations
  const groupSize = 4;
  for (let start = 0; start < CONST_COUNT; start += groupSize){
    ctx.beginPath();
    for (let j = 0; j < groupSize && start + j < CONST_COUNT; j++){
      const p = constPoints[start + j];
      if (j === 0){
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
  }

  // tiny glowing nodes at the constellation points
  for (const p of constPoints){
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(235,245,255,0.9)';
    ctx.fill();
  }
  ctx.restore();

  // tiny dust / grain layer
  const dustCount = 90;
  ctx.save();
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < dustCount; i++){
    const sx = (Math.sin(i * 12.9898 + time * 0.3) * 43758.5453) % vw;
    const sy = (Math.sin(i * 78.233  + time * 0.25) * 12345.6789) % vh;
    const x = (sx + vw) % vw;
    const y = (sy + vh) % vh;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();

  // smaller water band at the bottom
  const waterTop = vh * 0.78;
  const oceanGrad = ctx.createLinearGradient(0, waterTop, 0, vh);
  oceanGrad.addColorStop(0, `rgba(6,40,70,0.75)`);
  oceanGrad.addColorStop(1, `rgba(1,10,20,0.95)`);
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, waterTop, vw, vh - waterTop);

  // subtle ripple waves
  ctx.save();
  ctx.beginPath();
  const waveOffset = time * 10;
  const waveHeight = 10;
  const waveLength = 200;
  ctx.moveTo(0, waterTop);
  for (let x = 0; x <= vw; x += 8){
    const y = waterTop + Math.sin((x + waveOffset) / waveLength) * waveHeight;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(vw, vh);
  ctx.lineTo(0, vh);
  ctx.closePath();
  ctx.fillStyle = 'rgba(40,110,170,0.22)';
  ctx.fill();
  ctx.restore();

  // vignette over everything
  const vg = ctx.createRadialGradient(
    vw/2, vh/2, Math.min(vw,vh)/3,
    vw/2, vh/2, Math.max(vw,vh)/1.05
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = vg;
  ctx.fillRect(0,0,vw,vh);

  ctx.restore();
}

function drawWorld(){
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  drawBackground();

  ctx.save();
  ctx.scale(DPR, DPR);

  let camX, camY;
  if (relaxMode){
    const ang = time * 0.06;
    const camRadius = 600;
    camX = Math.cos(ang) * camRadius;
    camY = Math.sin(ang) * camRadius;
  } else {
    camX = ship.x - vw / 2;
    camY = ship.y - vh / 2;
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const fogGrad = ctx.createRadialGradient(vw/2, vh/2, 0, vw/2, vh/2, Math.min(vw,vh)*0.9);
  fogGrad.addColorStop(0, 'rgba(100,180,255,0.08)');
  fogGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0,0,vw,vh);
  ctx.restore();

  for (const isl of islands){
    const pos = getIslandPosition(isl);
    const sx = pos.x - camX;
    const sy = pos.y - camY;

    const baseHue = isl.hue;
    let pulseBase = 0.15 * Math.sin(time * 1.3 + isl.id) + 0.85;
    if (current && current.id === isl.id){
      pulseBase += audioLevel * 0.6;
    }
    const r = isl.radius * pulseBase;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glowGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r*2.2);
    const sat = (current && current.id === isl.id) ? 90 : 70;
    const levelBoost = 40 + audioLevel * 25;
    glowGrad.addColorStop(0, `hsla(${baseHue},${sat}%,${levelBoost}%,0.95)`);
    glowGrad.addColorStop(0.3, `hsla(${baseHue},${sat}%,45%,0.45)`);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(sx-r*2.2, sy-r*2.2, r*4.4, r*4.4);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = (current && current.id === isl.id)
      ? `hsl(${baseHue},85%,80%)`
      : `hsl(${baseHue},75%,65%)`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(sx, sy, r*0.7, 0, Math.PI*2);
    ctx.fillStyle = `hsla(${baseHue},55%,82%,0.9)`;
    ctx.fill();

    ctx.fillStyle = '#020611';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = isl.name.length > 16 ? isl.name.slice(0,15) + '…' : isl.name;
    ctx.fillText(label, sx, sy);
  }

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

  if (!relaxMode){
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
  }

  if (focusMode && current){
    const g = ctx.createRadialGradient(shipScreenX, shipScreenY, 0, shipScreenX, shipScreenY, Math.max(vw,vh)*0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,vw,vh);
  }

  ctx.restore();

  drawMinimap();
}

function drawMinimap(){
  const mW = mini.width;
  const mH = mini.height;
  const ctxM = miniCtx;
  ctxM.clearRect(0,0,mW,mH);

  const cx = mW / 2;
  const cy = mH / 2;
  const radius = Math.min(mW, mH) * 0.42;

  ctxM.fillStyle = 'rgba(2,6,17,0.95)';
  ctxM.beginPath();
  ctxM.arc(cx, cy, radius + 10, 0, Math.PI*2);
  ctxM.fill();

  ctxM.strokeStyle = 'rgba(90,140,210,0.6)';
  ctxM.lineWidth = 2;
  ctxM.beginPath();
  ctxM.arc(cx, cy, radius, 0, Math.PI*2);
  ctxM.stroke();

  if (!islands.length) return;

  const worldRadius = 2100;
  const scale = radius / worldRadius;

  for (const isl of islands){
    const pos = getIslandPosition(isl);
    const mx = cx + pos.x * scale;
    const my = cy + pos.y * scale;
    const r = 4;

    ctxM.beginPath();
    ctxM.arc(mx, my, r, 0, Math.PI*2);
    ctxM.fillStyle = (current && current.id === isl.id)
      ? 'rgba(255,240,190,0.95)'
      : 'rgba(120,190,255,0.9)';
    ctxM.fill();
  }

  const mx = cx + ship.x * scale;
  const my = cy + ship.y * scale;
  const sr = 5;
  ctxM.beginPath();
  ctxM.arc(mx, my, sr, 0, Math.PI*2);
  ctxM.fillStyle = 'rgba(255,255,255,1)';
  ctxM.fill();
}

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
