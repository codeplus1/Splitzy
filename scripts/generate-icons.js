import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const publicDir = path.resolve('public');

// Colors (RGBA) matching the uploaded circular Splitze icon
const TEAL = [3, 166, 204, 255];      // #03A6CC (Upper-left teal/cyan)
const NAVY = [15, 37, 71, 255];       // #0F2547 (Lower-right deep navy)
const WHITE = [255, 255, 255, 255];   // #FFFFFF (Curve & checkmark right arm)
const SILVER = [214, 221, 230, 255];  // #D6DDE6 (Subtle 3D shading on checkmark left arm)
const TRANSPARENT = [0, 0, 0, 0];

// Signed distance from point (px, py) to segment (ax, ay)-(bx, by)
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

// Point-in-polygon test
function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function blend(c1, c2, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  return [
    Math.round(c1[0] * (1 - a) + c2[0] * a),
    Math.round(c1[1] * (1 - a) + c2[1] * a),
    Math.round(c1[2] * (1 - a) + c2[2] * a),
    Math.round(c1[3] * (1 - a) + c2[3] * a),
  ];
}

// Quadratic bezier evaluation
function evalQuad(p0, p1, p2, t) {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
    mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
  ];
}

// Precompute polyline approximation of the left sweeping curve ribbon
const curveTopPts = [];
const curveBotPts = [];
const STEPS = 60;
for (let i = 0; i <= STEPS; i++) {
  const t = i / STEPS;
  curveTopPts.push(evalQuad([0, 330], [138, 186], [284, 167], t));
  curveBotPts.push(evalQuad([307, 199], [148, 214], [15, 358], t));
}
const leftCurvePoly = [...curveTopPts, ...curveBotPts];

// Upper-left teal region polygon
const tealBoundaryPts = [];
for (let i = 0; i <= STEPS; i++) {
  const t = i / STEPS;
  tealBoundaryPts.push(evalQuad([284, 167], [158, 192], [27, 320], t));
}
const tealPoly = [
  [0, 0],
  [512, 0],
  [512, 135],
  [341, 245],
  ...tealBoundaryPts,
  [0, 348],
];

// Checkmark polygons in 512x512 space
const checkLeftFoldPoly = [
  [276, 216],
  [339, 302],
  [341, 245],
  [308, 202],
];

const checkRightArmPoly = [
  [339, 302],
  [495, 190],
  [474, 159],
  [341, 245],
];

function renderIconPixel(u, v, maskable = false) {
  // Normalize (u, v) to 512x512 coordinate space
  let x = u * 512;
  let y = v * 512;

  if (maskable) {
    // Center inside safe zone (scale 0.82 around 256,256)
    x = (x - 256) / 0.82 + 256;
    y = (y - 256) / 0.82 + 256;
  }

  const distCenter = Math.hypot(x - 256, y - 256);
  const radius = 240;

  if (distCenter > radius + 1.2) {
    return maskable ? WHITE : TRANSPARENT;
  }

  // Base color inside circle: Teal in upper-left, Navy in lower-right
  let color = pointInPoly(x, y, tealPoly) ? TEAL : NAVY;

  // White sweeping left curve
  if (pointInPoly(x, y, leftCurvePoly)) {
    color = WHITE;
  }

  // Checkmark left fold (subtle silver to white gradient)
  if (pointInPoly(x, y, checkLeftFoldPoly)) {
    const t = Math.max(0, Math.min(1, (x - 276) / (341 - 276)));
    color = blend(SILVER, WHITE, t * 0.75);
  }

  // Checkmark right ascending arm (crisp white)
  if (pointInPoly(x, y, checkRightArmPoly)) {
    color = WHITE;
  }

  // Anti-aliased outer circular edge
  if (distCenter > radius - 1.2) {
    const edgeAlpha = Math.max(0, Math.min(1, (radius + 1.2 - distCenter) / 2.4));
    const bg = maskable ? WHITE : TRANSPARENT;
    return blend(bg, color, edgeAlpha);
  }

  return color;
}

// CRC32 table for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function generatePngBuffer(width, height, maskable = false) {
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawData[rowStart] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      // 2x2 supersampling for crisp edges
      let r = 0, g = 0, b = 0, a = 0;
      for (const dx of [0.25, 0.75]) {
        for (const dy of [0.25, 0.75]) {
          const u = (x + dx) / width;
          const v = (y + dy) / height;
          const rgba = renderIconPixel(u, v, maskable);
          r += rgba[0];
          g += rgba[1];
          b += rgba[2];
          a += rgba[3];
        }
      }
      const pxOffset = rowStart + 1 + x * 4;
      rawData[pxOffset] = r >> 2;
      rawData[pxOffset + 1] = g >> 2;
      rawData[pxOffset + 2] = b >> 2;
      rawData[pxOffset + 3] = a >> 2;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idatData = zlib.deflateSync(rawData, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function generateIcoFromPng(pngBuf, size = 32) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = size;
  entry[1] = size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12);

  return Buffer.concat([header, entry, pngBuf]);
}

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-192.png', size: 192, maskable: true },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'pwa-192x192.png', size: 192, maskable: false },
  { file: 'pwa-512x512.png', size: 512, maskable: false },
  { file: 'pwa-maskable-192x192.png', size: 192, maskable: true },
  { file: 'pwa-maskable-512x512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

for (const t of targets) {
  const buf = generatePngBuffer(t.size, t.size, t.maskable);
  fs.writeFileSync(path.join(publicDir, t.file), buf);
  console.log(`Generated ${t.file} (${buf.length} bytes)`);
}

const favPng = generatePngBuffer(32, 32, false);
const icoBuf = generateIcoFromPng(favPng, 32);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuf);
console.log(`Generated favicon.ico (${icoBuf.length} bytes)`);
