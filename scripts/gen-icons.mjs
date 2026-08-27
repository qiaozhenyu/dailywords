/* ============================================================
   gen-icons.mjs — 生成 PWA 图标（零依赖：Node 内置 zlib 手写 PNG 编码）
   设计：靛蓝圆角底 + 白色「文字行」三条（单词卡片意象）+ 绿点
   输出：app/icons/icon.svg, icon-180.png, icon-192.png, icon-512.png
   用法：node scripts/gen-icons.mjs
   ============================================================ */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "app", "icons");

const BG = [78, 128, 238]; // #4e80ee Earthworm 蓝
const WHITE = [255, 255, 255];
const GREEN = [34, 197, 94]; // #22c55e

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, draw) {
  // RGBA 像素
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = draw(x, y, size);
      const i = (y * size + x) * 4;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = c[3] === undefined ? 255 : c[3];
    }
  }
  // 每行前加 filter 字节 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// 圆角矩形内点判断
function insideRoundRect(x, y, size, r) {
  const inset = size * 0.08;
  const w = size - inset * 2;
  const rx = x - inset;
  const ry = y - inset;
  if (rx < 0 || ry < 0 || rx >= w || ry >= w) return false;
  const cx = Math.min(Math.max(rx, r), w - r);
  const cy = Math.min(Math.max(ry, r), w - r);
  const dx = rx - cx;
  const dy = ry - cy;
  return dx * dx + dy * dy <= r * r;
}

function drawIcon(x, y, size) {
  const S = size;
  const r = S * 0.2;
  // 背景圆角方块
  if (!insideRoundRect(x + 0.5, y + 0.5, S, r)) return [0, 0, 0, 0];

  // 内容区（安全区：中心 60%）
  const cx = S / 2;
  const barW = (S) => S * 0.56;
  const barH = S * 0.075;
  const gap = S * 0.085;
  const barTop = S * 0.34;

  // 三条白色文字行（宽度递减，模拟单词卡片）
  const widths = [barW(S), barW(S) * 0.72, barW(S) * 0.5];
  for (let i = 0; i < 3; i++) {
    const bx0 = cx - widths[i] / 2;
    const bx1 = cx + widths[i] / 2;
    const by0 = barTop + i * (barH + gap);
    const by1 = by0 + barH;
    if (x >= bx0 && x < bx1 && y >= by0 && y < by1) {
      return WHITE;
    }
  }

  // 右下角绿色圆点
  const dotC = S * 0.78;
  const dotR = S * 0.09;
  const dx = x + 0.5 - dotC;
  const dy = y + 0.5 - dotC;
  if (dx * dx + dy * dy <= dotR * dotR) return GREEN;

  return BG;
}

function svgIcon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <clipPath id="r"><rect x="${size * 0.08}" y="${size * 0.08}" width="${size * 0.84}" height="${size * 0.84}" rx="${size * 0.2}"/></clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="${size}" height="${size}" fill="#4e80ee"/>
    <rect x="${size * 0.22}" y="${size * 0.34}" width="${size * 0.56}" height="${size * 0.075}" rx="${size * 0.037}" fill="#ffffff"/>
    <rect x="${size * 0.30}" y="${size * 0.50}" width="${size * 0.40}" height="${size * 0.075}" rx="${size * 0.037}" fill="#ffffff"/>
    <rect x="${size * 0.36}" y="${size * 0.66}" width="${size * 0.28}" height="${size * 0.075}" rx="${size * 0.037}" fill="#ffffff"/>
    <circle cx="${size * 0.78}" cy="${size * 0.78}" r="${size * 0.09}" fill="#22c55e"/>
  </g>
</svg>
`;
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "icon.svg"), svgIcon(512));
for (const s of [180, 192, 512]) {
  writeFileSync(join(OUT_DIR, `icon-${s}.png`), encodePng(s, drawIcon));
  console.log(`[gen-icons] icon-${s}.png 已生成`);
}
console.log("[gen-icons] icon.svg 已生成 ✅");
