// THE WORLD TODAY — Sunday 22 November 2026
// A newspaper front page drawn from scratch in Node 22 (standard library
// only): a hand-written 5x7 bitmap font, a tiny raster canvas, and a
// from-scratch PNG encoder. Writes /output/entry.png (or
// $MAKEFUN_OUTPUT_DIR/entry.png). No network, fully deterministic — every
// run writes the same bytes.
//
// The day's stories (all published or first reported on 22 November 2026,
// as shown by the sources' own timestamps; Saturday events are those
// reported on Sunday 22 November):
//   - Israeli fire kills four more in Gaza, three in a strike on a vehicle
//     carrying food aid for displaced people (Dawn/AFP, updated 22 Nov)
//   - EU proposes a tax on the world's biggest digital companies to fund
//     its next budget (Dawn/AFP, 22 Nov)
//   - A Russian cargo ship catches fire in the Gulf of Finland after a
//     drone strike; a Russian helicopter is suspected of violating Finnish
//     airspace (Dawn/AFP, 22 Nov; AsiaOne)
//   - NATO vows to defend every inch of Poland after Russian missiles
//     came down on Polish soil; its council meets on Monday (The Times,
//     AsiaOne, 21-22 Nov reports of Saturday's statements)
//   - A Russian ballistic missile strike on Kryvyi Rih kills two and
//     wounds 60 (AsiaOne, Saturday 21 Nov)
//   - Protesters rally for a sixth weekend in France over living costs
//     and public services (Dawn/AFP, Arab News, 22 Nov)
//   - Countries open a path towards an accord on lethal autonomous
//     weapons, "killer robots" (Dawn/AFP, 22 Nov)
//   - A fossil-fuel fight threatens the COP31 climate talks in Antalya,
//     though the summit president says a final deal is close (Dawn/AFP,
//     Arab News/Reuters, 22 Nov)
//   - Two spacecraft loop into orbit around Mercury, its first visitor
//     in years (Arab News/AP, 22 Nov)
//   - A Brazilian town clears rubble after a deadly storm: "We lost
//     everything" (Arab News/AFP, 22 Nov)
//   - Also: 39 missing in an Indonesia factory fire (Arab News/AFP,
//     22 Nov); Alcaraz to face Zverev in the ATP Finals title match;
//     Dortmund go top of the Bundesliga (Dawn/AFP, 22 Nov)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- PNG out
// CRC-32 (IEEE) table, built once at startup.
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// One PNG chunk: length, type, data, CRC.
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// Encode an RGB pixel buffer as a PNG.
function encodePNG(w: number, h: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter type 0 (none) on every scanline
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ canvas
type RGB = [number, number, number];

const PAPER: RGB = [247, 242, 228]; // newsprint cream
const INK: RGB = [24, 20, 15];
const RED: RGB = [168, 28, 28];
const BLUE: RGB = [28, 74, 116];
const GREY: RGB = [110, 106, 94];
const PALE: RGB = [233, 227, 209];
const NAVY: RGB = [20, 38, 60];
const NIGHT: RGB = [12, 20, 32];
const GOLD: RGB = [238, 194, 78];
const EMBER: RGB = [216, 84, 32];
const SMOKE: RGB = [118, 122, 126];
const TEAL: RGB = [16, 92, 110];
const SKY: RGB = [158, 186, 202];
const WHITE: RGB = [249, 247, 241];
const GREEN: RGB = [34, 110, 60];

// A tiny raster canvas: a flat RGB buffer with rect, disc, line and polygon
// fills, plus an optional clip rectangle so pictograms stay in their panel.
class Canvas {
  readonly w: number;
  readonly h: number;
  private px: Uint8Array;
  private clip: [number, number, number, number] | null = null;

  constructor(w: number, h: number, bg: RGB) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
    this.fill(0, 0, w, h, bg);
  }

  setClip(x: number, y: number, w: number, h: number): void {
    this.clip = [Math.round(x), Math.round(y), Math.round(w), Math.round(h)];
  }

  clearClip(): void {
    this.clip = null;
  }

  put(x: number, y: number, c: RGB): void {
    if (this.clip) {
      const [cx, cy, cw, ch] = this.clip;
      if (x < cx || y < cy || x >= cx + cw || y >= cy + ch) return;
    }
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }

  fill(x: number, y: number, w: number, h: number, c: RGB): void {
    let x0 = Math.max(0, Math.round(x));
    let y0 = Math.max(0, Math.round(y));
    let x1 = Math.min(this.w, Math.round(x + w));
    let y1 = Math.min(this.h, Math.round(y + h));
    if (this.clip) {
      const [cx, cy, cw, ch] = this.clip;
      x0 = Math.max(x0, cx);
      y0 = Math.max(y0, cy);
      x1 = Math.min(x1, cx + cw);
      y1 = Math.min(y1, cy + ch);
    }
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.w + xx) * 3;
        this.px[i] = c[0];
        this.px[i + 1] = c[1];
        this.px[i + 2] = c[2];
      }
    }
  }

  // Hollow rectangle, 1px border.
  frame(x: number, y: number, w: number, h: number, c: RGB): void {
    this.fill(x, y, w, 1, c);
    this.fill(x, y + h - 1, w, 1, c);
    this.fill(x, y, 1, h, c);
    this.fill(x + w - 1, y, 1, h, c);
  }

  // Filled disc.
  disc(cx: number, cy: number, r: number, c: RGB): void {
    const rr = Math.round(r);
    for (let dy = -rr; dy <= rr; dy++) {
      const dx = Math.floor(Math.sqrt(Math.max(0, rr * rr - dy * dy)));
      for (let xx = -dx; xx <= dx; xx++) this.put(cx + xx, cy + dy, c);
    }
  }

  // 1px circle outline.
  ring(cx: number, cy: number, r: number, c: RGB): void {
    const rr = Math.round(r);
    for (let a = 0; a < 360; a += 2) {
      const t = (a * Math.PI) / 180;
      this.put(Math.round(cx + rr * Math.cos(t)), Math.round(cy + rr * Math.sin(t)), c);
    }
  }

  // Bresenham line; thickness > 1 stamps discs along it.
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, thick = 1): void {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    for (;;) {
      if (thick <= 1) this.put(x, y, c);
      else this.disc(x, y, Math.floor(thick / 2), c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  // Even-odd scanline polygon fill; pts is a flat [x, y, x, y, ...] list.
  poly(pts: number[], c: RGB): void {
    const n = pts.length / 2;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      minY = Math.min(minY, pts[i * 2 + 1]);
      maxY = Math.max(maxY, pts[i * 2 + 1]);
    }
    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x0 = pts[i * 2];
        const y0 = pts[i * 2 + 1];
        const x1 = pts[j * 2];
        const y1 = pts[j * 2 + 1];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) {
          this.put(x, y, c);
        }
      }
    }
  }

  // Starburst: a filled centre with radiating spikes.
  burst(cx: number, cy: number, r: number, spikes: number, c: RGB): void {
    this.disc(cx, cy, Math.round(r * 0.45), c);
    for (let i = 0; i < spikes; i++) {
      const a = (i * Math.PI * 2) / spikes;
      this.line(cx, cy, Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a)), c, 3);
    }
    this.disc(cx, cy, Math.round(r * 0.45), c);
  }

  toPNG(): Buffer {
    return encodePNG(this.w, this.h, this.px);
  }
}

