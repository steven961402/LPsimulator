import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as A from './anatomy.js';

const $ = (id) => document.getElementById(id);
const viewer = $('viewer');

// ---------- 場景 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.localClippingEnabled = true;
viewer.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'labels';
viewer.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f6f9);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
// 左側臥：病人的左側（-x）朝下貼床，所以畫面的「上」是病人的右側（+x）
camera.up.set(1, 0, 0);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 1.5);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(8, 10, 12);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.6);
fill.position.set(-10, -4, -6);
scene.add(fill);

// ---------- 材質 ----------
const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0); // 保留病人左半邊（隨背部傾斜一起轉）

// 病人整體（解剖、皮膚、針）放在同一個群組，背部傾斜時一起繞脊椎長軸轉動
const patient = new THREE.Group();
scene.add(patient);
const clipMats = [];
function mat(opts, clip = true) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0, side: THREE.DoubleSide, ...opts });
  if (clip) clipMats.push(m);
  return m;
}
const M = {
  bone: mat({ color: 0xe9dfc8 }),
  boneHit: mat({ color: 0xff8a7a }),
  disc: mat({ color: 0xa9c9dc }),
  flavum: mat({ color: 0xf2c12e, roughness: 0.5 }),
  inter: mat({ color: 0xe39a9a, transparent: true, opacity: 0.45, depthWrite: false }),
  supra: mat({ color: 0xc96f6f, transparent: true, opacity: 0.6, depthWrite: false }),
  dura: mat({ color: 0x5b9bff, transparent: true, opacity: 0.28, depthWrite: false }),
  cauda: mat({ color: 0xfff1b8, roughness: 0.4 }),
  skin: mat({ color: 0xf0c4a8, transparent: true, opacity: 0.3, depthWrite: false }, false),
};

// ---------- 腰椎 ----------
const vertObjs = {};
for (const v of A.VERTS) {
  const pivot = new THREE.Group();
  pivot.position.set(0, v.pivotY, A.PIVOT.z);
  const body = new THREE.Group();
  body.position.set(0, v.yc - v.pivotY, -A.PIVOT.z);
  pivot.add(body);
  patient.add(pivot);
  const meshes = [];
  for (const part of A.PARTS) {
    let mesh;
    if (part.kind === 'ell') {
      const h = part.y1 - part.y0;
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, h, 48), M.bone);
      mesh.scale.set(part.rx, 1, part.rz);
      mesh.position.set(part.cx, (part.y0 + part.y1) / 2, part.cz);
    } else {
      const r = Math.min(...part.s) * 0.28;
      mesh = new THREE.Mesh(new RoundedBoxGeometry(part.s[0], part.s[1], part.s[2], 3, r), M.bone);
      if (part.shear) {
        // 讓棘突往背側逐漸下斜
        mesh.geometry.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, part.shear, 0, 0, 0, 1, 0, 0, 0, 0, 1));
      }
      mesh.position.set(...part.c);
    }
    mesh.userData.part = part.key;
    body.add(mesh);
    meshes.push(mesh);
  }
  const lab = makeLabel(v.id, 'lab-level');
  lab.position.set(-2.6, 0, -2.6);
  // 部位標籤已移除（只保留方位標示）
  vertObjs[v.id] = { v, pivot, body, meshes };
}

// ---------- 標籤 ----------
function makeLabel(text, cls = '') {
  const div = document.createElement('div');
  div.className = 'lab ' + cls;
  div.textContent = text;
  return new CSS2DObject(div);
}
const labels = {
  sp: makeLabel('棘突 spinous process'),
  flavum: makeLabel('黃韌帶 ligamentum flavum', 'lab-yellow'),
  dura: makeLabel('硬膜囊 dural sac', 'lab-blue'),
  cauda: makeLabel('馬尾 cauda equina'),
  disc: makeLabel('椎間盤'),
};
// 部位標籤不加進場景，只保留方位標示

