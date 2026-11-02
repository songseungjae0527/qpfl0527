const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('best-score');
const coinsEl = document.getElementById('coins');
const levelEl = document.getElementById('level');
const itemStatusEl = document.getElementById('itemStatus');
const messageEl = document.getElementById('message');
const startButton = document.getElementById('startButton');
const pauseButton = document.getElementById('pauseButton');
const countdownOverlay = document.getElementById('countdownOverlay');
const challengeSelect = document.getElementById('challengeSelect');
const mapSizeSelect = document.getElementById('mapSizeSelect');
const speedSelect = document.getElementById('speedSelect');
const skinSelect = document.getElementById('skinSelect');
const skinPreview = document.getElementById('skinPreview');
const skinPreviewName = document.getElementById('skinPreviewName');
const skinPreviewRarity = document.getElementById('skinPreviewRarity');
const skinBuyButtons = document.querySelectorAll('.skin-buy-button');

const skins = {
  emerald: { name: '에메랄드', rarity: '일반', head: '#34d399', body: '#10b981', price: 0, effect: 'solid' },
  ocean: { name: '오션', rarity: '일반', head: '#38bdf8', body: '#0284c7', price: 3, effect: 'solid' },
  flame: { name: '플레임', rarity: '희귀', head: '#fb923c', body: '#ea580c', price: 6, effect: 'gradient' },
  neon: { name: '네온', rarity: '희귀', head: '#e879f9', body: '#a21caf', price: 10, effect: 'glow' },
  sunset: { name: '선셋', rarity: '영웅', head: '#fda4af', body: '#f97316', price: 14, effect: 'gradient' },
  ice: { name: '아이스', rarity: '영웅', head: '#e0f2fe', body: '#06b6d4', price: 18, effect: 'glow' },
  gold: { name: '골드', rarity: '전설', head: '#fef08a', body: '#eab308', price: 25, effect: 'glow' },
  galaxy: { name: '갤럭시', rarity: '전설', head: '#f0abfc', body: '#4c1d95', price: 40, effect: 'rainbow' },
};

let gridSize = 20;
let tileSize = canvas.width / gridSize;
let baseInterval = 120;

let snake;
let direction;
let nextDirection;
let food;
let score;
let level;
let isPaused = false;
let bonusFood = null;
let item = null;
let itemTimerId;
let shieldCount = 0;
let slowTimerId;
let obstacles = [];
let bonusTimerId;
let countdownTimerId;
let bestScore = Number(localStorage.getItem('snake-best-score') || 0);
let coins = Number(localStorage.getItem('snake-coins') || 0);
let ownedSkins = JSON.parse(localStorage.getItem('snake-owned-skins') || '["emerald"]');
let selectedSkin = skinSelect.value;
let gameLoopId;
let isRunning = false;

bestScoreEl.textContent = bestScore;
coinsEl.textContent = coins;

function resetGame() {
  const center = Math.floor(gridSize / 2);
  snake = [
    { x: center, y: center },
    { x: center - 1, y: center },
    { x: center - 2, y: center },
  ];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  level = challengeSelect.value ? Number(challengeSelect.value) : 1;
  isPaused = false;
  bonusFood = null;
  item = null;
  shieldCount = 0;
  clearTimeout(itemTimerId);
  clearTimeout(slowTimerId);
  obstacles = [];
  clearTimeout(bonusTimerId);
  scoreEl.textContent = '0';
  levelEl.textContent = challengeSelect.value ? String(level) : '-';
  updateItemStatus();
  spawnFood();
  if (challengeSelect.value) {
    for (let index = 1; index < level; index += 1) {
      addObstacle();
    }
  }
  draw();
}

function applySettings() {
  gridSize = Number(mapSizeSelect.value);
  tileSize = canvas.width / gridSize;
  baseInterval = Number(speedSelect.value);
  level = challengeSelect.value ? Number(challengeSelect.value) : 1;
}

function getCurrentInterval() {
  return Math.max(45, baseInterval - (level - 1) * 10);
}

