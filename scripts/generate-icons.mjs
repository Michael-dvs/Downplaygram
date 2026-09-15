import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCrcTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const toCrc = buf.subarray(4, 8 + len);
  const chunkCrc = crc32(toCrc);
  buf.writeUInt32BE(chunkCrc, 8 + len);
  return buf;
}

function createPng(width, height, drawFn) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10); // Compression
  ihdr.writeUInt8(0, 11); // Filter
  ihdr.writeUInt8(0, 12); // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw image data: height rows, each starting with filter byte 0x00, followed by width * 4 bytes (RGBA)
  const rowStride = 1 + width * 4;
  const raw = Buffer.alloc(height * rowStride);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    raw[rowOffset] = 0; // Filter: none
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(raw);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Icon design: Modern purple-to-indigo gradient with rounded corners and download arrow / ghost shape
function drawIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const r = w / 2;

  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background circle / rounded squircle
  if (dist > r - 0.5) {
    return [0, 0, 0, 0]; // transparent
  }

  // Gradient: Deep violet (#7c3aed) to Indigo (#4f46e5)
  const gradT = (x + y) / (w + h);
  let red = Math.round(124 * (1 - gradT) + 79 * gradT);
  let green = Math.round(58 * (1 - gradT) + 70 * gradT);
  let blue = Math.round(237 * (1 - gradT) + 229 * gradT);
  let alpha = 255;

  // Anti-aliasing at the border
  if (dist > r - 1.5) {
    alpha = Math.round(255 * (r - dist));
  }

  // Draw download arrow in center
  // Normalized coords [-1, 1]
  const nx = (x - cx) / (w * 0.45);
  const ny = (y - cy) / (h * 0.45);

  // Arrow shaft: |nx| <= 0.22 and -0.6 <= ny <= 0.1
  const isShaft = Math.abs(nx) <= 0.22 && ny >= -0.55 && ny <= 0.15;
  // Arrow head: triangle pointing down
  const isHead = ny >= 0.1 && ny <= 0.65 && Math.abs(nx) <= (0.65 - ny);
  // Base bar: -0.5 <= nx <= 0.5 and 0.55 <= ny <= 0.75
  const isBar = Math.abs(nx) <= 0.6 && ny >= 0.55 && ny <= 0.75;

  if (isShaft || isHead || isBar) {
    return [255, 255, 255, 255];
  }

  return [red, green, blue, alpha];
}

const iconsDir = path.resolve('public/icons');
fs.mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const pngBuf = createPng(size, size, drawIcon);
  const outPath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, pngBuf);
  console.log(`Generated ${outPath} (${size}x${size}, ${pngBuf.length} bytes)`);
}
