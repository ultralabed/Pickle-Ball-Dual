// Settings persisted in localStorage (every access wrapped; the game works without it).
const KEY = 'pickleball3d.settings.v1';
export const DEFAULTS = {
  mode: 'doubles', scoring: 'sideout', opp: 4.0, mate: 4.0, handed: 'R', quality: 'high',
  muted: false, voice: true, legend: true, volume: 0.8,
  lang: '',   // '' = not chosen yet: the shell picks from navigator.language

};
export function loadSettings() {
  const s = { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      for (const k of Object.keys(DEFAULTS)) if (o && typeof o[k] === typeof DEFAULTS[k]) s[k] = o[k];
    }
  } catch (e) { /* storage unavailable */ }
  if (![3, 4, 5, 6].includes(s.opp)) s.opp = 4;
  if (![3, 4, 5, 6].includes(s.mate)) s.mate = 4;
  if (!['high', 'medium', 'low'].includes(s.quality)) s.quality = 'high';
  return s;
}
export function saveSettings(s) {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}