function getChallengeTarget() {
  return Number(challengeSelect.value) * 50;
}

function updateSkinPreview() {
  const skin = skins[skinSelect.value] || skins.emerald;
  skinPreviewName.textContent = skin.name;
  skinPreviewRarity.textContent = skin.rarity;
  skinPreviewRarity.dataset.rarity = skin.rarity;
  skinPreview.style.setProperty('--preview-head', skin.head);
  skinPreview.style.setProperty('--preview-body', skin.body);
  skinPreview.dataset.effect = skin.effect;
  draw();
}

function updateSkinShop() {
  skinBuyButtons.forEach((button) => {
    const skinId = button.dataset.skin;
    const isOwned = ownedSkins.includes(skinId);
    button.textContent = isOwned
      ? `${skins[skinId].name} · ${skins[skinId].rarity} · 보유 중`
      : `${skins[skinId].name} · ${skins[skinId].rarity} · ${skins[skinId].price}코인`;
    button.classList.toggle('owned', isOwned);
    button.disabled = isOwned || isRunning;
  });
}

function purchaseSkin(skinId) {
  const skin = skins[skinId];
  if (!skin || ownedSkins.includes(skinId)) return;
  if (coins < skin.price) {
    messageEl.textContent = `${skin.name} 스킨을 사려면 ${skin.price}코인이 필요합니다.`;
    return;
  }

  coins -= skin.price;
  ownedSkins.push(skinId);
  localStorage.setItem('snake-coins', String(coins));
  localStorage.setItem('snake-owned-skins', JSON.stringify(ownedSkins));
  coinsEl.textContent = String(coins);
  skinSelect.value = skinId;
  selectedSkin = skinId;
  updateSkinPreview();
  updateSkinShop();
  messageEl.textContent = `${skin.name} 스킨을 구매했습니다!`;
}

function completeChallenge() {
  clearInterval(gameLoopId);
  clearTimeout(bonusTimerId);
  isRunning = false;
  pauseButton.disabled = true;
  challengeSelect.disabled = false;
  mapSizeSelect.disabled = false;
  speedSelect.disabled = false;
  skinSelect.disabled = false;
  updateSkinShop();
  startButton.textContent = '다시 도전';
  messageEl.textContent = `챌린지 ${level}단계 성공! 다음 단계는 직접 선택해 도전하세요.`;
}

function spawnFood() {
  const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
  obstacles.forEach((obstacle) => occupied.add(`${obstacle.x},${obstacle.y}`));
  const available = [];

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      if (!occupied.has(`${x},${y}`)) {
        available.push({ x, y });
      }
    }
  }

  food = available[Math.floor(Math.random() * available.length)];
}

function addObstacle() {
  const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
  obstacles.forEach((obstacle) => occupied.add(`${obstacle.x},${obstacle.y}`));
  if (food) occupied.add(`${food.x},${food.y}`);
  if (bonusFood) occupied.add(`${bonusFood.x},${bonusFood.y}`);

  const available = [];
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      if (!occupied.has(`${x},${y}`)) available.push({ x, y });
    }
  }

  const obstacle = available[Math.floor(Math.random() * available.length)];
  if (obstacle) obstacles.push(obstacle);
}

function drawGrid() {
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = 0; x < gridSize; x += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
}

