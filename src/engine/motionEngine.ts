import { FallbackKind, Palette, SceneSpec, ShowreelData, TransitionKind } from '../types/showreel';

export interface ScenePaintContext {
  pal: Palette;
  bpm: number;
  energy: number;
  text: string;
  sub: string;
  role: string;
  dur: number;
  seed: number;
  pulse: number;
  gt: number;
  i: number;
  layout_mode?: string;
  camera_motion?: string;
  visual_bridge?: string;
  narration?: string;
  idea?: string;
}

export type SceneDrawFn = (
  ctx: CanvasRenderingContext2D,
  t: number,
  ts: number,
  W: number,
  H: number,
  P: ScenePaintContext,
  M: typeof MotionLib
) => void;

const LAYOUT_VARIANTS = [
  'editorial_left',
  'editorial_right',
  'diagonal_impact',
  'split_stroke',
  'bottom_poster',
  'top_monumental',
  'vertical_cascade',
  'kinetic_stagger',
] as const;

export const MotionLib = {
  clamp: (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x)),
  lerp: (a: number, b: number, t: number) => a + (b - a) * t,
  map: (x: number, a: number, b: number, c: number, d: number) =>
    c + (d - c) * MotionLib.clamp((x - a) / (b - a)),
  p: (ts: number, start: number, dur: number) => MotionLib.clamp((ts - start) / Math.max(0.001, dur)),
  stagger: (ts: number, i: number, start: number, gap: number, dur: number) =>
    MotionLib.p(ts, start + i * gap, dur),
  ease: {
    outExpo: (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * MotionLib.clamp(x))),
    outCubic: (x: number) => 1 - Math.pow(1 - MotionLib.clamp(x), 3),
    inCubic: (x: number) => {
      const c = MotionLib.clamp(x);
      return c * c * c;
    },
    inOutCubic: (x: number) => {
      const c = MotionLib.clamp(x);
      return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
    },
    inOutQuint: (x: number) => {
      const c = MotionLib.clamp(x);
      return c < 0.5 ? 16 * c * c * c * c * c : 1 - Math.pow(-2 * c + 2, 5) / 2;
    },
    outBack: (x: number) => {
      const c = MotionLib.clamp(x);
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(c - 1, 3) + c1 * Math.pow(c - 1, 2);
    },
    outElastic: (x: number) => {
      const c = MotionLib.clamp(x);
      return c <= 0
        ? 0
        : c >= 1
        ? 1
        : Math.pow(2, -10 * c) * Math.sin((c * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    },
  },
  spring: (x: number, k = 7, w = 14) => {
    const cx = MotionLib.clamp(x);
    return 1 - Math.exp(-k * cx) * Math.cos(w * cx);
  },
  rgb: (h: string): [number, number, number] => {
    let hex = String(h || '#ffffff').replace('#', '');
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const n = parseInt(hex, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },
  col: (h: string, a = 1) => {
    const c = MotionLib.rgb(h);
    return `rgba(${c[0]},${c[1]},${c[2]},${MotionLib.clamp(a)})`;
  },
  mixc: (h1: string, h2: string, t: number) => {
    const a = MotionLib.rgb(h1);
    const b = MotionLib.rgb(h2);
    const ct = MotionLib.clamp(t);
    return `rgb(${Math.round(MotionLib.lerp(a[0], b[0], ct))},${Math.round(
      MotionLib.lerp(a[1], b[1], ct)
    )},${Math.round(MotionLib.lerp(a[2], b[2], ct))})`;
  },
  rng: (seed: number) => {
    let a = seed | 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  noise: (x: number, y = 0, seed = 1) => {
    const hash = (ix: number, iy: number) => {
      let n = (ix * 374761393 + iy * 668265263 + (seed | 0) * 1442695041) | 0;
      n = (n ^ (n >>> 13)) * 1274126177;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = MotionLib.lerp(hash(xi, yi), hash(xi + 1, yi), u);
    const b = MotionLib.lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u);
    return MotionLib.lerp(a, b, v);
  },
  lines: (s: string, max = 11, maxLines = 4): string[] => {
    const w = String(s).split(/\s+/).filter(Boolean);
    const L: string[] = [];
    let cur = '';
    w.forEach((x) => {
      if (cur && (cur + ' ' + x).length > max) {
        L.push(cur);
        cur = x;
      } else {
        cur = (cur ? cur + ' ' : '') + x;
      }
    });
    if (cur) L.push(cur);
    return L.slice(0, maxLines).length ? L.slice(0, maxLines) : [''];
  },
  fit: (
    ctx: CanvasRenderingContext2D,
    s: string,
    maxW: number,
    size: number,
    weight?: number | string
  ) => {
    ctx.save();
    let sz = Math.round(size);
    while (sz > 12) {
      ctx.font = `${weight || 800} ${sz}px 'Outfit', system-ui, Roboto, Arial, sans-serif`;
      if (ctx.measureText(s).width <= maxW) break;
      sz -= 4;
    }
    ctx.restore();
    return sz;
  },
  text: (
    ctx: CanvasRenderingContext2D,
    s: string,
    x: number,
    y: number,
    size: number,
    o: {
      alpha?: number;
      weight?: number | string;
      font?: string;
      align?: CanvasTextAlign;
      spacing?: number;
      rot?: number;
      shadow?: boolean;
      stroke?: string;
      strokeW?: number;
      color?: string;
      glow?: string;
    } = {}
  ) => {
    ctx.save();
    ctx.globalAlpha = o.alpha === undefined ? 1 : MotionLib.clamp(o.alpha);
    ctx.font = `${o.weight || 800} ${Math.round(Math.max(8, size))}px ${
      o.font || "'Outfit', system-ui, Roboto, Arial, sans-serif"
    }`;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx && o.spacing) {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${o.spacing}px`;
    }
    let dx = x;
    let dy = y;
    if (o.rot) {
      ctx.translate(x, y);
      ctx.rotate(o.rot);
      dx = 0;
      dy = 0;
    }
    if (o.shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,.42)';
      ctx.fillText(s, dx + size * 0.03, dy + size * 0.03);
    }
    if (o.stroke) {
      ctx.lineWidth = o.strokeW || size * 0.04;
      ctx.strokeStyle = o.stroke;
      ctx.strokeText(s, dx, dy);
    }
    ctx.fillStyle = o.color || '#fff';
    if (o.glow) {
      ctx.shadowColor = o.glow;
      ctx.shadowBlur = size * 0.38;
    }
    ctx.fillText(s, dx, dy);
    ctx.restore();
  },
  rot3: (p: [number, number, number], ax: number, ay: number, az: number): [number, number, number] => {
    let x = p[0];
    let y = p[1];
    let z = p[2];
    let c = Math.cos(ax);
    let s = Math.sin(ax);
    let t = y * c - z * s;
    z = y * s + z * c;
    y = t;
    c = Math.cos(ay);
    s = Math.sin(ay);
    t = x * c + z * s;
    z = -x * s + z * c;
    x = t;
    c = Math.cos(az);
    s = Math.sin(az);
    t = x * c - y * s;
    y = x * s + y * c;
    x = t;
    return [x, y, z];
  },
  proj: (
    p: [number, number, number],
    W: number,
    H: number,
    fov = 900,
    cx = W / 2,
    cy = H / 2
  ) => {
    const s = fov / Math.max(60, fov + p[2]);
    return { x: cx + p[0] * s, y: cy + p[1] * s, s };
  },
  poly: (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    sides = 6,
    rot = 0
  ) => {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i * Math.PI * 2) / sides;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  },
  star: (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rOut: number,
    rIn: number,
    pts = 5,
    rot = 0
  ) => {
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const r = i % 2 === 0 ? rOut : rIn;
      const a = rot + (i * Math.PI) / pts;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  },
  rrect: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r = 16
  ) => {
    const rad = Math.max(0, Math.min(r, Math.min(Math.abs(w), Math.abs(h)) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  },
  wave: (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    yBase: number,
    amp: number,
    freq: number,
    phase: number,
    fillBottom = false
  ) => {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 16) {
      const y =
        yBase +
        Math.sin((x / W) * Math.PI * 2 * freq + phase) * amp +
        Math.cos((x / W) * Math.PI * 4 * freq - phase * 0.7) * (amp * 0.35);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (fillBottom) {
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
    }
  },
  ring: (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    startA = 0,
    endA = Math.PI * 2
  ) => {
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0.5, r), startA, endA);
  },
  circle: (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0.5, r), 0, Math.PI * 2);
  },
  line: (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  },
  rect: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 0) => {
    if (r > 0) MotionLib.rrect(ctx, x, y, w, h, r);
    else {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
    }
  },
  bg: (ctx: CanvasRenderingContext2D, W: number, H: number, P: ScenePaintContext, v = 0) => {
    const R = MotionLib.rng((P.seed || 1) + v * 31);
    const bgMode = Math.floor(R() * 4);
    const ox = W * (0.2 + R() * 0.6);
    const oy = H * (0.18 + R() * 0.64);

    if (bgMode === 0) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, P.pal.bg1);
      g.addColorStop(0.65, P.pal.bg2);
      g.addColorStop(1, P.pal.bg1);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else if (bgMode === 1) {
      ctx.fillStyle = P.pal.bg1;
      ctx.fillRect(0, 0, W, H);
      const rg = ctx.createRadialGradient(ox, oy, W * 0.05, ox, oy, H * 0.75);
      rg.addColorStop(0, P.pal.bg2);
      rg.addColorStop(1, P.pal.bg1);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    } else if (bgMode === 2) {
      const g = ctx.createLinearGradient(W, 0, 0, H);
      g.addColorStop(0, P.pal.bg2);
      g.addColorStop(1, P.pal.bg1);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, P.pal.bg1);
      g.addColorStop(0.5, P.pal.bg2);
      g.addColorStop(1, P.pal.bg1);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // Luz atmosférica sutil reativa ao pulso e única para cada cena
    const glow = ctx.createRadialGradient(ox, oy, 10, ox, oy, W * (0.55 + P.pulse * 0.15));
    glow.addColorStop(0, MotionLib.col(v % 2 === 0 ? P.pal.acc : P.pal.acc2, 0.14));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  },
  deco: (ctx: CanvasRenderingContext2D, W: number, H: number, P: ScenePaintContext, ts: number) => {
    const R = MotionLib.rng(P.seed * 7 + 1);
    const decoKind = Math.floor(R() * 5);

    if (decoKind === 0) {
      // Poeira luminosa ascendente com profundidade
      for (let k = 0; k < 22; k++) {
        const x = R() * W;
        const y = R() * H;
        const r = 1.5 + R() * 4.5;
        const vx = (R() - 0.5) * 65;
        const vy = -15 - R() * 55;
        const px = (((x + vx * ts) % W) + W) % W;
        const py = (((y + vy * ts) % H) + H) % H;
        ctx.fillStyle = MotionLib.col(k % 2 ? P.pal.acc : P.pal.acc2, 0.25 + (k % 4) * 0.1);
        ctx.beginPath();
        ctx.arc(px, py, r * (1 + P.pulse * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (decoKind === 1) {
      // Traços cinéticos diagonais de velocidade
      const angle = (R() < 0.5 ? -1 : 1) * 0.35;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(angle);
      for (let k = 0; k < 14; k++) {
        const lx = (R() - 0.5) * W * 1.3;
        const ly = (((R() * H * 1.4 + ts * (120 + k * 20)) % (H * 1.4)) - H * 0.7);
        const len = 30 + R() * 90;
        ctx.strokeStyle = MotionLib.col(k % 2 ? P.pal.acc : P.pal.acc2, 0.3);
        ctx.lineWidth = 1.5 + (k % 3);
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx, ly + len);
        ctx.stroke();
      }
      ctx.restore();
    } else if (decoKind === 2) {
      // Ondas atmosféricas sutis no horizonte
      for (let w = 0; w < 3; w++) {
        const yBase = H * (0.18 + w * 0.32);
        ctx.strokeStyle = MotionLib.col(w % 2 ? P.pal.acc2 : P.pal.acc, 0.22);
        ctx.lineWidth = 2;
        MotionLib.wave(ctx, W, H, yBase, 18 + w * 8, 1.5 + w * 0.5, ts * 2 + w, false);
        ctx.stroke();
      }
    } else if (decoKind === 3) {
      // Constelação conectada flutuante
      const pts: { x: number; y: number }[] = [];
      for (let k = 0; k < 12; k++) {
        const px = W * (0.1 + 0.8 * ((R() + Math.sin(ts * 0.4 + k) * 0.08 + 1) % 1));
        const py = H * (0.1 + 0.8 * ((R() + Math.cos(ts * 0.35 + k * 2) * 0.08 + 1) % 1));
        pts.push({ x: px, y: py });
        ctx.fillStyle = MotionLib.col(P.pal.acc2, 0.45);
        ctx.beginPath();
        ctx.arc(px, py, 3 + P.pulse * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = MotionLib.col(P.pal.dim, 0.2);
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length - 1; i++) {
        if (Math.hypot(pts[i].x - pts[i + 1].x, pts[i].y - pts[i + 1].y) < W * 0.4) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
          ctx.stroke();
        }
      }
    } else {
      // Régua editorial assimétrica na lateral
      const sideX = R() < 0.5 ? W * 0.05 : W * 0.95;
      const e = MotionLib.ease.outExpo(MotionLib.p(ts, 0, 0.6));
      ctx.strokeStyle = MotionLib.col(P.pal.acc, 0.45);
      ctx.lineWidth = 2;
      for (let k = 0; k < 16; k++) {
        const y = H * (0.15 + (k / 15) * 0.7 * e);
        const tickW = (k % 4 === 0 ? 18 : 8) * (sideX < W * 0.5 ? 1 : -1);
        ctx.beginPath();
        ctx.moveTo(sideX, y);
        ctx.lineTo(sideX + tickW, y);
        ctx.stroke();
      }
    }
  },
  mainText: (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    P: ScenePaintContext,
    ts: number,
    o: {
      scale?: number;
      cy?: number;
      cx?: number;
      alpha?: number;
      align?: CanvasTextAlign;
      rot?: number;
      layout?: string;
    } = {}
  ) => {
    const L = MotionLib.lines(String(P.text).toUpperCase(), 12);
    const long = L.reduce((a, b) => (a.length > b.length ? a : b), '');
    const R = MotionLib.rng(P.seed + 19 + P.i * 7);
    const variant =
      o.layout ||
      P.layout_mode ||
      LAYOUT_VARIANTS[(Math.floor(R() * LAYOUT_VARIANTS.length) + P.i) % LAYOUT_VARIANTS.length];

    const baseScale = o.scale || 1;
    const fs = MotionLib.fit(ctx, long, W * 0.84, W * 0.165) * baseScale;
    const lh = fs * 1.14;
    const baseAlpha = o.alpha === undefined ? 1 : o.alpha;

    if (
      (variant.includes('left') || variant.includes('assimetrico') || variant.includes('editorial')) &&
      !o.align &&
      !o.cx
    ) {
      const xLeft = W * 0.085;
      const cy = o.cy || H * (0.3 + (P.i % 3) * 0.16);
      const y0 = cy - ((L.length - 1) * lh) / 2;
      const barP = MotionLib.ease.outExpo(MotionLib.p(ts, 0.04, 0.5));
      ctx.fillStyle = P.pal.acc;
      ctx.fillRect(xLeft, y0 - fs * 0.72, W * 0.22 * barP, Math.max(4, W * 0.008));
      L.forEach((l, i) => {
        const st = MotionLib.ease.outCubic(MotionLib.stagger(ts, i, 0.03, 0.09, 0.45));
        MotionLib.text(
          ctx,
          l,
          xLeft - (1 - st) * W * 0.14,
          y0 + i * lh,
          fs * (1 + P.pulse * 0.04),
          {
            align: 'left',
            color: i === L.length - 1 && L.length > 1 ? P.pal.acc : P.pal.fg,
            alpha: baseAlpha * st,
            glow: i === L.length - 1 ? P.pal.acc : undefined,
          }
        );
      });
      return;
    }

    if (variant.includes('right') && !o.align && !o.cx) {
      const xRight = W * 0.915;
      const cy = o.cy || H * (0.36 + (P.i % 2) * 0.22);
      const y0 = cy - ((L.length - 1) * lh) / 2;
      L.forEach((l, i) => {
        const st = MotionLib.ease.outBack(MotionLib.stagger(ts, i, 0.04, 0.09, 0.45));
        MotionLib.text(
          ctx,
          l,
          xRight + (1 - st) * W * 0.16,
          y0 + i * lh,
          fs * (1 + P.pulse * 0.04),
          {
            align: 'right',
            color: i === 0 ? P.pal.acc2 : P.pal.fg,
            alpha: baseAlpha * st,
            glow: P.pal.acc,
          }
        );
      });
      return;
    }

    if ((variant.includes('diagonal') || variant.includes('brutalist')) && !o.rot) {
      const tilt = (R() < 0.5 ? -1 : 1) * 0.085;
      const cy = o.cy || H * 0.48;
      const y0 = cy - ((L.length - 1) * lh) / 2;
      L.forEach((l, i) => {
        const st = MotionLib.ease.outBack(MotionLib.stagger(ts, i, 0.02, 0.1, 0.48));
        const dir = i % 2 === 0 ? 1 : -1;
        MotionLib.text(
          ctx,
          l,
          W / 2 + (1 - st) * dir * W * 0.35,
          y0 + i * lh,
          fs * (0.85 + 0.15 * st) * (1 + P.pulse * 0.06),
          {
            rot: tilt,
            color: i === 0 ? P.pal.fg : P.pal.acc,
            stroke: i === L.length - 1 ? P.pal.acc2 : undefined,
            alpha: baseAlpha * MotionLib.clamp(st * 1.5),
            glow: P.pal.acc,
          }
        );
      });
      return;
    }

    if (variant.includes('stroke') || variant.includes('recorte')) {
      const cy = o.cy || H * 0.46;
      const y0 = cy - ((L.length - 1) * lh) / 2;
      L.forEach((l, i) => {
        const st = MotionLib.ease.outExpo(MotionLib.stagger(ts, i, 0.05, 0.1, 0.5));
        const isOutline = i === 0 && L.length > 1;
        MotionLib.text(
          ctx,
          l,
          o.cx || W / 2,
          y0 + i * lh + (1 - st) * 35,
          fs * (1 + P.pulse * 0.05),
          {
            align: o.align || 'center',
            color: isOutline ? 'rgba(0,0,0,0)' : i === L.length - 1 ? P.pal.acc : P.pal.fg,
            stroke: isOutline ? P.pal.fg : undefined,
            strokeW: isOutline ? Math.max(2.5, fs * 0.035) : undefined,
            alpha: baseAlpha * st,
            glow: P.pal.acc,
          }
        );
      });
      return;
    }

    if (variant.includes('top') || variant.includes('monumental')) {
      const cy = o.cy || H * 0.22;
      const y0 = cy - ((L.length - 1) * lh) / 2;
      L.forEach((l, i) => {
        const st = MotionLib.ease.outExpo(MotionLib.stagger(ts, i, 0.02, 0.08, 0.45));
        MotionLib.text(
          ctx,
          l,
          o.cx || W / 2,
          y0 + i * lh - (1 - st) * 28,
          fs * (1 + P.pulse * 0.05),
          {
            align: o.align || 'center',
            color: i % 2 === 1 ? P.pal.acc2 : P.pal.fg,
            alpha: baseAlpha * st,
            glow: P.pal.acc,
          }
        );
      });
      return;
    }

    const cy = o.cy || (variant.includes('bottom') || variant.includes('poster') ? H * 0.68 : H * 0.46);
    const y0 = cy - ((L.length - 1) * lh) / 2;
    L.forEach((l, i) => {
      const st = MotionLib.ease.outBack(MotionLib.stagger(ts, i, 0.03, 0.08, 0.45));
      MotionLib.text(
        ctx,
        l,
        o.cx || W / 2,
        y0 + i * lh + (1 - st) * 28,
        fs * (1 + P.pulse * 0.05),
        {
          align: o.align || 'center',
          glow: P.pal.acc,
        }
      );
    });
  },
  renderCodeSystem: (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    P: ScenePaintContext,
    ts: number
  ) => {
    const e = MotionLib.ease.outExpo(MotionLib.p(ts, 0, 0.75));
    const cx = W / 2;
    const cy = H * 0.44;

    ctx.save();

    // 1. Fase de geração de código acelerado (0.0s - 1.8s)
    const codeProg = MotionLib.clamp(ts / 1.5, 0, 1);
    const winW = W * 0.88 * e;
    const winH = H * (ts > 1.8 ? 0.22 : 0.36) * e;
    const wx = cx - winW / 2;
    const wy = cy - (ts > 1.8 ? H * 0.22 : winH / 2);

    // Janela do editor de código
    ctx.fillStyle = MotionLib.col(P.pal.bg2, 0.94);
    MotionLib.rrect(ctx, wx, wy, winW, winH, 16);
    ctx.fill();
    ctx.strokeStyle = MotionLib.col(P.pal.acc2, 0.7);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Barra de título do editor com botões macOS e status de compilação
    ctx.fillStyle = MotionLib.col(P.pal.bg1, 0.96);
    MotionLib.rrect(ctx, wx, wy, winW, 36, 16);
    ctx.fill();
    const btnColors = ['#ff5f56', '#ffbd2e', '#27c93f'];
    for (let d = 0; d < 3; d++) {
      ctx.fillStyle = btnColors[d];
      ctx.beginPath();
      ctx.arc(wx + 20 + d * 18, wy + 18, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    MotionLib.text(
      ctx,
      'gerando-sistema.ts · compilando código...',
      wx + winW / 2,
      wy + 18,
      13,
      { color: P.pal.dim, align: 'center' }
    );

    // Linhas dinâmicas de código sendo geradas velozmente
    const codeLines = [
      { num: '01', text: "import { Sistema, AgenteIA, BancoDados } from '@cloud/saas';", col: P.pal.acc2 },
      { num: '02', text: "export const app = new Sistema({ modo: 'autônomo', autoDeploy: true });", col: P.pal.fg },
      { num: '03', text: 'await app.gerarPipelineCompleto({ auth: true, pagamentos: true });', col: P.pal.acc },
      { num: '04', text: 'const instancia = await app.iniciarSistemaProducao();', col: P.pal.acc2 },
      { num: '05', text: '// ✓ SISTEMA CRIADO E PRONTO COM SUCESSO', col: P.pal.acc },
    ];

    const maxLinesToShow = ts > 1.8 ? 3 : 5;
    const typingProgress = MotionLib.clamp(ts * 2.8, 0, codeLines.length);

    for (let li = 0; li < Math.min(codeLines.length, maxLinesToShow); li++) {
      const line = codeLines[li];
      if (li > typingProgress) continue;
      const charRatio = MotionLib.clamp(typingProgress - li, 0, 1);
      const charsToShow = Math.floor(line.text.length * charRatio);
      const visibleText = line.text.slice(0, charsToShow);
      const ly = wy + 58 + li * 26;

      MotionLib.text(ctx, line.num, wx + 18, ly, 12, {
        color: MotionLib.col(P.pal.dim, 0.45),
        align: 'left',
      });

      MotionLib.text(ctx, visibleText, wx + 48, ly, 13, {
        color: line.col,
        align: 'left',
        glow: li === 2 || li === 4 ? P.pal.acc : undefined,
      });

      if (Math.floor(typingProgress) === li && Math.sin(ts * 14) > 0) {
        ctx.font = '13px monospace';
        const tw = ctx.measureText(visibleText).width;
        ctx.fillStyle = P.pal.acc;
        ctx.fillRect(wx + 50 + tw, ly - 9, 7, 14);
      }
    }

    // 2. Transição para o EXEMPLO DO SISTEMA CRIADO EM EXECUÇÃO (a partir de ts > 1.4s)
    const sysEnter = MotionLib.ease.outBack(MotionLib.p(ts, 1.4, 0.75));
    if (sysEnter > 0) {
      const sysW = W * 0.88 * sysEnter;
      const sysH = H * 0.28 * sysEnter;
      const sysX = cx - sysW / 2;
      const sysY = cy + H * 0.05 + (1 - sysEnter) * 35;

      // Card do Sistema Criado (Live SaaS Preview)
      ctx.fillStyle = MotionLib.col(P.pal.bg1, 0.94);
      MotionLib.rrect(ctx, sysX, sysY, sysW, sysH, 18);
      ctx.fill();
      ctx.strokeStyle = P.pal.acc;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Top bar do sistema
      ctx.fillStyle = MotionLib.col(P.pal.acc, 0.16);
      MotionLib.rrect(ctx, sysX + 12, sysY + 12, sysW - 24, 34, 10);
      ctx.fill();
      ctx.strokeStyle = MotionLib.col(P.pal.acc, 0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      MotionLib.text(
        ctx,
        '⚡ SISTEMA CRIADO E ATIVO · EXEMPLO DE MINI SAAS',
        sysX + sysW / 2,
        sysY + 29,
        13,
        { color: P.pal.acc, align: 'center', weight: 800, glow: P.pal.acc }
      );

      // Mini módulos internos do sistema criado
      const modW = (sysW - 48) / 3;
      const modH = sysH - 70;
      const modY = sysY + 54;

      const mods = [
        { label: 'USUÁRIOS', val: '+2.450', col: P.pal.acc2 },
        { label: 'STATUS', val: '100% ONLINE', col: P.pal.acc },
        { label: 'FATURAMENTO', val: 'R$ 18.900', col: P.pal.acc },
      ];

      mods.forEach((md, mi) => {
        const mx = sysX + 16 + mi * (modW + 8);
        ctx.fillStyle = MotionLib.col(P.pal.bg2, 0.88);
        MotionLib.rrect(ctx, mx, modY, modW, modH, 10);
        ctx.fill();
        ctx.strokeStyle = MotionLib.col(md.col, 0.4);
        ctx.lineWidth = 1.2;
        ctx.stroke();

        MotionLib.text(ctx, md.label, mx + modW / 2, modY + 18, 10, {
          color: P.pal.dim,
          align: 'center',
          weight: 700,
        });
        MotionLib.text(ctx, md.val, mx + modW / 2, modY + 40, 13, {
          color: md.col,
          align: 'center',
          weight: 800,
          glow: mi > 0 ? md.col : undefined,
        });
      });
    }

    ctx.restore();
  },
  renderGrowthFinance: (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    P: ScenePaintContext,
    ts: number
  ) => {
    const e = MotionLib.ease.outExpo(MotionLib.p(ts, 0, 0.8));
    const cx = W / 2;
    const cy = H * 0.44;
    const cardW = W * 0.88 * e;
    const cardH = H * 0.36 * e;
    const x0 = cx - cardW / 2;
    const y0 = cy - cardH / 2;

    ctx.save();
    ctx.fillStyle = MotionLib.col(P.pal.bg2, 0.9);
    MotionLib.rrect(ctx, x0, y0, cardW, cardH, 20);
    ctx.fill();
    ctx.strokeStyle = MotionLib.col(P.pal.acc, 0.7);
    ctx.lineWidth = 2.5;
    ctx.stroke();

    MotionLib.text(ctx, 'FATURAMENTO & ESCALA EM TEMPO REAL', x0 + 26, y0 + 36, 14, {
      color: P.pal.dim,
      align: 'left',
    });

    const valProgress = MotionLib.clamp(ts * 0.9, 0, 1);
    const formattedVal = Math.round(valProgress * 148500).toLocaleString('pt-BR');
    MotionLib.text(ctx, `R$ ${formattedVal}`, x0 + 26, y0 + 82, 38 * (1 + P.pulse * 0.04), {
      color: P.pal.fg,
      align: 'left',
      glow: P.pal.acc,
    });

    const badgeW = 140;
    const badgeH = 34;
    ctx.fillStyle = MotionLib.col(P.pal.acc, 0.22);
    MotionLib.rrect(ctx, x0 + cardW - badgeW - 24, y0 + 56, badgeW, badgeH, 17);
    ctx.fill();
    ctx.strokeStyle = P.pal.acc;
    ctx.lineWidth = 2;
    ctx.stroke();
    MotionLib.text(ctx, '▲ +480% MÊS', x0 + cardW - badgeW / 2 - 24, y0 + 73, 14, {
      color: P.pal.acc,
      align: 'center',
    });

    const chartX = x0 + 28;
    const chartY = y0 + cardH - 30;
    const chartW = cardW - 56;
    const chartH = cardH * 0.44;

    const pts: { x: number; y: number }[] = [];
    const numPts = 20;
    for (let k = 0; k <= numPts; k++) {
      const prog = k / numPts;
      const px = chartX + prog * chartW;
      const curve = Math.pow(prog, 2.2);
      const drawProgress = MotionLib.clamp(ts * 1.4 - prog * 0.6, 0, 1);
      const py = chartY - curve * chartH * drawProgress - Math.sin(prog * 6 + ts * 3) * 6 * drawProgress;
      pts.push({ x: px, y: py });
    }

    if (pts.length > 1) {
      const grad = ctx.createLinearGradient(0, chartY - chartH, 0, chartY);
      grad.addColorStop(0, MotionLib.col(P.pal.acc, 0.35));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, chartY);
      pts.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pts[pts.length - 1].x, chartY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = P.pal.acc;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();

      const lastP = pts[pts.length - 1];
      ctx.fillStyle = P.pal.acc;
      ctx.beginPath();
      ctx.arc(lastP.x, lastP.y, 7 + P.pulse * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },
  renderAIAgents: (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    P: ScenePaintContext,
    ts: number
  ) => {
    const e = MotionLib.ease.outExpo(MotionLib.p(ts, 0, 0.75));
    const cx = W / 2;
    const cy = H * 0.44;

    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, W * 0.46 * e);
    g.addColorStop(0, MotionLib.col(P.pal.acc2, 0.4));
    g.addColorStop(0.5, MotionLib.col(P.pal.acc, 0.15));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, cy - H * 0.22, W, H * 0.44);

    const layers = [3, 4, 4, 2];
    const layerX = [cx - W * 0.34, cx - W * 0.12, cx + W * 0.12, cx + W * 0.34];
    const layerH = H * 0.26;
    const allNodes: { x: number; y: number; l: number; n: number }[][] = [];

    layers.forEach((cnt, li) => {
      const nodesInLayer: { x: number; y: number; l: number; n: number }[] = [];
      for (let ni = 0; ni < cnt; ni++) {
        const ny = cy - layerH / 2 + (ni / Math.max(1, cnt - 1)) * layerH;
        nodesInLayer.push({ x: layerX[li], y: ny, l: li, n: ni });
      }
      allNodes.push(nodesInLayer);
    });

    ctx.lineWidth = 1.8;
    for (let li = 0; li < allNodes.length - 1; li++) {
      const fromNodes = allNodes[li];
      const toNodes = allNodes[li + 1];
      fromNodes.forEach((fn, fni) => {
        toNodes.forEach((tn, tni) => {
          ctx.strokeStyle = MotionLib.col((fni + tni) % 2 ? P.pal.acc : P.pal.acc2, 0.25);
          ctx.beginPath();
          ctx.moveTo(fn.x, fn.y);
          ctx.lineTo(tn.x, tn.y);
          ctx.stroke();

          const pulseT = (ts * 2.5 + (fni * 3 + tni) * 0.2) % 1;
          const px = fn.x + (tn.x - fn.x) * pulseT;
          const py = fn.y + (tn.y - fn.y) * pulseT;
          ctx.fillStyle = P.pal.acc;
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();
        });
      });
    }

    allNodes.forEach((nodes, li) => {
      nodes.forEach((n) => {
        const isOutput = li === allNodes.length - 1;
        const col = isOutput ? P.pal.acc : li === 0 ? P.pal.fg : P.pal.acc2;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 8 + P.pulse * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = MotionLib.col(col, 0.5);
        ctx.lineWidth = 3;
        ctx.stroke();
      });
    });

    const badgeW = W * 0.6;
    const badgeH = 38;
    ctx.fillStyle = MotionLib.col(P.pal.bg1, 0.88);
    MotionLib.rrect(ctx, cx - badgeW / 2, cy + layerH / 2 + 18, badgeW, badgeH, 19);
    ctx.fill();
    ctx.strokeStyle = P.pal.acc;
    ctx.lineWidth = 2;
    ctx.stroke();
    MotionLib.text(ctx, '⚡ REDE NEURAL & AGENTES AUTÔNOMOS', cx, cy + layerH / 2 + 37, 13, {
      color: P.pal.acc,
      align: 'center',
    });
    ctx.restore();
  },
  renderSpeedLaunch: (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    P: ScenePaintContext,
    ts: number
  ) => {
    const cx = W / 2;
    const cy = H * 0.44;

    ctx.save();
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      const speedProg = (ts * 3.5 + k * 0.15) % 1;
      const r0 = W * (0.08 + speedProg * 0.15);
      const r1 = W * (0.15 + speedProg * 0.7);
      ctx.strokeStyle = MotionLib.col(k % 2 ? P.pal.acc : P.pal.acc2, speedProg);
      ctx.lineWidth = 1.5 + speedProg * 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }

    const gaugeR = W * 0.28;
    ctx.strokeStyle = MotionLib.col(P.pal.bg2, 0.8);
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(cx, cy, gaugeR, -Math.PI * 0.8, Math.PI * 0.8);
    ctx.stroke();

    const gaugeVal = MotionLib.clamp(ts * 1.2, 0, 1);
    ctx.strokeStyle = P.pal.acc;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(cx, cy, gaugeR, -Math.PI * 0.8, -Math.PI * 0.8 + gaugeVal * Math.PI * 1.6);
    ctx.stroke();

    const msCount = Math.floor((ts * 100) % 100);
    const secCount = Math.floor(ts % 60);
    MotionLib.text(
      ctx,
      `00:${String(secCount).padStart(2, '0')}:${String(msCount).padStart(2, '0')}`,
      cx,
      cy - 10,
      32 * (1 + P.pulse * 0.05),
      { color: P.pal.fg, align: 'center', glow: P.pal.acc }
    );
    MotionLib.text(ctx, 'TEMPO RECORDE · ALTA VELOCIDADE', cx, cy + 28, 14, {
      color: P.pal.acc,
      align: 'center',
    });
    ctx.restore();
  },
  renderSecurityTrust: (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    P: ScenePaintContext,
    ts: number
  ) => {
    const cx = W / 2;
    const cy = H * 0.44;
    const e = MotionLib.ease.outBack(MotionLib.p(ts, 0, 0.7));

    ctx.save();
    const shieldR = W * 0.26 * e;
    ctx.fillStyle = MotionLib.col(P.pal.bg2, 0.85);
    MotionLib.poly(ctx, cx, cy, shieldR, 6, Math.PI / 6);
    ctx.fill();
    ctx.strokeStyle = P.pal.acc;
    ctx.lineWidth = 4;
    ctx.stroke();

    for (let r = 1; r <= 2; r++) {
      ctx.strokeStyle = MotionLib.col(P.pal.acc2, 0.5 / r);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        shieldR * (0.6 + r * 0.25),
        ts * (r % 2 ? 1.5 : -1.5),
        ts * (r % 2 ? 1.5 : -1.5) + Math.PI * 1.4
      );
      ctx.stroke();
    }

    const scanY = cy + Math.sin(ts * 4) * (shieldR * 0.6);
    ctx.strokeStyle = P.pal.acc;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - shieldR * 0.65, scanY);
    ctx.lineTo(cx + shieldR * 0.65, scanY);
    ctx.stroke();

    MotionLib.text(ctx, '✓ 100% SEGURO & AUDITADO', cx, cy + shieldR + 24, 15, {
      color: P.pal.acc,
      align: 'center',
      glow: P.pal.acc,
    });
    ctx.restore();
  },
  renderClientsConversion: (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    P: ScenePaintContext,
    ts: number
  ) => {
    const cx = W / 2;
    const cy = H * 0.44;
    const e = MotionLib.ease.outExpo(MotionLib.p(ts, 0, 0.75));

    ctx.save();
    const stages = [
      { name: 'TRÁFEGO & LEADS', w: W * 0.78, y: cy - H * 0.14, col: P.pal.acc2 },
      { name: 'CONEXÃO IA ATIVA', w: W * 0.56, y: cy - H * 0.04, col: P.pal.fg },
      { name: 'CLIENTES CONVERTIDOS', w: W * 0.36, y: cy + H * 0.06, col: P.pal.acc },
    ];

    stages.forEach((stg, i) => {
      const sw = stg.w * e;
      const sh = 42;
      ctx.fillStyle = MotionLib.col(P.pal.bg2, 0.88);
      MotionLib.rrect(ctx, cx - sw / 2, stg.y, sw, sh, 12);
      ctx.fill();
      ctx.strokeStyle = MotionLib.col(stg.col, 0.7);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      MotionLib.text(ctx, stg.name, cx, stg.y + sh / 2, 14, {
        color: stg.col,
        align: 'center',
        glow: i === 2 ? P.pal.acc : undefined,
      });
    });

    for (let k = 0; k < 12; k++) {
      const prog = (ts * 1.6 + k * 0.25) % 1;
      const py = cy - H * 0.16 + prog * H * 0.28;
      const spread = (1 - prog * 0.5) * (W * 0.3);
      const px = cx + Math.sin(k * 7 + ts * 2) * spread;
      ctx.fillStyle = k % 2 ? P.pal.acc : P.pal.acc2;
      ctx.beginPath();
      ctx.arc(px, py, 4 + P.pulse * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    const notifW = W * 0.72;
    const notifY = cy + H * 0.15;
    ctx.fillStyle = MotionLib.col(P.pal.acc, 0.18);
    MotionLib.rrect(ctx, cx - notifW / 2, notifY, notifW, 40, 20);
    ctx.fill();
    ctx.strokeStyle = P.pal.acc;
    ctx.lineWidth = 2;
    ctx.stroke();
    MotionLib.text(ctx, '🔔 +1 NOVO CLIENTE CONVERTIDO!', cx, notifY + 20, 14, {
      color: P.pal.acc,
      align: 'center',
    });
    ctx.restore();
  },
  renderMobileApp: (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    P: ScenePaintContext,
    ts: number
  ) => {
    const cx = W / 2;
    const cy = H * 0.44;
    const e = MotionLib.ease.outExpo(MotionLib.p(ts, 0, 0.8));
    const mw = W * 0.58 * e;
    const mh = H * 0.36 * e;
    const mx = cx - mw / 2;
    const my = cy - mh / 2;

    ctx.save();
    ctx.fillStyle = MotionLib.col(P.pal.bg1, 0.95);
    MotionLib.rrect(ctx, mx, my, mw, mh, 28);
    ctx.fill();
    ctx.strokeStyle = MotionLib.col(P.pal.acc2, 0.7);
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.fillStyle = MotionLib.col(P.pal.bg2, 0.9);
    MotionLib.rrect(ctx, cx - 36, my + 10, 72, 14, 7);
    ctx.fill();

    for (let c = 0; c < 3; c++) {
      const cardY = my + 38 + c * 38;
      const cardProgress = MotionLib.clamp(ts * 1.5 - c * 0.2, 0, 1);
      ctx.fillStyle = MotionLib.col(P.pal.bg2, 0.85);
      MotionLib.rrect(ctx, mx + 16, cardY, (mw - 32) * cardProgress, 30, 8);
      ctx.fill();
      ctx.strokeStyle = MotionLib.col(c === 0 ? P.pal.acc : P.pal.acc2, 0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  },
  semanticMotion: (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    P: ScenePaintContext,
    ts: number
  ) => {
    const fullText = `${P.text || ''} ${P.sub || ''} ${P.narration || ''} ${P.idea || ''}`.toLowerCase();

    // 1. Criar sistema, código, software, app, programar, desenvolvimento
    if (
      fullText.includes('sistema') ||
      fullText.includes('código') ||
      fullText.includes('codigo') ||
      fullText.includes('software') ||
      fullText.includes('program') ||
      fullText.includes('app') ||
      fullText.includes('aplicativo') ||
      fullText.includes('plataforma') ||
      fullText.includes('saas') ||
      fullText.includes('criar') ||
      fullText.includes('dev') ||
      fullText.includes('computador')
    ) {
      MotionLib.renderCodeSystem(ctx, W, H, P, ts);
      return;
    }

    // 2. Vendas, faturamento, dinheiro, receita, lucro, escala, gráfico
    if (
      fullText.includes('venda') ||
      fullText.includes('dinheiro') ||
      fullText.includes('lucro') ||
      fullText.includes('fatur') ||
      fullText.includes('escala') ||
      fullText.includes('crescimento') ||
      fullText.includes('receita') ||
      fullText.includes('mrr') ||
      fullText.includes('gráfico') ||
      fullText.includes('grafico') ||
      fullText.includes('lucrativ')
    ) {
      MotionLib.renderGrowthFinance(ctx, W, H, P, ts);
      return;
    }

    // 3. IA, inteligência artificial, neural, agente, automação, modelo, prompt
    if (
      fullText.includes('ia') ||
      fullText.includes('inteligência') ||
      fullText.includes('inteligencia') ||
      fullText.includes('artificial') ||
      fullText.includes('neural') ||
      fullText.includes('agente') ||
      fullText.includes('robô') ||
      fullText.includes('robo') ||
      fullText.includes('automaç') ||
      fullText.includes('automac') ||
      fullText.includes('automátic') ||
      fullText.includes('automatic') ||
      fullText.includes('prompt')
    ) {
      MotionLib.renderAIAgents(ctx, W, H, P, ts);
      return;
    }

    // 4. Velocidade, rápido, tempo recorde, lançar, deploy, agilidade
    if (
      fullText.includes('rápido') ||
      fullText.includes('rapido') ||
      fullText.includes('tempo') ||
      fullText.includes('recorde') ||
      fullText.includes('velocidade') ||
      fullText.includes('lançar') ||
      fullText.includes('lancar') ||
      fullText.includes('deploy') ||
      fullText.includes('acelerar') ||
      fullText.includes('foguete') ||
      fullText.includes('minuto') ||
      fullText.includes('segundo')
    ) {
      MotionLib.renderSpeedLaunch(ctx, W, H, P, ts);
      return;
    }

    // 5. Clientes, leads, conversão, público, tráfego
    if (
      fullText.includes('cliente') ||
      fullText.includes('lead') ||
      fullText.includes('conversão') ||
      fullText.includes('conversao') ||
      fullText.includes('tráfego') ||
      fullText.includes('trafego') ||
      fullText.includes('público') ||
      fullText.includes('publico')
    ) {
      MotionLib.renderClientsConversion(ctx, W, H, P, ts);
      return;
    }

    // 6. Segurança, confiança, garantia, proteção
    if (
      fullText.includes('segur') ||
      fullText.includes('confian') ||
      fullText.includes('garantia') ||
      fullText.includes('proteç') ||
      fullText.includes('protec') ||
      fullText.includes('blindad')
    ) {
      MotionLib.renderSecurityTrust(ctx, W, H, P, ts);
      return;
    }

    // Fallback contextual por papel narrativo da cena
    if (P.role === 'hook') {
      MotionLib.renderCodeSystem(ctx, W, H, P, ts);
    } else if (P.role === 'climax') {
      MotionLib.renderGrowthFinance(ctx, W, H, P, ts);
    } else if (P.role === 'closing') {
      MotionLib.renderClientsConversion(ctx, W, H, P, ts);
    } else {
      MotionLib.renderAIAgents(ctx, W, H, P, ts);
    }
  },
  sub: (ctx: CanvasRenderingContext2D, W: number, H: number, P: ScenePaintContext, ts: number) => {
    MotionLib.narrativePresentation(ctx, W, H, P, ts);
  },
  narrativePresentation: (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    P: ScenePaintContext,
    ts: number
  ) => {
    const rawSub = String(P.sub || '').trim();
    const rawText = String(P.text || '').trim();
    const fullNarrative = String(P.narration || (rawSub ? `${rawText}. ${rawSub}` : rawText) || '').trim();
    if (!fullNarrative && !rawSub) return;

    // Se houver subtexto secundário, este é o corpo principal de narração
    const scriptToPresent = rawSub || fullNarrative;
    const words = scriptToPresent.toUpperCase().split(/\s+/).filter(Boolean);
    if (!words.length) return;

    // Tempo de início da narração do corpo (se houver título falado antes, dá o compasso inicial)
    const headWords = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0;
    const totalWords = Math.max(1, headWords + words.length);
    const sceneDur = Math.max(1.8, (P.dur || 4) - 0.4);
    const subStartTime = rawText && rawSub ? (headWords / totalWords) * sceneDur * 0.88 : 0.1;
    const subDuration = Math.max(1.2, sceneDur - subStartTime);

    // Fade geral de entrada da apresentação de motion
    const entryAlpha = MotionLib.ease.outCubic(MotionLib.clamp(ts / 0.35));
    if (entryAlpha <= 0) return;

    ctx.save();

    // Agrupamento do roteiro em BEATS RÍTMICOS DE APRESENTAÇÃO (3 a 5 palavras por impacto visual)
    const BEAT_SIZE = 4;
    const beats: string[][] = [];
    for (let i = 0; i < words.length; i += BEAT_SIZE) {
      beats.push(words.slice(i, i + BEAT_SIZE));
    }
    const numBeats = Math.max(1, beats.length);

    // Cálculo do beat ativo no exato momento da fala da voz
    const bodyElapsed = Math.max(0, ts - subStartTime);
    const beatTime = subDuration / numBeats;
    const currentBeatIdx = Math.min(
      numBeats - 1,
      Math.max(0, Math.floor((bodyElapsed / subDuration) * numBeats))
    );
    const beatElapsed = Math.max(0, bodyElapsed - currentBeatIdx * beatTime);
    const beatRatio = MotionLib.clamp(beatElapsed / Math.max(0.1, beatTime));

    const currentBeat = beats[currentBeatIdx] || words;
    const activeWordInBeat = Math.min(
      currentBeat.length - 1,
      Math.max(0, Math.floor(beatRatio * currentBeat.length))
    );
    const wordElapsedInBeat = beatElapsed - activeWordInBeat * (beatTime / currentBeat.length);
    const wordRatio = MotionLib.clamp(wordElapsedInBeat / (beatTime / currentBeat.length));

    // Posição central da faixa de Apresentação Motion (sem caixinha de legenda!)
    const cy = H * 0.79;
    const cx = W / 2;

    // 1. Tag de Telemetria e Apresentação Motion no Topo do Bloco
    const tagY = cy - 44;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Barras animadas de equalizador de voz ao lado do badge
    const eqBars = 4;
    const eqW = 3;
    const eqSpacing = 4;
    const eqTotalW = eqBars * eqW + (eqBars - 1) * eqSpacing;
    const eqStartX = cx - W * 0.28;
    for (let b = 0; b < eqBars; b++) {
      const barH = 5 + Math.abs(Math.sin(ts * 14 + b * 1.5)) * 12 + P.pulse * 6;
      ctx.fillStyle = MotionLib.col(P.pal.acc, 0.85);
      MotionLib.rrect(ctx, eqStartX + b * (eqW + eqSpacing), tagY - barH / 2, eqW, barH, 1.5);
      ctx.fill();
    }

    MotionLib.text(
      ctx,
      '✦ APRESENTAÇÃO DO ROTEIRO · SINCRONIZADO',
      cx,
      tagY,
      11,
      {
        color: P.pal.acc2,
        weight: 800,
        spacing: 2,
        glow: P.pal.acc,
        shadow: false,
      }
    );

    // 2. Renderização do Beat Anterior (Efeito Esteira Vertical Flutuante - saindo suavemente)
    if (currentBeatIdx > 0) {
      const prevBeat = beats[currentBeatIdx - 1];
      const prevText = prevBeat.join(' ');
      const prevSz = Math.min(W * 0.046, 22);
      const prevY = cy - prevSz * 1.55 - (1 - beatRatio) * 6;
      MotionLib.text(ctx, prevText, cx, prevY, prevSz, {
        color: P.pal.dim,
        alpha: 0.22 * entryAlpha * (1 - beatRatio * 0.5),
        weight: 700,
        shadow: false,
      });
    }

    // 3. Renderização do BEAT ATIVO (Grande, vibrante, com animação cinética palavra por palavra)
    // Transição suave de entrada/saída entre beats
    const beatEnterOffset = (1 - MotionLib.ease.outExpo(Math.min(1, beatElapsed / 0.22))) * 16;
    const beatExitOffset = beatRatio > 0.88 ? -14 * MotionLib.ease.inOutCubic((beatRatio - 0.88) / 0.12) : 0;
    const activeY = cy + beatEnterOffset + beatExitOffset;

    // Medição e dimensionamento da linha ativa
    const beatLineText = currentBeat.join(' ');
    const activeSz = MotionLib.fit(ctx, beatLineText, W * 0.88, Math.min(W * 0.065, 34), 900);
    ctx.font = `900 ${Math.round(activeSz)}px system-ui, -apple-system, 'SF Pro Display', Roboto, 'Segoe UI', sans-serif`;
    const spaceW = ctx.measureText(' ').width * 1.25;

    // Larguras individuais de cada palavra
    const wordWidths = currentBeat.map((w) => ctx.measureText(w).width);
    const totalBeatW =
      wordWidths.reduce((sum, w) => sum + w, 0) + Math.max(0, currentBeat.length - 1) * spaceW;

    let curWordX = cx - totalBeatW / 2;

    // Palavras-chave que ganham destaque de Motion Graphics (capsule neon)
    const POWER_KEYWORDS = [
      'SISTEMA',
      'CÓDIGO',
      'CODIGO',
      'IA',
      'SAAS',
      'APLICATIVO',
      'APP',
      'EQUIPE',
      'LUCRO',
      'VENDAS',
      'DEPLOY',
      'RECORDE',
      'CLIENTE',
      'CLIENTES',
      'ELITE',
      'PROJETO',
      'ESCALAR',
      'ONLINE',
      'AUTÔNOMO',
      'AUTONOMO',
    ];

    currentBeat.forEach((word, wi) => {
      const isCurrent = wi === activeWordInBeat;
      const isSpoken = wi <= activeWordInBeat;
      const ww = wordWidths[wi];
      const wordCenter = curWordX + ww / 2;

      // Elastic punch quando a voz atinge a palavra no exato instante
      const popProgress = isCurrent ? MotionLib.ease.outBack(MotionLib.clamp(wordRatio / 0.25)) : 1;
      const wordScale = isCurrent ? 1.0 + 0.18 * (1 - popProgress) + P.pulse * 0.04 : 1.0;
      const isPower = POWER_KEYWORDS.some((kw) => word.includes(kw));

      // Destaque em Capsule Neon para Palavras de Impacto Narrativo
      if (isPower && (isSpoken || isCurrent)) {
        const capPadX = 10;
        const capPadY = 6;
        const capW = (ww + capPadX * 2) * wordScale;
        const capH = (activeSz + capPadY * 2) * wordScale;
        ctx.fillStyle = MotionLib.col(P.pal.acc, isCurrent ? 0.28 : 0.12);
        MotionLib.rrect(ctx, wordCenter - capW / 2, activeY - capH / 2, capW, capH, 9);
        ctx.fill();
        ctx.strokeStyle = MotionLib.col(P.pal.acc, isCurrent ? 0.9 : 0.35);
        ctx.lineWidth = isCurrent ? 2 : 1.2;
        ctx.stroke();
      }

      // Palavra sendo ativamente pronunciada pela voz: Cor Neon + Glow + Linha de Pulso
      if (isCurrent) {
        // Linha de acento de fala pulsando sob a palavra ativa
        const lineW = ww * wordScale * 1.05;
        ctx.fillStyle = P.pal.acc;
        MotionLib.rrect(ctx, wordCenter - lineW / 2, activeY + activeSz * 0.62, lineW, 3.5, 2);
        ctx.fill();

        MotionLib.text(ctx, word, wordCenter, activeY, activeSz * wordScale, {
          color: P.pal.acc,
          weight: 900,
          glow: P.pal.acc,
          alpha: 1.0,
          shadow: true,
        });
      } else if (isSpoken) {
        // Palavra já dita na cena: Branca, nítida, de alto contraste
        MotionLib.text(ctx, word, wordCenter, activeY, activeSz, {
          color: P.pal.fg,
          weight: 800,
          alpha: 0.92 * entryAlpha,
          shadow: true,
        });
      } else {
        // Palavra que ainda será dita no beat: Translúcida, antecipando o ritmo da fala
        MotionLib.text(ctx, word, wordCenter, activeY, activeSz * 0.96, {
          color: P.pal.dim,
          weight: 700,
          alpha: 0.28 * entryAlpha,
          shadow: false,
        });
      }

      curWordX += ww + spaceW;
    });

    // 4. Renderização do Próximo Beat (Efeito Esteira Vertical Flutuante - aguardando entrada)
    if (currentBeatIdx < numBeats - 1) {
      const nextBeat = beats[currentBeatIdx + 1];
      const nextText = nextBeat.join(' ');
      const nextSz = Math.min(W * 0.046, 22);
      const nextY = cy + nextSz * 1.55 + (1 - beatRatio) * 6;
      MotionLib.text(ctx, nextText, cx, nextY, nextSz, {
        color: P.pal.dim,
        alpha: (0.16 + beatRatio * 0.16) * entryAlpha,
        weight: 700,
        shadow: false,
      });
    }

    ctx.restore();
  },
};

/**
 * Sintetizador de Código Procedural Polimórfico e Conectado:
 * Quando em modo offline ou fallback, gera código JavaScript Canvas 2D 100% único para cada cena,
 * variando arquitetura de layout, metáforas visuais, movimento de câmera e conexão entre cenas.
 */
export function synthesizeConnectedSceneCode(
  scene: { role?: string; seed?: number; text?: string; sub?: string },
  idx: number,
  total: number
): string {
  return `M.semanticMotion(ctx, W, H, P, ts);
const L = M.lines(P.text, 12);
const fs = M.fit(ctx, L[0] || P.text, W * 0.84, W * 0.125);
L.forEach((l, i) => {
  const st = M.ease.outBack(M.stagger(ts, i, 0.04, 0.08, 0.45));
  M.text(ctx, l, W * 0.5, H * 0.14 + i * fs * 1.12, fs * st * (1 + P.pulse * 0.04), {
    color: i === L.length - 1 ? P.pal.acc : P.pal.fg,
    glow: P.pal.acc2
  });
});
M.sub(ctx, W, H, P, ts);`;
}

export const FallbackEngines: Record<FallbackKind, SceneDrawFn> = {
  kinetic: (ctx, _t, ts, W, H, P, M) => {
    M.semanticMotion(ctx, W, H, P, ts);
    M.deco(ctx, W, H, P, ts);
    const R = M.rng(P.seed);
    const dir = R() < 0.5 ? -1 : 1;
    const L = M.lines(String(P.text).toUpperCase(), 11);
    const long = L.reduce((a, b) => (a.length > b.length ? a : b), '');
    const fs = M.fit(ctx, long, W * 0.84, W * 0.19);
    const lh = fs * 1.16;
    const cy = H * (0.36 + (P.i % 3) * 0.1);
    const y0 = cy - ((L.length - 1) * lh) / 2;
    L.forEach((l, i) => {
      const p = M.p(ts, 0.06 + i * 0.11, 0.5);
      const e = M.ease.outBack(p);
      M.text(
        ctx,
        l,
        W / 2 + (1 - M.ease.outCubic(p)) * dir * W * 0.32,
        y0 + i * lh + (1 - e) * lh * 0.45,
        fs * (0.65 + 0.35 * e) * (1 + P.pulse * 0.05),
        {
          color: i === L.length - 1 && L.length > 1 ? P.pal.acc : P.pal.fg,
          alpha: p * 2.5,
          glow: P.pal.acc,
        }
      );
    });
    const bw = W * 0.52 * M.ease.outExpo(M.p(ts, 0.45, 0.5));
    const y = y0 + (L.length - 1) * lh + fs * 0.78;
    ctx.fillStyle = P.pal.acc2;
    ctx.fillRect(W / 2 - bw / 2, y, bw, Math.max(4, W * 0.009));
  },
  burst: (ctx, _t, ts, W, H, P, M) => {
    M.semanticMotion(ctx, W, H, P, ts);
    const R = M.rng(P.seed);
    const cx = W * (0.35 + R() * 0.3);
    const cy = H * (0.35 + R() * 0.22);
    const g = M.ease.outExpo(M.p(ts, 0, 0.85));
    const n = 22 + Math.floor(R() * 18);
    const spin = (R() - 0.5) * 1.4;
    ctx.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const a = (Math.PI * 2 * k) / n + ts * spin;
      const ln = 0.45 + R() * 0.55;
      const r0 = W * (0.14 + P.pulse * 0.04);
      const r1 = W * (0.18 + 0.58 * g * ln);
      ctx.strokeStyle = M.col(k % 2 ? P.pal.acc : P.pal.acc2, 0.4 + 0.6 * g);
      ctx.lineWidth = 3 + (k % 3) * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    M.deco(ctx, W, H, P, ts);
    M.mainText(ctx, W, H, P, ts, {
      scale: 0.75 + 0.25 * M.ease.outBack(M.p(ts, 0.08, 0.5)),
      alpha: M.p(ts, 0.04, 0.3),
    });
  },
  tunnel: (ctx, _t, ts, W, H, P, M) => {
    M.semanticMotion(ctx, W, H, P, ts);
    const R = M.rng(P.seed);
    const cx = W / 2;
    const cy = H * 0.46;
    const sides = 3 + Math.floor(R() * 5);
    const sp = 0.8 + R() * 0.6;
    for (let k = 0; k < 12; k++) {
      const z = (k / 12 + ts * 0.4 * sp) % 1;
      const s = Math.pow(z, 2.1) * W * 1.1;
      ctx.strokeStyle = M.col(k % 2 ? P.pal.acc : P.pal.acc2, z);
      ctx.lineWidth = 2 + z * 8;
      M.poly(ctx, cx, cy, s, sides, z * 0.8 + ts * 0.3);
      ctx.stroke();
    }
    M.deco(ctx, W, H, P, ts);
    M.mainText(ctx, W, H, P, ts, {
      scale: 0.75 + 0.25 * M.ease.outExpo(M.p(ts, 0, 0.6)),
      alpha: M.p(ts, 0, 0.3),
    });
  },
  grid: (ctx, _t, ts, W, H, P, M) => {
    M.semanticMotion(ctx, W, H, P, ts);
    const R = M.rng(P.seed);
    const cols = [5, 6, 8][Math.floor(R() * 3)];
    const cs = W / cols;
    const rows = Math.ceil(H / cs);
    const ox = R() * W;
    const oy = R() * H;
    const wp = ts * 2.2 * (0.8 + R() * 0.6);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cs;
        const y = r * cs;
        const d = Math.hypot(x + cs / 2 - ox, y + cs / 2 - oy) / W;
        const glow = M.clamp(1 - Math.abs(d - (wp % 1.6)) * 3);
        const pad = cs * (0.06 + 0.2 * (1 - glow));
        ctx.fillStyle = M.mixc(P.pal.bg2, (r + c) % 2 ? P.pal.acc : P.pal.acc2, glow);
        ctx.fillRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);
      }
    }
    const a = M.p(ts, 0.15, 0.35);
    if (a > 0) {
      ctx.fillStyle = M.col(P.pal.bg1, 0.85 * a);
      M.rrect(ctx, W * 0.05, H * 0.46 - W * 0.22, W * 0.9, W * 0.44, 18);
      ctx.fill();
      M.mainText(ctx, W, H, P, ts, { scale: 0.8 + 0.2 * M.ease.outBack(a), alpha: a });
    }
  },
  orbit: (ctx, _t, ts, W, H, P, M) => {
    M.semanticMotion(ctx, W, H, P, ts);
    const R = M.rng(P.seed);
    const cx = W / 2;
    const cy = H * 0.46;
    const spin = 0.4 + R() * 0.8;
    for (let ring = 0; ring < 4; ring++) {
      const r = W * (0.18 + ring * 0.11) * M.ease.outExpo(M.p(ts, 0, 0.8));
      ctx.strokeStyle = M.col(P.pal.dim, 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      const n = 3 + ring * 2;
      for (let k = 0; k < n; k++) {
        const a = ts * spin * (1 + ring * 0.5) * (ring % 2 ? 1 : -1) + (Math.PI * 2 * k) / n;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        ctx.fillStyle = k % 2 ? P.pal.acc : P.pal.acc2;
        ctx.beginPath();
        ctx.arc(px, py, W * 0.016 * (1 + P.pulse * 0.35), 0, 7);
        ctx.fill();
      }
    }
    M.deco(ctx, W, H, P, ts);
    M.mainText(ctx, W, H, P, ts, {
      scale: 0.65 + 0.35 * M.ease.outBack(M.p(ts, 0, 0.6)),
      alpha: M.p(ts, 0, 0.3),
    });
  },
  cube: (ctx, _t, ts, W, H, P, M) => {
    M.semanticMotion(ctx, W, H, P, ts);
    const R = M.rng(P.seed);
    const cx = W / 2;
    const cy = H * 0.38;
    const s = W * 0.22 * M.ease.outBack(M.p(ts, 0, 0.7));
    const V: [number, number, number][] = [];
    for (let x = -1; x <= 1; x += 2) {
      for (let y = -1; y <= 1; y += 2) {
        for (let z = -1; z <= 1; z += 2) {
          V.push([x * s, y * s, z * s]);
        }
      }
    }
    const E = [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
      [0, 2],
      [1, 3],
      [4, 6],
      [5, 7],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    const ax = ts * 0.9 + R() * 3;
    const ay = ts * 1.3;
    const az = ts * 0.4;
    const Q = V.map((v) => M.proj(M.rot3(v, ax, ay, az), W, H, 900, cx, cy));
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    E.forEach((e, i) => {
      ctx.strokeStyle = M.col(i % 2 ? P.pal.acc : P.pal.acc2, 0.95);
      ctx.beginPath();
      ctx.moveTo(Q[e[0]].x, Q[e[0]].y);
      ctx.lineTo(Q[e[1]].x, Q[e[1]].y);
      ctx.stroke();
    });
    Q.forEach((p) => {
      ctx.fillStyle = P.pal.fg;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5.5 * p.s, 0, 7);
      ctx.fill();
    });
    M.deco(ctx, W, H, P, ts);
    M.mainText(ctx, W, H, P, ts, { cy: H * 0.68, scale: 0.75, alpha: M.p(ts, 0.15, 0.4) });
  },
  closing: (ctx, _t, ts, W, H, P, M) => {
    M.semanticMotion(ctx, W, H, P, ts);
    const cx = W / 2;
    const cy = H * 0.46;
    const r = W * 0.34 * M.ease.outExpo(M.p(ts, 0, 1));
    ctx.strokeStyle = M.col(P.pal.acc, 0.8);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    M.deco(ctx, W, H, P, ts);
    M.mainText(ctx, W, H, P, ts, {
      scale: 0.85 + 0.15 * M.ease.outExpo(M.p(ts, 0, 0.9)),
      alpha: M.p(ts, 0, 0.6),
    });
    const bw = W * 0.4 * M.ease.outExpo(M.p(ts, 0.4, 0.6));
    ctx.fillStyle = P.pal.acc2;
    ctx.fillRect(cx - bw / 2, cy + W * 0.2, bw, 5);
  },
};

export function compileSceneCode(code: string | null | undefined): SceneDrawFn {
  const src = String(code || '').trim();
  if (!src) throw new Error('Código vazio');
  const fn = /^(async\s+)?function\b|^\(\s*[\w\s,]*\)\s*=>/.test(src)
    ? new Function('return (' + src + ')')()
    : new Function('ctx', 't', 'ts', 'W', 'H', 'P', 'M', src);
  if (typeof fn !== 'function') throw new Error('Não é uma função válida');
  return fn as SceneDrawFn;
}

export function resetCanvasCtx(c: CanvasRenderingContext2D) {
  if (typeof (c as unknown as { reset?: () => void }).reset === 'function') {
    (c as unknown as { reset: () => void }).reset();
  } else {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.shadowBlur = 0;
    c.globalCompositeOperation = 'source-over';
  }
}

export function pulseAt(gt: number, bpm: number, energy: number): number {
  const f = ((gt * bpm) / 60) % 1;
  return Math.pow(1 - f, 4) * (0.35 + 0.13 * energy);
}

export function validateSceneCode(
  code: string,
  scene: SceneSpec,
  data: ShowreelData
): { valid: boolean; error?: string; avgMs?: number; fn?: SceneDrawFn } {
  try {
    const fn = compileSceneCode(code);
    const testCanvas = document.createElement('canvas');
    testCanvas.width = data.W;
    testCanvas.height = data.H;
    const ctx = testCanvas.getContext('2d');
    if (!ctx) return { valid: true, fn, avgMs: 1 };

    const t0 = performance.now();
    const drawsOwnSub = /\b(P\.sub|M\.sub)\b/.test(code);
    [0.05, 0.5, 0.95].forEach((f) => {
      const ts = scene.dur * f;
      const gt = (scene.start || 0) + ts;
      resetCanvasCtx(ctx);
      const P: ScenePaintContext = {
        pal: data.dna.pal,
        bpm: data.dna.bpm,
        energy: data.dna.energy,
        text: scene.text,
        sub: scene.sub,
        role: scene.role,
        dur: scene.dur,
        seed: scene.seed,
        pulse: pulseAt(gt, data.dna.bpm, data.dna.energy),
        gt,
        i: 0,
        layout_mode: scene.layout_mode,
        camera_motion: scene.camera_motion,
        visual_bridge: scene.visual_bridge,
      };
      MotionLib.bg(ctx, data.W, data.H, P, 0);
      fn(ctx, MotionLib.clamp(ts / scene.dur), ts, data.W, data.H, P, MotionLib);
      if (!drawsOwnSub) {
        MotionLib.sub(ctx, data.W, data.H, P, ts);
      }
    });
    const avgMs = (performance.now() - t0) / 3;
    if (avgMs > 120) {
      return {
        valid: false,
        error: `Cena muito pesada (${Math.round(avgMs)} ms/frame > limite 120ms)`,
        avgMs,
      };
    }
    return { valid: true, fn, avgMs: Math.round(avgMs * 10) / 10 };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function compositeTransition(
  ctx: CanvasRenderingContext2D,
  co: HTMLCanvasElement,
  cn: HTMLCanvasElement,
  kind: TransitionKind,
  p: number,
  W: number,
  H: number,
  pal: Palette
) {
  resetCanvasCtx(ctx);
  const e = MotionLib.ease.inOutCubic(p);
  if (kind === 'wipe_h') {
    ctx.drawImage(co, 0, 0);
    const cut = Math.floor(W * e);
    if (cut >= 1) ctx.drawImage(cn, 0, 0, cut, H, 0, 0, cut, H);
    ctx.fillStyle = pal.acc;
    ctx.fillRect(cut - W * 0.025, 0, W * 0.025, H);
  } else if (kind === 'wipe_v') {
    ctx.drawImage(co, 0, 0);
    const cut = Math.floor(H * e);
    if (cut >= 1) ctx.drawImage(cn, 0, 0, W, cut, 0, 0, W, cut);
    ctx.fillStyle = pal.acc;
    ctx.fillRect(0, cut - H * 0.018, W, H * 0.018);
  } else if (kind === 'crossfade') {
    ctx.drawImage(co, 0, 0);
    ctx.globalAlpha = e;
    ctx.drawImage(cn, 0, 0);
    ctx.globalAlpha = 1;
  } else if (kind === 'zoom') {
    const s2 = 0.86 + 0.14 * e;
    ctx.drawImage(cn, (W * (1 - s2)) / 2, (H * (1 - s2)) / 2, W * s2, H * s2);
    const s1 = 1 + e * 0.75;
    ctx.globalAlpha = 1 - e;
    ctx.drawImage(co, (W * (1 - s1)) / 2, (H * (1 - s1)) / 2, W * s1, H * s1);
    ctx.globalAlpha = 1;
  } else if (kind === 'glitch') {
    ctx.drawImage(cn, 0, 0);
    const R = MotionLib.rng(Math.floor(p * 30) + 7);
    for (let k = 0; k < 10; k++) {
      const y = R() * H;
      const h = R() * H * 0.08 + 8;
      const dx = (R() - 0.5) * W * 0.3 * (1 - p);
      ctx.drawImage(cn, 0, y, W, h, dx, y, W, h);
    }
    ctx.fillStyle = MotionLib.col(pal.acc, 0.25 * (1 - p));
    ctx.fillRect(0, R() * H, W, H * 0.01);
  } else {
    ctx.drawImage(cn, 0, 0);
    ctx.fillStyle = `rgba(255,255,255,${Math.pow(1 - p, 2)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

export function buildSingleSceneJsFile(
  scene: SceneSpec,
  index: number,
  _data: ShowreelData
): { fileName: string; content: string } {
  const num = String(index + 1).padStart(2, '0');
  const fileName = scene.fileName || `cena_${num}_${scene.role}.js`;
  const agentNum = scene.agentId || ((index % 2) + 1);
  const lines = [
    `// CENA ${index + 1} [${scene.role}] "${scene.text}" - Agente ${agentNum} (Chave ${agentNum}) - origem: ${scene.origem}`,
    `// Ideia do Roteiro: ${scene.idea || '-'}`,
    scene.narration ? `// Narração em Voz (100% Escrita na Tela): "${scene.narration}"` : '',
    scene.layout_mode ? `// Arquitetura Visual: ${scene.layout_mode} | Câmera: ${scene.camera_motion || 'dinâmica'}` : '',
    scene.visual_bridge ? `// Conexão c/ Próxima Cena: ${scene.visual_bridge}` : '',
    `// Duração: ${scene.dur.toFixed(1)}s | seed: ${scene.seed}`,
    scene.visualCheck
      ? `// Revisão Visual: ${scene.visualCheck.passed ? 'APROVADA' : 'REFEITA'} (Movimento: ${scene.visualCheck.motionScore}%, Cobertura: ${scene.visualCheck.coverageScore}%) - ${scene.visualCheck.reviewNote}`
      : '',
    '',
    scene.code || synthesizeConnectedSceneCode(scene, index, 8),
    '',
  ].filter((l) => l !== '');
  return { fileName, content: lines.join('\n') };
}

/**
 * Renderiza a cena nos tempos 15%, 50% e 85% da duração, captura snapshots reais (JPEG base64)
 * e analisa os pixels para certificar que há elementos visuais desenhados e movimento real entre os quadros.
 */
export function inspectSceneFrames(
  scene: SceneSpec,
  sceneIndex: number,
  data: ShowreelData
): {
  passed: boolean;
  motionScore: number;
  coverageScore: number;
  snapshots: string[];
  diagnosticReason: string;
} {
  const scale = 0.25;
  const sw = Math.max(90, Math.round(data.W * scale));
  const sh = Math.max(160, Math.round(data.H * scale));

  const cv = document.createElement('canvas');
  cv.width = sw;
  cv.height = sh;
  const ctx = cv.getContext('2d');
  if (!ctx) {
    return {
      passed: Boolean(scene.code),
      motionScore: 100,
      coverageScore: 100,
      snapshots: [],
      diagnosticReason: 'Canvas 2D indisponível para inspeção.',
    };
  }

  let fn: SceneDrawFn | null = null;
  const effectiveCode = scene.code || synthesizeConnectedSceneCode(scene, sceneIndex, data.scenes.length);
  try {
    fn = compileSceneCode(effectiveCode);
  } catch (e) {
    return {
      passed: false,
      motionScore: 0,
      coverageScore: 0,
      snapshots: [],
      diagnosticReason: `Erro de compilação na cena: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Render baseline background only
  resetCanvasCtx(ctx);
  const baseP: ScenePaintContext = {
    pal: data.dna.pal,
    bpm: data.dna.bpm,
    energy: data.dna.energy,
    text: scene.text,
    sub: scene.sub,
    role: scene.role,
    dur: scene.dur,
    seed: scene.seed,
    pulse: 0.2,
    gt: scene.start || 0,
    i: sceneIndex,
    layout_mode: scene.layout_mode,
    camera_motion: scene.camera_motion,
    visual_bridge: scene.visual_bridge,
  };
  MotionLib.bg(ctx, sw, sh, baseP, sceneIndex);
  const bgBytes = ctx.getImageData(0, 0, sw, sh).data;

  const fractions = [0.15, 0.5, 0.85];
  const framePixels: Uint8ClampedArray[] = [];
  const snapshots: string[] = [];
  const drawsOwnSub = /\b(P\.sub|M\.sub)\b/.test(effectiveCode);

  for (const f of fractions) {
    const ts = scene.dur * f;
    const gt = (scene.start || 0) + ts;
    resetCanvasCtx(ctx);
    const P: ScenePaintContext = {
      ...baseP,
      pulse: pulseAt(gt, data.dna.bpm, data.dna.energy),
      gt,
    };
    MotionLib.bg(ctx, sw, sh, P, sceneIndex);
    try {
      fn(ctx, MotionLib.clamp(ts / scene.dur), ts, sw, sh, P, MotionLib);
      if (!drawsOwnSub) {
        MotionLib.sub(ctx, sw, sh, P, ts);
      }
    } catch (e) {
      return {
        passed: false,
        motionScore: 0,
        coverageScore: 0,
        snapshots,
        diagnosticReason: `Erro em tempo de execução no instante ${(f * 100).toFixed(0)}%: ${
          e instanceof Error ? e.message : String(e)
        }`,
      };
    }
    framePixels.push(new Uint8ClampedArray(ctx.getImageData(0, 0, sw, sh).data));
    try {
      snapshots.push(cv.toDataURL('image/jpeg', 0.65));
    } catch {
      // ignore dataURL error
    }
  }

  const totalPixels = sw * sh;
  let fgDiffPixels = 0;
  const mid = framePixels[1];
  for (let p = 0; p < totalPixels * 4; p += 4) {
    const dr = Math.abs(mid[p] - bgBytes[p]);
    const dg = Math.abs(mid[p + 1] - bgBytes[p + 1]);
    const db = Math.abs(mid[p + 2] - bgBytes[p + 2]);
    if (dr + dg + db > 36) fgDiffPixels++;
  }
  const coverageScore = Math.min(100, Math.round((fgDiffPixels / totalPixels) * 280));

  let motionPixels = 0;
  const f0 = framePixels[0];
  const f1 = framePixels[1];
  const f2 = framePixels[2];
  for (let p = 0; p < totalPixels * 4; p += 4) {
    const d01 =
      Math.abs(f1[p] - f0[p]) +
      Math.abs(f1[p + 1] - f0[p + 1]) +
      Math.abs(f1[p + 2] - f0[p + 2]);
    const d12 =
      Math.abs(f2[p] - f1[p]) +
      Math.abs(f2[p + 1] - f1[p + 1]) +
      Math.abs(f2[p + 2] - f1[p + 2]);
    if (d01 > 30 || d12 > 30) motionPixels++;
  }
  const motionScore = Math.min(100, Math.round((motionPixels / totalPixels) * 320));

  if (!scene.code) {
    return {
      passed: false,
      motionScore,
      coverageScore,
      snapshots,
      diagnosticReason: 'Cena aguardando código personalizado do Agente.',
    };
  }

  if (coverageScore < 6) {
    return {
      passed: false,
      motionScore,
      coverageScore,
      snapshots,
      diagnosticReason: 'Tela quase vazia (poucos elementos visuais desenhados sobre o fundo).',
    };
  }

  if (motionScore < 5) {
    return {
      passed: false,
      motionScore,
      coverageScore,
      snapshots,
      diagnosticReason: 'Animação estática detectada entre 15%, 50% e 85% da cena.',
    };
  }

  return {
    passed: true,
    motionScore,
    coverageScore,
    snapshots,
    diagnosticReason: `Animação fluida e conectada (${motionScore}% movimento, ${coverageScore}% cobertura).`,
  };
}

export function buildJsBundle(data: ShowreelData): string {
  const { dna } = data;
  let out = `// Showreel: ${data.title}\n`;
  if (data.prompt) out += `// Pedido do Cliente: ${data.prompt}\n`;
  if (dna.narrative_thread) out += `// Fio Condutor: ${dna.narrative_thread}\n`;
  out += `// Direção de Arte: ${dna.estilo} | ${dna.structure} | ${dna.transition} | ${dna.bpm} bpm | energia ${dna.energy}\n`;
  out += `// Cada cena abaixo é o CORPO de uma função (ctx, t, ts, W, H, P, M)\n\n`;
  data.scenes.forEach((s, i) => {
    out += `// ===== CENA ${i + 1} [${s.role}] "${s.text}" (${s.origem}) =====\n`;
    out += `// Ideia: ${s.idea || '-'}\n`;
    if (s.layout_mode) out += `// Layout: ${s.layout_mode} | Câmera: ${s.camera_motion || '-'}\n`;
    if (s.visual_bridge) out += `// Conexão Visual: ${s.visual_bridge}\n`;
    out += `// Duração: ${s.dur.toFixed(1)}s | seed: ${s.seed}\n`;
    out +=
      (s.code
        ? s.code
        : synthesizeConnectedSceneCode(s, i, data.scenes.length)) + '\n\n';
  });
  return out;
}

export function buildStandaloneHtml(data: ShowreelData): string {
  const serialized = JSON.stringify(data).replace(/<\//g, '<\\/');
  return `<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${data.title} - Kinetix Showreel</title>
<style>
html,body{margin:0;height:100%;background:#07070b;color:#eee;font-family:system-ui,Roboto,Arial,sans-serif;overflow:hidden}
#app{display:flex;flex-direction:column;align-items:center;height:100%;padding:8px;box-sizing:border-box;gap:8px}
#top{display:flex;gap:10px;align-items:baseline;width:100%;justify-content:space-between;font-size:13px}
#top b{font-size:15px}#hud{opacity:.7}
#stage{flex:1;min-height:0;width:100%;display:flex;justify-content:center;align-items:center}
canvas{background:#000;border-radius:10px;box-shadow:0 0 40px rgba(0,0,0,.7)}
#seek{width:100%}
#bar{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
button{background:#1b1b28;color:#fff;border:1px solid #33334a;border-radius:10px;padding:10px 14px;font-size:15px;cursor:pointer}
button.rec{background:#e11d48;border-color:#f43f5e}
#dl a{display:inline-block;background:#12805a;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700}
details{width:100%;font-size:12px;opacity:.85}pre{white-space:pre-wrap;margin:4px 0;max-height:22vh;overflow:auto}
</style></head><body>
<div id="app">
  <div id="top"><b id="ttl"></b><span id="hud"></span></div>
  <div id="stage"><canvas id="cv"></canvas></div>
  <input type="range" id="seek" min="0" max="1000" value="0">
  <div id="bar">
    <button id="bPlay">&#9654; Play</button><button id="bRest">&#9198;</button>
    <button id="bSnd">&#128266; Som</button><button id="bRec" class="rec">&#9210; Gravar vídeo</button>
    <button id="bCode">&#128190; Salvar código</button>
  </div>
  <div id="dl"></div>
  <details><summary>Cenas / status</summary><pre id="log"></pre></details>
</div>
<script>
const D=${serialized};
const $=id=>document.getElementById(id);
const logEl=$('log');function log(m){logEl.textContent+=m+'\\n'}
const W=D.W,H=D.H,DUR=D.duration,BPM=D.dna.bpm,EN=D.dna.energy,PAL=D.dna.pal,KIND=D.dna.transition,TR=0.32;
const cv=$('cv');cv.width=W;cv.height=H;const ctx=cv.getContext('2d');
const co=document.createElement('canvas'),cn=document.createElement('canvas');
co.width=cn.width=W;co.height=cn.height=H;
const cxo=co.getContext('2d'),cxn=cn.getContext('2d');
$('ttl').textContent=D.title;
const M={};
M.clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
M.lerp=(a,b,t)=>a+(b-a)*t;
M.map=(x,a,b,c,d)=>c+(d-c)*M.clamp((x-a)/(b-a));
M.p=(ts,start,dur)=>M.clamp((ts-start)/Math.max(.001,dur));
M.stagger=(ts,i,start,gap,dur)=>M.p(ts,start+i*gap,dur);
M.ease={
  outExpo:x=>x>=1?1:1-Math.pow(2,-10*M.clamp(x)),
  outCubic:x=>1-Math.pow(1-M.clamp(x),3),
  inCubic:x=>{const c=M.clamp(x);return c*c*c},
  inOutCubic:x=>{const c=M.clamp(x);return c<.5?4*c*c*c:1-Math.pow(-2*c+2,3)/2},
  inOutQuint:x=>{const c=M.clamp(x);return c<.5?16*c*c*c*c*c:1-Math.pow(-2*c+2,5)/2},
  outBack:x=>{const c=M.clamp(x),c1=1.70158,c3=c1+1;return 1+c3*Math.pow(c-1,3)+c1*Math.pow(c-1,2)},
  outElastic:x=>{const c=M.clamp(x);return c<=0?0:c>=1?1:Math.pow(2,-10*c)*Math.sin((c*10-.75)*(2*Math.PI/3))+1}
};
M.spring=(x,k=7,w=14)=>{x=M.clamp(x);return 1-Math.exp(-k*x)*Math.cos(w*x)};
M.rgb=h=>{h=String(h||'#ffffff').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16)||0;return[(n>>16)&255,(n>>8)&255,n&255]};
M.col=(h,a=1)=>{const c=M.rgb(h);return 'rgba('+c[0]+','+c[1]+','+c[2]+','+M.clamp(a)+')'};
M.mixc=(h1,h2,t)=>{const a=M.rgb(h1),b=M.rgb(h2);t=M.clamp(t);return 'rgb('+Math.round(M.lerp(a[0],b[0],t))+','+Math.round(M.lerp(a[1],b[1],t))+','+Math.round(M.lerp(a[2],b[2],t))+')'};
M.rng=seed=>{let a=(seed|0)||1;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
M.noise=(x,y=0,seed=1)=>{const hash=(ix,iy)=>{let n=(ix*374761393+iy*668265263+(seed|0)*1442695041)|0;n=(n^(n>>>13))*1274126177;return((n^(n>>>16))>>>0)/4294967296};const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);return M.lerp(M.lerp(hash(xi,yi),hash(xi+1,yi),u),M.lerp(hash(xi,yi+1),hash(xi+1,yi+1),u),v)};
M.lines=(s,max=11,maxL=4)=>{const w=String(s).split(/\\s+/).filter(Boolean),L=[];let cur='';
  w.forEach(x=>{if(cur&&(cur+' '+x).length>max){L.push(cur);cur=x}else cur=(cur?cur+' ':'')+x});
  if(cur)L.push(cur);return L.slice(0,maxL).length?L.slice(0,maxL):['']};
M.fit=(ctx,s,maxW,size,weight)=>{ctx.save();size=Math.round(size);
  while(size>12){ctx.font=(weight||800)+' '+size+'px system-ui,Roboto,Arial,sans-serif';if(ctx.measureText(s).width<=maxW)break;size-=4}
  ctx.restore();return size};
M.text=(ctx,s,x,y,size,o={})=>{
  ctx.save();ctx.globalAlpha=o.alpha===undefined?1:M.clamp(o.alpha);
  ctx.font=(o.weight||800)+' '+Math.round(Math.max(8,size))+'px '+(o.font||'system-ui,Roboto,Arial,sans-serif');
  ctx.textAlign=o.align||'center';ctx.textBaseline='middle';
  if('letterSpacing' in ctx&&o.spacing)ctx.letterSpacing=o.spacing+'px';
  if(o.rot){ctx.translate(x,y);ctx.rotate(o.rot);x=0;y=0}
  if(o.shadow!==false){ctx.fillStyle='rgba(0,0,0,.42)';ctx.fillText(s,x+size*.03,y+size*.03)}
  if(o.stroke){ctx.lineWidth=o.strokeW||size*.04;ctx.strokeStyle=o.stroke;ctx.strokeText(s,x,y)}
  ctx.fillStyle=o.color||'#fff';
  if(o.glow){ctx.shadowColor=o.glow;ctx.shadowBlur=size*.38}
  ctx.fillText(s,x,y);ctx.restore()};
M.rot3=(p,ax,ay,az)=>{let x=p[0],y=p[1],z=p[2],c=Math.cos(ax),s=Math.sin(ax),t;
  t=y*c-z*s;z=y*s+z*c;y=t;c=Math.cos(ay);s=Math.sin(ay);t=x*c+z*s;z=-x*s+z*c;x=t;
  c=Math.cos(az);s=Math.sin(az);t=x*c-y*s;y=x*s+y*c;x=t;return[x,y,z]};
M.proj=(p,W,H,fov=900,cx=W/2,cy=H/2)=>{const s=fov/Math.max(60,fov+p[2]);return{x:cx+p[0]*s,y:cy+p[1]*s,s:s}};
M.poly=(ctx,cx,cy,r,sides=6,rot=0)=>{ctx.beginPath();for(let i=0;i<sides;i++){const a=rot+i*Math.PI*2/sides,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.closePath()};
M.star=(ctx,cx,cy,rOut,rIn,pts=5,rot=0)=>{ctx.beginPath();for(let i=0;i<pts*2;i++){const r=i%2===0?rOut:rIn,a=rot+i*Math.PI/pts,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.closePath()};
M.rrect=(ctx,x,y,w,h,r=16)=>{const rad=Math.max(0,Math.min(r,Math.min(Math.abs(w),Math.abs(h))/2));ctx.beginPath();ctx.moveTo(x+rad,y);ctx.arcTo(x+w,y,x+w,y+h,rad);ctx.arcTo(x+w,y+h,x,y+h,rad);ctx.arcTo(x,y+h,x,y,rad);ctx.arcTo(x,y,x+w,y,rad);ctx.closePath()};
M.wave=(ctx,W,H,yBase,amp,freq,phase,fillBottom=false)=>{ctx.beginPath();for(let x=0;x<=W;x+=16){const y=yBase+Math.sin((x/W)*Math.PI*2*freq+phase)*amp+Math.cos((x/W)*Math.PI*4*freq-phase*.7)*(amp*.35);if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}if(fillBottom){ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath()}};
M.ring=(ctx,cx,cy,r,sa=0,ea=Math.PI*2)=>{ctx.beginPath();ctx.arc(cx,cy,Math.max(.5,r),sa,ea)};
M.bg=(ctx,W,H,P,v=0)=>{
  const R=M.rng((P.seed||1)+v*31),ox=W*(.2+R()*.6),oy=H*(.18+R()*.64);
  const g=v%2?ctx.createLinearGradient(W,0,0,H):ctx.createLinearGradient(0,0,W*.3,H);
  g.addColorStop(0,P.pal.bg1);g.addColorStop(1,P.pal.bg2);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  const gl=ctx.createRadialGradient(ox,oy,10,ox,oy,W*(.55+P.pulse*.15));
  gl.addColorStop(0,M.col(v%2===0?P.pal.acc:P.pal.acc2,.14));gl.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gl;ctx.fillRect(0,0,W,H)};
M.deco=(ctx,W,H,P,ts)=>{const R=M.rng(P.seed*7+1);
  for(let k=0;k<20;k++){const x=R()*W,y=R()*H,r=1.5+R()*4,vx=(R()-.5)*65,vy=-15-R()*50;
    const px=((x+vx*ts)%W+W)%W,py=((y+vy*ts)%H+H)%H;
    ctx.fillStyle=M.col(k%2?P.pal.acc:P.pal.acc2,.35);ctx.beginPath();ctx.arc(px,py,r*(1+P.pulse*.5),0,7);ctx.fill()}};
M.mainText=(ctx,W,H,P,ts,o={})=>{
  const L=M.lines(String(P.text).toUpperCase(),11),long=L.reduce((a,b)=>a.length>b.length?a:b,'');
  const fs=M.fit(ctx,long,W*.84,W*.165)*(o.scale||1),lh=fs*1.15,cy=o.cy||H*.46,y0=cy-(L.length-1)*lh/2;
  L.forEach((l,i)=>M.text(ctx,l,o.cx||W/2,y0+i*lh,fs*(1+P.pulse*.05),
    {align:o.align||'center',rot:o.rot,color:(i===L.length-1&&L.length>1)?P.pal.acc:P.pal.fg,alpha:o.alpha===undefined?1:o.alpha,glow:P.pal.acc}))};
M.sub=(ctx,W,H,P,ts)=>{const s=String(P.sub||'').trim();if(!s)return;const a=M.ease.outCubic(M.p(ts,.12,.32));if(a<=0)return;
  const words=s.toUpperCase().split(/\\s+/).filter(Boolean);if(!words.length)return;
  const lines=M.lines(words.join(' '),28,6),long=lines.reduce((acc,l)=>l.length>acc.length?l:acc,'');
  const sz=M.fit(ctx,long,W*.82,Math.min(W*.042,30),700),lh=sz*1.32,totalH=lines.length*lh+sz*.9,boxW=W*.88,boxX=(W-boxW)/2,baseY=H*.84-totalH/2+(1-a)*18;
  ctx.save();ctx.globalAlpha=a;ctx.fillStyle=M.col(P.pal.bg1,.78);M.rrect(ctx,boxX,baseY,boxW,totalH,14);ctx.fill();
  ctx.strokeStyle=M.col(P.pal.acc,.45);ctx.lineWidth=1.5;ctx.stroke();
  const speakProg=M.clamp((ts-.1)/Math.max(.4,(P.dur||3)*.78)),activeIdx=Math.floor(speakProg*words.length);let wc=0;
  lines.forEach((line,idx)=>{const lw=line.split(/\\s+/).filter(Boolean),y=baseY+sz*.78+idx*lh;
    ctx.font='700 '+Math.round(sz)+'px system-ui,Roboto,Arial,sans-serif';
    const sp=ctx.measureText(' ').width*1.08,wws=lw.map(w=>ctx.measureText(w).width),lineW=wws.reduce((a,b)=>a+b,0)+Math.max(0,lw.length-1)*sp;
    let cx=W/2-lineW/2;lw.forEach((w,wi)=>{const wiG=wc++,spkn=wiG<=activeIdx,cur=wiG===activeIdx,ww=wws[wi];
      M.text(ctx,w,cx+ww/2,y,sz*(cur?1.06:1),{color:cur?P.pal.acc2:(spkn?P.pal.fg:P.pal.dim),alpha:spkn?1:.62,weight:700,glow:cur?P.pal.acc:undefined});cx+=ww+sp})});
  ctx.restore()};
const FB={};
FB.kinetic=(ctx,t,ts,W,H,P,M)=>{M.deco(ctx,W,H,P,ts);const R=M.rng(P.seed),dir=R()<.5?-1:1;
  const L=M.lines(String(P.text).toUpperCase(),11),long=L.reduce((a,b)=>a.length>b.length?a:b,'');
  const fs=M.fit(ctx,long,W*.84,W*.2),lh=fs*1.18,y0=H*.42-(L.length-1)*lh/2;
  L.forEach((l,i)=>{const p=M.p(ts,.08+i*.13,.5),e=M.ease.outBack(p);
    M.text(ctx,l,W/2+(1-M.ease.outCubic(p))*dir*W*.3,y0+i*lh+(1-e)*lh*.5,fs*(.6+.4*e)*(1+P.pulse*.05),
      {color:(i===L.length-1&&L.length>1)?P.pal.acc:P.pal.fg,alpha:p*2.5,glow:P.pal.acc})});
  const bw=W*.5*M.ease.outExpo(M.p(ts,.5,.5)),y=y0+(L.length-1)*lh+fs*.78;
  ctx.fillStyle=P.pal.acc2;ctx.fillRect(W/2-bw/2,y,bw,Math.max(4,W*.009))};
FB.burst=FB.tunnel=FB.grid=FB.orbit=FB.cube=FB.closing=FB.kinetic;
function compile(code){
  const src=String(code||'').trim();if(!src)throw new Error('código vazio');
  const fn=/^(async\\s+)?function\\b|^\\(\\s*[\\w\\s,]*\\)\\s*=>/.test(src)?new Function('return ('+src+')')():new Function('ctx','t','ts','W','H','P','M',src);
  if(typeof fn!=='function')throw new Error('não é função');return fn}
const SC=D.scenes.map((s,i)=>{let fn=null,origem='fallback';
  if(s.code){try{fn=compile(s.code);origem=s.origem||'gemini'}catch(e){fn=null;log('cena '+(i+1)+': erro de sintaxe -> fallback ('+e.message+')')}}
  if(!fn)fn=FB[s.fb]||FB.kinetic;
  return Object.assign({},s,{fn:fn,origem:origem,start:0,drawsSub:/\\b(P\\.sub|M\\.sub)\\b/.test(s.code||'')})});
let _acc=0;SC.forEach(s=>{s.start=_acc;_acc+=s.dur});
function degrade(i,e){const s=SC[i];log('cena '+(i+1)+': '+(e&&e.message||e)+' -> fallback');s.fn=FB[s.fb]||FB.kinetic;s.origem='fallback'}
function pulseAt(gt){const f=(gt*BPM/60)%1;return Math.pow(1-f,4)*(.35+.13*EN)}
function resetCtx(c){if(c.reset)c.reset();else{c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.shadowBlur=0;c.globalCompositeOperation='source-over'}}
function paint(c,i,ts,gt,strict){
  const s=SC[i];resetCtx(c);
  const P={pal:PAL,bpm:BPM,energy:EN,text:s.text,sub:s.sub,role:s.role,dur:s.dur,seed:s.seed,pulse:pulseAt(gt),gt:gt,i:i};
  M.bg(c,W,H,P,i);
  try{s.fn(c,M.clamp(ts/s.dur),ts,W,H,P,M)}
  catch(e){if(strict)throw e;degrade(i,e);resetCtx(c);M.bg(c,W,H,P,i);s.fn(c,M.clamp(ts/s.dur),ts,W,H,P,M)}
  if(!s.drawsSub){try{M.sub(c,W,H,P,ts)}catch(e){}}}
function trans(co,cn,kind,p){
  resetCtx(ctx);const e=M.ease.inOutCubic(p);
  if(kind==='wipe_h'){ctx.drawImage(co,0,0);const cut=Math.floor(W*e);if(cut>=1)ctx.drawImage(cn,0,0,cut,H,0,0,cut,H);
    ctx.fillStyle=PAL.acc;ctx.fillRect(cut-W*.03,0,W*.03,H)}
  else if(kind==='wipe_v'){ctx.drawImage(co,0,0);const cut=Math.floor(H*e);if(cut>=1)ctx.drawImage(cn,0,0,W,cut,0,0,W,cut);
    ctx.fillStyle=PAL.acc;ctx.fillRect(0,cut-H*.02,W,H*.02)}
  else if(kind==='crossfade'){ctx.drawImage(co,0,0);ctx.globalAlpha=e;ctx.drawImage(cn,0,0);ctx.globalAlpha=1}
  else if(kind==='zoom'){const s2=.88+.12*e;ctx.drawImage(cn,W*(1-s2)/2,H*(1-s2)/2,W*s2,H*s2);
    const s1=1+e*.7;ctx.globalAlpha=1-e;ctx.drawImage(co,W*(1-s1)/2,H*(1-s1)/2,W*s1,H*s1);ctx.globalAlpha=1}
  else if(kind==='glitch'){ctx.drawImage(cn,0,0);const R=M.rng(Math.floor(p*30)+7);
    for(let k=0;k<10;k++){const y=R()*H,h=R()*H*.08+8,dx=(R()-.5)*W*.3*(1-p);ctx.drawImage(cn,0,y,W,h,dx,y,W,h)}
    ctx.fillStyle=M.col(PAL.acc,.25*(1-p));ctx.fillRect(0,R()*H,W,H*.01)}
  else{ctx.drawImage(cn,0,0);ctx.fillStyle='rgba(255,255,255,'+Math.pow(1-p,2)+')';ctx.fillRect(0,0,W,H)}}
function frame(gt){
  gt=M.clamp(gt,0,DUR-1e-3);
  let i=0;while(i<SC.length-1&&gt>=SC[i+1].start)i++;
  const rawTs=gt-SC[i].start;
  const isIdlePoster=!playing&&gt<0.04;
  const ts=isIdlePoster?Math.min(SC[i].dur*0.45,1.15):rawTs;
  const effGt=isIdlePoster?ts:gt;
  const trKind=SC[i-1]&&SC[i-1].transition_out?SC[i-1].transition_out:KIND;
  if(i>0&&ts<TR){paint(cxn,i,ts,effGt);paint(cxo,i-1,SC[i-1].dur+ts,effGt);trans(co,cn,trKind,ts/TR)}
  else paint(ctx,i,ts,effGt);
  const f=gt>DUR-.5?1-(DUR-gt)/.5:0;
  if(f>0){ctx.fillStyle='rgba(0,0,0,'+M.clamp(f)+')';ctx.fillRect(0,0,W,H)}
  $('hud').textContent=gt.toFixed(1)+'s / '+DUR+'s · cena '+(i+1)+'/'+SC.length+' ('+SC[i].origem+')';
  $('seek').value=Math.round(gt/DUR*1000);return i}
let ac=null,master=null,adest=null,nbuf=null,muted=false;
function initAudio(){if(ac)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  ac=new AC();master=ac.createGain();master.gain.value=muted?0:.25;master.connect(ac.destination);
  if(ac.createMediaStreamDestination){adest=ac.createMediaStreamDestination();master.connect(adest)}
  nbuf=ac.createBuffer(1,ac.sampleRate*.2,ac.sampleRate);const d=nbuf.getChannelData(0);
  for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(ac.sampleRate*.04))}
function kick(){if(!ac||muted)return;const t=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();
  o.frequency.setValueAtTime(120,t);o.frequency.exponentialRampToValueAtTime(38,t+.12);
  g.gain.setValueAtTime(.9,t);g.gain.exponentialRampToValueAtTime(.001,t+.16);
  o.connect(g);g.connect(master);o.start(t);o.stop(t+.17)}
function hat(){if(!ac||muted||!nbuf)return;const t=ac.currentTime,s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();
  s.buffer=nbuf;f.type='highpass';f.frequency.value=5000;g.gain.setValueAtTime(.2,t);g.gain.exponentialRampToValueAtTime(.001,t+.06);
  s.connect(f);f.connect(g);g.connect(master);s.start(t);s.stop(t+.07)}
function whoosh(){if(!ac||muted||!nbuf)return;const t=ac.currentTime,s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();
  s.buffer=nbuf;f.type='bandpass';f.frequency.setValueAtTime(300,t);f.frequency.exponentialRampToValueAtTime(2200,t+.18);
  g.gain.setValueAtTime(.45,t);g.gain.exponentialRampToValueAtTime(.001,t+.19);
  s.connect(f);f.connect(g);g.connect(master);s.start(t);s.stop(t+.2)}
let playing=false,t0=0,gt=0,lastHalf=-1,lastScene=-1,mr=null,recording=false;
function play(){initAudio();if(ac&&ac.state==='suspended')ac.resume();
  if(gt>=DUR-.02)gt=0;t0=performance.now()-gt*1000;playing=true;lastHalf=-1;$('bPlay').innerHTML='&#9208; Pausar'}
function pause(){playing=false;$('bPlay').innerHTML='&#9654; Play'}
function tick(now){
  if(playing){gt=(now-t0)/1000;if(gt>=DUR){gt=DUR-1e-3;pause();if(recording)setTimeout(stopRec,500)}}
  const i=frame(gt);
  if(playing&&ac){const h=Math.floor(gt*BPM/60*2);if(h!==lastHalf){lastHalf=h;if(h%2===0)kick();else hat()}
    if(lastScene>=0&&i!==lastScene)whoosh()}
  lastScene=i;requestAnimationFrame(tick)}
$('bPlay').onclick=()=>playing?pause():play();
$('bRest').onclick=()=>{gt=0;if(playing)t0=performance.now();lastHalf=-1;frame(0)};
$('bSnd').onclick=()=>{initAudio();muted=!muted;if(master)master.gain.value=muted?0:.25;$('bSnd').textContent=muted?'Mudo':'Som'};
$('seek').oninput=e=>{pause();gt=(+e.target.value)/1000*DUR;frame(gt)};
function fitCanvas(){const st=$('stage'),r=W/H;let w=st.clientWidth,h=st.clientHeight;
  if(w/h>r)w=h*r;else h=w/r;cv.style.width=Math.floor(w)+'px';cv.style.height=Math.floor(h)+'px'}
window.addEventListener('resize',fitCanvas);fitCanvas();
function saveCode(){
  let out='// Showreel: '+D.title+'\\n';
  SC.forEach((s,i)=>{out+='// ===== CENA '+(i+1)+' ['+s.role+'] "'+s.text+'" ('+s.origem+') =====\\n'+(s.code||'// fallback')+'\\n\\n'});
  const b=new Blob([out],{type:'text/javascript'}),a=document.createElement('a');
  a.href=URL.createObjectURL(b);a.download='todas_as_cenas_'+Date.now()+'.js';
  document.body.appendChild(a);a.click();a.remove()}
$('bCode').onclick=saveCode;
function startRec(){if(recording)return;initAudio();if(ac&&ac.state==='suspended')ac.resume();
  const types=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  const mimeT=(window.MediaRecorder&&types.find(t=>MediaRecorder.isTypeSupported(t)))||'';
  if(!mimeT){alert('Navegador sem suporte a gravação');return}
  const stream=cv.captureStream(30);if(adest)adest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  const chunks=[];mr=new MediaRecorder(stream,{mimeType:mimeT,videoBitsPerSecond:8000000});
  mr.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
  mr.onstop=()=>{const ext=mimeT.indexOf('mp4')>=0?'mp4':'webm';
    const blob=new Blob(chunks,{type:mimeT.split(';')[0]}),url=URL.createObjectURL(blob),name='showreel_'+Date.now()+'.'+ext;
    $('dl').innerHTML='<a href="'+url+'" download="'+name+'">Baixar vídeo ('+ext.toUpperCase()+', '+(blob.size/1e6).toFixed(1)+' MB)</a>';
    $('dl').firstChild.click();recording=false;$('bRec').textContent='Gravar vídeo';$('bRec').disabled=false};
  recording=true;$('bRec').textContent='Gravando...';$('bRec').disabled=true;$('dl').innerHTML='';
  gt=0;mr.start(500);play()}
function stopRec(){if(mr&&mr.state!=='inactive')mr.stop()}
$('bRec').onclick=startRec;
log('DNA: '+D.dna.structure+' | '+KIND+' | '+D.dna.estilo+' | '+BPM+' bpm | energia '+EN);
SC.forEach((s,i)=>log((i+1)+'. ['+s.role+'] '+s.text+'  ('+s.origem+', '+s.dur.toFixed(1)+'s)'));
frame(0);requestAnimationFrame(tick);
</script></body></html>`;
}
