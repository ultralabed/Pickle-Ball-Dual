// Menu screens (main, setup, help, settings, pause, game over). Pure DOM; main.js owns the flow.
// Every screen is built by a render function so a language change can rebuild the visible text in place.
import { h } from './dom.js';
import { TEAM_COLOR } from './text.js';
import { t, getLang, LANGS } from './i18n.js';
import { isTouchUI } from './device.js';

const KEYHELP = [
  ['move', ['W', 'A', 'S', 'D']],
  ['drive', ['Space']],
  ['drop', ['J']],
  ['dink', ['K']],
  ['lob', ['L']],
  ['aim', ['A', 'D']],
  ['serve', ['Space', 'J', 'K', 'L']],
  ['other', ['Esc', 'M', 'H', 'R']],
];
// touch help rows: [key, css colour of the matching on-screen control]
const TOUCHHELP = [['move', '#9fb4d0'], ['drive', '#ff4fa8'], ['drop', '#2fe0b8'], ['dink', '#8e6bff'], ['lob', '#4aa8ff'], ['aim', '#9fb4d0'], ['serve', '#d9f23a'], ['other', '#9fb4d0']];
const RULE_KEYS = ['rule.1', 'rule.2', 'rule.3', 'rule.4'];

// ring colours under the human player's feet (same meaning in the HUD legend)
export const CUES = [
  ['#ffb020', 'amber'],
  ['#45ff7a', 'green'],
  ['#c8ff3a', 'lime'],
  ['#ff4d4d', 'red'],
];

let cb = null;
function seg(options, value, onPick) {
  const wrap = h('div', { class: 'seg' });
  const btns = options.map(([v, label]) => h('button', { class: 'segbtn', type: 'button', 'data-v': String(v), text: label, onClick: (e) => { e.currentTarget.blur(); set(v); onPick(v); if (cb.click) cb.click(); } }));
  function set(v) { btns.forEach((b) => b.classList.toggle('on', b.dataset.v === String(v))); }
  wrap.append(...btns); set(value);
  wrap.set = set;
  return wrap;
}
const qualityOpts = () => [['low', t('common.low')], ['medium', t('common.medium')], ['high', t('common.high')]];
const duprOpts = () => [[3, '3.0'], [4, '4.0'], [5, '5.0'], [6, '6.0']];

