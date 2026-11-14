# Pickleball 3D — build spec (single source of truth)

Browser game, plain ES modules, **no bundler / no build step**. Served by any static server
(`npx serve .` or `python3 -m http.server`). Three.js is vendored at `vendor/three.module.js`
(r170, already present). `index.html` uses an import map: `{"imports":{"three":"./vendor/three.module.js"}}`.
No other runtime dependencies, no CDN, no downloaded assets (all art procedural, all sound synthesized).

UI text: Traditional Chinese (zh-TW). Referee voice + score calls: English.
Target: desktop Chrome/Safari on a Mac, keyboard + mouse, 60 fps.

## 0. Architecture rule (future P2P 2v2)

The game is single-machine now, but must be ready for peer-to-peer later. Therefore:

- `src/sim/**` is a **pure, deterministic, headless simulation**: no DOM, no `three`, no `Math.random`
  (use the seeded RNG), no `Date.now`/`performance.now`. Runs in Node for tests.
- Fixed timestep: `sim.step(inputs)` always advances exactly `DT = 1/120` s. The shell accumulates real time.
- Every player slot is driven by an **Input** object, whoever produces it (keyboard, AI, later a network peer).
  AI lives inside the sim (`controller:'ai'`) and generates Inputs through the same path as a human.
- `sim.state` is plain JSON-serialisable data (no class instances, no functions) → can be snapshotted, hashed, sent.
- Rendering/audio/UI only **read** state and events; they never mutate the sim.

## 1. Coordinates & court (meters)

- `x` = across the court (width), `y` = up, `z` = along the court. Net is the plane `z = 0`.
- Team 0 (the human's team) plays on `z > 0`; team 1 on `z < 0`. Camera sits behind team 0 at +z looking toward −z,
  so +x is the human's right.
- Court 6.10 wide × 13.41 long → sidelines `x = ±3.05`, baselines `z = ±6.705`.
- Non-volley zone ("kitchen") line at `z = ±2.134`. Centerline `x = 0` from kitchen line to baseline.
- Net height 0.914 at the posts, 0.864 at center (interpolate). Posts at `x = ±3.355`.
- Ball: radius 0.037, mass 0.0265 kg. Use gravity 9.81, quadratic air drag (pickleballs slow down a lot), 
  bounce restitution ≈ 0.62 vertical, horizontal friction ≈ 0.80. Spin is optional (visual only is fine).
- Singles uses the same court and lines.

## 2. Rules (must be correct — unit tested)

Common:
- Serve: underhand, server behind own baseline on the correct half; must cross the net and land in the
  **diagonally opposite service court**. Landing on the kitchen line or in the kitchen = fault. Sideline, baseline,
  centerline are in. A serve that clips the net and lands in the correct court is **live** (no let).
  One serve attempt only.
- Two-bounce rule: the return of serve must bounce before being hit, and the serving side's next shot (3rd shot)
  must also bounce before being hit. After that, volleys are allowed.
- Non-volley zone: hitting a volley (ball has not bounced) while the hitter's position is inside the kitchen or on
  its line is a fault. Momentum: if the hitter enters the kitchen within 0.6 s after a volley → fault.
  Being in the kitchen is fine otherwise; hitting a bounced ball there is fine.
- Faults (rally lost by that team): ball lands out; ball into net and doesn't cross; ball bounces twice on your side;
  volley violating the two-bounce rule; kitchen violation; ball hits a player's body (that player's team loses);
  wrong-court serve.
- Line calls: all lines are in, except the kitchen line on a serve.
- ATP (around the post): a ball that passes **outside** a net post (`|x| > 3.355` when crossing `z = 0`) may travel at
  any height, even below net height, and is legal if it lands in the opponent's court. The net only blocks `|x| ≤ 3.355`.

Scoring mode `sideout` (traditional):
- Only the serving team scores. Game to 11, win by 2.
- Doubles: each team has two servers per service turn, except the very first service turn of the game, which starts
  on **server 2** (call "0-0-2"). The service turn always starts with the player currently on the **right** court as
  server 1. When the serving team wins a rally: +1 point, server and partner swap halves, same server serves again
  from the other half. When they lose a rally: server 1 → server 2 (the partner serves from the half they are standing
  in); server 2 → side out. The receiving team never swaps halves. Receiver = the opponent diagonally opposite.