function drawFood() {
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(
    food.x * tileSize + tileSize / 2,
    food.y * tileSize + tileSize / 2,
    tileSize * 0.35,
    0,
    Math.PI * 2
  );
  ctx.fill();

  if (bonusFood) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(
      bonusFood.x * tileSize + tileSize / 2,
      bonusFood.y * tileSize + tileSize / 2,
      tileSize * 0.38,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

}

function drawItem() {
  if (!item) return;

  const centerX = item.x * tileSize + tileSize / 2;
  const centerY = item.y * tileSize + tileSize / 2;
  const colors = { bonus: '#facc15', shield: '#60a5fa', slow: '#c084fc' };

  ctx.fillStyle = colors[item.type];
  ctx.beginPath();
  ctx.arc(centerX, centerY, tileSize * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold ${Math.max(9, tileSize * 0.42)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText({ bonus: '+', shield: 'S', slow: '↓' }[item.type], centerX, centerY + 1);
}

function updateItemStatus() {
  const effects = [];
  if (shieldCount > 0) effects.push(`보호막 ${shieldCount}`);
  if (slowTimerId) effects.push('느려짐');
  itemStatusEl.textContent = effects.length ? effects.join(' · ') : '없음';
}

function spawnItem() {
  if (item || Math.random() > 0.18) return;

  const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
  obstacles.forEach((obstacle) => occupied.add(`${obstacle.x},${obstacle.y}`));
  if (food) occupied.add(`${food.x},${food.y}`);
  if (bonusFood) occupied.add(`${bonusFood.x},${bonusFood.y}`);

  const available = [];
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      if (!occupied.has(`${x},${y}`)) available.push({ x, y });
    }
  }

  const position = available[Math.floor(Math.random() * available.length)];
  if (!position) return;
  const types = ['bonus', 'shield', 'slow'];
  item = { ...position, type: types[Math.floor(Math.random() * types.length)] };
  clearTimeout(itemTimerId);
  itemTimerId = setTimeout(() => {
    item = null;
    draw();
  }, 7000);
}

function collectItem() {
  if (!item) return;

  const collectedType = item.type;
  item = null;
  clearTimeout(itemTimerId);

  if (collectedType === 'bonus') {
    score += 50;
    scoreEl.textContent = String(score);
    messageEl.textContent = '아이템 획득! 보너스 점수 +50';
  } else if (collectedType === 'shield') {
    shieldCount = 1;
    messageEl.textContent = '아이템 획득! 보호막이 충돌 1회를 막아줍니다.';
  } else {
    clearTimeout(slowTimerId);
    slowTimerId = setTimeout(() => {
      slowTimerId = null;
      updateItemStatus();
      if (isRunning) {
        clearInterval(gameLoopId);
        gameLoopId = setInterval(tick, getCurrentInterval());
      }
    }, 5000);
    messageEl.textContent = '아이템 획득! 5초 동안 게임 속도가 느려집니다.';
    clearInterval(gameLoopId);
    gameLoopId = setInterval(tick, getCurrentInterval() + 80);
  }
  updateItemStatus();
}

function drawObstacles() {
  obstacles.forEach((obstacle) => {
    ctx.fillStyle = '#64748b';
    ctx.fillRect(
      obstacle.x * tileSize + 2,
      obstacle.y * tileSize + 2,
      tileSize - 4,
      tileSize - 4
    );
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      obstacle.x * tileSize + 3,
      obstacle.y * tileSize + 3,
      tileSize - 6,
      tileSize - 6
    );
  });
}

