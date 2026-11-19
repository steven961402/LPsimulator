// 腰椎穿刺 3D 示範：解剖幾何與「針尖在哪一層」的判斷邏輯
// 單位：公分（cm）。座標：x = 左右、y = 頭(+)/腳(-)、z = 背側(+)/腹側(-)
// 這是簡化的教學示意模型，比例為近似值。

// 皮膚表面位置會隨體型改變：棘上韌帶後緣在 z = 4.8，皮下脂肪越厚，皮膚越往背側
export const BODY_TYPES = {
  thin:   { name: '瘦',   fat: 0.7 },
  normal: { name: '一般', fat: 2.0 },
  over:   { name: '過重', fat: 3.5 },
  obese:  { name: '肥胖', fat: 5.0 },
};
export let SKIN_Z = 4.8 + BODY_TYPES.normal.fat;
export function setBodyType(key) { SKIN_Z = 4.8 + BODY_TYPES[key].fat; }
export const SKIN_THICK = 0.15;
export const PIVOT = { y: 0, z: -2.0 }; // 屈曲時的旋轉軸深度（約在椎間盤後半）
export const SEG = 3.7;                    // 相鄰兩節的間距（椎體 2.7 + 椎間盤 1.0）

// 棘突下斜程度：往背側每 1 cm 下降 0.3 cm（約 17°）
export const SP_SHEAR = -0.3;

// 三節腰椎：L4 固定，L3、L5 各自繞相鄰椎間盤後半轉動（屈曲時棘突間隙打開）
export const VERTS = [
  { id: 'L3', yc: 1.85, pivotY: 0, sign: -1 },
  { id: 'L4', yc: -1.85, pivotY: 0, sign: 0 },
  { id: 'L5', yc: -5.55, pivotY: -3.7, sign: 1 },
];
export const PAIRS = [
  { name: 'L3–L4', up: VERTS[0], lo: VERTS[1] },
  { name: 'L4–L5', up: VERTS[1], lo: VERTS[2] },
];
export const Y_TOP = 3.4, Y_BOT = -7.1; // 模型上下範圍

// 每一節腰椎的零件（以該節椎管中心為原點）
export const PARTS = [
  { key: 'body', name: '椎體', kind: 'ell', cx: 0, cz: -2.6, rx: 2.2, rz: 1.6, y0: -1.35, y1: 1.35 },
  { key: 'pedicle', name: '椎弓根', kind: 'box', c: [-1.2, 0.2, 0], s: [0.4, 1.1, 2.2] },
  { key: 'pedicle', name: '椎弓根', kind: 'box', c: [1.2, 0.2, 0], s: [0.4, 1.1, 2.2] },
  { key: 'lamina', name: '椎板', kind: 'box', c: [0, -0.4, 1.35], s: [2.8, 2.6, 0.7] },
  // 棘突：往背側逐漸下斜（shear），模擬真人腰椎棘突的形狀
  { key: 'spinous', name: '棘突', kind: 'box', c: [0, -0.75, 3.15], s: [0.7, 2.3, 2.9], shear: SP_SHEAR },
  { key: 'transverse', name: '橫突', kind: 'box', c: [-2.5, 0.1, 0.15], s: [2.2, 0.8, 0.7] },
  { key: 'transverse', name: '橫突', kind: 'box', c: [2.5, 0.1, 0.15], s: [2.2, 0.8, 0.7] },
  { key: 'facet', name: '關節突', kind: 'box', c: [-1.6, -0.35, 0.95], s: [0.6, 3.1, 1.1] },
  { key: 'facet', name: '關節突', kind: 'box', c: [1.6, -0.35, 0.95], s: [0.6, 3.1, 1.1] },
];

export const DURA_R = 0.72;   // 硬膜囊外徑
export const DURA_T = 0.08;   // 硬膜＋蜘蛛膜厚度（示意，略加粗）
export const CANAL_HALF = 1.0;

