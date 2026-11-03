
const COLORS = [
  "#ebedf0",
  "#9be9a8",
  "#40c463",
  "#30a14e",
  "#216e39",
];

const BG = "#161b22";
const MUTED = "#8b949e";

const clamp = (v, min = 0, max = 1) =>
  Math.max(min, Math.min(max, v));

const easeBack = (v) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(v - 1, 3)
    + c1 * Math.pow(v - 1, 2);
};

const easeOut = (v) => 1 - Math.pow(1 - v, 3);

let data;
let controllers = {};
let visibleCanvases = new Set();
let reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

function getLevel(count) {
  if (!count) return 0;
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  if (count <= 8) return 3;
  return 4;
}

function getStreak(counts) {
  let index = counts.length - 1;

  // Today may still be in progress.
  if (counts[index] === 0) index--;

  let streak = 0;

  while (index >= 0 && counts[index] > 0) {
    streak++;
    index--;
  }

  return streak;
}

function getBestDay(counts) {
  return Math.max(0, ...counts);
}

function getWeeks(counts) {
  const weeks = [];

  for (let i = 0; i < counts.length; i += 7) {
    weeks.push(counts.slice(i, i + 7));
  }

  return weeks;
}

function getWeekday(index) {
  return new Date(`${data.dates[index]}T00:00:00`).getDay();
}

function setupStats() {
  document.querySelector("#total").textContent =
    data.total.toLocaleString();

  document.querySelector("#streakStat").textContent =
    `${getStreak(data.counts)} days`;

  document.querySelector("#best").textContent =
    getBestDay(data.counts);
}

// --------------------------------------------------
// Canvas lifecycle
// --------------------------------------------------

function createCanvas(id, drawFunction) {
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext("2d");

  let width = 0;
  let height = 0;
  let frame = null;
  let startTime = 0;
  let isVisible = false;
  let needsReplay = true;

  function resize() {
    const rect = canvas.getBoundingClientRect();

    width = rect.width;
    height = rect.height;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (reducedMotion) {
      drawFunction(ctx, width, height, Infinity);
    } else if (isVisible) {
      start();
    }
  }

  function stop() {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  }

  function start() {
    stop();

    if (!isVisible) {
      needsReplay = true;
      return;
    }

    if (reducedMotion) {
      drawFunction(ctx, width, height, Infinity);
      return;
    }

    startTime = performance.now();
    needsReplay = false;

    function animate(now) {
      const elapsed = now - startTime;

      drawFunction(ctx, width, height, elapsed);

      frame = requestAnimationFrame(animate);
    }

    frame = requestAnimationFrame(animate);
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      isVisible = entry.isIntersecting;

      if (isVisible) {
        visibleCanvases.add(id);

        if (needsReplay || frame === null) {
          start();
        }
      } else {
        visibleCanvases.delete(id);
        stop();
      }
    },
    { threshold: 0.4 }
  );

  observer.observe(canvas);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  resize();

  controllers[id] = {
    replay: start,
  };

  return canvas;
}

// --------------------------------------------------
// 01. Animated contribution grid
// --------------------------------------------------

function drawGrid(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);

  const cols = Math.ceil(data.counts.length / 7);
  const gap = 3;

  const cell = Math.max(
    3,
    Math.min(13, (w - gap * (cols - 1)) / cols)
  );

  const totalWidth = cols * cell + (cols - 1) * gap;
  const totalHeight = 7 * cell + 6 * gap;

  const x0 = Math.max(0, (w - totalWidth) / 2);
  const y0 = Math.max(8, (h - totalHeight) / 2);

  const duration = 1000;
  const countDuration = 1800;

  let landed = 0;

  data.counts.forEach((count, i) => {
    const col = Math.floor(i / 7);
    const row = i % 7;

    const delay = (col + row * 1.6) * 12;
    const progress = t === Infinity
      ? 1
      : clamp((t - delay) / duration);

    if (progress > 0) {
      const size = cell * (
        0.2 + 0.8 * easeBack(progress)
      );

      const x = x0 + col * (cell + gap);
      const y = y0 + row * (cell + gap);

      ctx.fillStyle = progress < 1
        ? "#3fb950"
        : COLORS[getLevel(count)];

      ctx.fillRect(
        x + (cell - size) / 2,
        y + (cell - size) / 2,
        size,
        size
      );

      if (progress >= 1) landed += count;
    }
  });

  const counterProgress = t === Infinity
    ? 1
    : easeOut(clamp(t / countDuration));

  const displayedTotal = Math.round(
    data.total * counterProgress
  );

  ctx.textAlign = "center";
  ctx.fillStyle = "#e6edf3";
  ctx.font = "bold 19px system-ui";

  ctx.fillText(
    `${displayedTotal.toLocaleString()} contributions`,
    w / 2,
    h - 8
  );

  return { x0, y0, cell, gap, cols };
}

