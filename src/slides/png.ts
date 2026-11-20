/**
 * Bộ ghi PNG tối thiểu (không nén, không cần zlib) — chạy được cả trên trình duyệt và Node.
 * Dùng tạo biểu tượng nhạc và hình giả khi kiểm thử.
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function adler32(buf: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) { a = (a + buf[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function chunk(type: string, data: Uint8Array): number[] {
  const td = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) td[i] = type.charCodeAt(i);
  td.set(data, 4);
  return [...u32(data.length), ...td, ...u32(crc32(td))];
}

/** Tạo PNG RGBA. `px(x,y)` trả [r,g,b,a] 0–255. */
export function makePng(w: number, h: number, px: (x: number, y: number) => [number, number, number, number]): Uint8Array {
  const raw = new Uint8Array(h * (1 + w * 4));
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) { const p = px(x, y); raw[o++] = p[0]; raw[o++] = p[1]; raw[o++] = p[2]; raw[o++] = p[3]; }
  }
  // zlib "stored" blocks
  const z: number[] = [0x78, 0x01];
  for (let i = 0; i < raw.length; i += 65535) {
    const len = Math.min(65535, raw.length - i);
    const last = i + len >= raw.length ? 1 : 0;
    z.push(last, len & 255, len >>> 8, ~len & 255, (~len >>> 8) & 255);
    for (let k = 0; k < len; k++) z.push(raw[i + k]);
  }
  z.push(...u32(adler32(raw)));
  const ihdr = new Uint8Array([...u32(w), ...u32(h), 8, 6, 0, 0, 0]);
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', ihdr), ...chunk('IDAT', new Uint8Array(z)), ...chunk('IEND', new Uint8Array(0)),
  ]);
}

export function toBase64(u8: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Biểu tượng nhạc: nền tròn vàng + nốt nhạc nâu. */
export function musicIconPng(): Uint8Array {
  const S = 96;
  return makePng(S, S, (x, y) => {
    const dx = x - S / 2, dy = y - S / 2;
    if (dx * dx + dy * dy > (S / 2 - 2) ** 2) return [0, 0, 0, 0];
    const head = (x - 38) ** 2 + (y - 66) ** 2 < 11 * 11;
    const stem = x >= 47 && x <= 52 && y >= 22 && y <= 66;
    const flag = x >= 52 && x <= 68 && y >= 22 && y <= 34 + (x - 52) * 0.9;
    if (head || stem || flag) return [93, 58, 0, 255];
    return [242, 158, 2, 255];
  });
}

export type Shape = 'circle' | 'square' | 'triangle' | 'star' | 'tall';
/** Hình giả cho kiểm thử: hình khối tô một màu, nền trong suốt. */
export function fakePng(shape: Shape, rgb: [number, number, number], w = 160, h = 160): Uint8Array {
  return makePng(w, h, (x, y) => {
    const nx = (x + 0.5) / w - 0.5, ny = (y + 0.5) / h - 0.5;
    let inside = false;
    if (shape === 'circle') inside = nx * nx + ny * ny < 0.23 * 0.23 + 0.02;
    else if (shape === 'square' || shape === 'tall') inside = Math.abs(nx) < 0.42 && Math.abs(ny) < 0.42;
    else if (shape === 'triangle') inside = ny > -0.4 && ny < 0.42 && Math.abs(nx) < (ny + 0.4) * 0.55;
    else inside = Math.abs(nx) + Math.abs(ny) < 0.45 || (Math.abs(nx) < 0.1 && Math.abs(ny) < 0.48) || (Math.abs(ny) < 0.1 && Math.abs(nx) < 0.48);
    return inside ? [rgb[0], rgb[1], rgb[2], 255] : [0, 0, 0, 0];
  });
}
