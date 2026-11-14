// Scoring / serve-rotation logic (pure functions over sim state).
import { halfWorldSign } from './util.js';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five', 'twenty-six',
  'twenty-seven', 'twenty-eight', 'twenty-nine', 'thirty'];
export function numWord(n) { return n >= 0 && n < WORDS.length ? WORDS[n] : String(n); }

export function targetPoints(cfg) { return cfg.scoring === 'rally' ? 15 : 11; }

export function initHalves(players) {
  const half = {};
  const seen = { 0: 0, 1: 0 };
  for (const p of players) {
    half[p.id] = seen[p.team] === 0 ? 'R' : 'L';
    seen[p.team]++;
  }
  return half;
}

export function initScore(st) {
  const cfg = st.config;
  const dbl = cfg.mode === 'doubles';
  const so = cfg.scoring === 'sideout';
  const t0 = st.players.filter((p) => p.team === 0);
  const sc = {
    points: [0, 0], servingTeam: 0, serverId: t0[0].id, receiverId: -1,
    serverNumber: dbl && so ? 2 : 1, callText: '', gamePoint: false, winner: null,
  };
  st.score = sc;
  if (dbl && so) sc.serverId = t0.find((p) => st.internal.half[p.id] === 'R').id;
  assignServe(st);
}

export function assignServe(st) {
  const sc = st.score, cfg = st.config, H = st.internal.half;
  const dbl = cfg.mode === 'doubles';
  const so = cfg.scoring === 'sideout';
  const srv = st.players.filter((p) => p.team === sc.servingTeam);
  const rec = st.players.filter((p) => p.team !== sc.servingTeam);
  const own = sc.points[sc.servingTeam], opp = sc.points[1 - sc.servingTeam];
  let server;
  if (!dbl) {
    server = srv[0];
    H[server.id] = own % 2 === 0 ? 'R' : 'L';
  } else if (so) {
    server = st.players[sc.serverId];
  } else {
    const want = own % 2 === 0 ? 'R' : 'L';
    server = srv.find((p) => H[p.id] === want);
  }
  const sx = halfWorldSign(server.team, H[server.id]);
  let receiver;
  if (!dbl) {
    receiver = rec[0];
    // world sign must be -sx
    const wantR = receiver.team === 0 ? -sx > 0 : -sx < 0;
    H[receiver.id] = wantR ? 'R' : 'L';
  } else {
    receiver = rec.find((p) => halfWorldSign(p.team, H[p.id]) === -sx);
  }
  sc.serverId = server.id;
  sc.receiverId = receiver.id;
  sc.callText = dbl && so ? `${own} - ${opp} - ${sc.serverNumber}` : `${own} - ${opp}`;
  const T = targetPoints(cfg);
  const canWin = (a, b) => a + 1 >= T && a + 1 - b >= 2;
  sc.gamePoint = so ? canWin(own, opp) : (canWin(own, opp) || canWin(opp, own));
}

export function callWords(st) {
  const sc = st.score, cfg = st.config;
  const own = sc.points[sc.servingTeam], opp = sc.points[1 - sc.servingTeam];
  const w = [numWord(own), numWord(opp)];
  if (cfg.mode === 'doubles' && cfg.scoring === 'sideout') w.push(numWord(sc.serverNumber));
  return w;
}

function checkWinner(st, team) {
  const T = targetPoints(st.config);
  const a = st.score.points[team], b = st.score.points[1 - team];
  if (a >= T && a - b >= 2) st.score.winner = team;
}

// Apply a rally result. Returns { pointScored, sideOut, secondServer }.
export function resolveRally(st, winnerTeam) {
  const sc = st.score, cfg = st.config, H = st.internal.half;
  const dbl = cfg.mode === 'doubles';
  const so = cfg.scoring === 'sideout';
  const serving = sc.servingTeam;
  const res = { pointScored: false, sideOut: false, secondServer: false };
  if (so) {
    if (winnerTeam === serving) {
      sc.points[serving]++;
      res.pointScored = true;
      if (dbl) {
        for (const p of st.players) if (p.team === serving) H[p.id] = H[p.id] === 'R' ? 'L' : 'R';
      }
      checkWinner(st, serving);
    } else if (dbl && sc.serverNumber === 1) {
      sc.serverNumber = 2;
      sc.serverId = st.players.find((p) => p.team === serving && p.id !== sc.serverId).id;
      res.secondServer = true;
    } else {
      res.sideOut = true;
      sc.servingTeam = 1 - serving;
      sc.serverNumber = 1;
      if (dbl) sc.serverId = st.players.find((p) => p.team === sc.servingTeam && H[p.id] === 'R').id;
    }
  } else {
    sc.points[winnerTeam]++;
    res.pointScored = true;
    if (winnerTeam !== serving) { res.sideOut = true; sc.servingTeam = winnerTeam; }
    checkWinner(st, winnerTeam);
  }
  if (sc.winner === null) assignServe(st);
  return res;
}