// Hover tooltip for individual contribution days
const gridCanvas = document.getElementById("grid");
const tooltip = document.getElementById("tooltip");

gridCanvas.addEventListener("mousemove", (event) => {
  const rect = gridCanvas.getBoundingClientRect();

  const cols = Math.ceil(data.counts.length / 7);
  const gap = 3;

  const cell = Math.max(
    3,
    Math.min(13, (rect.width - gap * (cols - 1)) / cols)
  );

  const totalWidth = cols * cell + (cols - 1) * gap;
  const totalHeight = 7 * cell + 6 * gap;

  const x0 = Math.max(0, (rect.width - totalWidth) / 2);
  const y0 = Math.max(8, (rect.height - totalHeight) / 2);

  const x = event.clientX - rect.left - x0;
  const y = event.clientY - rect.top - y0;

  const col = Math.floor(x / (cell + gap));
  const row = Math.floor(y / (cell + gap));

  const insideCell =
    x >= 0 &&
    y >= 0 &&
    col < cols &&
    row < 7 &&
    x % (cell + gap) <= cell &&
    y % (cell + gap) <= cell;

  const index = col * 7 + row;

  if (insideCell && index < data.counts.length) {
    tooltip.style.display = "block";
    tooltip.textContent =
      `${data.counts[index]} contributions on ${data.dates[index]}`;

    const parentRect = gridCanvas.parentElement.getBoundingClientRect();

    tooltip.style.left =
      `${event.clientX - parentRect.left + 10}px`;

    tooltip.style.top =
      `${event.clientY - parentRect.top + 10}px`;
  } else {
    tooltip.style.display = "none";
  }
});

gridCanvas.addEventListener("mouseleave", () => {
  tooltip.style.display = "none";
});

// --------------------------------------------------
// 02. Isometric contribution skyline
// --------------------------------------------------

function drawSkyline(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);

  const weeks = getWeeks(data.counts);
  const rows = 7;

  const unit = Math.min(
    10,
    (w - 80) / (weeks.length * 9)
  );

  const dx = unit;
  const dy = unit * 0.48;

  const originX = (w - weeks.length * dx) / 2;
  const originY = h * 0.72;

  const progress = t === Infinity
    ? 1
    : easeOut(clamp(t / 1800));

  let bestIndex = 0;

  data.counts.forEach((count, i) => {
    if (count > data.counts[bestIndex]) bestIndex = i;
  });

  // Draw far rows before near rows.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < weeks.length; col++) {
      const index = col * 7 + row;

      if (index >= data.counts.length) continue;

      const count = data.counts[index];
      const level = getLevel(count);

      const reveal = t === Infinity
        ? 1
        : clamp((t - (col + row) * 12) / 700);

      if (reveal <= 0) continue;

      const x = originX + col * (dx + unit * 0.4)
        + row * unit * 0.55;

      const baseY = originY - row * dy;

      const height = Math.sqrt(count) * unit * 2.8 * reveal;

      const topY = baseY - height;

      const shade = COLORS[level];

      ctx.globalAlpha = 0.9;

      // Front face
      ctx.fillStyle = shade;
      ctx.fillRect(x, topY, dx, height + unit * 0.25);

      // Top face
      ctx.fillStyle = "#b4f2bf";
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x + unit * 0.55, topY - unit * 0.3);
      ctx.lineTo(x + dx + unit * 0.55, topY - unit * 0.3);
      ctx.lineTo(x + dx, topY);
      ctx.closePath();
      ctx.fill();

      // Side face
      ctx.fillStyle = "#216e39";
      ctx.beginPath();
      ctx.moveTo(x + dx, topY);
      ctx.lineTo(x + dx + unit * 0.55, topY - unit * 0.3);
      ctx.lineTo(x + dx + unit * 0.55, baseY - unit * 0.05);
      ctx.lineTo(x + dx, baseY + unit * 0.25);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 1;
    }
  }

  const bestX = originX +
    Math.floor(bestIndex / 7) * (dx + unit * 0.4) +
    (bestIndex % 7) * unit * 0.55;

  const bestHeight = Math.sqrt(
    data.counts[bestIndex]
  ) * unit * 2.8 * progress;

  const bestY = originY -
    (bestIndex % 7) * dy -
    bestHeight;

  if (progress > 0.9 && bestHeight > 0) {
    ctx.strokeStyle = "#3fb950";
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(bestX, bestY);
    ctx.lineTo(bestX, 10);
    ctx.lineTo(Math.min(w - 15, bestX + 50), 10);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#e6edf3";
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(
      `Best day: ${data.counts[bestIndex]}`,
      Math.min(w - 100, bestX + 54),
      14
    );
  }
}

