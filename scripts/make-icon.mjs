// Generates public/icon.png (512x512) — a white shopping bag with a check mark
// on the app's green, drawn with simple signed-distance primitives. Pure Node,
// no native deps, so it runs anywhere. Re-run with: node scripts/make-icon.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const S = 512;
const buf = Buffer.alloc(S * S * 4);

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const GREEN_TOP = hex("#34d65f");
const GREEN_BOT = hex("#1fae47");
const WHITE = [255, 255, 255];

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);

// rounded-rect signed distance (negative inside)
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    let r = 0,
      g = 0,
      b = 0,
      a = 0;

    // app-tile background with rounded corners + vertical gradient
    const bg = sdRoundRect(x, y, S / 2, S / 2, S / 2, S / 2, 112);
    const bgA = smooth(1, -1, bg);
    if (bgA > 0) {
      const grad = mix(GREEN_TOP, GREEN_BOT, y / S);
      [r, g, b] = grad;
      a = bgA;
    }

    // shopping bag body (rounded rect), white
    const bodyHw = 118,
      bodyHh = 120;
    const cx = S / 2,
      cy = 300;
    const body = sdRoundRect(x, y, cx, cy, bodyHw, bodyHh, 34);
    const bodyA = smooth(1.5, -1.5, body);

    // bag handle: an arc approximated by a ring segment above the body
    const handleR = 70;
    const hd = Math.abs(Math.hypot(x - cx, y - 188) - handleR);
    const handleA = y < 196 ? smooth(15, 11, hd) : 0;

    const bagA = Math.max(bodyA, handleA);
    if (bagA > 0) {
      [r, g, b] = mix([r, g, b], WHITE, bagA);
      a = Math.max(a, bagA);
    }

    // green check mark inside the bag
    const c1 = sdSegment(x, y, cx - 58, cy + 6, cx - 14, cy + 50);
    const c2 = sdSegment(x, y, cx - 14, cy + 50, cx + 60, cy - 40);
    const checkD = Math.min(c1, c2);
    const checkA = smooth(15, 11, checkD) * bodyA;
    if (checkA > 0) {
      const grad = mix(GREEN_TOP, GREEN_BOT, y / S);
      [r, g, b] = mix([r, g, b], grad, checkA);
    }

    buf[i] = Math.round(r);
    buf[i + 1] = Math.round(g);
    buf[i + 2] = Math.round(b);
    buf[i + 3] = Math.round(a * 255);
  }
}

// --- encode PNG (RGBA, 8-bit) ---
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0, 0);
  return Buffer.concat([len, td, crc]);
}
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++)
    c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
// scanlines with filter byte 0
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "icon.png",
);
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