// ---------- 會隨擺位變形的軟組織 ----------
function hexGeometry(c) {
  // c: 8 個角 [bf-1,bf1,bb1,bb-1, tf-1,tf1,tb1,tb-1]
  const idx = A.HEX_TRIS;
  const pos = new Float32Array(idx.length * 3);
  idx.forEach((k, i) => pos.set(c[k], i * 3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
const ligCorners = A.hexCorners;
// 每個椎間隙各一組韌帶
const ligs = A.PAIRS.map(pair => {
  const o = {
    pair,
    flavum: new THREE.Mesh(new THREE.BufferGeometry(), M.flavum),
    inter: new THREE.Mesh(new THREE.BufferGeometry(), M.inter),
    supra: new THREE.Mesh(new THREE.BufferGeometry(), M.supra),
  };
  o.inter.renderOrder = 2; o.supra.renderOrder = 3;
  patient.add(o.flavum, o.inter, o.supra);
  return o;
});

// 椎間盤：上面貼 L3 下終板，下面貼 L4 上終板
const discBase = new THREE.CylinderGeometry(1, 1, 1, 48, 1);
const discMeshes = A.PAIRS.map(pair => {
  const m = new THREE.Mesh(discBase.clone(), M.disc);
  m.userData.pair = pair;
  patient.add(m);
  return m;
});

// 硬膜囊與馬尾：沿兩節椎管平滑彎曲
const MID_Y = (A.Y_TOP + A.Y_BOT) / 2, SPAN = A.Y_TOP - A.Y_BOT;
const duraBase = new THREE.CylinderGeometry(A.DURA_R, A.DURA_R, SPAN + 0.6, 40, 90, true);
duraBase.translate(0, MID_Y, 0);
const duraMesh = new THREE.Mesh(duraBase.clone(), M.dura);
duraMesh.renderOrder = 1;
patient.add(duraMesh);
const caudaFibers = [];
{
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const ang = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * 0.4;
    const base = new THREE.CylinderGeometry(0.035, 0.035, SPAN + 0.2, 6, 60);
    base.translate(0, MID_Y, 0);
    // 左側臥時神經根受重力影響，稍微沉向左側（靠床側）
    base.translate(Math.cos(ang) * rad - 0.15, 0, Math.sin(ang) * rad - 0.05);
    const m = new THREE.Mesh(base.clone(), M.cauda);
    m.userData.base = base;
    patient.add(m);
    caudaFibers.push(m);
  }
}

function deform(mesh, base, fn) {
  const src = base.attributes.position, dst = mesh.geometry.attributes.position;
  for (let i = 0; i < src.count; i++) {
    const p = fn([src.getX(i), src.getY(i), src.getZ(i)]);
    dst.setXYZ(i, p[0], p[1], p[2]);
  }
  dst.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}

// ---------- 床面與方位標示 ----------
const bed = new THREE.GridHelper(16, 16, 0xb7c0cc, 0xd5dbe3);
bed.rotation.z = Math.PI / 2;   // 讓格線平面垂直於 x（病人左側下方）
bed.position.set(-7.6, 0, 0);
scene.add(bed);
const orient = [
  [makeLabel('頭側 head →', 'lab-dir'), [0, A.Y_TOP + 1.8, 0]],
  [makeLabel('背側（術者側）', 'lab-dir'), [0, 4.2, 7.5]],
  [makeLabel('腹側', 'lab-dir'), [0, 4.2, -5.2]],
  [makeLabel('← 尾側 feet', 'lab-dir'), [0, A.Y_BOT - 1.8, 0]],
];
orient.forEach(([l, p]) => { l.position.set(...p); patient.add(l); });
const orientBack = orient[1][0];
const bedLabel = makeLabel('床面（病人左側朝下）', 'lab-dir');
bedLabel.position.set(-7.6, 0, 4);
scene.add(bedLabel);

// 水平參考線（平行床面、垂直脊椎），放在世界座標，不跟病人轉
const horizLine = new THREE.Line(new THREE.BufferGeometry(),
  new THREE.LineDashedMaterial({ color: 0x55606e, dashSize: 0.3, gapSize: 0.2 }));
scene.add(horizLine);
const horizLabel = makeLabel('水平線（平行床面）', 'lab-gray');
scene.add(horizLabel);

// ---------- 皮膚與針 ----------
const skin = new THREE.Mesh(new THREE.PlaneGeometry(9, SPAN + 3), M.skin);
skin.geometry.translate(0, MID_Y, 0);
skin.position.z = A.SKIN_Z;
skin.renderOrder = 5;
patient.add(skin);
const midline = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, A.Y_BOT - 1.5, 0.01), new THREE.Vector3(0, A.Y_TOP + 1.5, 0.01)]),
  new THREE.LineDashedMaterial({ color: 0x9a6a50, dashSize: 0.25, gapSize: 0.18 })
);
midline.computeLineDistances();

// 真實視角用的不透明身體（背部皮膚＋兩側），看不到裡面
const realSkin = new THREE.Mesh(new RoundedBoxGeometry(15, SPAN + 3, 13, 4, 2.2),
  new THREE.MeshStandardMaterial({ color: 0xe9b99b, roughness: 0.8 }));
realSkin.position.set(0, MID_Y, A.SKIN_Z - 6.5);

// 皮下脂肪（上帝視角下半透明顯示，厚度隨體型改變）
const fatMesh = new THREE.Mesh(new THREE.BoxGeometry(9, SPAN + 3, 1),
  mat({ color: 0xf3d77e, transparent: true, opacity: 0.16, depthWrite: false }));
fatMesh.renderOrder = 4;
patient.add(fatMesh);

function updateBody() {
  const fat = A.SKIN_Z - 4.8;
  skin.position.z = A.SKIN_Z;
  midline.position.z = A.SKIN_Z;
  // 身體往腹側延伸到 z = -7，確保蓋住所有構造
  const bodyDepth = A.SKIN_Z + 7;
  realSkin.scale.z = bodyDepth / 13;
  realSkin.position.z = A.SKIN_Z - bodyDepth / 2;
  fatMesh.scale.z = fat;
  fatMesh.position.set(0, MID_Y, 4.8 + fat / 2);
  orientBack.position.z = A.SKIN_Z + 2;
}
realSkin.visible = false;
patient.add(realSkin);

// 摸得到的棘突最突起點，標在皮膚上（兩種視角都顯示）
const spTipMat = new THREE.MeshStandardMaterial({ color: 0x8a5a44, roughness: 0.6, transparent: true });
const spRingMat = new THREE.MeshBasicMaterial({ color: 0x8a5a44, side: THREE.DoubleSide, transparent: true });

