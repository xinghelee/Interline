// 生成扩展 icon:棕底 + 三条文本行(中间短行 = 长在行间的译文)
// 零依赖:手写 PNG 编码(zlib 是 Node 内置),4x 超采样抗锯齿
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BG = [0x7c, 0x5c, 0x3e];
const PAPER = [0xf6, 0xef, 0xe4];
const GOLD = [0xe9, 0xc0, 0x88];
const SIZES = [16, 32, 48, 128];
const SS = 4; // 超采样倍数

// 圆角矩形内部判定
function inRoundRect(px, py, rx, ry, w, h, r) {
  const cx = rx + w / 2;
  const cy = ry + h / 2;
  const dx = Math.max(Math.abs(px - cx) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(py - cy) - (h / 2 - r), 0);
  return dx * dx + dy * dy <= r * r;
}

function renderIcon(size) {
  const S = size * SS;
  const bars = [
    { y: 0.32, w: 0.64, color: PAPER },
    { y: 0.5, w: 0.46, color: GOLD },
    { y: 0.68, w: 0.64, color: PAPER },
  ];
  const barH = S * 0.115;
  const left = S * 0.18;

  const px = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const cx = x + 0.5;
      const cy = y + 0.5;
      if (!inRoundRect(cx, cy, 0, 0, S, S, S * 0.22)) continue; // 透明角
      let color = BG;
      for (const b of bars) {
        if (inRoundRect(cx, cy, left, S * b.y - barH / 2, S * b.w, barH, barH / 2)) {
          color = b.color;
        }
      }
      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = 255;
    }
  }

  // 盒式下采样回目标尺寸
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + x * SS + sx) * 4;
          acc[0] += px[i];
          acc[1] += px[i + 1];
          acc[2] += px[i + 2];
          acc[3] += px[i + 3];
        }
      }
      const o = (y * size + x) * 4;
      const n = SS * SS;
      out[o] = acc[0] / n;
      out[o + 1] = acc[1] / n;
      out[o + 2] = acc[2] / n;
      out[o + 3] = acc[3] / n;
    }
  }
  return encodePng(size, size, out);
}

// ---- 最小 PNG 编码器 ----

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (1 + w * 4) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("src/assets/icons", { recursive: true });
for (const size of SIZES) {
  const file = `src/assets/icons/icon${size}.png`;
  writeFileSync(file, renderIcon(size));
  console.log(`${file} ✓`);
}