export function createMenus(root, cbIn) {
  cb = cbIn;
  const screens = {};
  const renderers = {};
  /** register a screen: `render()` returns the children, called again on every language change */
  const mk = (name, render) => {
    const s = h('div', { class: 'screen hidden', 'data-screen': name });
    root.append(s); screens[name] = s; renderers[name] = render;
    s.append(...[].concat(render()));
    return s;
  };
  const rebuild = (name) => { const s = screens[name]; s.replaceChildren(...[].concat(renderers[name]())); };
  const btn = (label, cls, fn, sub) => h('button', { class: `btn ${cls || ''}`, type: 'button', onClick: (e) => { e.currentTarget.blur(); cb.click && cb.click(); fn(e); } },
    h('span', { class: 'bl', text: label }), sub ? h('span', { class: 'bs', text: sub }) : null);
  const langSeg = () => {
    const s = seg(LANGS.map((l) => [l.code, l.name]), getLang(), (v) => cb.setSetting('lang', v));
    return s;
  };

  // ---------------------------------------------------------------- main
  mk('main', () => [
    h('div', { class: 'lang-toggle', role: 'group', 'aria-label': t('lang.toggleAria') }, langSeg()),
    h('div', { class: 'panel main-panel' },
      h('div', { class: 'logo' }, h('div', { class: 'logo-ball' }), h('h1', {}, t('app.title'), h('small', { text: t('app.sub') }))),
      h('p', { class: 'tag', text: t('main.tag') }),
      h('div', { class: 'menu-btns' },
        btn(t('main.play'), 'primary', () => cb.openSetup(), t('main.playSub')),
        btn(t('main.help'), '', () => cb.openHelp('main')),
        btn(t('main.settings'), '', () => cb.openSettings('main'))),
      h('nav', { class: 'guide-links', 'aria-label': t('main.guide.aria') },
        ['how', 'rules', 'faq'].map((k) => h('a', { href: t(`guide.${k}.href`), text: t(`main.guide.${k}`) }))),
      h('div', { class: 'foot', text: t(isTouchUI() ? 'main.foot.touch' : 'main.foot') })),
  ]);

  // ---------------------------------------------------------------- setup
  const cfg = {};
  const renderSetup = () => {
    const mateRow = h('div', { class: 'row' });
    const scoreNote = h('div', { class: 'note' }), oppNote = h('div', { class: 'note' });
    const segs = {
      mode: seg([['doubles', t('mode.doubles')], ['singles', t('mode.singles')]], cfg.mode, (v) => { cfg.mode = v; cb.persist(cfg); mateRow.classList.toggle('hidden', v !== 'doubles'); }),
      scoring: seg([['sideout', t('scoring.sideout')], ['rally', t('scoring.rally')]], cfg.scoring, (v) => { cfg.scoring = v; cb.persist(cfg); scoreNote.textContent = t(`scoring.${v}.note`); }),
      opp: seg(duprOpts(), cfg.opp, (v) => { cfg.opp = v; cb.persist(cfg); oppNote.textContent = t(`dupr.${v}`); }),
      mate: seg(duprOpts(), cfg.mate, (v) => { cfg.mate = v; cb.persist(cfg); }),
      handed: seg([['R', t('common.right')], ['L', t('common.left')]], cfg.handed, (v) => { cfg.handed = v; cb.persist(cfg); }),
      quality: seg(qualityOpts(), cfg.quality, (v) => { cfg.quality = v; cb.quality && cb.quality(v); }),
    };
    mateRow.append(h('label', { text: t('setup.mate') }), segs.mate);
    mateRow.classList.toggle('hidden', cfg.mode !== 'doubles');
    scoreNote.textContent = t(`scoring.${cfg.scoring}.note`); oppNote.textContent = t(`dupr.${cfg.opp}`);
    const row = (label, s) => h('div', { class: 'row' }, h('label', { text: t(label) }), s);
    return h('div', { class: 'panel wide' }, h('h2', { text: t('setup.title') }),
      h('div', { class: 'form' },
        row('setup.mode', segs.mode), row('setup.scoring', segs.scoring), scoreNote, row('setup.opp', segs.opp), oppNote,
        mateRow, row('setup.hand', segs.handed), row('setup.quality', segs.quality)),
      h('div', { class: 'btn-row' }, btn(t('common.back'), 'ghost', () => cb.toMain()), btn(t('setup.start'), 'primary', () => cb.start({ ...cfg }))));
  };
  mk('setup', renderSetup);

  // ---------------------------------------------------------------- help
  let helpFrom = 'main';
  // schematic of the touch layout (landscape phone): joystick on the left, the four thumb buttons in an arc on the right
  const touchDiagram = () => {
    const d = h('div', { class: 'tdiag', 'aria-hidden': 'true' });
    d.innerHTML = '<svg viewBox="0 0 260 112" role="img"><rect x="2" y="2" width="256" height="108" rx="14" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.25)" stroke-width="2"/>'
      + '<circle cx="58" cy="66" r="27" fill="rgba(255,255,255,.06)" stroke="#9fb4d0" stroke-width="2" stroke-dasharray="4 4"/><circle cx="58" cy="66" r="11" fill="#9fb4d0"/>'
      + `<text x="58" y="30" text-anchor="middle" font-size="11" font-weight="800" fill="#cfe0f5">${t('touch.move')}</text>`
      + '<circle cx="212" cy="76" r="22" fill="#ff4fa8"/><circle cx="170" cy="84" r="15" fill="#8e6bff"/><circle cx="182" cy="48" r="15" fill="#2fe0b8"/><circle cx="220" cy="32" r="15" fill="#4aa8ff"/>'
      + `<g font-size="9" font-weight="800" fill="#06101d" text-anchor="middle"><text x="212" y="79">${t('touch.drive')}</text><text x="170" y="87">${t('touch.dink')}</text><text x="182" y="51">${t('touch.drop')}</text><text x="220" y="35">${t('touch.lob')}</text></g></svg>`;
    return d;
  };
  mk('help', () => {
    const touch = isTouchUI();
    const left = touch
      ? h('div', { class: 'helpgrid touchgrid' }, touchDiagram(), h('h3', { text: t('help.touch.title') }),
        TOUCHHELP.map(([k, c]) => h('div', { class: 'hrow tr', style: `--c:${c}` }, h('span', { class: 'hn', text: t(`help.touch.${k}`) }), h('span', { class: 'hd', text: t(`help.touch.${k}.d`) }))))
      : h('div', { class: 'helpgrid' }, KEYHELP.map(([k, ks]) => h('div', { class: 'hrow' }, h('span', { class: 'hn', text: t(`key.${k}`) }), h('span', { class: 'hk' }, ks.map((x) => h('kbd', { text: x }))), h('span', { class: 'hd', text: t(`key.${k}.d`) }))));
    return h('div', { class: `panel help${touch ? ' touchhelp' : ''}` }, h('h2', { text: t('help.title') }),
      h('div', { class: 'helpcols' },
        left,
        h('div', { class: 'helpside' },
          h('h3', { text: t('help.rules') }), h('ul', { class: 'rules' }, RULE_KEYS.map((r) => h('li', { text: t(r) }))),
          h('h3', { text: t('help.rings') }),
          h('div', { class: 'cues' }, CUES.map(([c, k]) => h('div', { class: 'cue' }, h('i', { style: `background:${c};box-shadow:0 0 10px ${c}` }), h('b', { text: t(`cue.${k}`) }), h('span', { text: t(touch && k === 'green' ? 'cue.green.d.touch' : `cue.${k}.d`) })))),
          h('p', { class: 'tip', text: t(touch ? 'help.tip.touch' : 'help.tip') }))),
      h('div', { class: 'btn-row' }, btn(t('common.back'), 'primary', () => cb.closeHelp(helpFrom))));
  });

  // ---------------------------------------------------------------- settings
  let setFrom = 'main', curSettings = null;
  const renderSettings = () => {
    const s = curSettings || {};
    const sg = {
      quality: seg(qualityOpts(), s.quality, (v) => cb.setSetting('quality', v)),
      sound: seg([[0, t('common.on')], [1, t('common.muted')]], s.muted ? 1 : 0, (v) => cb.setSetting('muted', v === 1)),
      voice: seg([[1, t('common.on')], [0, t('common.off')]], s.voice ? 1 : 0, (v) => cb.setSetting('voice', v === 1)),
      legend: seg([[1, t('common.show')], [0, t('common.hide')]], s.legend ? 1 : 0, (v) => cb.setSetting('legend', v === 1)),
      lang: langSeg(),
    };
    const vol = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round((s.volume ?? 0.8) * 100)), class: 'slider', onInput: (e) => cb.setSetting('volume', e.target.value / 100) });
    const row = (label, el) => h('div', { class: 'row' }, h('label', { text: label }), el);
    return h('div', { class: 'panel wide' }, h('h2', { text: t('settings.title') }),
      h('div', { class: 'form' },
        row(t('lang.label'), sg.lang), row(t('setup.quality'), sg.quality), row(t('settings.sound'), sg.sound), row(t('settings.volume'), vol),
        row(t('settings.voice'), sg.voice), isTouchUI() ? null : row(t('settings.legend'), sg.legend)),
      h('p', { class: 'tip', text: t('settings.saved') }),
      h('div', { class: 'btn-row' }, btn(t('common.back'), 'primary', () => cb.closeSettings(setFrom))));
  };
  mk('settings', renderSettings);

  // ---------------------------------------------------------------- pause
  mk('pause', () => h('div', { class: 'panel narrow' }, h('h2', { text: t('pause.title') }),
    h('div', { class: 'menu-btns' },
      btn(t('pause.resume'), 'primary', () => cb.resume()),
      btn(t('pause.restart'), '', () => cb.restart()),
      btn(t('main.help'), '', () => cb.openHelp('pause')),
      btn(t('main.settings'), '', () => cb.openSettings('pause')),
      btn(t('pause.main'), 'ghost', () => cb.toMain())),
    h('div', { class: 'foot', text: t(isTouchUI() ? 'pause.foot.touch' : 'pause.foot') })));

  // ---------------------------------------------------------------- game over
  let lastResult = null;
  const renderGameOver = () => {
    const r = lastResult;
    const body = h('div', { class: 'go-body' });
    if (r) {
      const win = r.winner === 0, names = r.names();
      const stat = (label, a, b) => h('div', { class: 'strow' }, h('span', { class: 'sa', text: String(a) }), h('span', { class: 'sl', text: label }), h('span', { class: 'sb', text: String(b) }));
      body.append(
        h('div', { class: `go-head ${win ? 'win' : 'lose'}` }, h('div', { class: 'go-title', text: t(win ? 'go.win' : 'go.lose') }), h('div', { class: 'go-sub', text: t(win ? 'go.winSub' : 'go.loseSub') })),
        h('div', { class: 'go-score' },
          h('div', { class: 'gs-team' }, h('i', { style: `background:${TEAM_COLOR[0]}` }), h('span', { text: names[0] })),
          h('div', { class: 'gs-pts' }, h('b', { class: win ? 'w' : '', text: String(r.points[0]) }), h('span', { text: ':' }), h('b', { class: win ? '' : 'w', text: String(r.points[1]) })),
          h('div', { class: 'gs-team r' }, h('span', { text: names[1] }), h('i', { style: `background:${TEAM_COLOR[1]}` }))),
        h('div', { class: 'stats' },
          stat(t('go.aces'), r.stats.aces[0], r.stats.aces[1]),
          stat(t('go.winners'), r.stats.winners[0], r.stats.winners[1]),
          stat(t('go.faults'), r.stats.faults[0], r.stats.faults[1]),
          stat(t('go.longest'), t('go.longestVal', { n: r.stats.longest }), t('go.rallies', { n: r.stats.rallies }))));
    }
    return h('div', { class: 'panel wide go' }, body,
      h('div', { class: 'btn-row' }, btn(t('pause.main'), 'ghost', () => cb.toMain()), btn(t('go.again'), 'primary', () => cb.restart())));
  };
  mk('gameover', renderGameOver);

  // ---------------------------------------------------------------- api
  let current = null;
  const api = {
    cfg,
    show(name) {
      for (const k of Object.keys(screens)) screens[k].classList.toggle('hidden', k !== name);
      current = name;
      if (name) { const s = screens[name]; s.classList.remove('in'); void s.offsetWidth; s.classList.add('in'); }
    },
    hide() { api.show(null); },
    get current() { return current; },
    openSetup(settings) { Object.assign(cfg, settings); rebuild('setup'); api.show('setup'); },
    openHelp(from) { helpFrom = from; api.show('help'); },
    openSettings(from, s) { setFrom = from; curSettings = s; rebuild('settings'); api.show('settings'); },
    gameOver(r) { lastResult = r; rebuild('gameover'); api.show('gameover'); },
    syncSettings(s) { curSettings = s; if (current === 'settings') rebuild('settings'); },
    /** language changed: rebuild every screen in place (no entrance animation replay) */
    relang(s) {
      if (s) curSettings = s;
      for (const k of Object.keys(screens)) { rebuild(k); screens[k].classList.remove('in'); }
    },
  };
  return api;
}