- Score call doubles: "serving score – receiving score – server number".
- Singles: one server; serves from the right half when own score is even, left when odd; call "server – receiver".

Scoring mode `rally`:
- Every rally scores a point for the winner. Game to 15, win by 2. No second server.
- Server serves from the right half when the serving team's score is even, left when odd.
  Doubles: players do not swap halves; the player standing on the correct half serves. Side out when the serving team
  loses a rally. Call "server – receiver".

Not implemented (intentional): end changes, time-outs, rally-scoring freeze.

## 3. Sim API (`src/sim/index.js`)

```js
import { createSim, DT, COURT, SHOTS, DUPR_LEVELS } from './sim/index.js';

const sim = createSim({
  mode: 'doubles' | 'singles',
  scoring: 'sideout' | 'rally',
  seed: 12345,
  players: [                       // 4 for doubles, 2 for singles
    { id: 0, team: 0, controller: 'human', dupr: 4.0, handed: 'R', name: '你' },
    { id: 1, team: 0, controller: 'ai',    dupr: 4.0, handed: 'R', name: '隊友' },
    { id: 2, team: 1, controller: 'ai',    dupr: 4.0, handed: 'R', name: '對手A' },
    { id: 3, team: 1, controller: 'ai',    dupr: 4.0, handed: 'L', name: '對手B' },
  ],
});
sim.step(inputs);          // inputs: { [playerId]: Input } for non-AI players; advances DT
const evts = sim.drainEvents();
sim.state;                 // see below
sim.snapshot(); sim.restore(snap);   // deep copy / restore (for future netcode)
```

`controller` ∈ `'human' | 'ai' | 'remote'` — `human` and `remote` both simply read from `inputs`.
`dupr` ∈ 3.0, 4.0, 5.0, 6.0 (for a human slot it only sets base accuracy; use the 4.0–5.0 feel).

### Input
```js
{ mx: -1..1,        // +1 = toward +x (human's right)
  mz: -1..1,        // +1 = toward +z (back, away from net for team 0)   — world axes, not relative
  swing: null | 'drive' | 'drop' | 'dink' | 'lob',   // set on the ONE tick the swing is triggered
  power: 0..1,      // drive charge (0.5 default); ignored by other shots
  aim: -1 | 0 | 1 } // -1 = aim toward −x (left on screen), +1 = toward +x, 0 = middle / safe
```
A swing lasts ~0.4 s with a contact window (≈0.08–0.28 s). If the ball comes within reach during the window,
contact happens. Timing quality (how centered in the window) + how stretched the player is + skill → error.
`drive` with contact height above ~1.6 m becomes a **smash** automatically. While the serving player is in
`preServe`, any swing type starts the serve (drive = fast deep serve, lob = high serve, others = soft serve).
If contact happens with the player wide outside the sideline (|x| > ~3.5) near the net and a path around the post
exists, the shot becomes an **ATP** (low, around the post). `hit` event carries `atp: true`.

### State (all plain data)
```js
state = {
  tick, time,
  phase: 'preServe' | 'serve' | 'rally' | 'pointOver' | 'gameOver',
  phaseTime,                      // seconds since phase began
  config,                         // as passed in
  ball: { pos:{x,y,z}, vel:{x,y,z}, spin:{x,y,z}, visible, bounces,          // bounces since last hit
          lastHitBy,              // player id or null
          landing: {x,z,t}|null },// predicted next ground contact (for the landing marker)
  players: [{ id, team, name, handed, dupr, controller,
              pos:{x,z}, vel:{x,z}, facing,          // facing: radians, 0 = looking toward −z
              anim: { name, t, side, shot },         // see below
              isServer, isReceiver, emotion }],      // emotion: 'neutral'|'happy'|'sad'|'focused'
  score: { points:[t0,t1], servingTeam, serverId, receiverId, serverNumber,   // 1|2 (always 1 in singles/rally)
           callText,              // e.g. "4 - 2 - 1"
           gamePoint, winner },   // winner: null | 0 | 1
  rally: { hits, lastShot, twoBounceRemaining },
}
```
`anim.name` ∈ `idle, ready, run, serveReady, serve, drive, drop, dink, lob, smash, volley, celebrate, dejected`.
`anim.t` = seconds since that anim started. `anim.side` ∈ `forehand | backhand` (decided from ball position
relative to the player's paddle hand: handed 'R' + ball on the player's right ⇒ forehand). Movement speed in `vel`
lets the renderer blend a run cycle under any upper-body anim.

