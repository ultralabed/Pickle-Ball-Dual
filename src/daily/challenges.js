// The 20 daily challenge types. This file is the content: to add a challenge, add one entry to CHALLENGES.
//
// Each entry has:
//   id     stable key (used in seeds and saves: never rename)
//   tier   1 easy, 2 medium, 3 hard (a day is two tier-1, two tier-2 and one tier-3, easy first)
//   name   { zh, en }
//   how    { zh, en } one-line instruction
//   gen(r) parameter generator: r() is a seeded random in [0, 1). Returns a stage (or null to reroll):
//            player {x, z}            where the player stands (z > 0 is the player's side, the net is z = 0)
//            hitY                     contact height of a self-fed ball (default 0.9 m)
//            targets [{x, z, full, zero, move?, strip?}]   full / zero = metres for 100 / 0 points
//            shots  [SHOT.*]          the shot types offered (first one is preselected)
//            wind {x, z}              acceleration on the ball in m/s^2
//            defs [{x, z, r, h}]      defenders: a ball inside radius r below height h is blocked
//            balls, agg               balls per stage (default 3); agg 'best' (default) or 'avg' (ball i goes to target i)
//            serve {box}              serve rules: must land in the service box on the x-sign `box` side
//            bucket {x, z, r, h}      a bucket to land in
//            inc, feeder              an incoming ball (see buildIncoming) and where its hitter stands
//   score(st, res, tg) scoring rule: 0..100 for a ball that landed in (res = flight result, tg = the target as it is at landing)
//
// Every generated stage is checked by the solver (engine.genStage): setups a perfect player cannot score 95 on are rerolled.
import {
  COURT, SHOT, U, sgn, pick, ringScore, distTo, inKitchenFar, feedToLand, feedThrough, buildIncoming,
} from './engine.js';

const HW = COURT.halfW, HL = COURT.halfL, K = COURT.kitchen;
const FT3 = 0.914;   // 3 ft
const T = (x, z, full = 0.23, zero = 2.44) => ({ x, z, full, zero });
const ring = (st, res, tg) => ringScore(distTo(res, tg), tg.full, tg.zero);
const softKitchen = (st, res, tg) => ring(st, res, tg) * (inKitchenFar(res) ? 1 : 0.5);
const STD = [SHOT.drive, SHOT.drop, SHOT.lob];

