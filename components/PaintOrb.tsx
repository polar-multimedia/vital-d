import React, { useEffect, useRef } from 'react';

// Mancha de acuarela viva para Adi, en los colores del logo Vital D.
// En reposo respira despacio; cuando Adi habla, la pintura se expande y se agita
// con el volumen real de su voz; cuando el médico habla, se aviva el verde.

export type OrbMode = 'idle' | 'listening' | 'user' | 'speaking';

interface Props {
  mode: OrbMode;
  getLevel?: () => number; // 0..1, volumen actual de la voz de Adi
  size?: number;
}

const INKS = [
  { c: [142, 59, 168], a: 0.3 },  // violeta
  { c: [224, 83, 31], a: 0.3 },   // naranja
  { c: [242, 183, 5], a: 0.34 },  // sol
  { c: [47, 158, 107], a: 0.28 }, // verde
  { c: [200, 50, 120], a: 0.2 },  // magenta
];

interface Blob {
  ink: number;
  angle: number; // posición alrededor del centro
  dist: number;
  r: number;
  seed: number;
  speed: number;
}

const PaintOrb: React.FC<Props> = ({ mode, getLevel, size = 288 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  const levelRef = useRef(getLevel);
  modeRef.current = mode;
  levelRef.current = getLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const blobs: Blob[] = Array.from({ length: 7 }, (_, i) => ({
      ink: i % INKS.length,
      angle: (i / 7) * Math.PI * 2 + Math.random() * 0.6,
      dist: 0.08 + Math.random() * 0.16,
      r: 0.36 + Math.random() * 0.16,
      seed: Math.random() * 1000,
      speed: 0.6 + Math.random() * 0.8,
    }));
    const drops = Array.from({ length: 14 }, () => ({
      a: Math.random() * Math.PI * 2,
      d: 0.45 + Math.random() * 0.4,
      r: 0.004 + Math.random() * 0.012,
      ink: Math.floor(Math.random() * INKS.length),
      seed: Math.random() * 1000,
    }));

    let raf = 0;
    let t = Math.random() * 100;
    let energy = 0;   // suavizado del volumen
    let greenish = 0; // cuánto domina el verde (médico hablando)
    let last = performance.now();

    const wobble = (seed: number, k: number, time: number) =>
      Math.sin(k * 3 + time * 0.9 + seed) * 0.5 +
      Math.sin(k * 5 - time * 1.3 + seed * 1.7) * 0.3 +
      Math.sin(k * 9 + time * 0.6 + seed * 0.3) * 0.2;

    const drawBlob = (cx: number, cy: number, radius: number, seed: number, time: number, rgb: number[], alpha: number, rough: number) => {
      // Varias capas translúcidas con bordes deformados = efecto acuarela
      for (let layer = 0; layer < 4; layer++) {
        const lr = radius * (1 - layer * 0.13);
        ctx.beginPath();
        const steps = 48;
        for (let i = 0; i <= steps; i++) {
          const k = (i / steps) * Math.PI * 2;
          const rr = lr * (1 + rough * wobble(seed + layer * 13, k, time));
          const x = cx + Math.cos(k) * rr;
          const y = cy + Math.sin(k) * rr;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        const g = ctx.createRadialGradient(cx, cy, lr * 0.1, cx, cy, lr * 1.1);
        g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha * 0.35})`);
        g.addColorStop(0.7, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha * 0.3})`);
        g.addColorStop(0.93, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha * 0.75})`); // borde más cargado, como pigmento que se seca
        g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
        ctx.fillStyle = g;
        ctx.fill();
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const m = modeRef.current;
      const lvl = m === 'speaking' ? Math.min(1, (levelRef.current?.() ?? 0) * 3.2) : 0;
      const target = m === 'speaking' ? 0.35 + lvl * 0.65 : m === 'user' ? 0.35 : m === 'listening' ? 0.12 : 0.05;
      energy += (target - energy) * Math.min(1, dt * (target > energy ? 9 : 2.5));
      greenish += ((m === 'user' ? 1 : 0) - greenish) * Math.min(1, dt * 3);
      t += dt * (0.25 + energy * 1.6);

      const S = size;
      const c = S / 2;
      ctx.clearRect(0, 0, S, S);

      // Papel
      ctx.fillStyle = '#FBF7F0';
      ctx.fillRect(0, 0, S, S);

      ctx.globalCompositeOperation = 'multiply';
      const breathe = 1 + Math.sin(t * 0.8) * 0.04 + energy * 0.08;
      for (const b of blobs) {
        const ang = b.angle + t * 0.12 * b.speed;
        const d = (b.dist + energy * (0.1 + 0.05 * Math.sin(t * b.speed + b.seed))) * S; // al hablar, la pintura se abre
        const x = c + Math.cos(ang) * d;
        const y = c + Math.sin(ang) * d;
        const ink = INKS[b.ink];
        let rgb = ink.c;
        if (greenish > 0.01 && b.ink !== 3) {
          const gC = INKS[3].c;
          const k = greenish * 0.45;
          rgb = rgb.map((v, i) => Math.round(v * (1 - k) + gC[i] * k));
        }
        drawBlob(x, y, b.r * S * 0.5 * breathe, b.seed, t * b.speed, rgb, ink.a * (0.9 + energy * 0.12), 0.1 + energy * 0.12);
      }
      // Salpicaduras
      for (const dr of drops) {
        const a = dr.a + t * 0.05;
        const dd = (dr.d + energy * 0.12 * Math.sin(t + dr.seed)) * c;
        const ink = INKS[dr.ink].c;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * dd, c + Math.sin(a) * dd, dr.r * S * (1 + energy * 0.8), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},0.45)`;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Grano de papel muy ligero
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * S, Math.random() * S, 1, 1);

      if (!reduced) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden="true" />;
};

export default PaintOrb;