// -------------------------------------------------------------------- font
// Hand-drawn 5x7 bitmap font, '#' is ink and '.' is empty. Glyphs with
// descenders (g, j, p, q, y) use 8 rows; the rest are padded to 8 rows so
// every cell is 5x8.
const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.####', '#....', '#....', '#....', '.####'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##.', '.#..#', '.#...', '####.', '.#...', '.#...', '.#...'],
  g: ['.....', '.....', '.####', '#...#', '#...#', '.####', '....#', '.###.'],
  h: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
  j: ['...#.', '.....', '..##.', '...#.', '...#.', '...#.', '...#.', '.##..'],
  k: ['#....', '#....', '#.#..', '#.#..', '##...', '#.#..', '#..#.'],
  l: ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '.....', '####.', '#...#', '#...#', '####.', '#....', '#....'],
  q: ['.....', '.....', '.####', '#...#', '#...#', '.####', '....#', '....#'],
  r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['.#...', '.#...', '####.', '.#...', '.#...', '.#...', '..##.'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '.....', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '#.##.', '#..##'],
  '"': ['.#.#.', '.#.#.', '.#.#.', '.....', '.....', '.....', '.....'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '.###.', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '.###.', '.....', '.###.', '.....', '.....'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '•': ['.....', '.....', '.###.', '.###.', '.###.', '.....', '.....'],
};