export const CHALLENGES = [
  {
    id: 'third-drop', tier: 1,
    name: { zh: '第三拍小球', en: 'Third-shot drop' },
    how: { zh: '從底線輕輕打，讓球落進對面的廚房（網前那一塊）。', en: 'From the baseline, land the ball softly in the far kitchen.' },
    gen: (r) => ({
      player: { x: U(r, -2.2, 2.2), z: U(r, 6.3, 6.9) },
      targets: [T(U(r, -2.2, 2.2), -U(r, 0.7, 1.6))],
      shots: [SHOT.drop, SHOT.lob, SHOT.drive], zone: 'kitchen',
    }),
    score: softKitchen,
  },
  {
    id: 'cross-dink', tier: 1,
    name: { zh: '廚房對吊', en: 'Cross-court dink' },
    how: { zh: '站在廚房線，把球輕輕吊到對面斜對角的廚房角落。', en: 'From the kitchen line, dink into the far diagonal kitchen corner.' },
    gen: (r) => {
      const s = sgn(r);
      return {
        player: { x: s * U(r, 1.0, 2.2), z: U(r, 2.3, 2.6) }, hitY: 0.6,
        targets: [T(-s * U(r, 1.7, 2.5), -U(r, 0.7, 1.5), 0.23, 2.0)],
        shots: [SHOT.dink, SHOT.push], zone: 'kitchen',
      };
    },
    score: softKitchen,
  },
  {
    id: 'deep-serve', tier: 1,
    name: { zh: '深發球', en: 'Deep serve' },
    how: { zh: '發球到斜對面的發球區，落在離底線 3 呎以內的亮帶上。', en: 'Serve into the diagonal box, landing within 3 ft of the baseline.' },
    gen: (r) => {
      const s = sgn(r);
      return {
        player: { x: s * U(r, 0.5, 2.5), z: 7.0 }, hitY: 0.75,
        targets: [{ x: -s * HW / 2, z: -HL + FT3 / 2, full: FT3, zero: FT3 + 2.6, strip: { w: HW, d: FT3 } }],
        shots: [SHOT.serve, SHOT.serveHi], serve: { box: -s }, zone: 'box',
      };
    },
    // distance from the baseline: full marks inside 3 ft, then falling off
    score: (st, res, tg) => { const d = res.z + HL; return d <= tg.full ? 100 : 100 * (1 - (d - tg.full) / (tg.zero - tg.full)); },
  },
  {
    id: 'corner-serve', tier: 1,
    name: { zh: '發球角落', en: 'Corner serve' },
    how: { zh: '發球到斜對面發球區裡標出來的那個角落。', en: 'Serve into the marked corner of the diagonal service box.' },
    gen: (r) => {
      const s = sgn(r);
      const cx = pick(r, [0.5, HW - 0.5]), cz = pick(r, [K + 0.55, HL - 0.5]);
      return {
        player: { x: s * U(r, 0.5, 2.5), z: 7.0 }, hitY: 0.75,
        targets: [T(-s * cx, -cz)],
        shots: [SHOT.serve, SHOT.serveHi], serve: { box: -s }, zone: 'box',
      };
    },
    score: ring,
  },
  {
    id: 'lob', tier: 2,
    name: { zh: '高吊過頭', en: 'Lob' },
    how: { zh: '兩個對手站在網前。把球高高吊過他們的頭，落在後場界內。', en: 'Lob over the two players at the net and land deep, inside the lines.' },
    gen: (r) => ({
      player: { x: U(r, -2, 2), z: U(r, 4.6, 6.6) },
      targets: [T(U(r, -2.1, 2.1), -U(r, 5.0, 6.0))],
      defs: [{ x: -1.5 + U(r, -0.25, 0.25), z: -2.4, r: 1.2, h: 2.6 }, { x: 1.5 + U(r, -0.25, 0.25), z: -2.4, r: 1.2, h: 2.6 }],
      shots: [SHOT.lob, SHOT.drop],
    }),
    score: ring,
  },
  {
    id: 'line-pass', tier: 1,
    name: { zh: '邊線穿越', en: 'Down-the-line pass' },
    how: { zh: '對手守在網前。沿著邊線把球打過去，別被他攔到。', en: 'Pass the net player down the sideline without getting blocked.' },
    gen: (r) => {
      const s = sgn(r);
      return {
        player: { x: s * U(r, 1.7, 2.5) - 0.4, z: U(r, 4.6, 6.7) },
        targets: [T(s * U(r, 2.35, 2.65), -U(r, 4.4, 5.9))],
        defs: [{ x: s * U(r, 0.9, 1.35), z: -U(r, 2.2, 2.6) }],
        shots: STD,
      };
    },
    score: ring,
  },
  {
    id: 'split-middle', tier: 2,
    name: { zh: '中路穿越', en: 'Split the middle' },
    how: { zh: '兩個對手一左一右。把球從他們中間的空隙打過去。', en: 'Hit through the gap between the two defenders.' },
    gen: (r) => ({
      player: { x: U(r, -1.6, 1.6), z: U(r, 4.6, 6.7) },
      targets: [T(U(r, -0.45, 0.45), -U(r, 4.5, 5.9))],
      defs: [{ x: -U(r, 1.45, 1.75), z: -U(r, 2.1, 3.0) }, { x: U(r, 1.45, 1.75), z: -U(r, 2.1, 3.0) }],
      shots: [SHOT.drive, SHOT.drop],
    }),
    score: ring,
  },
  {
    id: 'wind-lob', tier: 3,
    name: { zh: '逆風高吊', en: 'Lob into a headwind' },
    how: { zh: '風迎面吹來，球會被吹回來。高吊過網前兩人，落在後場。', en: 'The wind blows at you. Lob over the two net players and still land deep.' },
    gen: (r) => ({
      player: { x: U(r, -2, 2), z: U(r, 4.6, 6.4) },
      targets: [T(U(r, -2.0, 2.0), -U(r, 4.8, 5.8))],
      defs: [{ x: -1.5 + U(r, -0.25, 0.25), z: -2.4, r: 1.2, h: 2.6 }, { x: 1.5 + U(r, -0.25, 0.25), z: -2.4, r: 1.2, h: 2.6 }],
      wind: { x: U(r, -0.5, 0.5), z: U(r, 1.8, 3.4) },
      shots: [SHOT.lob, SHOT.drop],
    }),
    score: ring,
  },
  {
    id: 'cross-wind', tier: 2,
    name: { zh: '側風平抽', en: 'Drive in a crosswind' },
    how: { zh: '風從旁邊吹，球會往一邊飄。瞄偏一點，把平抽打到後場的圈。', en: 'A side wind pushes the ball. Aim off and drive to the deep target.' },
    gen: (r) => ({
      player: { x: U(r, -2, 2), z: U(r, 5.4, 6.8) },
      targets: [T(U(r, -2.0, 2.0), -U(r, 4.4, 5.8))],
      wind: { x: sgn(r) * U(r, 2.6, 4.8), z: 0 },
      shots: [SHOT.drive, SHOT.drop],
    }),
    score: ring,
  },
  {
    id: 'atp', tier: 3,
    name: { zh: '繞柱球', en: 'Around the post (ATP)' },
    how: { zh: '你被拉到場外，球很低，過不了網。從網柱外面繞過去，打進場內。', en: 'You are pulled wide and the ball is too low for the net. Send it around the post and in.' },
    gen: (r) => {
      const s = sgn(r);
      const px = s * U(r, 4.1, 4.7), pz = U(r, 0.7, 2.0);
      const tx = s * U(r, 1.4, 2.6), tz = -U(r, 2.6, 4.8);
      const hit = { x: px - s * 0.25, y: U(r, 0.3, 0.42), z: pz - 0.35 };
      const xNet = hit.x + (tx - hit.x) * (hit.z / (hit.z - tz));
      if (Math.abs(xNet) < COURT.postX + 0.18) return null;
      return {
        player: { x: hit.x - 0.4, z: pz }, hit,
        targets: [T(tx, tz)],
        shots: [SHOT.flat, SHOT.roll], atp: s,
      };
    },
    score: ring,
  },
  {
    id: 'deep-return', tier: 1,
    name: { zh: '接發深回', en: 'Deep return' },
    how: { zh: '對手發球過來。等球彈一下，再把它回到後場的圈。', en: 'A serve comes at you. Let it bounce, then return it deep to the target.' },
    gen: (r) => {
      const s = sgn(r);
      const F = { x: -s * U(r, 0.8, 2.2), y: 0.8, z: -6.9 };
      const V = feedToLand(F, { x: s * U(r, 0.7, 2.1), z: U(r, 3.6, 4.7) }, U(r, 18, 24));
      if (!V) return null;
      const inc = buildIncoming(F, V, (p) => { for (let i = 1; i < p.length; i++) if (p[i].b === 1 && p[i].vy <= 0) return i; return null; }, 0.75);
      if (!inc) return null;
      return {
        inc, feeder: { x: F.x + 0.4, z: F.z + 0.3 },
        targets: [T(U(r, -2.1, 2.1), -U(r, 5.0, 6.0))],
        shots: STD,
      };
    },
    score: ring,
  },
  {
    id: 'volley', tier: 2,
    name: { zh: '截擊', en: 'Volley' },
    how: { zh: '你站在網前，快球飛過來。不等它落地，抓準時間打到圈裡。', en: 'A fast ball comes at you at the net. Time the hit, out of the air, to the target.' },
    gen: (r) => {
      const F = { x: U(r, -2, 2), y: 1.0, z: -5.6 };
      const C = { x: U(r, -1.7, 1.7), y: U(r, 1.0, 1.35), z: U(r, 2.4, 2.8) };
      const V = feedThrough(F, C, U(r, 9.5, 11.5));
      if (!V) return null;
      const inc = buildIncoming(F, V, (p) => { for (let i = 1; i < p.length; i++) if (p[i].b === 0 && p[i].z >= C.z) return i; return null; }, 0.95);
      if (!inc) return null;
      return {
        inc, feeder: { x: F.x + 0.4, z: F.z - 0.3 },
        targets: [T(U(r, -2.2, 2.2), -U(r, 3.2, 5.6))],
        shots: [SHOT.punch, SHOT.blockV],
      };
    },
    score: ring,
  },
  {
    id: 'smash', tier: 3,
    name: { zh: '扣殺', en: 'Overhead smash' },
    how: { zh: '對手吊了一顆高球。等球掉到頭上，往沒人的那一邊用力扣下去。', en: 'A lob is coming down. Smash it into the open court, away from the defender.' },
    gen: (r) => {
      const s = sgn(r);
      const F = { x: U(r, -1.5, 1.5), y: 1.0, z: -4.6 };
      const V = feedToLand(F, { x: U(r, -1.4, 1.4), z: U(r, 3.4, 4.6) }, U(r, 58, 64));
      if (!V) return null;
      const inc = buildIncoming(F, V, (p) => { for (let i = 1; i < p.length; i++) if (p[i].b === 0 && p[i].vy < 0 && p[i].y <= 2.35) return i; return null; }, 0.8);
      if (!inc) return null;
      inc.above = true;
      return {
        inc, feeder: { x: F.x + 0.4, z: F.z - 0.3 },
        targets: [T(-s * U(r, 1.2, 2.3), -U(r, 3.4, 5.4))],
        defs: [{ x: s * U(r, 1.0, 1.7), z: -U(r, 3.6, 4.8) }],
        shots: [SHOT.smash, SHOT.steep],
      };
    },
    score: ring,
  },
  {
    id: 'reset', tier: 3,
    name: { zh: '重置球', en: 'Reset' },
    how: { zh: '對手用力抽球過來。不要打回去，輕輕擋一下，讓球掉進對面廚房。', en: 'A hard drive comes at you. Do not hit back hard: block it softly into the far kitchen.' },
    gen: (r) => {
      const F = { x: U(r, -2, 2), y: 1.0, z: -2.5 };
      const C = { x: U(r, -1.6, 1.6), y: U(r, 0.7, 1.0), z: U(r, 3.8, 4.8) };
      const V = feedThrough(F, C, U(r, 12, 14));
      if (!V) return null;
      const inc = buildIncoming(F, V, (p) => { for (let i = 1; i < p.length; i++) if (p[i].b === 0 && p[i].z >= C.z) return i; return null; }, 0.95);
      if (!inc) return null;
      return {
        inc, feeder: { x: F.x + 0.4, z: F.z - 0.3 },
        targets: [T(U(r, -2.0, 2.0), -U(r, 0.7, 1.5))],
        shots: [SHOT.block, SHOT.lift], zone: 'kitchen',
      };
    },
    score: softKitchen,
  },
  {
    id: 'sharp-dink', tier: 2,
    name: { zh: '小角度斜線', en: 'Sharp-angle dink' },
    how: { zh: '把球吊到廚房裡緊貼邊線的圈。打太大力就出界。', en: 'Dink to the target hugging the sideline inside the kitchen. Too hard and it is out.' },
    gen: (r) => {
      const s = sgn(r);
      return {
        player: { x: s * U(r, 0.3, 1.8), z: U(r, 2.3, 2.6) }, hitY: 0.6,
        targets: [T(-s * (HW - 0.3), -U(r, 0.6, 1.2), 0.23, 1.5)],
        shots: [SHOT.dink, SHOT.push], zone: 'kitchen',
      };
    },
    score: softKitchen,
  },
  {
    id: 'three-targets', tier: 2,
    name: { zh: '連續三靶', en: 'Three targets' },
    how: { zh: '三顆球，照 1、2、3 的順序各打一個圈。分數是三球的平均。', en: 'Three balls, three targets in order 1, 2, 3. Your score is the average.' },
    gen: (r) => {
      const s = sgn(r);
      return {
        player: { x: U(r, -1.5, 1.5), z: U(r, 5.6, 6.8) },
        targets: [T(s * U(r, 1.0, 2.2), -U(r, 0.8, 1.6)), T(U(r, -0.8, 0.8), -U(r, 3.0, 4.0)), T(-s * U(r, 1.0, 2.2), -U(r, 5.0, 5.9))],
        shots: STD, agg: 'avg',
      };
    },
    score: ring,
  },
  {
    id: 'moving', tier: 2,
    name: { zh: '移動靶', en: 'Moving target' },
    how: { zh: '圈會左右滑來滑去。算好球飛過去的時間，打到它會到的地方。', en: 'The target slides side to side. Lead it: hit where it will be when the ball lands.' },
    gen: (r) => ({
      player: { x: U(r, -1.5, 1.5), z: U(r, 5.4, 6.8) },
      targets: [{ ...T(U(r, -0.5, 0.5), -U(r, 3.4, 5.4)), move: { A: U(r, 1.2, 1.8), T: U(r, 3.4, 4.6) } }],
      shots: STD,
    }),
    score: ring,
  },
  {
    id: 'tiny', tier: 3,
    name: { zh: '小靶', en: 'Tiny target' },
    how: { zh: '這個圈很小。只有打得很近才有分，差一點就是 0。', en: 'A very small bullseye. Only a ball right next to it scores.' },
    gen: (r) => ({
      player: { x: U(r, -2, 2), z: U(r, 4.6, 6.6) },
      targets: [T(U(r, -2.2, 2.2), -U(r, 2.6, 5.6), 0.13, 0.95)],
      shots: STD,
    }),
    score: ring,
  },
  {
    id: 'one-ball', tier: 3,
    name: { zh: '一球定勝負', en: 'One ball' },
    how: { zh: '這一題只有一顆球，沒有重來。繞過網前的人，打到後場角落。', en: 'Only one ball, no second try. Get past the net player to the deep corner.' },
    gen: (r) => {
      const s = sgn(r);
      return {
        player: { x: U(r, -2, 2), z: U(r, 5.0, 6.8) },
        targets: [T(s * U(r, 1.6, 2.4), -U(r, 4.8, 5.8))],
        defs: [{ x: U(r, -0.6, 0.6), z: -U(r, 2.2, 2.8) }],
        shots: STD, balls: 1,
      };
    },
    score: ring,
  },
  {
    id: 'bucket', tier: 3,
    name: { zh: '進桶球', en: 'Bucket shot' },
    how: { zh: '場上放了一個桶子。把球直接打進桶裡就是 100 分。', en: 'There is a bucket on the court. Land the ball in it for 100.' },
    gen: (r) => {
      const bx = U(r, -2.0, 2.0), bz = -U(r, 2.4, 4.8);
      return {
        player: { x: U(r, -2, 2), z: U(r, 3.2, 6.0) },
        targets: [T(bx, bz, 0.3, 2.44)],
        bucket: { x: bx, z: bz, r: 0.34, h: 0.42 },
        shots: [SHOT.drop, SHOT.lob],
      };
    },
    // in the bucket = 100; a ball that lands beside it gets at most 70
    score: (st, res, tg) => (res.kind === 'bucket' ? 100 : Math.min(70, ringScore(distTo(res, tg), 0.3, tg.zero))),
  },
];

export const BY_ID = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));