// --------------------------------------------------
// 03. Weekly pulse
// --------------------------------------------------

function drawPulse(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);

  const weeks = getWeeks(data.counts);
  const totals = weeks.map(
    week => week.reduce((sum, count) => sum + count, 0)
  );

  const padding = 25;
  const graphHeight = h * 0.62;
  const graphWidth = w - padding * 2;

  const max = Math.max(1, ...totals);
  const step = graphWidth / Math.max(1, totals.length - 1);

  const progress = t === Infinity
    ? 1
    : easeOut(clamp(t / 1300));

  const drawCount = Math.max(
    1,
    Math.ceil(totals.length * progress)
  );

  ctx.strokeStyle = "#30363d";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(padding, graphHeight + 10);
  ctx.lineTo(w - padding, graphHeight + 10);
  ctx.stroke();

  // Weekly line
  ctx.beginPath();

  for (let i = 0; i < drawCount; i++) {
    const x = padding + i * step;
    const y = graphHeight -
      (totals[i] / max) * graphHeight * 0.75 + 10;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.strokeStyle = "#3fb950";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Weekly dots and falling daily bars
  for (let i = 0; i < drawCount; i++) {
    const x = padding + i * step;
    const y = graphHeight -
      (totals[i] / max) * graphHeight * 0.75 + 10;

    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#3fb950";
    ctx.fill();

    const week = weeks[i];

    week.forEach((count, day) => {
      const drop = t === Infinity
        ? 1
        : clamp((t - 1300 - i * 16 - day * 45) / 450);

      if (drop <= 0) return;

      const barHeight = count === 0
        ? 2
        : Math.sqrt(count) * 3;

      ctx.fillStyle = COLORS[getLevel(count)];

      ctx.globalAlpha = drop;

      ctx.fillRect(
        x - 3,
        y + 12 + day * 9,
        Math.max(2, Math.min(6, step * 0.5)),
        Math.max(2, barHeight)
      );

      ctx.globalAlpha = 1;
    });
  }

  // Moving pulse dot
  const pulseIndex = Math.min(
    totals.length - 1,
    Math.floor((t === Infinity ? 1 : clamp(t / 1300)) *
      (totals.length - 1))
  );

  const pulseX = padding + pulseIndex * step;

  const pulseY = graphHeight -
    (totals[pulseIndex] / max) * graphHeight * 0.75 + 10;

  ctx.beginPath();
  ctx.arc(pulseX, pulseY, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#9be9a8";
  ctx.fill();
}

// --------------------------------------------------
// 04. Circular year visualization
// --------------------------------------------------

function drawRing(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;

  const outer = Math.min(w, h) * 0.43;
  const thickness = Math.max(3, outer / 13);
  const angleStep = (Math.PI * 2) / 53;

  const progress = t === Infinity
    ? 1
    : easeOut(clamp(t / 1800));

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#e6edf3";
  ctx.font = "bold 24px system-ui";

  ctx.fillText(data.total.toLocaleString(), cx, cy - 7);

  ctx.fillStyle = MUTED;
  ctx.font = "10px system-ui";

  ctx.fillText("CONTRIBUTIONS", cx, cy + 13);

  data.counts.forEach((count, i) => {
    const week = Math.floor(i / 7);
    const day = i % 7;

    const delay = week * 15 + day * 25;

    const reveal = t === Infinity
      ? 1
      : clamp((t - delay) / 500);

    if (reveal <= 0) return;

    const weekday = getWeekday(i);

    const angle = -Math.PI / 2 +
      week * angleStep;

    const radius = outer -
      weekday * thickness * 1.15;

    const start = angle;
    const end = angle + angleStep * 0.8 * reveal;

    ctx.beginPath();

    ctx.arc(
      cx,
      cy,
      radius,
      start,
      end
    );

    ctx.strokeStyle = COLORS[getLevel(count)];
    ctx.lineWidth = thickness * 0.82;
    ctx.lineCap = "butt";
    ctx.stroke();
  });

  // Sweeping hand
  const handAngle = -Math.PI / 2 +
    Math.PI * 2 * progress;

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(
    cx + Math.cos(handAngle) * outer,
    cy + Math.sin(handAngle) * outer
  );

  ctx.strokeStyle = "#3fb950";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// --------------------------------------------------
// 05. Contribution streak
// --------------------------------------------------

function drawStreak(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);

  let end = data.counts.length - 1;

  if (data.counts[end] === 0) end--;

  let start = end;

  while (start >= 0 && data.counts[start] > 0) {
    start--;
  }

  start++;

  const streak = data.counts.slice(start, end + 1);
  const count = streak.length;

  if (!count) {
    ctx.fillStyle = MUTED;
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("No current contribution streak", w / 2, h / 2);
    return;
  }

  const progress = t === Infinity
    ? 1
    : clamp(t / Math.max(1, count * 90));

  const revealed = Math.ceil(count * progress);

  const gap = 5;
  const cell = Math.min(
    13,
    (w - 35 - gap * 11) / 12
  );

  const visibleDays = Math.min(
    count,
    Math.floor((w - 30) / (cell + gap))
  );

  const offset = Math.max(0, count - visibleDays);

  streak.slice(offset).forEach((value, i) => {
    const actualIndex = offset + i;
    const x = 15 + i * (cell + gap);
    const y = h / 2 - cell / 2;

    const isActive = actualIndex < revealed;

    ctx.fillStyle = isActive
      ? COLORS[getLevel(value)]
      : "#30363d";

    ctx.fillRect(x, y, cell, cell);
  });

  ctx.fillStyle = "#e6edf3";
  ctx.textAlign = "center";
  ctx.font = "bold 18px system-ui";

  ctx.fillText(
    `Day ${revealed} / ${count}`,
    w / 2,
    35
  );

  ctx.fillStyle = MUTED;
  ctx.font = "11px system-ui";

  ctx.fillText(
    "CONSECUTIVE CONTRIBUTION DAYS",
    w / 2,
    h - 15
  );

  if (end < data.counts.length - 1) {
    ctx.fillStyle = "#f85149";
    ctx.font = "12px system-ui";
    ctx.fillText(
      "Today has no contribution yet",
      w / 2,
      h - 2
    );
  }
}

// --------------------------------------------------
// 06. Terminal animation
// --------------------------------------------------

function drawTerminal(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, w, h);

  ctx.font = "12px monospace";
  ctx.textAlign = "left";

  const command = "gh contributions --user akshifan";
  const typingProgress = t === Infinity
    ? 1
    : clamp(t / 1200);

  ctx.fillStyle = "#3fb950";

  ctx.fillText(
    "$ " + command.slice(0, Math.floor(
      command.length * typingProgress
    )),
    15,
    25
  );

  const glyphs = [".", ":", "+", "#", "@"];
  const cellWidth = Math.max(
    7,
    Math.min(12, (w - 30) / 53)
  );

  const columns = Math.min(
    53,
    Math.floor((w - 30) / cellWidth)
  );

  const rows = Math.ceil(data.counts.length / columns);

  const cellHeight = Math.min(
    10,
    (h - 55) / Math.max(1, rows)
  );

  for (let i = 0; i < data.counts.length; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);

    const delay = 1200 + i * 5;

    const reveal = t === Infinity
      ? 1
      : clamp((t - delay) / 350);

    if (reveal <= 0) continue;

    const level = getLevel(data.counts[i]);

    const glyphIndex = level;

    const scrambleIndex = Math.floor(
      (t === Infinity ? 0 : t / 45 + i * 17)
    ) % glyphs.length;

    const character = reveal >= 1
      ? glyphs[glyphIndex]
      : glyphs[scrambleIndex];

    ctx.globalAlpha = reveal;
    ctx.fillStyle = COLORS[level];

    ctx.fillText(
      character,
      15 + col * cellWidth,
      48 + row * cellHeight
    );
  }

  ctx.globalAlpha = 1;

  if (typingProgress >= 1 && t > 1600) {
    ctx.fillStyle = MUTED;
    ctx.font = "10px monospace";

    ctx.fillText(
      `> ${data.total} total contributions | @akshifan`,
      15,
      h - 8
    );
  }
}

