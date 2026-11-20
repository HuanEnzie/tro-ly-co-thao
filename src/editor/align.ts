/**
 * Ánh xạ đoạn <p> mà docx-preview vẽ ra ↔ thứ tự <w:p> trong document.xml (thuần, chạy được Node).
 *
 * Thường hai danh sách dài bằng nhau và cùng thứ tự (docx-preview vẽ mỗi <w:p> thành một <p>, kể cả đoạn
 * trống, đoạn trong ô bảng và bảng lồng). Khi lệch (vd đoạn trong hộp văn bản, nội dung thay thế) thì khớp theo
 * chữ bằng dãy con chung dài nhất, đoạn còn lại ghép theo vị trí trong cùng khoảng.
 */

const norm = (s: string) => s.normalize('NFC').replace(/[\s ​]+/g, '');

/** với mỗi đoạn trong model: chỉ số <p> trong DOM tương ứng, hoặc -1 nếu không có */
export function alignParas(domTexts: string[], modelTexts: string[]): number[] {
  const a = modelTexts.map(norm), b = domTexts.map(norm);
  const n = a.length, m = b.length;
  if (n === m && a.every((x, i) => x === b[i])) return a.map((_, i) => i);
  const map = new Array<number>(n).fill(-1);
  if ((n + 1) * (m + 1) <= 8_000_000) {
    const W = m + 1;
    const dp = new Int32Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i * W + j] = a[i] === b[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { map[i++] = j++; }
      else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++;
      else j++;
    }
  } else if (n === m) return a.map((_, i) => i);
  // đoạn chưa khớp: ghép theo vị trí trong khoảng giữa hai mốc đã khớp
  let prevM = -1, prevD = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && map[i] < 0) continue;
    const nextD = i < n ? map[i] : m;
    const mi: number[] = [];
    for (let k = prevM + 1; k < i; k++) mi.push(k);
    const di: number[] = [];
    for (let k = prevD + 1; k < nextD; k++) di.push(k);
    for (let k = 0; k < Math.min(mi.length, di.length); k++) map[mi[k]] = di[k];
    prevM = i; prevD = nextD;
  }
  return map;
}

/** số đoạn khớp đúng chữ trên tổng (để báo độ khớp) */
export function alignStats(domTexts: string[], modelTexts: string[]) {
  const map = alignParas(domTexts, modelTexts);
  let exact = 0, mapped = 0;
  map.forEach((d, i) => {
    if (d < 0) return;
    mapped++;
    if (norm(domTexts[d]) === norm(modelTexts[i])) exact++;
  });
  return { model: modelTexts.length, dom: domTexts.length, mapped, exact, identity: map.every((d, i) => d === i) };
}