### Events (from `drainEvents()`), each `{ type, tick, ... }`
- `serveReady { serverId, callText, callWords }` — callWords e.g. `["four","two","one"]`
- `hit { playerId, shot, side, power, atp, isVolley, isServe, pos:{x,y,z}, speed }` — shot ∈ SHOTS + `'smash'|'serve'`
- `bounce { pos:{x,z}, inBounds, speed }`
- `netTouch { pos }`
- `fault { reason, team, playerId }` — reason ∈ `out, net, doubleBounce, kitchen, twoBounceRule, serveShort, serveWrongCourt, bodyHit`
- `rallyEnd { winnerTeam, reason, hits, pointScored, sideOut, secondServer, highlight, highlightReason }`
  — `highlight` true for: smash winner, ATP winner, rally ≥ 10 hits, lob winner, game point won.
- `gameOver { winnerTeam, points }`

After `rallyEnd` the sim stays in `pointOver` ~2.5 s (players play celebrate/dejected), then repositions for the next
serve and enters `preServe`. In `preServe` an AI server waits ~1.5 s then serves; a human server waits for a swing input.
`sim.skipPointOver()` lets the shell shorten/hold this (shell calls it after a replay finishes).

### Shots (targets on the opponent side; error grows with lower skill / bad timing / stretch)
- `drive` — fast, flat, deep; power scales speed.
- `drop` — soft arc landing in the opponent kitchen (the classic 3rd-shot drop).
- `dink` — very soft, low, into the kitchen; from far back it degrades into a weak drop.
- `lob` — high arc landing deep near the baseline.
- `smash` — steep, very fast, downward; only from high contact.
- `atp` — around the post, low.
Trajectory must be solved with the **same integrator** used for flight (so `ball.landing` is exact).

### AI (`src/sim/ai.js`), DUPR profiles
| | 3.0 | 4.0 | 5.0 | 6.0 |
|---|---|---|---|---|
| move speed | slow | medium | fast | very fast |
| reaction delay | ~0.45 s | ~0.30 s | ~0.20 s | ~0.12 s |
| unforced error | high | medium | low | very low |
| strategy | stays back, mostly drives/lobs, pops balls up | 3rd-shot drop sometimes, comes to kitchen, dinks | reliable drop, patient dinking, attacks high balls, targets weaker/backhand side | all of 5.0 + disguises, speed-ups at the body/feet, poaches, attempts ATP, almost never misses easy balls |
Doubles AI: sensible positioning (both up at the kitchen line when possible, shift with the ball, cover middle),
decide who takes a ball in the middle (forehand in the middle / closer player), respect the two-bounce rule and the kitchen
(never volley from the kitchen on purpose; 3.0 may occasionally fault). The human's AI partner must **not** steal balls
that are clearly on the human's half.

Human movement: speed like a 4.5 player; the human may walk anywhere on their own side (and outside the lines) but
cannot cross the net.

## 4. View API (`src/render/index.js`)

```js
import { createView } from './render/index.js';
const view = createView(canvas, { quality: 'high' | 'medium' | 'low' });
view.setup(config);                       // (re)build players for this match config
view.update(state, dtSeconds, { replay: false });   // pose everything from state; pure function of state + smoothing
view.onEvents(events);                    // particles, camera shake, floating text ("ATP!", "SMASH!")
view.setCamera('menu' | 'play' | 'replay');
view.resize(); view.render(); view.dispose();
```
The view must be able to render **any** state snapshot (the replay system feeds recorded snapshots back in), so it
must not depend on having seen every intermediate frame.