// 觸診誤差：過重、肥胖時摸不太到 → 真實視角下標記變淡、位置隨機偏一點
const PALP = {
  thin:   { amp: 0,    op: 1 },
  normal: { amp: 0,    op: 1 },
  over:   { amp: 0.35, op: 0.6 },
  obese:  { amp: 0.8,  op: 0.3 },
};
let bodyKey = 'normal';
const palp = { tuffDy: 0, sp: A.VERTS.map(() => ({ dx: 0, dy: 0 })) };
function rollPalpation() {
  const a = PALP[bodyKey].amp, r = () => (Math.random() * 2 - 1) * a;
  palp.tuffDy = r();
  palp.sp.forEach(p => { p.dx = r() * 0.4; p.dy = r(); });
}
const palpOn = () => MODE === 'real';
const spTips = A.VERTS.map(() => {
  const g = new THREE.Group();
  const bump = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 12), spTipMat);
  bump.scale.set(1, 1, 0.35);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 28), spRingMat);
  ring.position.z = 0.02;
  g.add(bump, ring);
  patient.add(g);
  return g;
});
patient.add(midline);

// 脊椎穿刺針長度（可切換）
const NEEDLES = { std: { name: '3.5 吋', len: 8.9 }, long: { name: '5 吋', len: 12.7 } };
let needleKey = 'std';
let NEEDLE_LEN = NEEDLES.std.len;
const needle = new THREE.Group();
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, NEEDLE_LEN, 12),
  new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.85, roughness: 0.25 }));
shaft.position.y = NEEDLE_LEN / 2; // 針尖在群組原點，針身往 +y（往針座方向）
const tipCone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 12),
  new THREE.MeshStandardMaterial({ color: 0xd0d6dc, metalness: 0.9, roughness: 0.2 }));
tipCone.position.y = 0.09; tipCone.rotation.x = Math.PI;
const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 1.3, 20),
  new THREE.MeshStandardMaterial({ color: 0x3f8f6b, roughness: 0.5, transparent: true, opacity: 0.9 }));
hub.position.y = NEEDLE_LEN + 0.65;
needle.add(shaft, tipCone, hub);
// 抓取用的隱形大球（手機上比較好按）
const grabMat = new THREE.MeshBasicMaterial({ visible: false });
// 整支針（針身＋針座）都可以抓來改角度；做粗一點方便手指按
let NEEDLE_TOTAL = NEEDLE_LEN + 1.3;
const needleGrab = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, NEEDLE_TOTAL, 10), grabMat);
needleGrab.position.y = NEEDLE_TOTAL / 2;
needle.add(needleGrab);
patient.add(needle);

const pathLine = new THREE.Line(new THREE.BufferGeometry(),
  new THREE.LineDashedMaterial({ color: 0xd94b4b, dashSize: 0.2, gapSize: 0.15, transparent: true, opacity: 0.8 }));
patient.add(pathLine);
const entryDot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshBasicMaterial({ color: 0xd94b4b }));
patient.add(entryDot);
const entryRing = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 32), new THREE.MeshBasicMaterial({ color: 0xd94b4b, side: THREE.DoubleSide }));
patient.add(entryRing);
const entryGrab = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), grabMat);
patient.add(entryGrab);

// ---------- 狀態 ----------
let MODE = 'god'; // 'god' 上帝視角 / 'real' 真實視角
const DEFAULT_Y = Math.round(A.interspaceSkinY(4) * 10) / 10; // 預設入針點：L4–L5 間隙
const S = { flex: 6, roll: 0, tuff: 0, x: 0, y: DEFAULT_Y, ceph: 12, horiz: 0, depth: 0 };

// ---------- Tuffier's line（兩側髂嵴最高點連線）----------
const tuffMat = new THREE.MeshBasicMaterial({ color: 0x7b3fc4, transparent: true });
// 畫面上 Tuffier's line 的位置（真實視角時含觸診誤差）
const tuffLineY = () => A.interspaceSkinY(4 - S.tuff) + (palpOn() ? palp.tuffDy : 0);
const tuffier = new THREE.Group();
const tuffBar = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.09, 0.03), tuffMat);
const crestL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), tuffMat);
const crestR = crestL.clone();
crestL.position.x = -4.2; crestR.position.x = 4.2;
const tuffLabel = makeLabel("Tuffier's line（摸到的）", 'lab-tuff');
tuffLabel.position.set(4.6, 0, 0.3);
tuffier.add(tuffBar, crestL, crestR, tuffLabel);
patient.add(tuffier);
// 公認位置（真正的 L4–L5）參考線：只有摸偏時才出現
const trueLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4.2, 0, 0), new THREE.Vector3(4.2, 0, 0)]),
  new THREE.LineDashedMaterial({ color: 0x7b3fc4, dashSize: 0.25, gapSize: 0.2, transparent: true, opacity: 0.6 }));
trueLine.computeLineDistances();
const trueLabel = makeLabel('實際 L4–L5', 'lab-tuff-ghost');
trueLabel.position.set(-4.6, 0, 0.3);
const trueGroup = new THREE.Group();
trueGroup.add(trueLine, trueLabel);
// trueGroup 的位置在 updateTuffier() 裡依皮膚高度更新
patient.add(trueGroup);

function updateTuffier() {
  tuffier.position.set(0, tuffLineY(), A.SKIN_Z + 0.03);
  trueGroup.position.set(0, A.interspaceSkinY(4), A.SKIN_Z + 0.03);
  trueGroup.visible = trueLabel.visible = MODE === 'god' && Math.abs(S.tuff) >= 0.15;
  const where = A.levelName(4 - S.tuff);
  let html;
  if (Math.abs(S.tuff) < 0.15) {
    html = `摸到的線在 <b>${where}</b>（公認位置）。往頭側一個間隙就是 L3–L4。`;
  } else {
    const n = Math.abs(S.tuff).toFixed(1).replace(/\.0$/, '');
    html = `摸到的線其實在 <b>${where}</b>，比公認位置${S.tuff > 0 ? '高' : '低'} ${n} 節。` +
      `如果把它當成 L4–L5 來數，你實際下針的位置都會比你以為的<b>${S.tuff > 0 ? '高' : '低'} ${n} 節</b>。`;
  }
  if (MODE === 'real') html = '真實視角下不會告訴你摸到的線準不準。可以按「隨機（不告訴你）」再進針，切回上帝視角對答案。';
  $('tuffInfo').innerHTML = html;
}