function drawSnake() {
  const skin = skins[skinSelect.value] || skins.emerald;
  snake.forEach((segment, index) => {
    const x = segment.x * tileSize + 1;
    const y = segment.y * tileSize + 1;
    ctx.shadowBlur = skin.effect === 'glow' || skin.effect === 'rainbow' ? 9 : 0;
    ctx.shadowColor = skin.head;

    if (skin.effect === 'gradient') {
      const gradient = ctx.createLinearGradient(x, y, x + tileSize, y + tileSize);
      gradient.addColorStop(0, skin.head);
      gradient.addColorStop(1, skin.body);
      ctx.fillStyle = gradient;
    } else if (skin.effect === 'rainbow') {
      const galaxyGradient = ctx.createLinearGradient(x, y, x + tileSize, y + tileSize);
      galaxyGradient.addColorStop(0, skin.head);
      galaxyGradient.addColorStop(1, skin.body);
      ctx.fillStyle = galaxyGradient;
    } else {
      ctx.fillStyle = index === 0 ? skin.head : skin.body;
    }

    ctx.fillRect(x, y, tileSize - 2, tileSize - 2);

    if (index === 0) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = Math.max(1.5, tileSize * 0.08);
      ctx.strokeRect(x + 1, y + 1, tileSize - 4, tileSize - 4);

      const eyeRadius = Math.max(1.2, tileSize * 0.09);
      const eyeOffset = tileSize * 0.28;
      const centerX = x + tileSize / 2;
      const centerY = y + tileSize / 2;
      let eyeX = centerX;
      let eyeY = centerY;

      if (direction.x !== 0) {
        eyeX += direction.x * tileSize * 0.2;
        [centerY - eyeOffset, centerY + eyeOffset].forEach((yPosition) => {
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.arc(eyeX, yPosition, eyeRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(eyeX + direction.x * eyeRadius * 0.35, yPosition, eyeRadius * 0.45, 0, Math.PI * 2);
          ctx.fill();
        });
      } else {
        eyeY += direction.y * tileSize * 0.2;
        [centerX - eyeOffset, centerX + eyeOffset].forEach((xPosition) => {
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.arc(xPosition, eyeY, eyeRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(xPosition, eyeY + direction.y * eyeRadius * 0.35, eyeRadius * 0.45, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  });
  ctx.shadowBlur = 0;
}

function draw() {
  drawGrid();
  drawObstacles();
  drawFood();
  drawItem();
  drawSnake();
}

function updateDirection(newDirection) {
  const isOpposite =
    newDirection.x === -direction.x && newDirection.y === -direction.y;

  if (!isOpposite) {
    nextDirection = newDirection;
  }
}

function tick() {
  if (isPaused) return;

  direction = nextDirection;

  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

  const hitWall = head.x < 0 || head.x >= gridSize || head.y < 0 || head.y >= gridSize;
  const hitSelf = snake.some((segment) => segment.x === head.x && segment.y === head.y);
  const hitObstacle = obstacles.some(
    (obstacle) => obstacle.x === head.x && obstacle.y === head.y
  );

  if (hitWall || hitSelf || hitObstacle) {
    if (shieldCount > 0 && !hitSelf) {
      shieldCount = 0;
      direction = { x: -direction.x, y: -direction.y };
      nextDirection = direction;
      updateItemStatus();
      messageEl.textContent = '보호막이 충돌을 막았습니다!';
      draw();
      return;
    }
    endGame();
    return;
  }

  snake.unshift(head);

  const ateFood = head.x === food.x && head.y === food.y;
  const ateBonus = bonusFood && head.x === bonusFood.x && head.y === bonusFood.y;
  const ateItem = item && head.x === item.x && head.y === item.y;

  if (ateFood || ateBonus) {
    const previousScore = score;
    const pointsEarned = ateBonus ? 30 : 10;
    score += pointsEarned;
    const coinsEarned = Math.floor(score / 50) - Math.floor(previousScore / 50);
    coins += coinsEarned;
    scoreEl.textContent = String(score);
    coinsEl.textContent = String(coins);
    localStorage.setItem('snake-coins', String(coins));
    if (score > bestScore) {
      bestScore = score;
      bestScoreEl.textContent = String(bestScore);
      localStorage.setItem('snake-best-score', String(bestScore));
    }
    if (challengeSelect.value && score >= getChallengeTarget()) {
      completeChallenge();
      return;
    }
    spawnFood();
    bonusFood = null;
  } else {
    snake.pop();
  }

  if (ateItem) collectItem();

  if (!bonusFood && Math.random() < 0.08) {
    const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
    obstacles.forEach((obstacle) => occupied.add(`${obstacle.x},${obstacle.y}`));
    if (food) occupied.add(`${food.x},${food.y}`);
    const candidates = [];
    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        if (!occupied.has(`${x},${y}`)) candidates.push({ x, y });
      }

      spawnItem();
    }
    bonusFood = candidates[Math.floor(Math.random() * candidates.length)] || null;
    clearTimeout(bonusTimerId);
    bonusTimerId = setTimeout(() => {
      bonusFood = null;
      if (isRunning) draw();
    }, 4000);
  }

  draw();
}

function startGame() {
  if (isRunning) return;
  if (!ownedSkins.includes(skinSelect.value)) {
    const skin = skins[skinSelect.value];
    messageEl.textContent = `${skin.name} 스킨은 미리보기만 가능합니다. ${skin.price}코인으로 구매하세요.`;
    return;
  }

  applySettings();
  resetGame();
  isRunning = true;
  isPaused = true;
  pauseButton.disabled = true;
  startButton.textContent = '준비 중...';
  challengeSelect.disabled = true;
  mapSizeSelect.disabled = true;
  speedSelect.disabled = true;
  skinSelect.disabled = true;
  updateSkinShop();

  let countdown = 3;
  countdownOverlay.hidden = false;
  countdownOverlay.textContent = String(countdown);
  messageEl.textContent = '준비하세요!';
  countdownTimerId = setInterval(() => {
    countdown -= 1;
    if (countdown > 0) {
      countdownOverlay.textContent = String(countdown);
      return;
    }

    clearInterval(countdownTimerId);
    countdownOverlay.hidden = true;
    isPaused = false;
    pauseButton.disabled = false;
    pauseButton.textContent = '일시정지';
    startButton.textContent = '재시작';
    messageEl.textContent = challengeSelect.value
      ? `챌린지 ${level}단계 도전 시작! 목표: ${getChallengeTarget()}점`
      : '자유 플레이를 시작합니다!';
    gameLoopId = setInterval(tick, getCurrentInterval());
  }, 1000);
}

function endGame() {
  clearInterval(gameLoopId);
  clearTimeout(bonusTimerId);
  clearInterval(countdownTimerId);
  countdownOverlay.hidden = true;
  isRunning = false;
  isPaused = false;
  pauseButton.disabled = true;
  challengeSelect.disabled = false;
  mapSizeSelect.disabled = false;
  speedSelect.disabled = false;
  skinSelect.disabled = false;
  updateSkinShop();
  messageEl.textContent = `GAME OVER · Final score: ${score}`;
  startButton.textContent = '다시 시작';
}

function togglePause() {
  if (!isRunning) return;
  isPaused = !isPaused;
  pauseButton.textContent = isPaused ? '계속하기' : '일시정지';
  messageEl.textContent = isPaused ? '잠시 멈춤' : '게임 중!';
  draw();
}

startButton.addEventListener('click', startGame);
pauseButton.addEventListener('click', togglePause);
skinSelect.addEventListener('change', () => {
  selectedSkin = skinSelect.value;
  updateSkinPreview();
  if (ownedSkins.includes(selectedSkin)) {
    messageEl.textContent = `${skins[selectedSkin].name} 스킨을 선택했습니다.`;
  } else {
    messageEl.textContent = `${skins[selectedSkin].name} 스킨 미리보기 중 · 구매하지 않아도 미리볼 수 있습니다.`;
  }
});
skinBuyButtons.forEach((button) => {
  button.addEventListener('click', () => purchaseSkin(button.dataset.skin));
});

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  const mapping = {
    arrowup: { x: 0, y: -1 },
    w: { x: 0, y: -1 },
    arrowdown: { x: 0, y: 1 },
    s: { x: 0, y: 1 },
    arrowleft: { x: -1, y: 0 },
    a: { x: -1, y: 0 },
    arrowright: { x: 1, y: 0 },
    d: { x: 1, y: 0 },
  };

  if (mapping[key]) {
    event.preventDefault();
    if (isRunning && !isPaused) {
      updateDirection(mapping[key]);
    }
  }
});

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'p' || key === ' ') {
    event.preventDefault();
    togglePause();
  }
});

applySettings();
resetGame();
updateSkinPreview();
updateSkinShop();
messageEl.textContent = '화살표 키 또는 WASD로 움직이세요 · 회색 블록은 장애물입니다';