for (const k of Object.keys(FONT)) {
  while (FONT[k].length < 8) FONT[k].push('.....');
}

function textWidth(s: string, scale: number): number {
  let w = 0;
  for (const _ch of s) w += 6 * scale;
  return w > 0 ? w - scale : 0; // no trailing gap after the last glyph
}

function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of s) {
    const g = FONT[ch] ?? FONT['?'];
    for (let r = 0; r < 8; r++) {
      const row = g[r];
      for (let col = 0; col < 5; col++) {
        if (row[col] === '#') cv.fill(cx + col * scale, cy + r * scale, scale, scale, c);
      }
    }
    cx += 6 * scale;
  }
}

// Word-wrap plain text to a pixel width; returns lines without trailing spaces.
function wrapText(s: string, maxW: number, scale: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (textWidth(trial, scale) <= maxW) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      let rest = w;
      while (textWidth(rest, scale) > maxW) {
        const take = Math.max(1, Math.floor(maxW / (6 * scale)));
        lines.push(rest.slice(0, take));
        rest = rest.slice(take);
      }
      cur = rest;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draw wrapped text; returns the y just below the last line.
function drawPara(cv: Canvas, s: string, x: number, y: number, maxW: number, scale: number, c: RGB, lh?: number): number {
  const lines = wrapText(s, maxW, scale);
  const step = lh ?? Math.round(9 * scale);
  lines.forEach((ln, i) => drawText(cv, ln, x, y + i * step, scale, c));
  return y + lines.length * step;
}

// Centre a line of text on cx.
function drawCentred(cv: Canvas, s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(cv, s, cx - textWidth(s, scale) / 2, y, scale, c);
}

// ------------------------------------------------------------- pictograms
// Each pictogram draws inside (x, y, w, h) and clips to that rectangle.

// Lead picture: an aid truck on a dusty road, smoke rising behind it.
function drawAidTruck(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.setClip(x, y, w, h);
  cv.fill(x, y, w, h, [224, 196, 150]); // dusty sky
  cv.disc(x + Math.round(w * 0.82), y + Math.round(h * 0.24), Math.round(h * 0.16), [240, 214, 160]); // low sun
  cv.fill(x, y + Math.round(h * 0.62), w, Math.round(h * 0.38), [120, 100, 74]); // ground
  cv.fill(x, y + Math.round(h * 0.62), w, 3, [90, 76, 56]); // road edge
  // Ruined wall blocks in the distance.
  cv.fill(x + Math.round(w * 0.06), y + Math.round(h * 0.4), 34, Math.round(h * 0.24), [150, 132, 108]);
  cv.fill(x + Math.round(w * 0.9), y + Math.round(h * 0.44), 30, Math.round(h * 0.2), [150, 132, 108]);
  // Smoke plume.
  cv.disc(x + Math.round(w * 0.62), y + Math.round(h * 0.18), 10, SMOKE);
  cv.disc(x + Math.round(w * 0.58), y + Math.round(h * 0.3), 13, SMOKE);
  cv.disc(x + Math.round(w * 0.55), y + Math.round(h * 0.44), 9, SMOKE);
  // Truck: cargo box with a red cross, cab, wheels.
  const tx = x + Math.round(w * 0.18);
  const ty = y + Math.round(h * 0.3);
  const tw = Math.round(w * 0.5);
  const th = Math.round(h * 0.42);
  cv.fill(tx, ty, tw, th, WHITE); // cargo box
  cv.frame(tx, ty, tw, th, INK);
  cv.fill(tx + Math.round(tw * 0.44), ty + 6, 8, th - 12, RED); // cross, upright
  cv.fill(tx + Math.round(tw * 0.32), ty + Math.round(th * 0.38), Math.round(tw * 0.36), 8, RED); // cross, bar
  const cx0 = tx + tw;
  cv.fill(cx0, ty + 10, Math.round(w * 0.14), th - 10, [180, 60, 44]); // cab
  cv.fill(cx0 + 6, ty + 16, Math.round(w * 0.08), 12, SKY); // cab window
  cv.fill(tx - 6, ty + th, tw + Math.round(w * 0.16), 5, INK); // chassis
  cv.disc(tx + Math.round(tw * 0.22), ty + th + 10, 9, INK); // wheels
  cv.disc(tx + Math.round(tw * 0.78), ty + th + 10, 9, INK);
  cv.disc(cx0 + Math.round(w * 0.09), ty + th + 10, 9, INK);
  // Fallen crates beside the truck.
  cv.fill(tx - 34, ty + th - 6, 22, 14, [150, 110, 62]);
  cv.fill(tx - 30, ty + th - 20, 20, 13, [170, 128, 74]);
  cv.clearClip();
}

// A laptop showing rising bars, with gold coins: the Big Tech tax plan.
function drawBigTech(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.setClip(x, y, w, h);
  cv.fill(x, y, w, h, NAVY);
  const lx = x + Math.round(w * 0.3);
  const ly = y + Math.round(h * 0.14);
  const lw = Math.round(w * 0.44);
  const lh = Math.round(h * 0.52);
  cv.fill(lx, ly, lw, lh, [10, 22, 38]); // screen
  cv.frame(lx, ly, lw, lh, WHITE);
  // Rising bars on the screen.
  const bars = [0.25, 0.45, 0.35, 0.65, 0.9];
  for (let i = 0; i < bars.length; i++) {
    const bw = Math.round(lw / 7);
    const bh = Math.round((lh - 14) * bars[i]);
    cv.fill(lx + 8 + i * (bw + 4), ly + lh - 8 - bh, bw, bh, i === bars.length - 1 ? GOLD : TEAL);
  }
  cv.fill(lx - 8, ly + lh, lw + 16, 6, [120, 124, 128]); // keyboard base
  // Gold coins in front.
  for (const [ox, oy, r] of [[0.16, 0.72, 16], [0.3, 0.8, 12], [0.84, 0.74, 15]] as const) {
    const px = x + Math.round(w * ox);
    const py = y + Math.round(h * oy);
    cv.disc(px, py, r, GOLD);
    cv.ring(px, py, r - 3, [180, 140, 40]);
  }
  // EU stars arc, top left.
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.15 + i * 0.12);
    cv.disc(x + 22 + Math.round(26 * Math.cos(a)), y + 34 - Math.round(22 * Math.sin(a)), 2, GOLD);
  }
  cv.clearClip();
}