function updateRoll() {
  patient.rotation.y = S.roll * Math.PI / 180;
  patient.updateMatrixWorld(true);
  const r = S.roll * Math.PI / 180;
  clipPlane.normal.set(-Math.cos(r), 0, Math.sin(r));
  $('rollInfo').innerHTML = S.roll === 0 ? '背部與床面垂直' :
    `背部往${S.roll > 0 ? '前（朝天花板）' : '後（朝床面）'}傾斜 ${Math.abs(S.roll)}°，針的水平角度要跟著調成 <b>${S.roll}°</b> 才會維持在正中矢狀面`;
}
let lastTipLayer = null, lastDepth = 0;

function updateAnatomy() {
  for (const o of Object.values(vertObjs)) o.pivot.rotation.x = A.vertAngle(o.v, S.flex);
  scene.updateMatrixWorld(true);

  for (const o of ligs) {
    for (const [k, def] of [['flavum', A.FLAVUM], ['inter', A.INTERSPINOUS], ['supra', A.SUPRASPINOUS]]) {
      o[k].geometry.dispose();
      o[k].geometry = hexGeometry(ligCorners(def, S.flex, o.pair));
    }
  }

  for (const m of discMeshes) {
    const { up: U, lo: L } = m.userData.pair;
    deform(m, discBase, ([x, y, z]) => {
      const lp = [x * 2.15, 0, z * 1.55 - 2.6];
      return y > 0 ? A.localToWorld(U, S.flex, [lp[0], -1.35, lp[2]]) : A.localToWorld(L, S.flex, [lp[0], 1.35, lp[2]]);
    });
  }
  deform(duraMesh, duraBase, (p) => A.blendToWorld(S.flex, p));
  for (const f of caudaFibers) deform(f, f.userData.base, (p) => A.blendToWorld(S.flex, p));

  const fc = A.ligamentCorners(A.FLAVUM, S.flex);
  labels.flavum.position.set(-1.25, (fc['tf-1'][1] + fc['bf-1'][1]) / 2, 1.25);
  labels.dura.position.copy(new THREE.Vector3(...A.blendToWorld(S.flex, [0, 3.2, A.DURA_R])));
  labels.cauda.position.copy(new THREE.Vector3(...A.blendToWorld(S.flex, [0, -3.3, 0])));
  labels.disc.position.set(-2.3, 0, -3.6);

  // 棘突最突起點（最背側的尖端）投影到皮膚上
  const sp = A.PARTS.find(p => p.key === 'spinous');
  A.VERTS.forEach((v, i) => {
    const tipL = [0, sp.c[1] + sp.shear * (sp.s[2] / 2), sp.c[2] + sp.s[2] / 2];
    const w = A.localToWorld(v, S.flex, tipL);
    const n = palpOn() ? palp.sp[i] : { dx: 0, dy: 0 };
    spTips[i].position.set(n.dx, w[1] + n.dy, A.SKIN_Z + 0.01);
  });

  const op = palpOn() ? PALP[bodyKey].op : 1;
  spTipMat.opacity = spRingMat.opacity = op;
  tuffMat.opacity = op;

  const g = A.gaps(S.flex);
  $('gapInfo').style.display = MODE === 'god' ? '' : 'none';
  $('gapInfo').innerHTML = `棘突間距 <b>${g.interspinous.toFixed(1)} cm</b>　椎板間距（interlaminar）<b>${g.interlaminar.toFixed(1)} cm</b>`;
}

function updateHud(dev) {
  const lv = A.skinYToLevel(S.y);
  // 你以為的節數：把畫面上的 Tuffier's line 當成 L4–L5 來數
  const actual = A.levelName(lv), believed = A.levelName(4 - (S.y - tuffLineY()) / A.SEG);
  const mismatch = actual !== believed;
  const dy = S.y - tuffLineY(); // 相對於摸到的 Tuffier's line
  const yTxt = Math.abs(dy) < 0.05 ? "就在 Tuffier's line 上" : `Tuffier's line ${dy > 0 ? '頭側' : '尾側'} ${Math.abs(dy).toFixed(1)} cm`;
  const xTxt = S.x === 0 ? '正中線' : `${Math.abs(S.x).toFixed(1)} cm 偏${S.x < 0 ? '左（靠床側）' : '右（朝上側）'}`;
  const hTxt = Math.abs(S.horiz) < 0.5 ? '0°（平行床面）' : `${Math.abs(S.horiz).toFixed(0)}°（針尖朝${S.horiz > 0 ? '下' : '上'}）`;
  const devCls = Math.abs(dev) < 3 ? 'ok' : Math.abs(dev) < 8 ? 'warn' : 'off';
  const devTxt = Math.abs(dev) < 0.5 ? '0° ✓' : `${Math.abs(dev).toFixed(0)}°（偏向${dev > 0 ? '朝上側' : '靠床側'}）`;
  $('hud').innerHTML = `
    <div class="hrow"><span>入針點</span><b>${yTxt}</b></div>
    <div class="hrow"><span></span><b>${xTxt}</b></div>
    <div class="hrow"><span>往頭側角度</span><b>${S.ceph.toFixed(0)}°</b></div>
    <div class="hrow"><span>水平角度</span><b>${hTxt}</b></div>
    ${MODE === 'god' ? `<div class="hrow ${devCls}"><span>與正中矢狀面</span><b>${devTxt}</b></div>` : ''}
    <div class="hrow"><span>深度</span><b>${S.depth.toFixed(1)} cm</b></div>
    <div class="hsep"></div>
    ${MODE === 'god' ? `<div class="hrow"><span>實際位置</span><b>${actual}</b></div>` : ''}
    <div class="hrow ${MODE === 'god' && mismatch ? 'warn' : ''}"><span>${MODE === 'god' ? "依 Tuffier's line 推算" : '你以為的位置'}</span><b>${believed}</b></div>`;
}

