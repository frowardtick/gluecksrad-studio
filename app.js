const palette = ['#FF6B6B','#FFD166','#06D6A0','#4D96FF','#845EC2','#FF9671','#00C2A8','#F15BB5','#5B5F97','#2EC4B6'];

let segments = Array.from({ length: 4 }, (_, index) => ({
  text: `Gewinn ${index + 1}`,
  color: palette[index % palette.length]
}));
let savedWheels = JSON.parse(localStorage.getItem('glücksrad_wheels') || '[]');
let currentId = null;
let rotation = 0;
let spinning = false;
let soundEnabled = true;
let audioContext = null;
let lastWinnerIndex = null;

const wheelName = document.getElementById('wheelName');
const segmentList = document.getElementById('segmentList');
const savedList = document.getElementById('savedList');
const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');
const spinButton = document.getElementById('spinButton');
const winnerCard = document.getElementById('winnerCard');
const winnerText = document.getElementById('winnerText');
const toast = document.getElementById('toast');

function normalizeAngle(angle) {
  const tau = Math.PI * 2;
  return ((angle % tau) + tau) % tau;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawWheel();
}

function drawWheel() {
  const size = canvas.clientWidth;
  if (!size) return;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.465;
  const count = segments.length;
  const arc = (Math.PI * 2) / count;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  ctx.beginPath();
  ctx.arc(0, 0, radius + size * 0.018, 0, Math.PI * 2);
  ctx.fillStyle = '#20243a';
  ctx.fill();

  for (let i = 0; i < count; i++) {
    const start = -Math.PI / 2 + i * arc;
    const end = start + arc;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = segments[i].color;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(start) * radius, Math.sin(start) * radius);
    ctx.strokeStyle = 'rgba(255,255,255,.68)';
    ctx.lineWidth = Math.max(1.5, size * 0.004);
    ctx.stroke();

    ctx.save();
    ctx.rotate(start + arc / 2);
    ctx.translate(radius * 0.64, 0);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = getContrastColor(segments[i].color);
    ctx.font = `800 ${Math.max(11, Math.min(22, size * 0.027))}px Inter, sans-serif`;

    const label = segments[i].text || 'Unbenannt';
    const maxWidth = radius * 0.72;
    let display = label;
    while (ctx.measureText(display).width > maxWidth && display.length > 4) display = display.slice(0, -2) + '…';
    ctx.fillText(display, 0, 0);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = size * 0.012;
  ctx.stroke();
  ctx.restore();
}