// A cargo ship on fire at sea, a small drone overhead.
function drawShipFire(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.setClip(x, y, w, h);
  cv.fill(x, y, w, h, [70, 110, 140]); // sky
  cv.fill(x, y + Math.round(h * 0.58), w, Math.round(h * 0.42), [24, 66, 96]); // sea
  // Wave lines.
  for (let i = 0; i < 5; i++) {
    cv.line(x + 8 + i * 44, y + Math.round(h * 0.66), x + 34 + i * 44, y + Math.round(h * 0.66), SKY, 2);
  }
  // Drone silhouette, top right.
  const dx = x + Math.round(w * 0.78);
  const dy = y + Math.round(h * 0.16);
  cv.fill(dx - 14, dy, 28, 5, INK);
  cv.disc(dx - 16, dy + 2, 4, INK);
  cv.disc(dx + 16, dy + 2, 4, INK);
  cv.fill(dx - 4, dy + 4, 8, 8, INK);
  // Ship hull and containers.
  const hx = x + Math.round(w * 0.1);
  const hy = y + Math.round(h * 0.48);
  const hw = Math.round(w * 0.8);
  cv.poly([hx, hy, hx + hw, hy, hx + hw - 18, hy + Math.round(h * 0.22), hx + 14, hy + Math.round(h * 0.22)], [140, 32, 28]); // hull
  cv.fill(hx + Math.round(hw * 0.08), hy - 22, 30, 22, [200, 90, 30]); // containers
  cv.fill(hx + Math.round(hw * 0.08) + 32, hy - 22, 30, 22, [220, 180, 60]);
  cv.fill(hx + Math.round(hw * 0.08) + 64, hy - 22, 30, 22, TEAL);
  cv.fill(hx + hw - 44, hy - 34, 22, 34, WHITE); // bridge
  cv.fill(hx + hw - 40, hy - 30, 14, 8, SKY);
  // Flames and smoke from the midship containers.
  cv.burst(hx + Math.round(hw * 0.42), hy - 26, 24, 8, EMBER);
  cv.burst(hx + Math.round(hw * 0.42), hy - 30, 14, 7, GOLD);
  cv.disc(hx + Math.round(hw * 0.42) - 16, hy - 52, 9, SMOKE);
  cv.disc(hx + Math.round(hw * 0.42) - 26, hy - 66, 12, SMOKE);
  cv.clearClip();
}