function updateNeedle() {
  const entry = [S.x, S.y, A.SKIN_Z];
  const dir = A.needleDirBed(S.ceph, S.horiz, S.roll);
  const dev = A.sagittalDeviation(dir);
  updateHud(dev);
  const sim = A.simulate(entry, dir, S.depth, S.flex);
  const d = new THREE.Vector3(...dir);
  const tip = new THREE.Vector3(...entry).addScaledVector(d, sim.tipDepth);
  needle.position.copy(tip);
  needle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().negate());
  needle.visible = true;

  entryDot.position.set(S.x, S.y, A.SKIN_Z + 0.02);
  entryRing.position.set(S.x, S.y, A.SKIN_Z + 0.03);
  entryGrab.position.set(S.x, S.y, A.SKIN_Z);
  const ew = patient.localToWorld(new THREE.Vector3(...entry));
  const hz = ew.clone().add(new THREE.Vector3(0, 0, -8));
  horizLine.geometry.dispose();
  horizLine.geometry = new THREE.BufferGeometry().setFromPoints([ew.clone().add(new THREE.Vector3(0, 0, 2)), hz]);
  horizLine.computeLineDistances();
  horizLabel.position.copy(ew.clone().add(new THREE.Vector3(0, 0, 2.2)));
  const end = new THREE.Vector3(...entry).addScaledVector(d, 9);
  pathLine.geometry.dispose();
  pathLine.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...entry), end]);
  pathLine.computeLineDistances();
  pathLine.visible = MODE === 'god' && $('tPath').checked;

  // 碰到的骨頭標紅
  for (const o of Object.values(vertObjs)) for (const m of o.meshes) m.material = M.bone;
  if (sim.hit) {
    const o = vertObjs[sim.hit.vert];
    o.meshes.filter(m => m.userData.part === sim.hit.part).forEach(m => (m.material = M.boneHit));
  }

  renderStatus(sim);
  // 落空感：只在針剛穿出黃韌帶時出現一次（就算一次拉很快、跳過好幾層也會觸發）
  const tipL = sim.tip ? sim.tip.layer : null;
  const fi = sim.layers.findIndex(l => l.layer === 'flavum');
  const exitDepth = fi >= 0 && sim.layers[fi + 1] ? sim.layers[fi + 1].start : null;
  if (lastTipLayer !== null && exitDepth !== null && lastDepth < exitDepth && sim.tipDepth >= exitDepth) {
    pop(MODE === 'real' ? '落空感' : '落空感！（穿過黃韌帶）');
  }
  lastTipLayer = tipL; lastDepth = sim.tipDepth;
}

const LAYER_COLOR = { skin: '#e8b89a', subq: '#f3d9b1', supra: '#c96f6f', inter: '#e39a9a', muscle: '#c97c7c',
  flavum: '#f2c12e', epi: '#c9d3e0', dura: '#5b9bff', sub: '#2fbf71', disc: '#a9c9dc', deep: '#999', outside: '#ccc' };

