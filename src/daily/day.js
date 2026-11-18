// Which challenges a day has, the save format and the share text. Pure (no DOM) except the storage helpers.
import { CHALLENGES, BY_ID } from './challenges.js';
import { makeRng, genStage, stageScore } from './engine.js';

/** The link people share. Set to the published page. */
export const SHARE_URL = 'https://claude.ai/artifact/TnUCvveikwSKjWDeGjRMQ4';

export const STAGES = 5;
export const DAY_ONE = Date.UTC(2026, 10, 18);   // day #1 = 2026-11-18 (local date)

export function dayInfo(d = new Date()) {
  const n = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - DAY_ONE) / 864e5) + 1;
  return { n, key: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` };
}

function shuffled(r, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** The five challenge ids of a day: two easy, two medium, one hard, in that order. Same for everyone on that date. */
export function pickDay(key) {
  const r = makeRng(`pbd-daily|${key}`);
  const tier = (t) => shuffled(r, CHALLENGES.filter((c) => c.tier === t).map((c) => c.id));
  const t1 = tier(1), t2 = tier(2), t3 = tier(3);
  return [t1[0], t1[1], t2[0], t2[1], t3[0]];
}

/** The five generated stages of a day. */
export function genDay(key) {
  return pickDay(key).map((id) => ({ def: BY_ID[id], st: genStage(BY_ID[id], `pbd-daily|${key}`) }));
}

// ---------------------------------------------------------------- results
export const emojiFor = (s) => (s >= 90 ? '🟢' : s >= 60 ? '🟡' : s >= 30 ? '🟠' : '⚫');
export function totals(stages, shots) {
  const per = stages.map((g, i) => stageScore(g.st, shots[i] || []));
  return { per, total: per.reduce((a, b) => a + b, 0), balls: shots.reduce((a, b) => a + b.length, 0), emoji: per.map(emojiFor).join('') };
}
export function shareText(name, dayN, tot, ballsLabel) {
  return `${name} #${dayN}  ${tot.total}/${STAGES * 100}\n${tot.emoji}  ${ballsLabel}${SHARE_URL ? `\n${SHARE_URL}` : ''}`;
}

// ---------------------------------------------------------------- storage (every access guarded)
export function lsGet(k) { try { return JSON.parse(window.localStorage.getItem(k)); } catch (e) { return null; } }
export function lsSet(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
export const saveKey = (key) => `pbd-daily.day.${key}`;
export const STATS_KEY = 'pbd-daily.stats', SEEN_KEY = 'pbd-daily.seen';

export function loadDay(key) {
  const s = lsGet(saveKey(key));
  if (s && s.v === 1 && Array.isArray(s.shots) && s.shots.length === STAGES) return s;
  return { v: 1, stage: 0, shots: [[], [], [], [], []], done: false };
}
export function updateStats(dayN, total) {
  const s = lsGet(STATS_KEY) || { streak: 0, last: 0, best: 0, played: 0 };
  if (s.last === dayN) return s;
  s.streak = s.last === dayN - 1 ? s.streak + 1 : 1;
  s.last = dayN; s.best = Math.max(s.best || 0, total); s.played = (s.played || 0) + 1;
  lsSet(STATS_KEY, s);
  return s;
}
