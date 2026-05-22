import { useEffect, useRef, useState } from "react";
import "./styles.css";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Star { x: number; y: number; r: number; s: number; twinkle: number }
interface Bullet { x: number; y: number; vy: number; color?: string }
interface EnemyBullet { x: number; y: number; vx: number; vy: number; color: string; size: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; type: "spark" | "smoke" }
interface PowerUp { x: number; y: number; type: "shield" | "extraLife"; vy: number; pulse: number }
interface Companion { offsetX: number; color: string }
interface Enemy {
  x: number; y: number; type: "basic" | "fast" | "tank";
  hp: number; maxHp: number; vy: number; vx: number;
  size: number; color: string; pts: number; flash: number;
  shootTimer: number; shootRate: number;
}
interface ScoreEntry { score: number; level: number; date: string }

// ─── Audio ───────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}
function playSound(type: "shoot" | "hit" | "explode" | "powerup" | "death") {
  try {
    const ctx = getAudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime;
    if (type === "shoot") {
      o.type = "square"; o.frequency.setValueAtTime(880, t);
      o.frequency.exponentialRampToValueAtTime(220, t + 0.08);
      g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.start(t); o.stop(t + 0.08);
    } else if (type === "hit") {
      o.type = "sawtooth"; o.frequency.setValueAtTime(300, t);
      o.frequency.exponentialRampToValueAtTime(100, t + 0.1);
      g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.start(t); o.stop(t + 0.1);
    } else if (type === "explode") {
      o.type = "sawtooth"; o.frequency.setValueAtTime(200, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.start(t); o.stop(t + 0.3);
    } else if (type === "powerup") {
      o.type = "sine"; o.frequency.setValueAtTime(440, t);
      o.frequency.exponentialRampToValueAtTime(880, t + 0.2);
      g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.start(t); o.stop(t + 0.2);
    } else if (type === "death") {
      o.type = "sawtooth"; o.frequency.setValueAtTime(400, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.8);
      g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      o.start(t); o.stop(t + 0.8);
    }
  } catch (_) {}
}

// ─── LocalStorage helpers ────────────────────────────────────────────────────
const LS_KEY = "galaxia_scores";
const LS_FIRE = "galaxia_fire_mode";

function loadScores(): ScoreEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function saveScore(score: number, level: number) {
  const entries = loadScores();
  entries.push({ score, level, date: new Date().toLocaleDateString("ru-RU") });
  entries.sort((a, b) => b.score - a.score);
  localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(0, 5)));
}
function loadFireMode(): "auto" | "manual" {
  return localStorage.getItem(LS_FIRE) === "manual" ? "manual" : "auto";
}

function canvasRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<"menu" | "settings" | "playing" | "dead">("menu");
  const [fireMode, setFireMode] = useState<"auto" | "manual">(loadFireMode);
  const fireModeRef = useRef<"auto" | "manual">(loadFireMode());
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [shield, setShield] = useState(0);
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores);

  const mx = useRef(240); const my = useRef(540);
  const keys = useRef<Record<string, boolean>>({});
  const bullets = useRef<Bullet[]>([]);
  const enemyBullets = useRef<EnemyBullet[]>([]);
  const enemies = useRef<Enemy[]>([]);
  const companions = useRef<Companion[]>([]);
  const powerUps = useRef<PowerUp[]>([]);
  const particles = useRef<Particle[]>([]);
  const stars = useRef<Star[]>([]);
  const frame = useRef(0);
  const shootCooldown = useRef(0);
  const enemySpawnTimer = useRef(0);
  const shieldTimer = useRef(0);
  const lifeTimer = useRef(0);
  const livesRef = useRef(3);
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const shieldRef = useRef(0);
  const running = useRef(false);
  const animId = useRef(0);

  useEffect(() => {
    stars.current = Array.from({ length: 150 }, () => ({
      x: Math.random() * 480, y: Math.random() * 620,
      r: Math.random() * 1.8 + 0.2, s: Math.random() * 0.6 + 0.1,
      twinkle: Math.random() * Math.PI * 2,
    }));
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.key] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.key] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  function changeFireMode(mode: "auto" | "manual") {
    setFireMode(mode);
    fireModeRef.current = mode;
    localStorage.setItem(LS_FIRE, mode);
  }

  function startGame() {
    cancelAnimationFrame(animId.current);
    setGameState("playing");
    setScore(0); setLives(3); setLevel(1); setShield(0);
    scoreRef.current = 0; livesRef.current = 3; levelRef.current = 1; shieldRef.current = 0;
    bullets.current = []; enemyBullets.current = []; enemies.current = [];
    particles.current = []; companions.current = []; powerUps.current = [];
    frame.current = 0; shieldTimer.current = 0; lifeTimer.current = 0;
    enemySpawnTimer.current = 0; shootCooldown.current = 0;
    mx.current = 240; my.current = 540;
    running.current = true;
    requestAnimationFrame(loop);
  }

  function updateCompanions(lv: number) {
    const needed = lv >= 5 ? 2 : lv >= 2 ? 1 : 0;
    while (companions.current.length < needed) {
      const idx = companions.current.length;
      companions.current.push({ offsetX: idx === 0 ? -50 : 50, color: idx === 0 ? "#00ffcc" : "#ff88ff" });
    }
  }

  function shoot() {
    if (shootCooldown.current > 0) return;
    bullets.current.push({ x: mx.current, y: my.current - 30, vy: -10 });
    companions.current.forEach((c) => {
      bullets.current.push({ x: mx.current + c.offsetX, y: my.current - 20, vy: -10, color: c.color });
    });
    shootCooldown.current = 10;
    playSound("shoot");
  }

  function spawnEnemy() {
    const lv = levelRef.current;
    const pool = lv >= 3 ? ["basic", "fast", "tank", "basic"] : ["basic", "fast", "basic"];
    const t = pool[Math.floor(Math.random() * pool.length)] as Enemy["type"];
    const e: Enemy = {
      x: Math.random() * 420 + 30, y: -40, type: t, flash: 0,
      shootTimer: Math.floor(Math.random() * 60),
      hp: 0, maxHp: 0, vy: 0, size: 0, color: "", pts: 0, shootRate: 0, vx: 0,
    };
    if (t === "basic")  { e.maxHp=3; e.hp=3; e.vy=1.0+lv*0.15; e.size=24; e.color="#ff4444"; e.pts=20; e.shootRate=120; }
    if (t === "fast")   { e.maxHp=2; e.hp=2; e.vy=2.2+lv*0.25; e.size=18; e.color="#ffaa00"; e.pts=30; e.shootRate=90; }
    if (t === "tank")   { e.maxHp=6; e.hp=6; e.vy=0.6+lv*0.08; e.size=32; e.color="#aa44ff"; e.pts=80; e.shootRate=70; }
    e.vx = (Math.random() - 0.5) * 1.2;
    enemies.current.push(e);
  }

  function spawnPowerUp(type: PowerUp["type"]) {
    powerUps.current.push({ x: Math.random() * 400 + 40, y: -20, type, vy: 1.4, pulse: 0 });
  }

  function explode(x: number, y: number, color: string, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * 4 + 1;
      particles.current.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1, color, size: Math.random() * 4 + 1,
        type: Math.random() > 0.5 ? "spark" : "smoke",
      });
    }
  }

  function dist(a: {x:number;y:number}, b: {x:number;y:number}) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function loop() {
    const canvas = canvasRef.current;
    if (!canvas || !running.current) return;
    const ctx = canvas.getContext("2d")!;
    frame.current++;
    shootCooldown.current = Math.max(0, shootCooldown.current - 1);

    const speed = 4;
    if (keys.current["ArrowLeft"]  || keys.current["a"] || keys.current["A"]) mx.current = Math.max(20,  mx.current - speed);
    if (keys.current["ArrowRight"] || keys.current["d"] || keys.current["D"]) mx.current = Math.min(460, mx.current + speed);
    if (keys.current["ArrowUp"]    || keys.current["w"] || keys.current["W"]) my.current = Math.max(20,  my.current - speed);
    if (keys.current["ArrowDown"]  || keys.current["s"] || keys.current["S"]) my.current = Math.min(600, my.current + speed);
    if (keys.current[" "]) shoot();

    // auto-fire only when mode is set to auto
    if (fireModeRef.current === "auto" && frame.current % 12 === 0) shoot();

    const lv = levelRef.current;
    updateCompanions(lv);

    stars.current.forEach((s) => { s.y += s.s; s.twinkle += 0.05; if (s.y > 620) s.y = 0; });

    enemySpawnTimer.current++;
    const rate = Math.max(35, 120 - lv * 8);
    if (enemySpawnTimer.current >= rate) { spawnEnemy(); enemySpawnTimer.current = 0; }

    shieldTimer.current++;
    if (shieldTimer.current >= 1800) { spawnPowerUp("shield"); shieldTimer.current = 0; }

    lifeTimer.current++;
    if (lifeTimer.current >= 1800) {
      if (livesRef.current < 3) spawnPowerUp("extraLife");
      lifeTimer.current = 0;
    }

    enemies.current.forEach((e) => {
      e.x += e.vx; e.y += e.vy;
      if (e.x < 20 || e.x > 460) e.vx *= -1;
      if (e.flash > 0) e.flash--;
      e.shootTimer++;
      if (e.shootTimer >= e.shootRate && e.y > 0 && e.y < 500) {
        enemyBullets.current.push({ x: e.x, y: e.y + e.size, vx: 0, vy: 4, color: e.color, size: 5 });
        e.shootTimer = 0;
      }
    });

    bullets.current = bullets.current.filter((b) => { b.y += b.vy; return b.y > -20; });

    enemyBullets.current = enemyBullets.current.filter((b) => {
      b.x += b.vx; b.y += b.vy;
      if (dist(b, { x: mx.current, y: my.current }) < 18) {
        if (shieldRef.current > 0) {
          shieldRef.current = Math.max(0, shieldRef.current - 25);
          setShield(shieldRef.current);
          explode(b.x, b.y, "#00ffff", 6);
          playSound("hit");
        } else {
          livesRef.current--;
          setLives(livesRef.current);
          explode(mx.current, my.current, "#0cf", 16);
          playSound("hit");
        }
        return false;
      }
      return b.y < 640 && b.x > 0 && b.x < 480;
    });

    bullets.current = bullets.current.filter((b) => {
      for (let i = enemies.current.length - 1; i >= 0; i--) {
        if (dist(b, enemies.current[i]) < enemies.current[i].size) {
          enemies.current[i].hp--;
          enemies.current[i].flash = 8;
          explode(b.x, b.y, enemies.current[i].color, 5);
          if (enemies.current[i].hp <= 0) {
            scoreRef.current += enemies.current[i].pts;
            explode(enemies.current[i].x, enemies.current[i].y, enemies.current[i].color, 22);
            explode(enemies.current[i].x, enemies.current[i].y, "#fff", 8);
            playSound("explode");
            enemies.current.splice(i, 1);
            levelRef.current = Math.floor(scoreRef.current / 300) + 1;
          }
          return false;
        }
      }
      return true;
    });

    enemies.current = enemies.current.filter((e) => {
      if (e.y > 670) { livesRef.current--; setLives(livesRef.current); return false; }
      if (dist(e, { x: mx.current, y: my.current }) < e.size + 16) {
        if (shieldRef.current > 0) { shieldRef.current = Math.max(0, shieldRef.current - 50); setShield(shieldRef.current); }
        else { livesRef.current--; setLives(livesRef.current); }
        explode(mx.current, my.current, "#0cf", 20);
        explode(e.x, e.y, e.color, 16);
        playSound("explode");
        return false;
      }
      return true;
    });

    powerUps.current = powerUps.current.filter((p) => {
      p.y += p.vy; p.pulse += 0.1;
      if (dist(p, { x: mx.current, y: my.current }) < 28) {
        if (p.type === "shield") { shieldRef.current = Math.min(100, shieldRef.current + 50); setShield(shieldRef.current); }
        else if (p.type === "extraLife") { livesRef.current = Math.min(5, livesRef.current + 1); setLives(livesRef.current); }
        explode(p.x, p.y, p.type === "shield" ? "#00ffff" : "#ff88ff", 14);
        playSound("powerup");
        return false;
      }
      return p.y < 650;
    });

    particles.current.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy *= 0.96;
      p.life -= p.type === "smoke" ? 0.025 : 0.04;
    });
    particles.current = particles.current.filter((p) => p.life > 0);

    setScore(scoreRef.current);
    setLevel(levelRef.current);

    if (livesRef.current <= 0) {
      running.current = false;
      playSound("death");
      saveScore(scoreRef.current, levelRef.current);
      setScores(loadScores());
      setGameState("dead");
      return;
    }

    draw(ctx);
    animId.current = requestAnimationFrame(loop);
  }

  // ─── Draw helpers ─────────────────────────────────────────────────────────
  function drawBasicEnemy(ctx: CanvasRenderingContext2D, e: Enemy, f: number) {
    const fl = e.flash > 0;
    ctx.fillStyle = fl ? "#fff" : "#cc2200";
    ctx.beginPath(); ctx.moveTo(0,26); ctx.lineTo(-6,14); ctx.lineTo(-20,18); ctx.lineTo(-14,4); ctx.lineTo(-22,-8); ctx.lineTo(-8,-6); ctx.lineTo(0,-18); ctx.lineTo(8,-6); ctx.lineTo(22,-8); ctx.lineTo(14,4); ctx.lineTo(20,18); ctx.lineTo(6,14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fl ? "#ffaaaa" : "#ff4444";
    ctx.beginPath(); ctx.moveTo(0,20); ctx.lineTo(-10,6); ctx.lineTo(-8,-10); ctx.lineTo(0,-14); ctx.lineTo(8,-10); ctx.lineTo(10,6); ctx.closePath(); ctx.fill();
    const cg = ctx.createRadialGradient(-2,-4,0,0,-2,9); cg.addColorStop(0,"rgba(255,220,200,0.95)"); cg.addColorStop(0.5,"rgba(255,80,80,0.6)"); cg.addColorStop(1,"rgba(150,0,0,0.2)"); ctx.fillStyle=cg; ctx.beginPath(); ctx.ellipse(0,-2,6,8,0,0,Math.PI*2); ctx.fill();
    const fire = 0.6+Math.sin(f*0.4)*0.3; ctx.fillStyle=`rgba(255,${Math.floor(100+fire*100)},0,${fire})`; ctx.beginPath(); ctx.moveTo(-4,20); ctx.lineTo(4,20); ctx.lineTo(2,30+fire*8); ctx.lineTo(-2,30+fire*8); ctx.fill();
  }
  function drawFastEnemy(ctx: CanvasRenderingContext2D, e: Enemy, f: number) {
    const fl = e.flash > 0;
    ctx.fillStyle = fl ? "#fff" : "#aa6600"; ctx.beginPath(); ctx.moveTo(0,22); ctx.lineTo(-30,8); ctx.lineTo(-24,-2); ctx.lineTo(-10,-4); ctx.lineTo(0,-20); ctx.lineTo(10,-4); ctx.lineTo(24,-2); ctx.lineTo(30,8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fl ? "#ffddaa" : "#ffaa00"; ctx.beginPath(); ctx.moveTo(0,16); ctx.lineTo(-12,4); ctx.lineTo(-8,-8); ctx.lineTo(0,-16); ctx.lineTo(8,-8); ctx.lineTo(12,4); ctx.closePath(); ctx.fill();
    const cg2 = ctx.createRadialGradient(-2,-6,0,0,-4,8); cg2.addColorStop(0,"rgba(255,240,180,0.95)"); cg2.addColorStop(1,"rgba(100,50,0,0.2)"); ctx.fillStyle=cg2; ctx.beginPath(); ctx.ellipse(0,-4,5,7,0,0,Math.PI*2); ctx.fill();
    const fire2 = 0.5+Math.sin(f*0.6)*0.4; ctx.fillStyle=`rgba(255,160,0,${fire2*0.8})`; ctx.beginPath(); ctx.ellipse(-24,6,7,4,0.3,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.ellipse(24,6,7,4,-0.3,0,Math.PI*2); ctx.fill();
  }
  function drawTankEnemy(ctx: CanvasRenderingContext2D, e: Enemy, f: number) {
    const fl = e.flash > 0;
    ctx.fillStyle = fl ? "#fff" : "#4411aa"; ctx.beginPath(); ctx.moveTo(0,36); ctx.lineTo(-10,28); ctx.lineTo(-32,16); ctx.lineTo(-34,-2); ctx.lineTo(-22,-18); ctx.lineTo(-10,-26); ctx.lineTo(0,-30); ctx.lineTo(10,-26); ctx.lineTo(22,-18); ctx.lineTo(34,-2); ctx.lineTo(32,16); ctx.lineTo(10,28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fl ? "#ddaaff" : "#8833ee"; ctx.beginPath(); ctx.moveTo(0,28); ctx.lineTo(-18,16); ctx.lineTo(-22,0); ctx.lineTo(-14,-16); ctx.lineTo(0,-22); ctx.lineTo(14,-16); ctx.lineTo(22,0); ctx.lineTo(18,16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fl ? "#eeccff" : "#aa44ff"; ctx.beginPath(); ctx.ellipse(0,4,14,18,0,0,Math.PI*2); ctx.fill();
    const cg3 = ctx.createRadialGradient(-3,-8,0,0,-6,12); cg3.addColorStop(0,"rgba(240,200,255,0.95)"); cg3.addColorStop(1,"rgba(60,0,120,0.2)"); ctx.fillStyle=cg3; ctx.beginPath(); ctx.ellipse(0,-6,8,10,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = fl ? "#fff" : "#330088"; ctx.fillRect(-4,-30,3,-12); ctx.fillRect(1,-30,3,-12);
    ctx.fillStyle="#5522aa"; ctx.beginPath(); ctx.moveTo(-22,-18); ctx.lineTo(-40,-10); ctx.lineTo(-38,6); ctx.lineTo(-34,-2); ctx.fill(); ctx.beginPath(); ctx.moveTo(22,-18); ctx.lineTo(40,-10); ctx.lineTo(38,6); ctx.lineTo(34,-2); ctx.fill();
    const fire3 = 0.6+Math.sin(f*0.3)*0.3;
    [[-8,28],[8,28],[-22,14],[22,14]].forEach(([ex,ey]) => { ctx.fillStyle=`rgba(160,60,255,${fire3})`; ctx.beginPath(); ctx.moveTo(ex-4,ey); ctx.lineTo(ex+4,ey); ctx.lineTo(ex+2,ey+14+fire3*8); ctx.lineTo(ex-2,ey+14+fire3*8); ctx.fill(); });
  }
  function drawCompanion(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, f: number) {
    ctx.save(); ctx.translate(cx,cy); ctx.shadowBlur=18; ctx.shadowColor=color;
    ctx.fillStyle = color==="#00ffcc" ? "#006644" : "#660044"; ctx.beginPath(); ctx.moveTo(0,-20); ctx.lineTo(-8,4); ctx.lineTo(-5,8); ctx.lineTo(0,5); ctx.lineTo(5,8); ctx.lineTo(8,4); ctx.closePath(); ctx.fill();
    ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(-5,2); ctx.lineTo(0,4); ctx.lineTo(5,2); ctx.closePath(); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.ellipse(0,-8,3,5,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = color==="#00ffcc" ? "#004433" : "#440033"; ctx.beginPath(); ctx.moveTo(-8,4); ctx.lineTo(-16,10); ctx.lineTo(-12,13); ctx.lineTo(-5,8); ctx.fill(); ctx.beginPath(); ctx.moveTo(8,4); ctx.lineTo(16,10); ctx.lineTo(12,13); ctx.lineTo(5,8); ctx.fill();
    const fire=8+Math.sin(f*0.5)*3; const fg=ctx.createLinearGradient(0,7,0,7+fire*1.8); fg.addColorStop(0,color); fg.addColorStop(1,"transparent"); ctx.fillStyle=fg; ctx.beginPath(); ctx.moveTo(-3,7); ctx.lineTo(3,7); ctx.lineTo(1,7+fire*1.8); ctx.lineTo(-1,7+fire*1.8); ctx.fill();
    ctx.restore();
  }
  function drawPowerUp(ctx: CanvasRenderingContext2D, p: PowerUp) {
    ctx.save(); ctx.translate(p.x,p.y); const pulse=0.8+Math.sin(p.pulse)*0.3; ctx.scale(pulse,pulse);
    if (p.type==="shield") {
      ctx.shadowBlur=20; ctx.shadowColor="#00ccff"; ctx.strokeStyle="#00ccff"; ctx.lineWidth=2; ctx.fillStyle="rgba(0,150,255,0.25)";
      ctx.beginPath(); for(let i=0;i<6;i++){const a=-Math.PI/2+(i*Math.PI)/3; i===0?ctx.moveTo(Math.cos(a)*16,Math.sin(a)*16):ctx.lineTo(Math.cos(a)*16,Math.sin(a)*16);} ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle="#00eeff"; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(-5,0); ctx.lineTo(0,8); ctx.lineTo(5,0); ctx.closePath(); ctx.stroke();
    } else {
      ctx.shadowBlur=20; ctx.shadowColor="#ff44aa"; ctx.fillStyle="rgba(255,60,120,0.3)"; ctx.strokeStyle="#ff44aa"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(0,8); ctx.bezierCurveTo(-16,-2,-18,-18,-2,-14); ctx.bezierCurveTo(0,-10,0,-10,2,-14); ctx.bezierCurveTo(18,-18,16,-2,0,8); ctx.fill(); ctx.stroke();
      ctx.fillStyle="#ff44aa"; ctx.font="bold 11px monospace"; ctx.textAlign="center"; ctx.fillText("+1",0,6);
    }
    ctx.restore();
  }

  function draw(ctx: CanvasRenderingContext2D) {
    const W=480, H=620;
    ctx.fillStyle="#00000e"; ctx.fillRect(0,0,W,H);
    const n1=ctx.createRadialGradient(120,180,0,120,180,220); n1.addColorStop(0,"rgba(0,20,80,0.12)"); n1.addColorStop(1,"transparent"); ctx.fillStyle=n1; ctx.fillRect(0,0,W,H);
    const n2=ctx.createRadialGradient(360,420,0,360,420,200); n2.addColorStop(0,"rgba(40,0,80,0.10)"); n2.addColorStop(1,"transparent"); ctx.fillStyle=n2; ctx.fillRect(0,0,W,H);

    stars.current.forEach((s)=>{const tw=0.5+Math.sin(s.twinkle)*0.4; ctx.fillStyle=`rgba(200,220,255,${tw*0.7})`; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();});

    particles.current.forEach((p)=>{
      ctx.globalAlpha=p.life;
      if(p.type==="smoke"){ctx.fillStyle=`rgba(180,180,180,${p.life*0.3})`; ctx.beginPath(); ctx.arc(p.x,p.y,p.size*2,0,Math.PI*2); ctx.fill();}
      else{ctx.shadowBlur=6; ctx.shadowColor=p.color; ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;}
    });
    ctx.globalAlpha=1;

    powerUps.current.forEach((p)=>drawPowerUp(ctx,p));

    bullets.current.forEach((b)=>{
      ctx.save(); ctx.shadowBlur=18; ctx.shadowColor=b.color||"#00ffff";
      const bg=ctx.createLinearGradient(b.x,b.y-14,b.x,b.y+4); bg.addColorStop(0,"#ffffff"); bg.addColorStop(0.3,b.color||"#00ffff"); bg.addColorStop(1,"transparent");
      ctx.fillStyle=bg; ctx.beginPath(); ctx.ellipse(b.x,b.y-5,2.5,11,0,0,Math.PI*2); ctx.fill(); ctx.restore();
    });

    enemyBullets.current.forEach((b)=>{
      ctx.save(); ctx.shadowBlur=12; ctx.shadowColor=b.color; ctx.fillStyle=b.color; ctx.beginPath(); ctx.arc(b.x,b.y,b.size,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=`rgba(255,200,0,0.3)`; ctx.beginPath(); ctx.arc(b.x,b.y-b.vy*2,b.size*0.6,0,Math.PI*2); ctx.fill(); ctx.restore();
    });

    enemies.current.forEach((e)=>{
      ctx.save(); ctx.translate(e.x,e.y); ctx.shadowBlur=e.flash>0?30:16; ctx.shadowColor=e.flash>0?"#ffffff":e.color;
      if(e.type==="basic") drawBasicEnemy(ctx,e,frame.current);
      else if(e.type==="fast") drawFastEnemy(ctx,e,frame.current);
      else drawTankEnemy(ctx,e,frame.current);
      const bw=e.size*2.2, bx=-bw/2, by=e.size+8;
      ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.beginPath(); canvasRoundRect(ctx,bx,by,bw,5,2); ctx.fill();
      const pct=e.hp/e.maxHp; ctx.fillStyle=pct>0.6?"#00ee44":pct>0.3?"#ffcc00":"#ff3300"; ctx.beginPath(); canvasRoundRect(ctx,bx,by,bw*pct,5,2); ctx.fill();
      ctx.fillStyle="rgba(255,255,255,0.7)"; ctx.font="bold 9px monospace"; ctx.textAlign="center"; ctx.fillText(`${e.hp}/${e.maxHp}`,0,by+13);
      ctx.restore();
    });

    companions.current.forEach((c)=>drawCompanion(ctx,mx.current+c.offsetX,my.current+10,c.color,frame.current));

    ctx.save(); ctx.translate(mx.current,my.current); ctx.shadowBlur=22; ctx.shadowColor="#0088ff";
    const fS=12+Math.sin(frame.current*0.4)*5;
    const fg=ctx.createLinearGradient(0,10,0,10+fS*2.2); fg.addColorStop(0,"rgba(0,180,255,0.95)"); fg.addColorStop(0.4,"rgba(0,80,255,0.7)"); fg.addColorStop(1,"transparent"); ctx.fillStyle=fg; ctx.beginPath(); ctx.moveTo(-7,10); ctx.lineTo(7,10); ctx.lineTo(4,10+fS*2.2); ctx.lineTo(-4,10+fS*2.2); ctx.fill();
    ctx.fillStyle=`rgba(0,160,255,${0.35+Math.sin(frame.current*0.5)*0.2})`; ctx.beginPath(); ctx.ellipse(-21,17,5,7,0.2,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.ellipse(21,17,5,7,-0.2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#003399"; ctx.beginPath(); ctx.moveTo(0,-36); ctx.lineTo(-5,-20); ctx.lineTo(-14,2); ctx.lineTo(-10,10); ctx.lineTo(0,6); ctx.lineTo(10,10); ctx.lineTo(14,2); ctx.lineTo(5,-20); ctx.closePath(); ctx.fill();
    const bodyG=ctx.createLinearGradient(-8,0,8,0); bodyG.addColorStop(0,"#0044cc"); bodyG.addColorStop(0.5,"#1166ff"); bodyG.addColorStop(1,"#0044cc"); ctx.fillStyle=bodyG; ctx.beginPath(); ctx.moveTo(0,-30); ctx.lineTo(-4,-18); ctx.lineTo(-10,0); ctx.lineTo(-7,8); ctx.lineTo(0,4); ctx.lineTo(7,8); ctx.lineTo(10,0); ctx.lineTo(4,-18); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#002288"; ctx.beginPath(); ctx.moveTo(-14,2); ctx.lineTo(-28,16); ctx.lineTo(-22,20); ctx.lineTo(-10,10); ctx.fill(); ctx.beginPath(); ctx.moveTo(14,2); ctx.lineTo(28,16); ctx.lineTo(22,20); ctx.lineTo(10,10); ctx.fill();
    ctx.fillStyle="#0033aa"; ctx.beginPath(); ctx.moveTo(-28,16); ctx.lineTo(-34,20); ctx.lineTo(-28,22); ctx.lineTo(-22,20); ctx.fill(); ctx.beginPath(); ctx.moveTo(28,16); ctx.lineTo(34,20); ctx.lineTo(28,22); ctx.lineTo(22,20); ctx.fill();
    const cg=ctx.createRadialGradient(-3,-20,0,0,-16,12); cg.addColorStop(0,"rgba(255,255,255,0.95)"); cg.addColorStop(0.3,"rgba(140,220,255,0.85)"); cg.addColorStop(1,"rgba(0,60,180,0.1)"); ctx.fillStyle=cg; ctx.beginPath(); ctx.ellipse(0,-18,5,9,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#4488ff"; ctx.beginPath(); ctx.ellipse(0,-36,3,5,0,0,Math.PI*2); ctx.fill();
    if(shieldRef.current>0){
      const alpha=(shieldRef.current/100)*0.4; ctx.strokeStyle=`rgba(0,200,255,${alpha+0.2})`; ctx.lineWidth=2+shieldRef.current/50; ctx.shadowBlur=20; ctx.shadowColor="#00ffff"; ctx.beginPath(); ctx.ellipse(0,-8,32,40,0,0,Math.PI*2); ctx.stroke(); ctx.fillStyle=`rgba(0,180,255,${alpha*0.3})`; ctx.fill(); ctx.shadowBlur=0;
    }
    ctx.restore();

    ctx.strokeStyle="rgba(0,200,255,0.3)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(mx.current-16,my.current); ctx.lineTo(mx.current+16,my.current); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx.current,my.current-16); ctx.lineTo(mx.current,my.current+16); ctx.stroke();
    ctx.beginPath(); ctx.arc(mx.current,my.current,7,0,Math.PI*2); ctx.stroke();
  }

  // ─── Input handlers ───────────────────────────────────────────────────────
  function getCanvasScale() {
    const canvas = canvasRef.current;
    if (!canvas) return { sx: 1, sy: 1 };
    const r = canvas.getBoundingClientRect();
    return { sx: canvas.width / r.width, sy: canvas.height / r.height };
  }

  function handleMouseMove(e: React.MouseEvent) {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const { sx, sy } = getCanvasScale();
    mx.current = (e.clientX - r.left) * sx;
    my.current = (e.clientY - r.top) * sy;
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const { sx, sy } = getCanvasScale();
    const t = e.touches[0];
    mx.current = Math.max(20, Math.min(460, (t.clientX - r.left) * sx));
    my.current = Math.max(20, Math.min(600, (t.clientY - r.top) * sy));
  }

  function handleTouchStart(e: React.TouchEvent) {
    e.preventDefault();
    handleTouchMove(e);
    if (fireModeRef.current === "manual") shoot();
  }

  // ─── Leaderboard snippet ──────────────────────────────────────────────────
  function renderLeaderboard() {
    if (scores.length === 0) return null;
    return (
      <div className="leaderboard">
        <div className="lb-title">🏆 РЕКОРДТАР</div>
        {scores.map((s, i) => (
          <div key={i} className="lb-row">
            <span className="lb-rank">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}.`}</span>
            <span className="lb-score">{s.score} ұпай</span>
            <span className="lb-level">Дең. {s.level}</span>
            <span className="lb-date">{s.date}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="App">
      <div className="ui">
        <span>ҰПАЙ: <b>{score}</b></span>
        <span>ДЕҢГЕЙ: <b>{level}</b></span>
        <span>ӨМІР: <b>{"❤️".repeat(Math.max(0,lives)) || "💀"}</b></span>
        <span style={{ color: shield > 0 ? "#00ffff" : "#555" }}>
          🛡️ <b style={{ color: shield>60?"#00ff88":shield>30?"#ffcc00":"#ff4444" }}>
            {shield > 0 ? shield + "%" : "—"}
          </b>
        </span>
      </div>

      <div className="game-wrapper">
        <canvas
          ref={canvasRef} width={480} height={620}
          onMouseMove={handleMouseMove}
          onTouchMove={handleTouchMove}
          onTouchStart={handleTouchStart}
          onClick={() => { if (gameState === "playing") shoot(); }}
          style={{ cursor: "none" }}
        />

        {gameState !== "playing" && (
          <div className="overlay">
            {/* ── MENU ── */}
            {gameState === "menu" && (
              <>
                <h1>ГАЛАКТИКА</h1>
                <p>🔴 Basic 3HP &nbsp;|&nbsp; 🟠 Fast 2HP &nbsp;|&nbsp; 🟣 Tank 6HP</p>
                <p>🛡️ Қалқан — 30 сек сайын &nbsp;|&nbsp; ❤️ Жүрек — өмір азайғанда</p>
                <p>⭐ 2-деңгейде 1 серіктес, 5-деңгейде 2 серіктес</p>
                <p className="controls-hint">🖱️ Мышь / ⌨️ WASD / 📱 Сенсор — басқару</p>
                <div className="menu-buttons">
                  <button onClick={startGame}>БАСТАУ</button>
                  <button onClick={() => setGameState("settings")} className="btn-settings">⚙️ БАПТАУЛАР</button>
                </div>
                {renderLeaderboard()}
              </>
            )}

            {/* ── SETTINGS ── */}
            {gameState === "settings" && (
              <>
                <h1 style={{ fontSize: "26px", letterSpacing: "3px" }}>⚙️ БАПТАУЛАР</h1>
                <div className="settings-row">
                  <span className="settings-label">АТЫ РЕЖИМІ</span>
                  <div className="toggle-group">
                    <button
                      className={`toggle${fireMode === "auto" ? " active" : ""}`}
                      onClick={() => changeFireMode("auto")}
                    >
                      АВТО
                    </button>
                    <button
                      className={`toggle${fireMode === "manual" ? " active" : ""}`}
                      onClick={() => changeFireMode("manual")}
                    >
                      ҚОЛМЕН
                    </button>
                  </div>
                </div>
                <p className="settings-hint">
                  {fireMode === "auto"
                    ? "✅ Кеме өздігінен атады"
                    : "✅ Пробел / экранды түрту арқылы атады"}
                </p>
                <button onClick={() => setGameState("menu")} style={{ marginTop: "16px" }}>
                  ← КЕРІ
                </button>
              </>
            )}

            {/* ── DEAD ── */}
            {gameState === "dead" && (
              <>
                <h1 style={{ color:"#f44" }}>ОЙЫН АЯҚТАЛДЫ</h1>
                <div className="score">{score} ҰПАЙ</div>
                <p>Деңгей {level}</p>
                <div className="menu-buttons">
                  <button onClick={startGame} style={{ borderColor:"#f44", color:"#f44" }}>ҚАЙТА ОЙНАУ</button>
                  <button onClick={() => setGameState("menu")} className="btn-settings">МӘЗІР</button>
                </div>
                {renderLeaderboard()}
              </>
            )}
          </div>
        )}
      </div>

      {/* Mobile fire button — visible only on touch devices via CSS */}
      {gameState === "playing" && fireMode === "manual" && (
        <button
          className="mobile-fire-btn"
          onTouchStart={(e) => { e.preventDefault(); shoot(); }}
        >
          🔥
        </button>
      )}
    </div>
  );
}
