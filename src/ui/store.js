// Settings persisted in localStorage (every access wrapped in try/catch: storage can be blocked or full).
import { defaultQuality } from './device.js';

const KEY = 'pickleball3d.settings.v1';
export const DEFAULTS = {
  mode: 'doubles', scoring: 'sideout', opp: 4, mate: 4, handed: 'R', quality: 'high',
  muted: false, voice: true, legend: true, volume: 0.8,
  lang: '',   // '' = not chosen yet: the shell picks from navigator.language
};
export function loadSettings() {
  const s = { ...DEFAULTS };
  let storedQuality = false;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      for (const k of Object.keys(DEFAULTS)) if (o && typeof o[k] === typeof DEFAULTS[k]) s[k] = o[k];
      storedQuality = !!o && ['high', 'medium', 'low'].includes(o.quality);
    }
  } catch (e) { /* storage unavailable */ }
  if (![3, 4, 5, 6].includes(s.opp)) s.opp = 4;
  if (![3, 4, 5, 6].includes(s.mate)) s.mate = 4;
  // nothing (valid) stored yet: low on phones, medium on tablets, high on desktop
  if (!storedQuality) s.quality = defaultQuality();
  return s;
}
export function saveSettings(s) {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}
