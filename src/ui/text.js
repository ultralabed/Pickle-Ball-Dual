// Small helpers shared by the shell UI. All wording lives in i18n.js.
import { playerName } from './i18n.js';

export const EMO = { drive: '⚡', drop: '🪂', dink: '🤏', lob: '🌈', smash: '💥', serve: '🎾', atp: '🚀' };

/** display name of a team: its players' (translated) names joined with " & " */
export function teamLabel(state, team) {
  const names = state.players.filter((p) => p.team === team).map((p) => playerName(p.name));
  return names.join(' & ');
}

export const TEAM_COLOR = ['#ff7a1f', '#8e6bff'];

export function clsx(...a) { return a.filter(Boolean).join(' '); }