Look (2026-acceptable quality, stylised not photoreal):
- PBR materials, ACES filmic tone mapping, sRGB output, soft shadows (PCFSoft, one directional sun), hemisphere light,
  gradient sky, antialiasing, device-pixel-ratio capped at 2.
- Court: blue playing area, green kitchen, white lines, darker surround, proper net (posts, mesh texture, white tape),
  fence, small stands with a simple instanced crowd, a few trees / light poles, a sponsor-free scoreboard tower is optional.
- **Characters (anthropomorphic, procedural, charming):** chunky stylised humans built from capsules/spheres with
  a big head, eyes that blink and look at the ball, eyebrows/mouth that change with `emotion`, hair or cap/visor,
  jersey + shorts in team colours, shoes, visible **paddle** in the dominant hand (left-handers hold it in the left hand).
  Each of the 4 players looks different (skin tone, hair, outfit). Proper joint hierarchy
  (hips, spine, head, shoulder/elbow/wrist per arm, hip/knee/ankle per leg).
- **Animations** are keyframed poses evaluated from `anim.name`, `anim.t`, `anim.side`, mirrored for handedness,
  blended with a run/shuffle leg cycle from `vel`:
  ready (athletic split-step bounce), run, serveReady, serve (underhand), forehand drive, backhand drive
  (visibly different: arm crosses the body), drop (short push), dink (bent knees, soft lift), lob (open face, low-to-high),
  smash (overhead, jump), volley (punch), celebrate (fist pump / jump), dejected (head down).
  Wind-up → contact → follow-through must read clearly.
