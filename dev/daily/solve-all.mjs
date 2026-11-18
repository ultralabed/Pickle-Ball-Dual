// Solver sweep: every challenge type over many seeds. Prints the worst best-possible score, reroll rate and the power the solution needs.
//   node dev/daily/solve-all.mjs [seeds=200]
import { CHALLENGES } from '../../src/daily/challenges.js';
import { genStage, SOLVE_MIN, ROBUST_MIN } from '../../src/daily/engine.js';
const N = Number(process.argv[2]) || 200;
let bad = 0;
const t0 = Date.now();
for (const def of CHALLENGES) {
  let min = 100, rob = 100, tries = 0, fail = 0, pmin = 1, pmax = 0, psum = 0, pn = 0, nul = 0;
  const shots = {};
  for (let i = 0; i < N; i++) {
    const st = genStage(def, `sweep-${i}`);
    if (!st) { nul++; fail++; continue; }
    min = Math.min(min, st.solved); rob = Math.min(rob, st.robust ?? 0); tries += st.tries;
    if (st.solved < SOLVE_MIN || !(st.robust >= ROBUST_MIN)) fail++;
    for (const s of st.sols) { pmin = Math.min(pmin, s.power); pmax = Math.max(pmax, s.power); psum += s.power; pn++; const k = st.shots[s.si].key; shots[k] = (shots[k] || 0) + 1; }
  }
  bad += fail;
  console.log(`${def.id.padEnd(14)} T${def.tier} worst=${String(min).padStart(3)} robust=${String(rob).padStart(3)} fail=${fail} null=${nul} tries/stage=${(tries / N).toFixed(2)} power ${pmin.toFixed(2)}..${pmax.toFixed(2)} avg ${(psum / pn).toFixed(2)}  ${JSON.stringify(shots)}`);
}
console.log(`${bad ? 'FAIL' : 'OK'}: ${bad} unsolvable of ${CHALLENGES.length * N} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(bad ? 1 : 0);
