import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const publicDir = path.resolve('public');

// Colors (RGBA)
const NAVY_DARK = [11, 20, 32, 255];      // #0B1420
const NAVY_PRIMARY = [16, 29, 45, 255];   // #101D2D
const NAVY_SURFACE = [21, 36, 54, 255];   // #152436
const MINT = [99, 230, 190, 255];         // #63E6BE
const WHITE = [255, 255, 255, 255];       // #FFFFFF
const TRANSPARENT = [0, 0, 0, 0];

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter type None
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distToUpperArc(px, py, cx, cy, r) {
  // Left semicircle x <= cx
  if (px <= cx) {
    return Math.abs(Math.hypot(px - cx, py - cy) - r);
  }
  return Math.min(Math.hypot(px - cx, py - (cy - r)), Math.hypot(px - cx, py - (cy + r)));
}

function distToLowerArc(px, py, cx, cy, r) {
  // Right semicircle x >= cx
  if (px >= cx) {
    return Math.abs(Math.hypot(px - cx, py - cy) - r);
  }
  return Math.min(Math.hypot(px - cx, py - (cy - r)), Math.hypot(px - cx, py - (cy + r)));
}

function blendPixel(buf, idx, color, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  buf[idx] = Math.round(buf[idx] * (1 - a) + color[0] * a);
  buf[idx + 1] = Math.round(buf[idx + 1] * (1 - a) + color[1] * a);
  buf[idx + 2] = Math.round(buf[idx + 2] * (1 - a) + color[2] * a);
  buf[idx + 3] = 255;
}

function renderSplitzeIcon(size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / 512;
  const contentScale = maskable ? 0.78 : 1.0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / scale;
      const ny = y / scale;

      // Squircle mask check for non-maskable
      if (!maskable) {
        const margin = 8;
        const radius = 120;
        const innerMin = margin + radius;
        const innerMax = 512 - margin - radius;
        let dx = 0;
        let dy = 0;
        if (nx < innerMin) dx = innerMin - nx;
        else if (nx > innerMax) dx = nx - innerMax;
        if (ny < innerMin) dy = innerMin - ny;
        else if (ny > innerMax) dy = ny - innerMax;
        const cornerDist = Math.hypot(dx, dy);
        if (nx < margin || nx > 512 - margin || ny < margin || ny > 512 - margin || cornerDist > radius) {
          buf[idx] = TRANSPARENT[0];
          buf[idx + 1] = TRANSPARENT[1];
          buf[idx + 2] = TRANSPARENT[2];
          buf[idx + 3] = TRANSPARENT[3];
          continue;
        }
      }

      // Navy gradient background (#152436 -> #101D2D -> #0B1420)
      const gradT = (nx + ny) / 1024;
      buf[idx] = Math.round(NAVY_SURFACE[0] * (1 - gradT) + NAVY_DARK[0] * gradT);
      buf[idx + 1] = Math.round(NAVY_SURFACE[1] * (1 - gradT) + NAVY_DARK[1] * gradT);
      buf[idx + 2] = Math.round(NAVY_SURFACE[2] * (1 - gradT) + NAVY_DARK[2] * gradT);
      buf[idx + 3] = 255;

      // Transform to emblem space
      const ex = (nx - 256) / contentScale + 256;
      const ey = (ny - 256) / contentScale + 256;

      const strokeRadius = 26;

      // Upper Split S Ribbon (Mint Green #63E6BE)
      const dTopLine = distToSegment(ex, ey, 204, 128, 344, 128);
      const dMidTopLine = distToSegment(ex, ey, 204, 244, 304, 244);
      const dTopArc = distToUpperArc(ex, ey, 204, 186, 58);
      const dTopArrow1 = distToSegment(ex, ey, 312, 96, 352, 128);
      const dTopArrow2 = distToSegment(ex, ey, 312, 160, 352, 128);
      const dUpper = Math.min(dTopLine, dMidTopLine, dTopArc, dTopArrow1, dTopArrow2);

      if (dUpper <= strokeRadius + 1.5) {
        const alpha = Math.max(0, Math.min(1, strokeRadius + 1 - dUpper));
        blendPixel(buf, idx, MINT, alpha);
      }

      // Lower Even S Ribbon (White #FFFFFF)
      const dBotLine = distToSegment(ex, ey, 168, 384, 308, 384);
      const dMidBotLine = distToSegment(ex, ey, 208, 268, 308, 268);
      const dBotArc = distToLowerArc(ex, ey, 308, 326, 58);
      const dBotArrow1 = distToSegment(ex, ey, 200, 352, 160, 384);
      const dBotArrow2 = distToSegment(ex, ey, 200, 416, 160, 384);
      const dLower = Math.min(dBotLine, dMidBotLine, dBotArc, dBotArrow1, dBotArrow2);

      if (dLower <= strokeRadius + 1.5) {
        const alpha = Math.max(0, Math.min(1, strokeRadius + 1 - dLower));
        blendPixel(buf, idx, WHITE, alpha);
      }

      // Center Equilibrium Mint Dot
      const dCenterDot = Math.hypot(ex - 256, ey - 256);
      if (dCenterDot <= 14) {
        const alpha = Math.max(0, Math.min(1, 14 - dCenterDot));
        blendPixel(buf, idx, MINT, alpha);
      }
    }
  }

  return encodePNG(size, size, buf);
}

function generate() {
  console.log('Generating Splitze PWA & favicon icons...');

  fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), renderSplitzeIcon(192, false));
  console.log('✔ Generated pwa-192x192.png');

  fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), renderSplitzeIcon(512, false));
  console.log('✔ Generated pwa-512x512.png');

  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), renderSplitzeIcon(180, false));
  console.log('✔ Generated apple-touch-icon.png');

  fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), renderSplitzeIcon(512, true));
  console.log('✔ Generated pwa-maskable-512x512.png');

  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), renderSplitzeIcon(64, false));
  console.log('✔ Generated favicon.ico');

  console.log('All Splitze icons generated successfully!');
}

generate();