// Placards and crowd heads: the French protests.
function drawProtest(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.setClip(x, y, w, h);
  cv.fill(x, y, w, h, [214, 226, 232]);
  // Placards on sticks.
  const boards: [number, number, RGB][] = [
    [16, 6, RED],
    [88, 0, BLUE],
    [160, 8, TEAL],
  ];
  for (const [bx, by, c] of boards) {
    cv.fill(x + bx, y + by, 52, 26, c);
    cv.frame(x + bx, y + by, 52, 26, WHITE);
    cv.fill(x + bx + 24, y + by + 26, 4, 26, INK);
  }
  // Crowd heads and shoulders.
  for (let i = 0; i < 8; i++) {
    const hx = x + 14 + i * 26;
    const hy = y + h - 18 - (i % 2) * 6;
    cv.disc(hx, hy, 9, [58, 44, 36]);
    cv.fill(hx - 10, hy + 8, 20, 12, [90, 84, 74]);
  }
  cv.clearClip();
}

// A warming globe with a thermometer: the climate talks.
function drawClimate(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.setClip(x, y, w, h);
  cv.fill(x, y, w, h, [206, 226, 232]);
  const gx = x + Math.round(w * 0.36);
  const gy = y + Math.round(h * 0.5);
  const gr = Math.round(h * 0.4);
  cv.disc(gx, gy, gr, [60, 120, 170]); // ocean
  cv.disc(gx - Math.round(gr * 0.4), gy - Math.round(gr * 0.3), Math.round(gr * 0.42), GREEN); // land
  cv.disc(gx + Math.round(gr * 0.45), gy + Math.round(gr * 0.35), Math.round(gr * 0.3), GREEN);
  cv.ring(gx, gy, gr, BLUE);
  // Sun, top right.
  cv.disc(x + Math.round(w * 0.82), y + Math.round(h * 0.2), 10, GOLD);
  cv.burst(x + Math.round(w * 0.82), y + Math.round(h * 0.2), 18, 8, GOLD);
  // Thermometer, right side.
  const tx = x + Math.round(w * 0.82);
  cv.fill(tx - 4, y + Math.round(h * 0.42), 8, Math.round(h * 0.4), WHITE);
  cv.frame(tx - 4, y + Math.round(h * 0.42), 8, Math.round(h * 0.4), INK);
  cv.disc(tx, y + Math.round(h * 0.84), 9, RED);
  cv.fill(tx - 2, y + Math.round(h * 0.52), 4, Math.round(h * 0.3), RED);
  cv.clearClip();
}

// A cratered planet on an orbit ring, with two small craft: Mercury.
function drawMercury(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.setClip(x, y, w, h);
  cv.fill(x, y, w, h, NIGHT);
  for (let i = 0; i < 20; i++) {
    cv.disc(x + 6 + ((i * 53) % (w - 12)), y + 6 + ((i * 29) % (h - 12)), 1, WHITE);
  }
  const px = x + Math.round(w * 0.42);
  const py = y + Math.round(h * 0.52);
  const pr = Math.round(h * 0.34);
  cv.ring(px, py, Math.round(pr * 1.45), [90, 100, 116]); // orbit ring
  cv.disc(px, py, pr, [168, 158, 146]); // Mercury
  cv.disc(px - Math.round(pr * 0.4), py - Math.round(pr * 0.3), 5, [140, 130, 120]); // craters
  cv.disc(px + Math.round(pr * 0.35), py + Math.round(pr * 0.2), 7, [140, 130, 120]);
  cv.disc(px + Math.round(pr * 0.1), py - Math.round(pr * 0.55), 4, [140, 130, 120]);
  cv.disc(px - Math.round(pr * 0.6), py + Math.round(pr * 0.4), 4, [140, 130, 120]);
  // Two small craft on the ring.
  for (const [ox, oy] of [[1.15, -0.9], [-1.2, 0.8]] as const) {
    const cx = px + Math.round(pr * 1.45 * ox * 0.7);
    const cy = py + Math.round(pr * 1.45 * oy * 0.55);
    cv.fill(cx - 8, cy - 3, 16, 6, WHITE);
    cv.fill(cx - 3, cy - 8, 6, 16, GOLD);
    cv.disc(cx, cy, 3, GOLD);
  }
  cv.clearClip();
}

