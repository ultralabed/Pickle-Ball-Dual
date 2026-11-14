// Review: how often does the human (scripted, tests/lib/scripthuman) lose a rally to a body hit, and was that ball going out?
import { createSim, COURT } from '../../src/sim/index.js';
import { scriptHuman } from '../../tests/lib/scripthuman.mjs';
import { trace } from '../../src/sim/physics.js';

const out = { rallies: 0, humanBody: 0, humanBodyWouldBeOut: 0, mateBody: 0, mateBodyByHuman: 0, humanBodyByMate: 0, idle: { rallies: 0, body: 0, bodyOut: 0 } };
for (const idle of [false, true]) for (let seed = 1; seed <= 40; seed++) {
  const players = [{ id: 0, team: 0, controller: 'human', dupr: 4.5, handed: 'R', name: 'h' }, { id: 1, team: 0, controller: 'ai', dupr: 4, handed: 'R' },
    { id: 2, team: 1, controller: 'ai', dupr: 4, handed: 'R' }, { id: 3, team: 1, controller: 'ai', dupr: 4, handed: 'L' }];
  const sim = createSim({ mode: 'doubles', scoring: 'rally', seed, players });
  const s = sim.state;
  let landingOut = null;
  while (s.phase !== 'gameOver' && s.tick < 120 * 60 * 15) {
    let inp = scriptHuman(sim, 0, { serve: 'drop' });
    if (idle && s.phase !== 'preServe') inp = { mx: 0, mz: 0 };   // human just stands still after serving
    // predicted first-bounce of the current ball (before this tick)
    const r = s.ball.bounces === 0 && !s.internal.held ? trace(s.ball.pos, s.ball.vel) : null;
    const lastHitTeam = s.ball.lastHitBy !== null ? s.players[s.ball.lastHitBy].team : null;
    sim.step({ 0: inp });
    for (const e of sim.drainEvents()) {
      if (e.type === 'rallyEnd') { if (idle) out.idle.rallies++; else out.rallies++; }
      if (e.type === 'fault' && e.reason === 'bodyHit') {
        const wouldOut = r && (Math.abs(r.x) > COURT.halfW + COURT.ballR || Math.abs(r.z) > COURT.halfL + COURT.ballR);
        if (idle) { if (e.playerId === 0) { out.idle.body++; if (wouldOut) out.idle.bodyOut++; } continue; }
        if (e.playerId === 0) { out.humanBody++; if (wouldOut) out.humanBodyWouldBeOut++; if (lastHitTeam === 0) out.humanBodyByMate++; }
        if (e.playerId === 1) { out.mateBody++; if (lastHitTeam === 0) out.mateBodyByHuman++; }
      }
    }
  }
}
console.log(JSON.stringify(out, null, 1));
