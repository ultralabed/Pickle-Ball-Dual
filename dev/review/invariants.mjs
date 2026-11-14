// Review: property checks over many AI-vs-AI games (all four configs) at every serveReady / rallyEnd.
import { createSim, COURT } from '../../src/sim/index.js';
import { halfWorldSign } from '../../src/sim/util.js';

function mk(mode, scoring, seed) {
  const players = mode === 'singles'
    ? [{ id: 0, team: 0, controller: 'ai', dupr: 4, handed: 'R' }, { id: 1, team: 1, controller: 'ai', dupr: 4, handed: 'R' }]
    : [{ id: 0, team: 0, controller: 'ai', dupr: 4, handed: 'R' }, { id: 1, team: 0, controller: 'ai', dupr: 4, handed: 'R' },
       { id: 2, team: 1, controller: 'ai', dupr: 4, handed: 'R' }, { id: 3, team: 1, controller: 'ai', dupr: 4, handed: 'L' }];
  return createSim({ mode, scoring, seed, players });
}

const problems = {};
const bump = (k, ex) => { problems[k] = problems[k] || { n: 0, ex }; problems[k].n++; };
const faultsBy = {};
for (const mode of ['doubles', 'singles']) for (const scoring of ['sideout', 'rally']) {
  for (let seed = 1; seed <= 25; seed++) {
    const sim = mk(mode, scoring, seed);
    const s = sim.state;
    const H = () => s.internal.half;
    // team-0 / team-1 player who started on the right
    const firstRight = [0, 1].map((t) => s.players.find((p) => p.team === t && H()[p.id] === 'R').id);
    let prevScore = null, first = true, lastFault = null;
    let guard = 0;
    while (s.phase !== 'gameOver' && guard++ < 120 * 60 * 40) {
      sim.step({});
      for (const e of sim.drainEvents()) {
        if (e.type === 'fault') { lastFault = e; const k = `${mode}/${scoring}:${e.reason}`; faultsBy[k] = (faultsBy[k] || 0) + 1;
          if (e.reason === 'bodyHit') {
            const lh = s.ball.lastHitBy; const vt = s.players[e.playerId].team;
            const k2 = lh !== null && s.players[lh].team === vt ? 'bodyHit_by_own_team' : 'bodyHit_by_opponent';
            faultsBy[`${mode}/${scoring}:${k2}`] = (faultsBy[`${mode}/${scoring}:${k2}`] || 0) + 1;
          }
        }
        if (e.type === 'rallyEnd') {
          if (lastFault && 1 - lastFault.team !== e.winnerTeam) bump('winner!=1-faultTeam', { e, lastFault });
        }
        if (e.type === 'serveReady') {
          const sc = s.score;
          const srv = s.players[sc.serverId], rcv = s.players[sc.receiverId];
          if (srv.team !== sc.servingTeam) bump('server not on serving team', { sc });
          if (rcv.team === sc.servingTeam) bump('receiver on serving team', { sc });
          const sxs = Math.sign(srv.pos.x), rxs = Math.sign(rcv.pos.x);
          if (sxs !== -rxs) bump('receiver not diagonal (world x signs)', { srv: srv.pos, rcv: rcv.pos });
          if (Math.abs(srv.pos.z) <= COURT.halfL) bump('server not behind baseline', { pos: srv.pos });
          const own = sc.points[sc.servingTeam];
          const half = H()[srv.id];
          if (mode === 'singles' || scoring === 'rally') {
            if (half !== (own % 2 === 0 ? 'R' : 'L')) bump(`${mode}/${scoring}: server half parity wrong`, { own, half });
            if (sc.serverNumber !== 1) bump('serverNumber != 1 outside sideout doubles', sc);
          }
          if (mode === 'doubles') {
            // the player who started on the right is on the right iff team score even (sideout); never moves (rally)
            for (const t of [0, 1]) {
              const want = scoring === 'rally' ? 'R' : (s.score.points[t] % 2 === 0 ? 'R' : 'L');
              if (H()[firstRight[t]] !== want) bump(`${mode}/${scoring}: team ${t} starting-right player half wrong`, { pts: s.score.points.slice(), half: H()[firstRight[t]] });
            }
          }
          if (first) {
            if (mode === 'doubles' && scoring === 'sideout' && (sc.serverNumber !== 2 || sc.callText !== '0 - 0 - 2')) bump('no 0-0-2 start', sc);
            first = false;
          }
          // call text
          const opp = sc.points[1 - sc.servingTeam];
          const want = mode === 'doubles' && scoring === 'sideout' ? `${own} - ${opp} - ${sc.serverNumber}` : `${own} - ${opp}`;
          if (sc.callText !== want || e.callText !== want) bump('callText wrong', { want, got: sc.callText });
          // sideout doubles sequence
          if (prevScore && mode === 'doubles' && scoring === 'sideout') {
            const p = prevScore;
            if (p.servingTeam === sc.servingTeam && sc.points[sc.servingTeam] === p.points[p.servingTeam]) {
              // lost a rally without side out -> must be 1 -> 2 and partner
              if (!(p.serverNumber === 1 && sc.serverNumber === 2 && p.serverId !== sc.serverId)) bump('second server transition wrong', { p, sc: { ...sc } });
            }
            if (p.servingTeam !== sc.servingTeam) {
              if (sc.serverNumber !== 1) bump('side out but serverNumber != 1', sc);
              if (H()[sc.serverId] !== 'R') bump('side out: server 1 not on right', sc);
              if (!(p.serverNumber === 2)) bump('side out from server 1', { p, sc });
            }
            if (p.servingTeam === sc.servingTeam && sc.points[sc.servingTeam] === p.points[p.servingTeam] + 1 && p.serverId !== sc.serverId) bump('server changed after scoring', { p, sc });
          }
          prevScore = JSON.parse(JSON.stringify(sc));
        }
        if (e.type === 'gameOver') {
          const [a, b] = e.points, T = scoring === 'rally' ? 15 : 11;
          const w = e.winnerTeam, hi = w === 0 ? a : b, lo = w === 0 ? b : a;
          if (!(hi >= T && hi - lo >= 2)) bump('bad final score', e.points);
          if (hi > T && hi - lo !== 2) bump('game continued past win', e.points);
        }
      }
    }
    if (s.phase !== 'gameOver') bump('game never ended', { mode, scoring, seed, tick: s.tick, score: s.score });
  }
}
console.log('PROBLEMS', JSON.stringify(problems, null, 1));
console.log('FAULTS', JSON.stringify(faultsBy, null, 1));