// 黃韌帶、棘間韌帶、棘上韌帶的附著點（各節局部座標）
// topF/topB：上緣（附著上一節）在前/後側的高度；botF/botB：下緣（附著下一節）
export const FLAVUM = { x: 1.25, topF: -1.3, topB: -1.3, botF: 0.6, botB: 0.6, front: 1.0, back: 1.45 };
export const INTERSPINOUS = { x: 0.3, topF: -1.25, topB: -2.1, botF: 0.7, botB: -0.2, front: 1.45, back: 4.45 };
export const SUPRASPINOUS = { x: 0.42, topF: 0.3, topB: 0.3, botF: -2.6, botB: -2.6, front: 4.45, back: 4.8 };

export function vertAngle(v, flexDeg) {
  return v.sign * flexDeg * Math.PI / 180;
}

function rotX(y, z, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [y * c - z * s, y * s + z * c];
}

// 局部 → 世界
export function localToWorld(v, flexDeg, p) {
  const a = vertAngle(v, flexDeg);
  const ry = p[1] + v.yc - v.pivotY;
  const rz = p[2] - PIVOT.z;
  const [y, z] = rotX(ry, rz, a);
  return [p[0], y + v.pivotY, z + PIVOT.z];
}

// 世界 → 局部
export function worldToLocal(v, flexDeg, p) {
  const a = vertAngle(v, flexDeg);
  const [y, z] = rotX(p[1] - v.pivotY, p[2] - PIVOT.z, -a);
  return [p[0], y + v.pivotY - v.yc, z + PIVOT.z];
}

function inPart(part, l) {
  if (part.kind === 'ell') {
    if (l[1] < part.y0 || l[1] > part.y1) return false;
    const dx = (l[0] - part.cx) / part.rx, dz = (l[2] - part.cz) / part.rz;
    return dx * dx + dz * dz <= 1;
  }
  let dx = l[0] - part.c[0], dy = l[1] - part.c[1], dz = l[2] - part.c[2];
  if (part.shear) dy -= part.shear * dz;
  return Math.abs(dx) <= part.s[0] / 2 && Math.abs(dy) <= part.s[1] / 2 && Math.abs(dz) <= part.s[2] / 2;
}

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// 硬膜囊、馬尾等「跨兩節」的軟組織：依高度在兩節之間平滑過渡
export function blendToWorld(flexDeg, p) {
  const [a, b, c] = VERTS.map(v => localToWorld(v, flexDeg, [p[0], p[1] - v.yc, p[2]]));
  const w1 = smooth(-1.2, 1.2, p[1]);               // L3 ↔ L4
  const w2 = smooth(-SEG - 1.2, -SEG + 1.2, p[1]);  // L4 ↔ L5
  const mid = b.map((v, i) => v + (a[i] - v) * w1);
  return c.map((v, i) => v + (mid[i] - v) * w2);
}

function canalCenterZ(flexDeg, y) {
  return blendToWorld(flexDeg, [0, y, 0])[2];
}

// 跨兩節的韌帶：上緣附著在 L3、下緣附著在 L4，回傳中線上的前/後緣
export function ligamentCorners(def, flexDeg, pair = PAIRS[0]) {
  const U = pair.up, L = pair.lo;
  const c = {};
  for (const sx of [-1, 1]) {
    c['tf' + sx] = localToWorld(U, flexDeg, [sx * def.x, def.topF, def.front]);
    c['tb' + sx] = localToWorld(U, flexDeg, [sx * def.x, def.topB, def.back]);
    c['bf' + sx] = localToWorld(L, flexDeg, [sx * def.x, def.botF, def.front]);
    c['bb' + sx] = localToWorld(L, flexDeg, [sx * def.x, def.botB, def.back]);
  }
  return c;
}

// 8 個角的順序：下前左、下前右、下後右、下後左、上前左、上前右、上後右、上後左
export function hexCorners(def, flexDeg, pair = PAIRS[0]) {
  const c = ligamentCorners(def, flexDeg, pair);
  return [c['bf-1'], c['bf1'], c['bb1'], c['bb-1'], c['tf-1'], c['tf1'], c['tb1'], c['tb-1']];
}
export const HEX_TRIS = [0,1,5, 0,5,4, 3,7,6, 3,6,2, 0,4,7, 0,7,3, 1,2,6, 1,6,5, 4,5,6, 4,6,7, 0,3,2, 0,2,1];