// Storm rain over a wrecked roof and rubble: the Brazil storm.
function drawStorm(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.setClip(x, y, w, h);
  cv.fill(x, y, w, h, [52, 64, 78]); // storm sky
  // Rain streaks.
  for (let i = 0; i < 14; i++) {
    const rx = x + 8 + ((i * 37) % (w - 16));
    const ry = y + 4 + ((i * 23) % Math.max(1, Math.round(h * 0.5)));
    cv.line(rx, ry, rx - 5, ry + 10, SKY, 1);
  }
  // A roof blown sideways, walls below, rubble at the base.
  const rx0 = x + Math.round(w * 0.24);
  const ry0 = y + Math.round(h * 0.42);
  cv.poly([rx0, ry0, rx0 + Math.round(w * 0.52), ry0, rx0 + Math.round(w * 0.26), ry0 - Math.round(h * 0.26)], [150, 40, 36]); // roof
  cv.fill(rx0 + 8, ry0, Math.round(w * 0.2), Math.round(h * 0.3), [190, 178, 152]); // wall
  cv.fill(rx0 + Math.round(w * 0.3), ry0, Math.round(w * 0.18), Math.round(h * 0.3), [170, 158, 134]);
  cv.fill(rx0 + 20, ry0 + 8, 14, 16, NIGHT); // dark window
  // Rubble blocks.
  for (const [bx, by, bw, bh] of [[0.08, 0.78, 26, 10], [0.3, 0.82, 32, 9], [0.58, 0.78, 24, 11], [0.76, 0.84, 30, 8]] as const) {
    cv.fill(x + Math.round(w * bx), y + Math.round(h * by), bw, bh, [120, 108, 88]);
  }
  // A fallen tree trunk.
  cv.line(x + Math.round(w * 0.1), y + Math.round(h * 0.86), x + Math.round(w * 0.42), y + Math.round(h * 0.66), [70, 52, 36], 5);
  cv.disc(x + Math.round(w * 0.42), y + Math.round(h * 0.64), 10, GREEN);
  cv.clearClip();
}

// A shield with stars: NATO's pledge to defend Poland.
function drawShield(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.setClip(x, y, w, h);
  cv.fill(x, y, w, h, [30, 52, 88]);
  // Stars.
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12 - Math.PI / 2;
    cv.disc(x + Math.round(w * 0.5) + Math.round(w * 0.4 * Math.cos(a)), y + Math.round(h * 0.5) + Math.round(h * 0.4 * Math.sin(a)), 2, WHITE);
  }
  // Shield.
  const sx = x + Math.round(w * 0.32);
  const sw = Math.round(w * 0.36);
  const sy = y + Math.round(h * 0.14);
  const sh = Math.round(h * 0.72);
  cv.poly(
    [sx, sy, sx + sw, sy, sx + sw, sy + Math.round(sh * 0.55), sx + sw / 2, sy + sh, sx, sy + Math.round(sh * 0.55)],
    GOLD,
  );
  cv.poly(
    [sx + 6, sy + 6, sx + sw - 6, sy + 6, sx + sw - 6, sy + Math.round(sh * 0.52), sx + sw / 2, sy + sh - 8, sx + 6, sy + Math.round(sh * 0.52)],
    NAVY,
  );
  // Compass rose on the shield.
  const cx = sx + sw / 2;
  const cy = sy + Math.round(sh * 0.42);
  cv.poly([cx, cy - 18, cx + 5, cy, cx, cy + 18, cx - 5, cy], WHITE);
  cv.poly([cx - 18, cy, cx, cy - 5, cx + 18, cy, cx, cy + 5], WHITE);
  cv.clearClip();
}

// ------------------------------------------------------------- front page
const W = 1024;
const H = 1024;
const M = 24; // page margin

