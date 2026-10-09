// Pixelated snowfall: draws at low resolution and lets CSS scale it up without smoothing.
const SCALE = 4;
const LAYERS = [
  { count: 70, size: 1, speed: 0.25, drift: 0.15, alpha: 0.45 },
  { count: 45, size: 1, speed: 0.45, drift: 0.25, alpha: 0.75 },
  { count: 22, size: 2, speed: 0.7, drift: 0.35, alpha: 1 },
];

const canvas = document.createElement("canvas");
canvas.className = "pixel-snow";
canvas.setAttribute("aria-hidden", "true");
document.body.prepend(canvas);
const ctx = canvas.getContext("2d");

let w = 0;
let h = 0;
let flakes = [];

function resize() {
  w = Math.ceil(window.innerWidth / SCALE);
  h = Math.ceil(window.innerHeight / SCALE);
  canvas.width = w;
  canvas.height = h;
  flakes = LAYERS.flatMap((layer) =>
    Array.from({ length: Math.round((layer.count * w) / 320) }, () => ({
      ...layer,
      x: Math.random() * w,
      y: Math.random() * h,
      phase: Math.random() * Math.PI * 2,
    }))
  );
}

function draw() {
  ctx.clearRect(0, 0, w, h);
  for (const f of flakes) {
    ctx.fillStyle = `rgba(255, 255, 255, ${f.alpha})`;
    ctx.fillRect(Math.round(f.x), Math.round(f.y), f.size, f.size);
  }
}

function step() {
  for (const f of flakes) {
    f.phase += 0.02;
    f.y += f.speed;
    f.x += Math.sin(f.phase) * f.drift;
    if (f.y > h) {
      f.y = -f.size;
      f.x = Math.random() * w;
    }
    if (f.x < -2) f.x = w;
    if (f.x > w + 2) f.x = 0;
  }
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let frame = null;

function loop() {
  step();
  draw();
  frame = requestAnimationFrame(loop);
}

function start() {
  if (frame === null && !document.hidden && !reducedMotion.matches) loop();
  else draw();
}

function stop() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
}

window.addEventListener("resize", () => {
  resize();
  draw();
});
document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
reducedMotion.addEventListener("change", () => {
  stop();
  start();
});

resize();
start();