- Ball: yellow-green with holes texture, motion trail, blob shadow + real shadow, landing-marker ring at
  `state.ball.landing` (only when the ball is heading to the human's side), bounce dust puff, hit spark,
  camera shake on smash, floating text for ATP / smash / kitchen fault.
- Human player gets a subtle ring under the feet so the user knows who they control.
- Cameras: `play` = behind team 0, elevated (~6 m up, ~12 m back), gently follows the human's x and the ball;
  `replay` = lower cinematic side/orbit camera following the ball; `menu` = slow orbit of the court.

## 5. Shell (`index.html`, `src/main.js`, `src/input.js`, `src/replay.js`, `src/ui/*`)

Controls:
- `W A S D` move (W = toward the net). Arrow keys also work for movement.
- `Space` drive: hold to charge (0.5 → 1.0 over ~0.7 s), release to swing. A quick tap = normal drive. Auto-smash on high balls.
- `J` drop, `K` dink, `L` lob (trigger on key down).
- Aim: at the moment the swing is triggered, `A`/← held ⇒ aim −1, `D`/→ held ⇒ aim +1, neither ⇒ 0.
- `Esc` pause/resume. `R` skip replay. `M` mute. Mouse drives every menu.
- Prevent default on Space/arrows so the page never scrolls. Pause automatically when the tab loses focus.

Screens (HTML/CSS overlay over the canvas, polished: glassy panels, good typography, smooth transitions):
1. Main menu: title, 開始比賽, 操作說明, 設定.
2. Match setup: 模式 (雙打/單打), 計分 (傳統 11 分 / Rally 15 分), 對手強度 DUPR 3.0/4.0/5.0/6.0,
   隊友強度 DUPR (doubles only), 持拍手 (右手/左手), 畫質. Remember choices in localStorage (wrapped in try/catch).
3. HUD: broadcast-style scoreboard (team names, points, serving indicator dot, server number in sideout doubles,
   game-point badge), shot-type toast when the human hits, drive charge meter, small always-visible key legend
   (toggle with `H`), rally hit counter, contextual hints ("輪到你發球 — 按 Space", "兩跳規則：讓球先彈一下").
4. Pause menu: 繼續, 重新開始, 操作說明, 回主選單.
5. Game-over screen: winner, final score, simple stats (aces/winners/faults, longest rally), 再來一局.

Audio (`src/ui/audio.js`, WebAudio, synthesized): paddle pop (pitch/volume by shot power), bounce, net thud,
crowd ambience loop + cheer swell on points/highlights, UI click, whistle on fault. Master mute.
Voice (`src/ui/voice.js`, `speechSynthesis`, English voice): calls the score before each serve
("four, two, one"; "zero, zero, two" at game start), "Side out", "Second server", "Point", "Fault — kitchen",
"Out", "Game point", "Game". Must fail silently when speech is unavailable; also show the call as text in the HUD.

Replay (`src/replay.js`): ring buffer of the last ~8 s of compact view snapshots (ball + players pos/anim/emotion,
plus events) sampled every sim tick or every 2nd tick. On `rallyEnd.highlight`, after ~0.8 s, play the last ~5 s at
0.4× speed with the `replay` camera, a "精彩重播 REPLAY" banner and letterbox bars; `R`/click skips. Sim is frozen
during replay; afterwards the game continues to the next serve.

Debug hook for automated testing: `window.__game = { sim, view, getState(), startMatch(config), setAutoplay(bool) }`
where autoplay makes the human slot AI-controlled (used by automated playtests).

## 6. File ownership
- Sim: `src/sim/**`, `tests/**`
- View: `src/render/**`, `dev/view-demo.html`
- Shell: `index.html`, `src/main.js`, `src/input.js`, `src/replay.js`, `src/ui/**`, `src/styles.css`
Do not edit files outside your ownership; if the contract above is insufficient, add the minimum needed and document
it at the bottom of this file under "Contract addenda".

## Contract addenda
Sim engineer (src/sim, tests) — clarifications; none change field names/shapes of section 3:
- `state.internal` is an extra opaque top-level object (RNG state, swing timers, AI memory, claims). Plain JSON; the
  view/shell must ignore it. Snapshots/`restore` include it, so determinism survives restore.
- `ball.landing = {x, z, t}`: `t` = seconds from *now* until ground contact (counts down each tick). `null` when
  unknown/dead. It is exact unless something interferes (net, body, another hit).
- `ball.visible` is always `true`; in `preServe` / during the serve swing the ball is held at the server's hand
  (`vel` = 0, `landing` = null). `ball.bounces` = ground bounces since the last hit.
- Phases: `serve` lasts from the server's swing trigger until the serve's first legal bounce (then `rally`); a serve
  fault goes straight to `pointOver`. Serve contact happens 0.22 s after the swing starts (`anim.name='serve'`).
- `hit` events: for an ATP, `shot` is the swing type that was requested and `atp:true`; `state.rally.lastShot` is
  `'atp'` for it. `power` = input power for drives, `speed/20` (0..1) otherwise. Serves: `shot:'serve', isServe:true`.
- `SHOTS` = `['drive','drop','dink','lob']` (the legal `Input.swing` values); `ALL_SHOTS` additionally has `smash`,`serve`.
- `fault.playerId` is the player blamed (hitter for out/net/kitchen/twoBounceRule/serve faults; for `doubleBounce`
  the nearest player of the team that failed to return; the touched player for `bodyHit`).
- `rallyEnd.highlightReason` ∈ `'smash' | 'atp' | 'lob' | 'longRally' | 'gamePoint'` (null if no highlight).
- `gameOver` event fires when the phase flips to `gameOver`, i.e. ~2.5 s after the final `rallyEnd` (so the replay of a
  game-point highlight can play first). `state.score.winner` is already set at the final `rallyEnd`.
- At every `serveReady` players are repositioned (teleported) to their serve spots, then free to move. A human server
  may shuffle along/behind the baseline but is clamped to stay behind it and on the serving half until the ball is struck.
- Optional AI-only Input field `tx` (target x in meters) overrides `aim`; humans never need it. `normInput` ignores junk.
- `anim.name` `'idle'` is never produced (`ready` is used); `volley` is used for any non-lob/non-smash swing at an
  unbounced ball; `smash` is chosen automatically for `drive` swings at high balls.
- Rule simplifications: serve return by the non-diagonal receiver is not penalised; a ball that clips the net cord is live
  for any shot; ball touching a net post/tape outside |x|<=3.355 is ignored; bouncing off the net after having bounced on the
  far side is not a net fault.
- Test hooks: `sim.debug.{endRally, setupServe, nextRand}` (not for the shell).

### View addenda (render engineer)
- `facing` is applied as `root.rotation.y = -facing` (so `facing = atan2(dx, -dz)` for a direction `(dx, dz)`; 0 looks toward -z, +π/2 toward +x).
- Optional extras on the view object (not required by the shell): `view.setQuality('low'|'medium'|'high')` (runtime toggle), `view.setCameraOverride({position:[x,y,z], target:[x,y,z], fov}|null)` (debug/demo close-ups), `view.renderer/scene/camera` for inspection.
- Visual ball is drawn 1.5x the physical radius (0.037 m) for legibility; physics is untouched. `ball.landing` is only used for the ring (shown when `ball.vel.z > 0`, `landing.z > 0` and `bounces === 0`); `landing.t` is not read.
- Floating text is English: `SMASH!`, `ATP!`, and fault labels (`KITCHEN!`, `OUT!`, `NET!`, ...). The view fires crowd cheer/confetti on `rallyEnd` (bigger when `highlight`) and `gameOver`.
- Anim contact timing assumed by the poses: drive/drop/dink/lob contact at `anim.t ≈ 0.18`, volley ≈ 0.13, smash/serve ≈ 0.20 (matches the 0.08-0.28 s window). Anim `t` past the table end holds the final (ready-like) pose.
- When the human's own player (or anyone) stands between the camera and the ball, that player is rendered ~30 % opaque so the ball stays visible.
- Replay camera: `view.setCamera('replay')` picks the sidelines side opposite the ball's current x sign and hides that side's fence panel.

### Shell addenda (integration engineer)
Cross-ownership edits made while integrating (all keep `npm test` green):
- **sim**: `state.players[i].anim` gains optional `tc` (expected/actual contact time of the current swing in swing-seconds; re-predicted each tick until the ball is struck, then frozen at the real contact time) and `hit` (true once contact happened). Serves report `tc = 0.22`. Purely informational (no RNG, no effect on play). `shots.js`: `HUMAN_MARGIN = 1.35` — human-controlled slots aim 35 % further inside the lines / baseline (keyboard aim is only left / middle / right).
- **view**: swing poses are time-warped so the contact key lands on `anim.tc` (`warpSwingTime` in `pose.js`); around contact the body lunges/crouches so the paddle face really meets the ball (`snapPaddle`, uses the `hit` event position; needs events for exactness but falls back to ball position); `view.setCue(0..4)` colours the human's ground ring (1 ball approaching, 2 swing now, 3 swing would be a fault, 4 sweet spot); new low play camera that follows the human's depth; the near end fence is hidden in the play camera; ball is drawn at least ~6.5 px in radius; the visual hold-ball in the server's hand is removed (the sim ball is drawn there); singles opponent uses the team-1 look; players are rebuilt when `controller`/`team` change.
- **Autoplay** = the shell flips `state.players[0].controller` between `'human'` and `'ai'` (the sim re-reads it every tick); the shell hands the view a copy that still says `'human'` so the ring/camera stay on the player.
- **Debug hook** `window.__game`: `sim, view, getState(), startMatch(cfg{mode,scoring,opp,mate,handed,quality,seed,autoplay,humanDupr}), setAutoplay(b), setTimeScale(n), advance(seconds,{until}) (synchronous fast-forward, stops at replay/game over), stepTicks(n), freeze(b), setRender(b), setReplayEnabled(b), skipReplay(), pause(), resume(), toMenu(), drainLog() (sim events), voiceLog(), swingCue()/swingCueInfo(), predict(), getStats(), settleView()`.
- Playtests live in `dev/playtest/*.mjs` (Playwright; `node dev/playtest/<name>.mjs`).
