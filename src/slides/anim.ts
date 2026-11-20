/**
 * Gắn hiệu ứng vào .pptx do pptxgenjs xuất — chạy trên trình duyệt (JSZip, không dùng fs).
 * Chuyển từ skill-slide-mam-non/scripts/build/anim.js. Luật của cô:
 *  - chỉ 2 nút tới/lui: mọi hiệu ứng thuộc nhóm "tới" (c:true mở nhóm mới), không hyperlink/nút bấm;
 *  - nhạc phát bằng "tới" SAU hình (cmd playMusic), "tới" nữa dừng (stopMusic), "tới" nữa sang slide.
 * Không dùng âm thanh hiệu ứng (SFX) và không có nút bật/tắt nhạc bằng chuột.
 */
import JSZip from 'jszip';

export type EntrName = 'fade' | 'appear' | 'wipe' | 'zoom' | 'pop' | 'spin' | 'flyT' | 'flyB' | 'flyL' | 'flyR';
export type LoopName = 'bob' | 'drift' | 'across' | 'spin' | 'pulse' | 'wiggle';

export interface Fx {
  /** tên shape (cNvPr name) */
  n?: string;
  /** hiệu ứng vào */
  e?: EntrName; d?: number; t?: number;
  /** true = bắt đầu một nhóm "tới" mới */
  c?: boolean;
  /** thoát (đáp án sai) */
  x?: boolean; xt?: number; xd?: number;
  /** nhấn mạnh phóng to (đáp án đúng), kèm đường đi tuỳ chọn */
  g?: { t?: number; pct?: number; dx?: number; dy?: number }; gd?: number;
  /** lặp */
  l?: LoopName; lo?: { amp?: number; t?: number; dy?: number; from?: number; to?: number }; ld?: number;
  /** lệnh nhạc */
  cmd?: 'playMusic' | 'stopMusic';
}

export type TransName = 'fade' | 'ripple' | 'vortex' | 'curtains';
export interface SlideMotion {
  fx: Fx[];
  trans?: TransName;
  music?: { vol?: number; once?: boolean };
}

const NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const NS_P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main';
const NS_P15 = 'http://schemas.microsoft.com/office/powerpoint/2012/main';

const TRANS: Record<TransName, { ns: string; el: string; dur: number }> = {
  fade: { ns: 'p14', el: '<p:fade/>', dur: 700 },
  ripple: { ns: 'p14', el: '<p14:ripple/>', dur: 1200 },
  vortex: { ns: 'p14', el: '<p14:vortex dir="r"/>', dur: 1800 },
  curtains: { ns: 'p15', el: '<p15:prstTrans prst="curtains"/>', dur: 2000 },
};
export function transitionXml(name: TransName): string {
  const t = TRANS[name];
  if (name === 'fade') return '<p:transition spd="med"><p:fade/></p:transition>';
  return `<mc:AlternateContent xmlns:mc="${NS_MC}"><mc:Choice xmlns:p14="${NS_P14}" xmlns:p15="${NS_P15}" Requires="${t.ns}">` +
    `<p:transition spd="slow" p14:dur="${t.dur}">${t.el}</p:transition></mc:Choice>` +
    '<mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>';
}

interface TimingOpt { musicSpid?: string; musicVol?: number; musicOnce?: boolean }

