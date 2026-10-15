import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, colorFn) {
  // colorFn(x, y) returns [r, g, b, a] (0-255)
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = colorFn(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // CRC32 table
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crcBuf = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    buf.writeUInt32BE(crc32(crcBuf), 8 + len);
    return buf;
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA color type
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// 1. App icon (black background with crisp white open book / research glyph)
function appIconColor(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const r = w * 0.45;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Rounded rectangle icon background (dark sleek e-ink theme: near-black #121212)
  const pad = w * 0.08;
  const rx = Math.max(0, Math.abs(dx) - (w / 2 - pad - 12));
  const ry = Math.max(0, Math.abs(dy) - (h / 2 - pad - 12));
  const cornerDist = Math.sqrt(rx * rx + ry * ry);
  const isInsideBg = cornerDist <= 12 && Math.abs(dx) <= (w / 2 - pad) && Math.abs(dy) <= (h / 2 - pad);

  if (!isInsideBg) {
    return [0, 0, 0, 0]; // transparent outside rounded card
  }

  // Draw open book / paper symbol in center
  const nx = (x - cx) / (w * 0.35); // -1 to 1
  const ny = (y - cy) / (h * 0.35); // -1 to 1

  // Book pages
  const isLeftPage = nx >= -0.85 && nx <= -0.08 && ny >= -0.65 && ny <= 0.65;
  const isRightPage = nx >= 0.08 && nx <= 0.85 && ny >= -0.65 && ny <= 0.65;
  // Center spine gap
  const isSpine = Math.abs(nx) < 0.08;

  // Horizontal text lines on pages
  const lineY1 = ny >= -0.45 && ny <= -0.38;
  const lineY2 = ny >= -0.22 && ny <= -0.15;
  const lineY3 = ny >= 0.01 && ny <= 0.08;
  const lineY4 = ny >= 0.24 && ny <= 0.31;
  const lineY5 = ny >= 0.47 && ny <= 0.54;
  const isTextLine = (lineY1 || lineY2 || lineY3 || lineY4 || lineY5) && (
    (nx >= -0.75 && nx <= -0.2) || (nx >= 0.2 && nx <= 0.75)
  );

  if (isLeftPage || isRightPage) {
    if (isTextLine) {
      return [30, 30, 30, 255]; // Dark grey lines on page
    }
    return [245, 245, 245, 255]; // Off-white page paper
  }

  return [18, 18, 18, 255]; // #121212 background card
}

// 2. Android Monochrome Badge (white shape on transparent background)
function badgeIconColor(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const nx = (x - cx) / (w * 0.4);
  const ny = (y - cy) / (h * 0.4);

  // Open book outline/silhouette for status bar
  const isBook = (
    ((nx >= -0.85 && nx <= -0.1) || (nx >= 0.1 && nx <= 0.85)) &&
    (ny >= -0.7 && ny <= 0.7)
  );

  // Hollow out lines so it's a stencil
  const line1 = ny >= -0.35 && ny <= -0.2 && ((nx >= -0.75 && nx <= -0.2) || (nx >= 0.2 && nx <= 0.75));
  const line2 = ny >= 0.05 && ny <= 0.2 && ((nx >= -0.75 && nx <= -0.2) || (nx >= 0.2 && nx <= 0.75));
  const line3 = ny >= 0.45 && ny <= 0.6 && ((nx >= -0.75 && nx <= -0.2) || (nx >= 0.2 && nx <= 0.75));

  if (isBook && !line1 && !line2 && !line3) {
    return [255, 255, 255, 255]; // Pure white silhouette
  }
  return [0, 0, 0, 0]; // Transparent
}

const publicDir = path.resolve('public');
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPNG(192, 192, appIconColor));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPNG(512, 512, appIconColor));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPNG(180, 180, appIconColor));
fs.writeFileSync(path.join(publicDir, 'badge-96x96.png'), createPNG(96, 96, badgeIconColor));

console.log('Successfully generated PWA icons and Android badge icon in public/');