function getContrastColor(hex) {
  const value = hex.replace('#','');
  const r = parseInt(value.slice(0,2),16);
  const g = parseInt(value.slice(2,4),16);
  const b = parseInt(value.slice(4,6),16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#20243a' : '#ffffff';
}

function renderSegmentList() {
  segmentList.innerHTML = '';
  segments.forEach((segment, index) => {
    const row = document.createElement('div');
    row.className = 'segment-row';

    const color = document.createElement('input');
    color.type = 'color';
    color.className = 'color-picker';
    color.value = segment.color;
    color.title = 'Farbe wählen';
    color.addEventListener('input', () => {
      segments[index].color = color.value;
      drawWheel();
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'segment-input';
    input.value = segment.text;
    input.maxLength = 24;
    input.placeholder = `Feld ${index + 1}`;
    input.addEventListener('input', () => {
      segments[index].text = input.value;
      drawWheel();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-button';
    remove.textContent = '×';
    remove.title = 'Feld entfernen';
    remove.disabled = segments.length <= 2;
    remove.addEventListener('click', () => {
      if (segments.length <= 2) return;
      segments.splice(index, 1);
      renderSegmentList();
      drawWheel();
    });

    row.append(color, input, remove);
    segmentList.appendChild(row);
  });
}

function renderSavedList() {
  savedList.innerHTML = '';
  savedWheels.forEach(wheel => {
    const item = document.createElement('div');
    item.className = 'saved-item';
    if (wheel.id === currentId) item.classList.add('active');

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'saved-item-main';
    main.textContent = wheel.name;
    main.addEventListener('click', () => loadWheel(wheel));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'saved-delete';
    remove.textContent = '×';
    remove.title = 'Rad löschen';
    remove.addEventListener('click', () => {
      savedWheels = savedWheels.filter(item => item.id !== wheel.id);
      if (currentId === wheel.id) currentId = null;
      persist();
      renderSavedList();
      showToast('Rad gelöscht');
    });

    item.append(main, remove);
    savedList.appendChild(item);
  });
}

function persist() {
  localStorage.setItem('glücksrad_wheels', JSON.stringify(savedWheels));
}

function saveWheel() {
  const name = wheelName.value.trim() || 'Unbenanntes Glücksrad';
  const existing = savedWheels.find(wheel => wheel.id === currentId);
  const wheel = {
    id: existing?.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    name,
    segments: segments.map(segment => ({ ...segment }))
  };

  if (existing) {
    savedWheels = savedWheels.map(item => item.id === wheel.id ? wheel : item);
  } else {
    savedWheels.unshift(wheel);
  }
  currentId = wheel.id;
  persist();
  renderSavedList();
  showToast('Rad gespeichert');
}

function loadWheel(wheel) {
  if (spinning) return;
  currentId = wheel.id;
  wheelName.value = wheel.name;
  segments = wheel.segments.map(segment => ({ ...segment }));
  lastWinnerIndex = null;
  document.getElementById('removeWinner').hidden = true;
  winnerText.textContent = 'Bereit zum Drehen';
  winnerCard.classList.remove('pop');
  rotation = 0;
  renderSegmentList();
  renderSavedList();
  drawWheel();
  showToast('Rad geladen');
}

function createNewWheel() {
  if (spinning) return;
  currentId = null;
  wheelName.value = 'Neues Glücksrad';
  segments = [
    { text: 'Gewinn 1', color: '#FF6B6B' },
    { text: 'Gewinn 2', color: '#FFD166' },
    { text: 'Gewinn 3', color: '#06D6A0' },
    { text: 'Gewinn 4', color: '#4D96FF' }
  ];
  lastWinnerIndex = null;
  document.getElementById('removeWinner').hidden = true;
  rotation = 0;
  winnerText.textContent = 'Bereit zum Drehen';
  renderSegmentList();
  renderSavedList();
  drawWheel();
}

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
  }
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function playTick(progress = 0) {
  if (!soundEnabled) return;
  const ac = getAudioContext();
  if (!ac || ac.state !== 'running') return;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const startFrequency = 210 - progress * 90;
  osc.type = 'square';
  osc.frequency.setValueAtTime(startFrequency, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(65, startFrequency * 0.45), ac.currentTime + 0.035);
  gain.gain.setValueAtTime(0.12, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.055);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.06);
}

function playWinSound() {
  if (!soundEnabled) return;
  const ac = getAudioContext();
  if (!ac) return;
  [523.25, 659.25, 783.99].forEach((frequency, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const start = ac.currentTime + i * 0.09;
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  });
}

function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}

let lastTickTime = 0;

function spinWheel() {
  if (spinning || segments.length < 2) return;
  const ac = getAudioContext();
  if (ac && ac.state === 'suspended') ac.resume();
  spinning = true;
  spinButton.disabled = true;
  winnerText.textContent = 'Das Rad dreht sich…';

  const count = segments.length;
  const arc = Math.PI * 2 / count;
  const winnerIndex = Math.floor(Math.random() * count);
  const targetRotation = normalizeAngle(-(winnerIndex + 0.5) * arc);
  const currentRotation = normalizeAngle(rotation);
  let delta = normalizeAngle(targetRotation - currentRotation);
  const fullTurns = 5 + Math.floor(Math.random() * 3);
  if (delta < 0.001) delta += arc * 0.35;
  const startRotation = rotation;
  const endRotation = rotation + fullTurns * Math.PI * 2 + delta;
  const duration = 5200;
  let previousSegment = null;
  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    rotation = startRotation + (endRotation - startRotation) * easeOutQuint(progress);
    drawWheel();

    const pointerSegment = Math.floor(normalizeAngle(-rotation) / arc);
    if (previousSegment === null) previousSegment = pointerSegment;

    if (pointerSegment !== previousSegment) {
      playTick(progress);
      previousSegment = pointerSegment;
    }

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      rotation = endRotation;
      drawWheel();
      finishSpin(winnerIndex);
    }
  }
  requestAnimationFrame(animate);
}