/** Sinh cây <p:timing>. idOf: tên → spid; isSp: shape (true) hay ảnh/media (false) */
export function buildTiming(effects: Fx[], idOf: (n: string) => string | undefined, isSp: (n: string) => boolean, opt: TimingOpt = {}): string {
  let id = 2;
  const nid = () => ++id;
  const tgt = (s: string) => `<p:tgtEl><p:spTgt spid="${s}"/></p:tgtEl>`;
  const attrs = (...a: string[]) => `<p:attrNameLst>${a.map(x => `<p:attrName>${x}</p:attrName>`).join('')}</p:attrNameLst>`;
  const vis = (s: string) => `<p:set><p:cBhvr><p:cTn id="${nid()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${tgt(s)}${attrs('style.visibility')}</p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
  const anim = (s: string, attr: string, dur: number, kf: [number, string][], extra = '') =>
    `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${nid()}" dur="${dur}" fill="hold"${extra}/>${tgt(s)}${attrs(attr)}</p:cBhvr><p:tavLst>` +
    kf.map(([tm, v]) => `<p:tav tm="${tm}"><p:val><p:strVal val="${v}"/></p:val></p:tav>`).join('') + '</p:tavLst></p:anim>';
  const fade = (s: string, dur: number) => `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${nid()}" dur="${dur}"/>${tgt(s)}</p:cBhvr></p:animEffect>`;
  const wipe = (s: string, dur: number) => `<p:animEffect transition="in" filter="wipe(left)"><p:cBhvr><p:cTn id="${nid()}" dur="${dur}"/>${tgt(s)}</p:cBhvr></p:animEffect>`;
  const rot = (s: string, by: number, dur: number, extra = '') => `<p:animRot by="${by}"><p:cBhvr><p:cTn id="${nid()}" dur="${dur}" fill="hold"${extra}/>${tgt(s)}${attrs('r')}</p:cBhvr></p:animRot>`;
  const motion = (s: string, path: string, dur: number, extra = '') => `<p:animMotion origin="layout" path="${path}" pathEditMode="relative"><p:cBhvr><p:cTn id="${nid()}" dur="${dur}" fill="hold"${extra}/>${tgt(s)}${attrs('ppt_x', 'ppt_y')}</p:cBhvr></p:animMotion>`;
  const scale = (s: string, pct: number, dur: number, extra = '') => `<p:animScale><p:cBhvr><p:cTn id="${nid()}" dur="${dur}" fill="hold"${extra}/>${tgt(s)}</p:cBhvr><p:by x="${pct}" y="${pct}"/></p:animScale>`;

  const overshoot = (from: string, to: string, sign: '+' | '-'): [number, string][] =>
    [[0, from], [72000, `${to}${sign}0.02`], [88000, `${to}${sign === '+' ? '-' : '+'}0.006`], [100000, to]];
  const bounceIn = (from: string, to: string): [number, string][] =>
    [[0, from], [62000, to], [76000, `${to}-0.025`], [88000, to], [94000, `${to}-0.008`], [100000, to]];
  const wh = (s: string, t: number) => anim(s, 'ppt_w', t, [[0, '0'], [100000, '#ppt_w']]) + anim(s, 'ppt_h', t, [[0, '0'], [100000, '#ppt_h']]);
  const ENTR: Record<EntrName, [number, number, (s: string, t: number) => string]> = {
    fade: [10, 0, (s, t) => vis(s) + fade(s, t)],
    appear: [1, 0, s => vis(s)],
    wipe: [22, 8, (s, t) => vis(s) + wipe(s, t)],
    zoom: [53, 16, (s, t) => vis(s) + wh(s, t) + fade(s, t)],
    pop: [53, 16, (s, t) => {
      const k = (p: string): [number, string][] => [[0, '0'], [60000, `#${p}*1.15`], [82000, `#${p}*0.94`], [100000, `#${p}`]];
      return vis(s) + anim(s, 'ppt_w', t, k('ppt_w')) + anim(s, 'ppt_h', t, k('ppt_h')) + fade(s, Math.round(t * 0.4));
    }],
    spin: [31, 0, (s, t) => vis(s) + wh(s, t) + rot(s, 21600000, t) + fade(s, Math.round(t * 0.5))],
    flyT: [2, 1, (s, t) => vis(s) + anim(s, 'ppt_x', t, [[0, '#ppt_x'], [100000, '#ppt_x']]) + anim(s, 'ppt_y', t, bounceIn('0-#ppt_h/2', '#ppt_y'))],
    flyB: [2, 4, (s, t) => vis(s) + anim(s, 'ppt_x', t, [[0, '#ppt_x'], [100000, '#ppt_x']]) + anim(s, 'ppt_y', t, overshoot('1+#ppt_h/2', '#ppt_y', '-'))],
    flyL: [2, 8, (s, t) => vis(s) + anim(s, 'ppt_x', t, overshoot('0-#ppt_w/2', '#ppt_x', '+')) + anim(s, 'ppt_y', t, [[0, '#ppt_y'], [100000, '#ppt_y']])],
    flyR: [2, 2, (s, t) => vis(s) + anim(s, 'ppt_x', t, overshoot('1+#ppt_w/2', '#ppt_x', '-')) + anim(s, 'ppt_y', t, [[0, '#ppt_y'], [100000, '#ppt_y']])],
  };
  const SMOOTH = ' accel="50000" decel="50000" autoRev="1"';
  type LO = NonNullable<Fx['lo']>;
  const LOOP: Record<LoopName, [string, number, string, (s: string, o: LO) => string]> = {
    bob: ['path', 0, SMOOTH, (s, o) => motion(s, `M 0 0 L 0 -${o.amp || 0.018} E`, o.t || 900)],
    drift: ['path', 0, SMOOTH, (s, o) => motion(s, `M 0 0 L ${o.amp || 0.03} ${o.dy || 0} E`, o.t || 3500)],
    across: ['path', 0, '', (s, o) => motion(s, `M ${o.from} 0 L ${o.to} ${o.dy || 0} E`, o.t || 9000)],
    spin: ['emph', 8, '', (s, o) => rot(s, 21600000, o.t || 14000)],
    pulse: ['emph', 6, SMOOTH, (s, o) => scale(s, o.amp || 107000, o.t || 700)],
    wiggle: ['emph', 8, SMOOTH, (s, o) => rot(s, o.amp || 420000, o.t || 260)],
  };

  const M = opt.musicSpid;
  const mediaCall = (cmd: string, preset: number, node: string) =>
    `<p:par><p:cTn id="${nid()}" presetID="${preset}" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="${node}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:cmd type="call" cmd="${cmd}"><p:cBhvr><p:cTn id="${nid()}" dur="1" fill="hold"/>${tgt(M!)}</p:cBhvr></p:cmd></p:childTnLst></p:cTn></p:par>`;

  // hiệu ứng c:true mở nhóm "tới" mới; mọi thứ trước nhóm đầu tự chạy khi vào slide
  const groups: Fx[][] = [[]];
  for (const e of effects) {
    if (e.c) groups.push([]);
    groups[groups.length - 1].push(e);
  }
  const bld = new Set<string>();

  function buildPars(list: Fx[], isClick: boolean): string[] {
    const pars: string[] = [];
    let first = true;
    const node = () => { const n = isClick && first ? 'clickEffect' : 'withEffect'; first = false; return n; };
    for (const e of list) {
      if (e.cmd === 'playMusic') {
        if (!M) throw new Error('playMusic cần shape nhạc "bgmusic"');
        pars.push(mediaCall('playFrom(0.0)', 1, node()));
        continue;
      }
      if (e.cmd === 'stopMusic') {
        if (!M) throw new Error('stopMusic cần shape nhạc "bgmusic"');
        pars.push(mediaCall('stop', 2, node()));
        continue;
      }
      const s = idOf(e.n!);
      if (s == null) throw new Error('thiếu shape ' + e.n);
      const sp = isSp(e.n!);
      if (e.e) {
        const [pid, sub, fn] = ENTR[e.e];
        const t = e.t || 800, cid = nid();
        pars.push(`<p:par><p:cTn id="${cid}" presetID="${pid}" presetClass="entr" presetSubtype="${sub}" fill="hold" grpId="0" nodeType="${node()}"><p:stCondLst><p:cond delay="${e.d || 0}"/></p:stCondLst><p:childTnLst>${fn(s, t)}</p:childTnLst></p:cTn></p:par>`);
        if (sp) bld.add(`<p:bldP spid="${s}" grpId="0" animBg="1"/>`);
      }
      if (e.x) {
        const t = e.xt || 500, cid = nid();
        const body = `<p:animEffect transition="out" filter="fade"><p:cBhvr><p:cTn id="${nid()}" dur="${t}"/>${tgt(s)}</p:cBhvr></p:animEffect>` +
          `<p:set><p:cBhvr><p:cTn id="${nid()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${t - 1}"/></p:stCondLst></p:cTn>${tgt(s)}${attrs('style.visibility')}</p:cBhvr><p:to><p:strVal val="hidden"/></p:to></p:set>`;
        pars.push(`<p:par><p:cTn id="${cid}" presetID="10" presetClass="exit" presetSubtype="0" fill="hold" grpId="2" nodeType="${node()}"><p:stCondLst><p:cond delay="${e.xd || 0}"/></p:stCondLst><p:childTnLst>${body}</p:childTnLst></p:cTn></p:par>`);
        if (sp) bld.add(`<p:bldP spid="${s}" grpId="2" animBg="1"/>`);
      }
      if (e.g) {
        const t = e.g.t || 700, cid = nid(), sm = ' accel="40000" decel="40000"';
        pars.push(`<p:par><p:cTn id="${cid}" presetID="6" presetClass="emph" presetSubtype="0" fill="hold" grpId="3" nodeType="${node()}"><p:stCondLst><p:cond delay="${e.gd || 0}"/></p:stCondLst><p:childTnLst>${scale(s, e.g.pct || 125000, t, sm)}</p:childTnLst></p:cTn></p:par>`);
        if (e.g.dx !== undefined)
          pars.push(`<p:par><p:cTn id="${nid()}" presetID="0" presetClass="path" presetSubtype="0" fill="hold" grpId="3" nodeType="withEffect"><p:stCondLst><p:cond delay="${e.gd || 0}"/></p:stCondLst><p:childTnLst>${motion(s, `M 0 0 L ${e.g.dx} ${e.g.dy} E`, t, sm)}</p:childTnLst></p:cTn></p:par>`);
      }
      if (e.l) {
        const [cls, pid, at, fn] = LOOP[e.l];
        const start = e.ld != null ? e.ld : (e.d || 0) + (e.e ? e.t || 800 : 0);
        const cid = nid();
        pars.push(`<p:par><p:cTn id="${cid}" presetID="${pid}" presetClass="${cls}" presetSubtype="0"${at} repeatCount="indefinite" fill="hold" grpId="1" nodeType="${node()}"><p:stCondLst><p:cond delay="${start}"/></p:stCondLst><p:childTnLst>${fn(s, e.lo || {})}</p:childTnLst></p:cTn></p:par>`);
        if (sp) bld.add(`<p:bldP spid="${s}" grpId="1" animBg="1"/>`);
      }
    }
    return pars;
  }

  const groupXml = groups.map((g, gi) => {
    if (!g.length) return '';
    const pars = buildPars(g, gi > 0);
    const cond = gi === 0
      ? '<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>'
      : '<p:cond delay="indefinite"/>';
    return `<p:par><p:cTn id="${nid()}" fill="hold"><p:stCondLst>${cond}</p:stCondLst><p:childTnLst>` +
      `<p:par><p:cTn id="${nid()}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
      pars.join('') + '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>';
  });

  const audio = M
    ? `<p:audio><p:cMediaNode vol="${Math.round((opt.musicVol ?? 0.5) * 100000)}"><p:cTn id="${nid()}"${opt.musicOnce ? '' : ' repeatCount="indefinite"'} fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:endCondLst><p:cond evt="onStopAudio" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:endCondLst></p:cTn>${tgt(M)}</p:cMediaNode></p:audio>`
    : '';
  return '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>' +
    '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>' +
    groupXml.join('') +
    '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>' +
    '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>' +
    audio +
    '</p:childTnLst></p:cTn></p:par></p:tnLst>' + (bld.size ? `<p:bldLst>${[...bld].join('')}</p:bldLst>` : '') + '</p:timing>';
}

/** Đánh lại cNvPr id bị trùng trong một slide XML (pptxgenjs hay trùng với shape media). */
export function fixDuplicateIds(xml: string): string {
  const seen = new Set<string>();
  const ids = [...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m => +m[1]);
  let next = (ids.length ? Math.max(...ids) : 1) + 1;
  return xml.replace(/<p:cNvPr id="(\d+)"/g, (m0, id: string) => (seen.has(id) ? `<p:cNvPr id="${next++}"` : (seen.add(id), m0)));
}

/** Bảng màu chủ đề của PowerPoint mặc định có xanh dương (4472C4, 5B9BD5, 0563C1…): thay bằng bảng không có xanh dương. */
const CLR_SCHEME = '<a:clrScheme name="Mam non"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="4E342E"/></a:dk2><a:lt2><a:srgbClr val="FFF8E1"/></a:lt2>' +
  '<a:accent1><a:srgbClr val="E53935"/></a:accent1><a:accent2><a:srgbClr val="8E24AA"/></a:accent2><a:accent3><a:srgbClr val="43A047"/></a:accent3>' +
  '<a:accent4><a:srgbClr val="FBC02D"/></a:accent4><a:accent5><a:srgbClr val="FF7043"/></a:accent5><a:accent6><a:srgbClr val="00897B"/></a:accent6>' +
  '<a:hlink><a:srgbClr val="8E24AA"/></a:hlink><a:folHlink><a:srgbClr val="4E342E"/></a:folHlink></a:clrScheme>';
async function patchTheme(zip: JSZip): Promise<void> {
  for (const f of Object.keys(zip.files).filter(n => /^ppt\/theme\/theme\d+\.xml$/.test(n))) {
    const x = await zip.file(f)!.async('string');
    zip.file(f, x.replace(/<a:clrScheme[\s\S]*?<\/a:clrScheme>/, CLR_SCHEME));
  }
}

const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Mở .pptx, đánh lại id trùng, gắn chuyển cảnh + timing theo từng slide (theo thứ tự slide1..N). */
export async function addMotion(file: ArrayBuffer | Uint8Array, slides: SlideMotion[]): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(file);
  let ct = await zip.file('[Content_Types].xml')!.async('string');
  ct = ct.replace(/<Default Extension="mp3" ContentType="[^"]*"\/>/, '<Default Extension="mp3" ContentType="audio/mpeg"/>');
  zip.file('[Content_Types].xml', ct);
  await patchTheme(zip);
  for (let i = 0; i < slides.length; i++) {
    const p = `ppt/slides/slide${i + 1}.xml`;
    const f = zip.file(p);
    if (!f) throw new Error(`không thấy ${p}`);
    let xml = fixDuplicateIds(await f.async('string'));
    const ids: Record<string, string> = {}, sp: Record<string, boolean> = {};
    const re = /<p:(sp|pic)>\s*<p:nv(?:Sp|Pic)Pr>\s*<p:cNvPr id="(\d+)" name="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) { const nm = unesc(m[3]); ids[nm] = m[2]; sp[nm] = m[1] === 'sp'; }
    const spec = slides[i];
    let add = '';
    if (spec.trans) add += transitionXml(spec.trans);
    const opt: TimingOpt = {};
    if (spec.music) {
      opt.musicSpid = ids['bgmusic'];
      opt.musicVol = spec.music.vol;
      opt.musicOnce = spec.music.once;
      if (!opt.musicSpid) throw new Error(`slide ${i + 1}: không có shape bgmusic`);
      xml = xml.replace('<a:videoFile r:link=', '<a:audioFile r:link=');
    }
    if (spec.fx.length) add += buildTiming(spec.fx, n => ids[n], n => sp[n], opt);
    if (!xml.includes('</p:clrMapOvr>')) throw new Error('không có clrMapOvr trong ' + p);
    xml = xml.replace('</p:clrMapOvr>', '</p:clrMapOvr>' + add);
    zip.file(p, xml);
  }
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}
