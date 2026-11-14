// Review: volley from OUTSIDE the sideline, level with the kitchen (not in the NVZ per the rules) -> sim calls 'kitchen'.
import { manual, liveBall, place, run, ofType } from '../../tests/lib/util.mjs';
for (const [x, z, label] of [[3.7, 1.6, 'outside sideline beside kitchen'], [2.0, 1.6, 'inside kitchen (control)'], [3.7, 2.6, 'outside sideline behind kitchen line (control)']]) {
  const sim = manual('singles', 'rally', 3);
  place(sim, 0, x, z);
  // ball from the opponent arriving at chest height right in front of player 0 (no bounce), 2-bounce rule done
  liveBall(sim, { hitter: 1, pos: { x: x - 0.3, y: 1.0, z: z - 2.5 }, vel: { x: 0, y: 1.2, z: 8 }, hits: 4, twoBounce: 0 });
  sim.step({ 0: { swing: 'dink' } });
  const evs = run(sim, 80, () => ({}));
  const hit = ofType(evs, 'hit')[0];
  console.log(label.padEnd(48), 'hit:', hit ? `volley=${hit.isVolley} atp=${hit.atp}` : 'none', ' fault:', ofType(evs, 'fault').map((e) => e.reason + '/team' + e.team).join(',') || 'none');
}