function renderStatus(sim) {
  $('depthVal').textContent = S.depth.toFixed(1);
  if (typeof syncDepthUI === 'function') syncDepthUI();
  const chips = sim.layers.filter(l => l.layer !== 'outside').map(l =>
    `<span class="chip" style="--c:${LAYER_COLOR[l.layer] || '#ccc'}">${l.name}${l.side === 'ant' ? '（前側）' : ''}<small>${l.start.toFixed(1)}</small></span>`);
  if (sim.hit) chips.push(`<span class="chip bone">✖ ${sim.hit.name}<small>${sim.tipDepth.toFixed(1)}</small></span>`);
  $('layers').innerHTML = MODE === 'real' ? '' : (chips.join('<span class="arrow">›</span>') || '<span class="muted">尚未進針</span>');

  const box = $('status');
  let cls = 'info', msg = '';
  const t = sim.tip;
  const allIn = S.depth >= NEEDLE_LEN - 0.01 && !sim.hit && !sim.passedSub && t.layer !== 'sub';
  if (allIn) {
    box.className = 'status bad';
    box.textContent = needleKey === 'std'
      ? '整支 3.5 吋（8.9 cm）針都推進去了，還沒有 CSF：皮下太厚時可能需要更長的脊椎穿刺針（例如 5 吋）。'
      : '整支 5 吋（12.7 cm）針都推進去了，還沒有 CSF：檢查入針點與角度。';
    return;
  }
  if (MODE === 'real') {
    [cls, msg] = feelStatus(sim);
    box.className = 'status ' + cls;
    box.textContent = msg;
    return;
  }
  if (S.depth === 0) {
    msg = '選好入針點與角度後，拖動「進針深度」開始進針。';
  } else if (sim.hit) {
    cls = 'bad';
    const h = sim.hit;
    if (sim.passedSub) msg = `進太深了：已穿過前側硬膜，碰到 ${h.name}。正確位置應停在蜘蛛膜下腔。`;
    else if (h.part === 'spinous' || h.part === 'lamina') {
      msg = `碰到骨頭：${h.name}（約 ${sim.tipDepth.toFixed(1)} cm）。` +  (h.lowerHalf
        ? '針太偏頭側：減少往頭側的角度，或把入針點往尾側（腳）移。'
        : '針太偏尾側：增加往頭側的角度（更朝向肚臍），或把入針點往頭側移。') + '　→ 退針到皮下再調整。';
    } else msg = `碰到骨頭：${h.name}。針偏離正中矢狀面：檢查入針點是否在中線，以及針的水平角度是否和病人背部傾斜一致。`;
  } else if (!sim.passedSub && (t.layer === 'deep' || t.layer === 'muscle') && S.depth > 3.5 && Math.abs(A.sagittalDeviation(A.needleDirBed(S.ceph, S.horiz, S.roll))) >= 3) {
    cls = 'bad';
    msg = `針從硬膜囊旁邊偏過去了（針尖在「${t.name}」）。針沒有沿著正中矢狀面前進：把針的水平角度調成和背部傾斜一樣，或確認入針點在中線。`;
  } else if (t.layer === 'sub' ) {
    cls = 'good'; msg = '✓ 針尖在蜘蛛膜下腔：拔出針芯（stylet）應可見 CSF 流出。';
  } else if (sim.passedSub) {
    cls = 'bad'; msg = `進太深了：針尖已穿過蜘蛛膜下腔，現在在「${t.name}${t.side === 'ant' ? '（前側）' : ''}」。可能造成出血（前側靜脈叢）或傷及椎間盤，請退針。`;
  } else {
    const tips = {
      skin: '穿過皮膚。', subq: '皮下組織：阻力低。', supra: '棘上韌帶：阻力開始增加。',
      inter: '棘間韌帶：有韌性的阻力，針應該被「固定住」。', muscle: '針在椎旁肌肉：可能偏離中線（若非刻意旁正中入路）。',
      flavum: '黃韌帶：阻力最大的一層，穿過時會有明顯落空感。', epi: '硬膜外腔：再往前一點點就到硬膜。',
      dura: '正在穿過硬膜／蜘蛛膜。', disc: '在椎間盤內：太深了！', deep: '太深了，請退針。',
    };
    cls = (t.layer === 'disc' || t.layer === 'deep') ? 'bad' : 'info';
    msg = `針尖在「${t.name}」。${tips[t.layer] || ''}`;
  }
  box.className = 'status ' + cls;
  box.textContent = msg;
}

// 真實視角：只給手上感覺得到的回饋（阻力、落空感、碰骨頭、有沒有 CSF）
function feelStatus(sim) {
  const t = sim.tip;
  if (S.depth === 0) return ['info', '觸診找好棘突與 Tuffier\'s line，決定入針點與角度後，往上推「進針深度」開始進針。'];
  if (sim.hit) {
    return ['bad', `碰到骨頭（約 ${sim.tipDepth.toFixed(1)} cm 深）。退針到皮下，重新調整入針點或角度。`];
  }
  if (t.layer === 'sub') return ['good', '✓ 拔出針芯（stylet）：CSF 流出！'];
  if (sim.passedSub || t.layer === 'deep' || t.layer === 'disc') {
    return ['bad', t.layer === 'disc' ? '阻力很大、很紮實。拔出針芯：沒有 CSF。' : '拔出針芯：沒有 CSF 流出。'];
  }
  const feel = {
    skin: '穿過皮膚。', subq: '阻力很低，針很好推。',
    supra: '阻力開始增加。', inter: '有韌性的阻力，針被穩穩夾住、放手也不會倒。',
    muscle: '阻力中等，但針比較會晃動、沒有被夾住的感覺。',
    flavum: '阻力明顯增加，像在推一塊硬橡皮。',
    epi: '感受到落空感。拔出針芯：沒有 CSF。', dura: '拔出針芯：沒有 CSF。',
  };
  return ['info', feel[t.layer] || '繼續進針。'];
}