function finishSpin(winnerIndex) {
  const winner = segments[winnerIndex].text.trim() || 'Unbenannt';
  lastWinnerIndex = winnerIndex;
  winnerText.textContent = winner;
  document.getElementById('removeWinner').hidden = false;
  winnerCard.classList.remove('pop');
  void winnerCard.offsetWidth;
  winnerCard.classList.add('pop');
  spinning = false;
  spinButton.disabled = false;
  playWinSound();
  launchConfetti();
}

function removeWinnerSegment() {
  if (lastWinnerIndex === null || spinning) return;
  if (segments.length <= 2) {
    showToast('Mindestens zwei Felder werden benötigt');
    return;
  }

  const removedName = segments[lastWinnerIndex]?.text || 'Das Feld';
  segments.splice(lastWinnerIndex, 1);
  lastWinnerIndex = null;
  winnerText.textContent = 'Bereit zum Drehen';
  document.getElementById('removeWinner').hidden = true;
  winnerCard.classList.remove('pop');
  rotation = 0;
  renderSegmentList();
  drawWheel();

  if (currentId) {
    savedWheels = savedWheels.map(wheel => wheel.id === currentId
      ? { ...wheel, name: wheelName.value.trim() || wheel.name, segments: segments.map(segment => ({ ...segment })) }
      : wheel
    );
    persist();
    renderSavedList();
  }

  showToast(`${removedName} wurde entfernt`);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

const confettiCanvas = document.getElementById('confettiCanvas');
const confettiCtx = confettiCanvas.getContext('2d');
let confetti = [];

function launchConfetti() {
  const dpr = window.devicePixelRatio || 1;
  confettiCanvas.width = window.innerWidth * dpr;
  confettiCanvas.height = window.innerHeight * dpr;
  confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  confetti = [];
  const colors = segments.map(segment => segment.color).concat(palette);
  for (let i = 0; i < 180; i++) {
    confetti.push({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 220,
      y: window.innerHeight * 0.47,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 12 - 4,
      gravity: 0.22 + Math.random() * 0.12,
      size: 5 + Math.random() * 7,
      rotation: Math.random() * Math.PI,
      rotationSpeed: (Math.random() - 0.5) * 0.25,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1
    });
  }
  requestAnimationFrame(updateConfetti);
}

function updateConfetti() {
  confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  confetti.forEach(piece => {
    piece.vy += piece.gravity;
    piece.x += piece.vx;
    piece.y += piece.vy;
    piece.rotation += piece.rotationSpeed;
    piece.vx *= 0.992;
    piece.life -= 0.004;

    confettiCtx.save();
    confettiCtx.translate(piece.x, piece.y);
    confettiCtx.rotate(piece.rotation);
    confettiCtx.globalAlpha = Math.max(0, piece.life);
    confettiCtx.fillStyle = piece.color;
    confettiCtx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
    confettiCtx.restore();
  });
  confetti = confetti.filter(piece => piece.life > 0 && piece.y < window.innerHeight + 30);
  if (confetti.length) requestAnimationFrame(updateConfetti);
  else confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
}

document.getElementById('addSegment').addEventListener('click', () => {
  if (segments.length >= 30) {
    showToast('Maximal 30 Möglichkeiten möglich');
    return;
  }
  segments.push({ text: `Feld ${segments.length + 1}`, color: palette[segments.length % palette.length] });
  renderSegmentList();
  drawWheel();
});
document.getElementById('saveWheel').addEventListener('click', saveWheel);
document.getElementById('newWheel').addEventListener('click', createNewWheel);
document.getElementById('soundToggle').addEventListener('click', event => {
  soundEnabled = !soundEnabled;
  event.currentTarget.classList.toggle('off', !soundEnabled);
  event.currentTarget.textContent = soundEnabled ? '🔊' : '🔇';
  if (soundEnabled) playTick();
});
document.getElementById('removeWinner').addEventListener('click', removeWinnerSegment);
spinButton.addEventListener('click', spinWheel);

window.addEventListener('resize', () => {
  resizeCanvas();
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
});

renderSegmentList();
renderSavedList();
resizeCanvas();