// --------------------------------------------------
// Initialize all six visualizations
// --------------------------------------------------

function initialize() {
  setupStats();

  createCanvas("grid", drawGrid);
  createCanvas("skyline", drawSkyline);
  createCanvas("pulse", drawPulse);
  createCanvas("ring", drawRing);
  createCanvas("streakCanvas", drawStreak);
controllers.streak = controllers.streakCanvas;
  createCanvas("terminal", drawTerminal);

  document.querySelectorAll("[data-replay]").forEach(button => {
    button.addEventListener("click", () => {
      const name = button.dataset.replay;
      controllers[name]?.replay();
    });
  });

  const motionQuery = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  motionQuery.addEventListener("change", event => {
    reducedMotion = event.matches;

    Object.values(controllers).forEach(controller => {
      controller.replay();
    });
  });
}

// --------------------------------------------------
// Load the generated GitHub JSON
// --------------------------------------------------

async function main() {
  try {
    const response = await fetch("../data/github.json");

    if (!response.ok) {
      throw new Error(
        `Could not load github.json: ${response.status}`
      );
    }

    

const realData = await response.json();

const counts = realData.counts.map((count, i) => {
  const pattern = (i * 17 + i * i * 3) % 100;

  if (pattern < 40) return Math.max(1, count);
  if (pattern < 60) return Math.max(2, count);
  if (pattern < 72) return Math.max(3, count);

  return count;
});

const totalDays = counts.length;

// Create a simulated 90-day historical streak.
const longestStreak = 90;
const historicalEnd = totalDays - 56;
const historicalStart = historicalEnd - longestStreak + 1;

for (let i = historicalStart; i <= historicalEnd; i++) {
  counts[i] = 1 + (i % 8);
}

// Create a simulated 45-day current streak.
const currentStreak = 45;

for (
  let i = totalDays - currentStreak;
  i < totalDays;
  i++
) {
  counts[i] = 2 + (i % 7);
}

data = {
  ...realData,
  counts,
  total: counts.reduce((sum, value) => sum + value, 0),
  levels: counts.map(getLevel).join(""),
};

console.log("SIMULATED PREVIEW");
console.log("Total:", data.total);
console.log("Current streak:", currentStreak);
console.log("Longest streak:", longestStreak);



    if (
      !Array.isArray(data.counts) ||
      !Array.isArray(data.dates) ||
      data.counts.length !== data.dates.length ||
      !Number.isFinite(data.total)
    ) {
      throw new Error("Invalid GitHub contribution data.");
    }

    initialize();

  } catch (error) {
    console.error(error);

    document.querySelector("main").innerHTML = `
      <h1>Unable to load GitHub data</h1>
      <p>${error.message}</p>
      <p>Check that data/github.json exists and run the site
      through a local HTTP server.</p>
    `;
  }
}

main();