function drawFrontPage(): Canvas {
  const cv = new Canvas(W, H, PAPER);

  // ---- masthead
  cv.fill(M, 16, W - 2 * M, 3, INK);
  drawCentred(cv, 'THE WORLD TODAY', W / 2, 28, 8, INK);
  drawText(cv, 'SUNDAY 22 NOVEMBER 2026', M, 100, 2, INK);
  const tag = 'ONE DAY, ONE PAGE';
  drawText(cv, tag, W - M - textWidth(tag, 2), 100, 2, GREY);
  cv.fill(M, 124, W - 2 * M, 2, INK);

  // ---- lead story: Gaza aid strike (left, wide)
  drawAidTruck(cv, M, 140, 592, 130);
  const leadEnd = drawPara(cv, 'FOUR KILLED IN GAZA AID STRIKE', M, 282, 592, 4, RED);
  drawPara(
    cv,
    'Israeli fire killed four people in Gaza, three of them in a drone strike on a vehicle carrying food for displaced people. Several others were injured, medics said.',
    M,
    leadEnd + 10,
    592,
    2,
    INK,
  );

  // ---- right column: the EU Big Tech tax, then the killer-robot talks
  drawBigTech(cv, 632, 140, 368, 92);
  drawPara(cv, 'EU PLANS BIG TECH TAX TO FUND BUDGET', 632, 242, 368, 3, INK);
  drawPara(
    cv,
    'Brussels plans to tax the biggest digital firms to fund its next budget.',
    632,
    304,
    368,
    2,
    INK,
  );
  cv.fill(632, 372, 368, 2, INK);
  drawPara(cv, 'TALKS OPEN ON KILLER-ROBOT RULES', 632, 382, 368, 2, BLUE);
  drawPara(
    cv,
    'Geneva talks seek an accord on lethal autonomous weapons.',
    632,
    424,
    368,
    2,
    INK,
  );

  // ---- middle band: NATO and Poland
  cv.fill(M, 482, W - 2 * M, 2, INK);
  drawText(cv, 'UKRAINE WAR', 440, 492, 2, RED);
  drawShield(cv, M, 516, 400, 168);
  drawPara(cv, 'NATO VOWS TO DEFEND POLAND', 440, 516, 560, 4, INK);
  drawPara(
    cv,
    'NATO chief Mark Rutte, in Warsaw on Saturday, guaranteed the alliance will defend every inch of Polish territory after Russian missiles came down in Poland. Its council meets on Monday. A strike on Kryvyi Rih killed two and wounded 60.',
    440,
    596,
    560,
    2,
    INK,
  );

  // ---- bottom grid: four more stories of the day
  cv.fill(M, 700, W - 2 * M, 2, INK);
  const cols: { x: number; icon: (cv: Canvas, x: number, y: number, w: number, h: number) => void; head: string; body: string }[] = [
    {
      x: 24,
      icon: drawProtest,
      head: 'FRANCE: SIXTH WEEKEND OF PROTESTS',
      body: 'Thousands rally over living costs and public services, in France and in Lisbon.',
    },
    {
      x: 272,
      icon: drawClimate,
      head: 'CLIMATE TALKS NEAR A DEAL',
      body: 'A fossil-fuel fight threatens the COP31 talks in Antalya, but its president says a final deal is close.',
    },
    {
      x: 520,
      icon: drawMercury,
      head: 'TWO CRAFT REACH MERCURY',
      body: 'A pair of spacecraft loops into orbit around Mercury, its first visitor in years.',
    },
    {
      x: 768,
      icon: drawShipFire,
      head: 'SHIP ABLAZE IN THE BALTIC',
      body: 'A Russian cargo ship catches fire after a drone strike in the Gulf of Finland.',
    },
  ];
  for (const col of cols) {
    col.icon(cv, col.x, 708, 232, 64);
    drawPara(cv, col.head, col.x, 782, 232, 2, RED);
    drawPara(cv, col.body, col.x, 826, 232, 2, INK);
  }

  // ---- footer ticker: the rest of the day
  cv.fill(M, 952, W - 2 * M, 2, INK);
  drawCentred(cv, 'ALSO TODAY: BRAZIL TOWN CLEARS RUBBLE AFTER DEADLY STORM', W / 2, 962, 2, INK);
  drawCentred(cv, '39 MISSING IN INDONESIA FACTORY FIRE - ALCARAZ FACES ZVEREV IN ATP FINAL', W / 2, 984, 2, GREY);
  drawCentred(
    cv,
    'Sources: Dawn/AFP, Arab News/AP and Reuters, AsiaOne, The Times - all stories reported 22 November 2026',
    W / 2,
    1008,
    1,
    GREY,
  );

  return cv;
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), drawFrontPage().toPNG());
}

main();