let popTimer;
function pop(text) {
  const el = $('pop');
  el.textContent = text;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(popTimer); popTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

// ---------- 控制項 ----------
const bind = (id, key, fmt = (v) => v) => {
  const el = $(id), out = $(id + 'Out');
  const sync = () => { if (out) out.textContent = fmt(+el.value); };
  el.value = S[key]; sync();
  el.addEventListener('input', () => {
    S[key] = +el.value; sync();
    if (key === 'flex') updateAnatomy();
    if (key === 'roll') updateRoll();
    if (key === 'tuff') updateTuffier();
    if (key !== 'depth') { lastTipLayer = null; }
    updateNeedle();
  });
};
const flexText = (v) => v < -1 ? `${v}°（後仰，間隙變窄）` : v < 3 ? `${v}°（自然）` : v < 10 ? `${v}°（屈曲）` : `${v}°（抱膝、充分屈曲）`;
bind('flex', 'flex', flexText);
bind('roll', 'roll', (v) => v === 0 ? '0°（垂直床面）' : `${v > 0 ? '往前' : '往後'} ${Math.abs(v)}°`);
bind('tuff', 'tuff', (v) => Math.abs(v) < 0.15 ? 'L4–L5（公認）' : `${A.levelName(4 - v)}（${v > 0 ? '偏高' : '偏低'} ${Math.abs(v).toFixed(1)} 節）`);
bind('depth', 'depth', (v) => `${v.toFixed(1)} cm`);

function setVal(id, v) { const el = $(id); el.value = v; el.dispatchEvent(new Event('input')); }
$('withdraw').onclick = () => setVal('depth', 0);
function setBody(key) {
  A.setBodyType(key);
  bodyKey = key;
  rollPalpation();
  document.querySelectorAll('[data-body]').forEach(b => b.classList.toggle('on', b.dataset.body === key));
  $('bodyInfo').innerHTML = `皮下脂肪約 <b>${A.BODY_TYPES[key].fat.toFixed(1)} cm</b>（棘突尖端到皮膚）`;
  updateBody(); updateTuffier(); updateAnatomy();
  lastTipLayer = null;
  setVal('depth', 0);
}
document.querySelectorAll('[data-body]').forEach(b => (b.onclick = () => setBody(b.dataset.body)));
$('tuffRandom').onclick = () => {
  rollPalpation();
  // 偏差多半往頭側：-0.5 ~ +1.5 節
  setVal('tuff', Math.round((Math.random() * 2 - 0.5) * 10) / 10);
  if (MODE === 'god') document.querySelector('[data-mode="real"]').click();
};

// ---------- 畫面右側的進針深度桿：往上推 = 往深處推針（最下面 = 皮膚）----------
const dTrack = $('dTrack'), dThumb = $('dThumb'), dFill = $('dFill');
let D_MAX = NEEDLE_LEN; // 整支針推到底
function buildTicks() {
  dTrack.querySelectorAll('.tick').forEach(t => t.remove());
  const step = D_MAX > 10 ? 2 : 1;
  for (let cm = 0; cm <= D_MAX; cm += step) {
    const t = document.createElement('div');
    t.className = 'tick'; t.textContent = cm;
    t.style.top = ((1 - cm / D_MAX) * 100) + '%';
    dTrack.appendChild(t);
  }
}
buildTicks();

function setNeedle(key) {
  needleKey = key;
  NEEDLE_LEN = NEEDLES[key].len;
  NEEDLE_TOTAL = NEEDLE_LEN + 1.3;
  shaft.geometry.dispose(); shaft.geometry = new THREE.CylinderGeometry(0.045, 0.045, NEEDLE_LEN, 12);
  shaft.position.y = NEEDLE_LEN / 2;
  hub.position.y = NEEDLE_LEN + 0.65;
  needleGrab.geometry.dispose(); needleGrab.geometry = new THREE.CylinderGeometry(0.5, 0.5, NEEDLE_TOTAL, 10);
  needleGrab.position.y = NEEDLE_TOTAL / 2;
  D_MAX = NEEDLE_LEN;
  $('depth').max = NEEDLE_LEN;
  buildTicks();
  document.querySelectorAll('[data-needle]').forEach(b => b.classList.toggle('on', b.dataset.needle === key));
  lastTipLayer = null;
  setVal('depth', 0);
}
document.querySelectorAll('[data-needle]').forEach(b => (b.onclick = () => setNeedle(b.dataset.needle)));
function syncDepthUI() {
  const f = S.depth / D_MAX * 100;
  dThumb.style.top = (100 - f) + '%';
  dFill.style.height = f + '%';
}
let dDrag = false;
function depthFromPointer(e) {
  const r = dTrack.getBoundingClientRect();
  const f = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
  const v = Math.round(f * D_MAX / 0.05) * 0.05;
  if (Math.abs(v - S.depth) > 1e-6) setVal('depth', +v.toFixed(2));
}
dTrack.addEventListener('pointerdown', (e) => { dDrag = true; dTrack.setPointerCapture(e.pointerId); depthFromPointer(e); e.preventDefault(); });
dTrack.addEventListener('pointermove', (e) => { if (dDrag) depthFromPointer(e); });
dTrack.addEventListener('pointerup', () => (dDrag = false));
dTrack.addEventListener('pointercancel', () => (dDrag = false));
dTrack.addEventListener('wheel', (e) => { e.preventDefault(); setVal('depth', Math.min(D_MAX, Math.max(0, +(S.depth + (e.deltaY < 0 ? 0.1 : -0.1)).toFixed(2)))); }, { passive: false });
$('reset').onclick = () => {
  Object.assign(S, { x: 0, y: DEFAULT_Y, ceph: 12, horiz: 0 });
  setBody('normal');
  setNeedle('std');
  setVal('tuff', 0);
  setVal('flex', 6); setVal('roll', 0); setVal('depth', 0);
};

// ---------- 直接在 3D 裡拖曳：紅點 = 入針點，綠色針尾 = 角度 ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let drag = null; // { kind: 'entry' | 'needle', plane, ... }
function setRay(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function pickHandle(e) {
  setRay(e);
  const hits = ray.intersectObjects([entryGrab, needleGrab], false);
  if (!hits.length) return null;
  // 紅點優先；其餘針身都算「改角度」
  return hits.some(h => h.object === entryGrab) ? 'entry' : 'needle';
}
function withdrawTo(maxDepth, why) {
  if (S.depth > maxDepth) { setVal('depth', maxDepth); pop(why); }
}
renderer.domElement.addEventListener('pointerdown', (e) => {
  const kind = pickHandle(e);
  if (!kind) return;
  controls.enabled = false;
  renderer.domElement.setPointerCapture(e.pointerId);
  if (kind === 'entry') {
    withdrawTo(0, '移動入針點前，先把針完全退出');
    // 拖曳面 = 皮膚平面（病人座標系 z = SKIN_Z）
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(patient.quaternion);
    const p0 = patient.localToWorld(new THREE.Vector3(0, 0, A.SKIN_Z));
    drag = { kind, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, p0) };
  } else {
    withdrawTo(1.0, '改變角度前，先退到皮下');
    // 找出手指按到的是針上的哪一點（離入針點多遠）
    const d = new THREE.Vector3(...A.needleDirBed(S.ceph, S.horiz, S.roll));
    const entryL = new THREE.Vector3(S.x, S.y, A.SKIN_Z);
    const entryW = patient.localToWorld(entryL.clone());
    const farW = patient.localToWorld(entryL.clone().addScaledVector(d, -NEEDLE_TOTAL));
    const onSeg = new THREE.Vector3();
    ray.ray.distanceSqToSegment(entryW, farW, undefined, onSeg);
    // 太靠近入針點時，角度會變得過度敏感 → 至少當作 3 cm 遠的位置來算
    const lever = Math.max(3, onSeg.distanceTo(entryW));
    const grabW = entryW.clone().add(farW.clone().sub(entryW).setLength(lever));
    const n = camera.getWorldDirection(new THREE.Vector3()).negate();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, grabW);
    const startW = ray.ray.intersectPlane(plane, new THREE.Vector3()) || grabW.clone();
    drag = { kind, plane, grabW, startW };
  }
  viewer.classList.add('dragging');
  e.preventDefault();
}, true); // capture：比 OrbitControls 先收到，避免拖曳時畫面跟著轉