function inHex(c, p) {
  const ctr = [0, 1, 2].map(i => c.reduce((a, v) => a + v[i], 0) / 8);
  for (let t = 0; t < HEX_TRIS.length; t += 3) {
    const a = c[HEX_TRIS[t]], b = c[HEX_TRIS[t + 1]], d = c[HEX_TRIS[t + 2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const sc = n[0] * (ctr[0] - a[0]) + n[1] * (ctr[1] - a[1]) + n[2] * (ctr[2] - a[2]);
    const sp = n[0] * (p[0] - a[0]) + n[1] * (p[1] - a[1]) + n[2] * (p[2] - a[2]);
    if (sp * sc < 0 && Math.abs(sp) > 1e-9) return false;
  }
  return true;
}

function inLigament(def, flexDeg, p) {
  if (Math.abs(p[0]) > def.x) return false;
  return PAIRS.some(pair => inHex(hexCorners(def, flexDeg, pair), p));
}

// 判斷一個點是什麼組織
export function classify(p, flexDeg) {
  const [x, y, z] = p;
  if (z > SKIN_Z) return { layer: 'outside', name: '體外' };
  if (z > SKIN_Z - SKIN_THICK) return { layer: 'skin', name: '皮膚' };

  for (const v of VERTS) {
    const l = worldToLocal(v, flexDeg, p);
    for (const part of PARTS) {
      if (inPart(part, l)) {
        // 碰到的是這塊骨頭的下半（→ 針太偏頭側）還是上半（→ 太偏尾側）
        const cy = part.kind === 'ell' ? (part.y0 + part.y1) / 2 : part.c[1] + (part.shear || 0) * (l[2] - part.c[2]);
        return { layer: 'bone', name: `${v.id} ${part.name}`, vert: v.id, part: part.key, lowerHalf: l[1] < cy };
      }
    }
  }

  // 椎間盤：在上一節下終板與下一節上終板之間
  for (const pair of PAIRS) {
    const lu = worldToLocal(pair.up, flexDeg, p);
    const ll = worldToLocal(pair.lo, flexDeg, p);
    if (lu[1] < -1.35 && ll[1] > 1.35) {
      const dx = ll[0] / 2.15, dz = (ll[2] + 2.6) / 1.55;
      if (dx * dx + dz * dz <= 1) return { layer: 'disc', name: `${pair.name} 椎間盤` };
    }
  }

  const cz = canalCenterZ(flexDeg, y);
  const r = Math.hypot(x, z - cz);
  if (r <= DURA_R - DURA_T) return { layer: 'sub', name: '蜘蛛膜下腔（CSF）' };
  if (r <= DURA_R) return { layer: 'dura', name: '硬膜／蜘蛛膜', side: z > cz ? 'post' : 'ant' };

  if (inLigament(FLAVUM, flexDeg, p)) return { layer: 'flavum', name: '黃韌帶' };
  if (Math.abs(x) <= CANAL_HALF && Math.abs(z - cz) <= CANAL_HALF) return { layer: 'epi', name: '硬膜外腔', side: z > cz ? 'post' : 'ant' };
  if (inLigament(SUPRASPINOUS, flexDeg, p)) return { layer: 'supra', name: '棘上韌帶' };
  if (inLigament(INTERSPINOUS, flexDeg, p)) return { layer: 'inter', name: '棘間韌帶' };
  if (z > SUPRASPINOUS.back) return { layer: 'subq', name: '皮下組織' };
  if (Math.abs(x) <= INTERSPINOUS.x) {
    if (z > SUPRASPINOUS.front) return { layer: 'subq', name: '皮下組織' };
    if (z > 1.0) return { layer: 'inter', name: '棘間韌帶' };
  }
  if (z > -1.0) return { layer: 'muscle', name: '椎旁肌肉' };
  if (Math.abs(x) <= 1.2) return { layer: 'deep', name: '後縱韌帶附近' };
  return { layer: 'deep', name: '深部組織' };
}

// 入針方向：cephDeg = 往頭側傾斜角；medDeg = 往中線傾斜角（旁正中入路用）
export function needleDir(entry, cephDeg, medDeg) {
  const t1 = Math.tan(cephDeg * Math.PI / 180);
  const sx = entry[0] === 0 ? 0 : -Math.sign(entry[0]);
  const t2 = Math.tan(medDeg * Math.PI / 180) * sx;
  const n = Math.hypot(t2, t1, 1);
  return [t2 / n, t1 / n, -1 / n];
}

// 以「床面」為基準的入針方向，回傳病人座標系的方向向量
// cephDeg：往頭側傾斜；horizDeg：針相對水平面（床面）的角度，正值 = 針尖朝床面（往下）
// rollDeg：病人背部傾斜，正值 = 病人往前倒（背面朝天花板轉）
export function needleDirBed(cephDeg, horizDeg, rollDeg) {
  const r = Math.PI / 180;
  let wx = -Math.tan(horizDeg * r), wy = Math.tan(cephDeg * r), wz = -1;
  const n = Math.hypot(wx, wy, wz); wx /= n; wy /= n; wz /= n;
  const c = Math.cos(rollDeg * r), s = Math.sin(rollDeg * r);
  return [wx * c - wz * s, wy, wx * s + wz * c];
}

// 反過來：由病人座標系的針方向算出（往頭側角度、水平角度）
export function anglesFromDir(dir, rollDeg) {
  const r = rollDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const wx = dir[0] * c + dir[2] * s, wy = dir[1], wz = -dir[0] * s + dir[2] * c;
  if (wz > -0.15) return null; // 針不是朝病人體內
  const d = 180 / Math.PI;
  return { ceph: Math.atan(wy / -wz) * d, horiz: Math.atan(wx / wz) * d };
}

// 針與病人正中矢狀面的夾角（正 = 針尖偏向病人右側，即朝上側）
export function sagittalDeviation(dir) {
  return Math.atan2(dir[0], -dir[2]) * 180 / Math.PI;
}

// 沿針的路徑模擬進針
export function simulate(entry, dir, depth, flexDeg) {
  const step = 0.02;
  const layers = [];
  let last = null, tipDepth = 0, hit = null, passedSub = false;
  for (let d = 0; d <= depth + 1e-9; d += step) {
    const p = [entry[0] + dir[0] * d, entry[1] + dir[1] * d, entry[2] + dir[2] * d];
    const c = classify(p, flexDeg);
    if (c.layer === 'bone') { hit = c; break; }
    tipDepth = d;
    if (c.layer === 'sub') passedSub = true;
    const key = c.name + (c.side || '');
    if (!last || last.key !== key) {
      last = { key, ...c, start: d, afterSub: passedSub && c.layer !== 'sub' };
      layers.push(last);
    }
  }
  return { tipDepth, hit, layers, tip: last, passedSub };
}

// 量測擺位：棘突間距、椎板間距（中線）
export function gaps(flexDeg) {
  const U = PAIRS[0].up, L = PAIRS[0].lo;
  const sp = (v, by) => {
    const part = PARTS.find(p => p.key === 'spinous');
    // 量測棘突中段（皮膚與椎板之間）的上下緣
    const dz = 0, dy = by * part.s[1] / 2 + part.shear * dz;
    return localToWorld(v, flexDeg, [0, part.c[1] + dy, part.c[2] + dz]);
  };
  const lam = PARTS.find(p => p.key === 'lamina');
  const lu = localToWorld(U, flexDeg, [0, lam.c[1] - lam.s[1] / 2, lam.c[2]]);
  const ll = localToWorld(L, flexDeg, [0, lam.c[1] + lam.s[1] / 2, lam.c[2]]);
  return { interspinous: sp(U, -1)[1] - sp(L, 1)[1], interlaminar: lu[1] - ll[1] };
}

// ---------- 椎間隙與 Tuffier's line ----------
// 椎間隙編號 n：n = 3 代表 L3–L4、n = 4 代表 L4–L5（依此類推）
export function levelName(n) {
  const r = Math.round(n);
  const sp = (k) => (k <= 5 ? `L${k}` : 'S1');
  if (Math.abs(n - r) < 0.15) return `${sp(r)}–${sp(r + 1)} 間隙`;
  return `${sp(Math.ceil(n))} 棘突`;
}
// 椎間隙在皮膚上的位置（考慮棘突下斜，皮膚上的間隙比椎間盤低約 1.35 cm）
export function interspaceSkinY(n) { return (3 - n) * SEG - 1.35; }
export function skinYToLevel(y) { return 3 - (y + 1.35) / SEG; }