renderer.domElement.addEventListener('pointermove', (e) => {
  if (!drag) {
    if (e.pointerType === 'mouse') viewer.classList.toggle('canGrab', !!pickHandle(e));
    return;
  }
  setRay(e);
  let hitW = ray.ray.intersectPlane(drag.plane, new THREE.Vector3());
  if (!hitW) return;
  // 抓針時用「位移量」帶動抓住的那一點，避免一按下去針就跳一下
  if (drag.kind === 'needle') hitW = drag.grabW.clone().add(hitW.sub(drag.startW));
  const hit = patient.worldToLocal(hitW.clone());
  if (drag.kind === 'entry') {
    let x = Math.max(-2, Math.min(2, Math.round(hit.x * 10) / 10));
    if (Math.abs(x) < 0.15) x = 0; // 靠近中線時自動吸附到中線
    S.x = x;
    S.y = Math.max(A.Y_BOT - 1, Math.min(A.Y_TOP + 0.5, Math.round(hit.y * 10) / 10));
  } else {
    const entry = new THREE.Vector3(S.x, S.y, A.SKIN_Z);
    const dir = entry.clone().sub(hit).normalize(); // 抓住的點 → 入針點 = 針的方向
    const ang = A.anglesFromDir([dir.x, dir.y, dir.z], S.roll);
    if (!ang) return;
    S.ceph = Math.max(-30, Math.min(45, Math.round(ang.ceph)));
    S.horiz = Math.max(-45, Math.min(45, Math.round(ang.horiz)));
  }
  lastTipLayer = null;
  updateNeedle();
});
function endDrag() {
  if (!drag) return;
  drag = null;
  controls.enabled = true;
  viewer.classList.remove('dragging');
}
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

// 顯示選項
function applyVisibility() {
  const god = MODE === 'god';
  const on = (id) => $(id).checked;
  for (const o of Object.values(vertObjs)) o.pivot.visible = god;
  ligs.forEach(o => { o.flavum.visible = god; o.inter.visible = o.supra.visible = god && on('tLig'); });
  discMeshes.forEach(m => (m.visible = god));
  duraMesh.visible = god && on('tDura');
  caudaFibers.forEach(f => (f.visible = god && on('tDura')));
  skin.visible = midline.visible = fatMesh.visible = god && on('tSkin');
  realSkin.visible = !god;
  labelRenderer.domElement.style.display = on('tLabels') ? '' : 'none';
  document.body.classList.toggle('real', !god);
  updateTuffier(); updateAnatomy(); updateNeedle();
}
['tSkin', 'tLig', 'tDura', 'tLabels', 'tPath'].forEach(id => ($(id).onchange = applyVisibility));
document.querySelectorAll('[data-mode]').forEach(b => (b.onclick = () => {
  MODE = b.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
  lastTipLayer = null;
  applyVisibility();
}));
$('tCut').onchange = (e) => {
  clipMats.forEach(m => { m.clippingPlanes = e.target.checked ? [clipPlane] : []; m.needsUpdate = true; });
};

// 視角
// 視角（相機的「上」= 病人右側）
const CY = -1.85; // 以 L4 為畫面中心
const VIEWS = { back: [3, CY, 28], side: [22, CY + 0.01, 4], oblique: [14, CY + 8, 20], head: [3, CY + 24, 6] };
function setView(name) {
  camera.position.set(...VIEWS[name]);
  controls.target.set(0, CY, 3);
  controls.update();
}
// （視角按鈕已移除；使用者自己旋轉視角）

// ---------- 尺寸與迴圈 ----------
function resize() {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  renderer.setSize(w, h); labelRenderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewer);

// 預設：剖面開啟、側面視角
$('tCut').checked = true;
clipMats.forEach(m => (m.clippingPlanes = [clipPlane]));
setView('oblique');
resize();
updateRoll();
setBody('normal');
updateTuffier();
updateAnatomy();
updateNeedle();
$('loading').remove();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});
