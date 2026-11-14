// UI localisation. To add a language: add one dictionary to DICTS and one entry to LANGS (code, display name, <html lang>).
// Missing keys fall back to English, then to the key itself. Sim state keeps stable keys (e.g. player names 'you', 'mate');
// the shell translates them at display time with playerName().

const en = {
  'app.title': 'Pickle Ball Dual',
  'app.sub': '3D PICKLEBALL · VS AI',
  // meta.title / meta.description (en) mirror the static <title> / meta description in index.html (dev/seo/site.mjs HOME_EN)
  'meta.ogLocale': 'en_US', 'meta.ogLocaleAlt': 'zh_TW',
  'meta.title': 'Pickle Ball Dual — Free 3D Pickleball Game in Your Browser',
  'meta.description': 'Play Pickle Ball Dual, a free 3D pickleball game in your browser. Singles or doubles vs AI from DUPR 3.0 to 6.0, real rules, no install or sign-up.',
  'app.noWebgl': 'Could not start the 3D view (WebGL). Please use a recent Chrome / Safari with hardware acceleration enabled.',
  'canvas.aria': 'Pickle Ball Dual: 3D pickleball court. Play with the keyboard.',
  'lang.label': '語言 / Language',
  'lang.toggleAria': 'Language',

  'main.tag': 'A free 3D pickleball game in your browser. Play singles or doubles against AI at DUPR 3.0 to 6.0 with real rules. No install, no sign-up.',
  'main.guide.aria': 'Guides and rules',
  'main.guide.how': 'How to play', 'main.guide.rules': 'Rules', 'main.guide.faq': 'FAQ',
  'guide.how.href': 'how-to-play/', 'guide.rules.href': 'rules/', 'guide.faq.href': 'faq/',   // relative to index.html; zh-TW points into zh-tw/
  'main.play': 'Play',
  'main.playSub': 'Choose opponent level and rules',
  'main.help': 'How to play',
  'main.settings': 'Settings',
  'main.foot': 'WASD move · Space drive · J drop · K dink · L lob',

  'common.back': 'Back',
  'common.on': 'On', 'common.off': 'Off', 'common.muted': 'Muted',
  'common.show': 'Show', 'common.hide': 'Hide',
  'common.low': 'Low', 'common.medium': 'Medium', 'common.high': 'High',
  'common.right': 'Right', 'common.left': 'Left',

  'setup.title': 'Match setup',
  'setup.mode': 'Mode',
  'setup.scoring': 'Scoring',
  'setup.opp': 'Opponent level (DUPR)',
  'setup.mate': 'Partner level (DUPR)',
  'setup.hand': 'Paddle hand',
  'setup.quality': 'Graphics',
  'setup.start': 'Start match',
  'mode.doubles': 'Doubles', 'mode.singles': 'Singles',
  'scoring.sideout': 'Traditional (to 11)',
  'scoring.rally': 'Rally (to 15)',
  'scoring.sideout.note': 'Only the serving side scores (two serves per turn in doubles). First to 11, win by 2.',
  'scoring.rally.note': 'Every rally scores a point. First to 15, win by 2.',
  'dupr.3': 'Beginner: slower, makes plenty of errors. Good for learning the controls.',
  'dupr.4': 'Intermediate: mixes in drops and comes up to dink at the kitchen.',
  'dupr.5': 'Advanced: consistent drops, patient, attacks high balls.',
  'dupr.6': 'Expert: rarely misses, changes pace, takes the net, even hits ATPs.',

  'help.title': 'How to play',
  'help.rules': 'Key rules',
  'help.rings': 'Foot ring = swing timing',
  'help.tip': 'A yellow circle marks where the ball will land. Press a hit key when the ring turns green; the paddle meets the ball about 0.17 s later. Lime means perfect timing.',
  'key.move': 'Move', 'key.drive': 'Drive', 'key.drop': 'Drop', 'key.dink': 'Dink', 'key.lob': 'Lob', 'key.aim': 'Aim', 'key.serve': 'Serve', 'key.other': 'Other',
  'key.move.d': '(or arrow keys) W toward the net, S back',
  'key.drive.d': 'Tap for a quick drive; hold to charge, release to hit (a high ball becomes a smash)',
  'key.drop.d': 'Soft arc landing in the kitchen: the classic third-shot drop',
  'key.dink.d': 'Soft shot into the kitchen; best from near the net',
  'key.lob.d': 'High arc that pushes opponents back to the baseline',
  'key.aim.d': 'Hold A/← as you hit to go left, D/→ to go right; neither = safe middle',
  'key.serve.d': 'On your serve press any hit key: Space = fast deep serve, L = lob serve, J/K = soft serve',
  'key.other.d': 'Esc pause/resume · M mute · H hide key hints · R skip replay',
  'rule.1': 'Serve diagonally into the opposite service court and past the kitchen line (landing on the line is short).',
  'rule.2': 'Two-bounce rule: the return of serve and the serving side\'s third shot must bounce before being hit.',
  'rule.3': 'No volleys in the kitchen (non-volley zone, 7 ft / 2.13 m from the net): you can\'t hit an unbounced ball from inside or on the line, or step in within 0.6 s of a volley.',
  'rule.4': 'Out, into the net, a double bounce or hitting a player loses the rally. Lines are in.',
  'cue.amber': 'Amber', 'cue.green': 'Green', 'cue.lime': 'Lime', 'cue.red': 'Red',
  'cue.amber.d': 'Ball incoming: not time yet, get ready',
  'cue.green.d': 'Press a hit key now and you will make contact',
  'cue.lime.d': 'Perfect timing: hit now for the steadiest, strongest shot',
  'cue.red.d': 'Swinging now is a fault (volley before the bounce, or standing in the kitchen)',

  'settings.title': 'Settings',
  'settings.sound': 'Sound',
  'settings.volume': 'Volume',
  'settings.voice': 'Referee voice (English)',
  'settings.legend': 'Key hints',
  'settings.saved': 'Settings are saved in this browser.',

  'pause.title': 'Paused',
  'pause.resume': 'Resume',
  'pause.restart': 'Restart',
  'pause.main': 'Main menu',
  'pause.foot': 'Press Esc to resume',

  'go.win': 'You win!', 'go.lose': 'Good game!',
  'go.winSub': 'VICTORY', 'go.loseSub': 'GAME OVER',
  'go.aces': 'Aces', 'go.winners': 'Winners', 'go.faults': 'Faults & errors',
  'go.longest': 'Longest rally',
  'go.longestVal': '{n} shots',
  'go.rallies': '{n} rallies',
  'go.again': 'Play again',

  'hud.callLabel': 'Score call',
  'hud.server': 'Server {n}',
  'hud.gamePoint': 'GAME POINT',
  'hud.rally': 'Rally',
  'hud.charge': 'Power',
  'hud.power': 'Power {n}%',
  'hud.start': 'Game on',
  'hud.pause': 'Pause', 'hud.pauseTitle': 'Pause (Esc)',
  'hud.muteTitle': 'Mute (M)', 'hud.mute': 'Mute',
  'hud.legendTitle': 'Key hints (H)', 'hud.legendAria': 'Key hints',
  'legend.title': 'Controls',
  'legend.move': 'Move',
  'legend.drive': 'Drive (hold to charge)',
  'legend.drop': 'Drop', 'legend.dink': 'Dink', 'legend.lob': 'Lob',
  'legend.aim': 'Aim left/right (hold on hit)',
  'legend.pause': 'Pause', 'legend.mute': 'Mute', 'legend.hide': 'Hide key hints',
  'legend.rings': 'Foot ring',
  'legend.ring.amber': 'Ball coming',
  'legend.ring.green': 'Press now to hit',
  'legend.ring.lime': 'Perfect timing',
  'legend.ring.red': 'Swing = fault',

  'shot.drive': 'Drive', 'shot.drop': 'Drop', 'shot.dink': 'Dink', 'shot.lob': 'Lob', 'shot.smash': 'Smash', 'shot.serve': 'Serve', 'shot.atp': 'Around the post',
  'shot.drive.sub': '', 'shot.drop.sub': '', 'shot.dink.sub': '', 'shot.lob.sub': '', 'shot.smash.sub': '', 'shot.serve.sub': '', 'shot.atp.sub': 'ATP',

  'hint.serve': 'Your serve — press Space (J/K soft serve, L lob, hold A/D to aim)',
  'hint.serveUrge': 'Your serve — press Space! (J/K soft, L lob, hold A/D to aim)',
  'hint.receive': 'Opponent serving — let the ball bounce before you return it',
  'hint.twoBounce1': 'Two-bounce rule: let the serve bounce once before returning it',
  'hint.twoBounce2': 'Two-bounce rule: the third shot must bounce before you hit it',
  'hint.kitchen': 'You\'re in the kitchen — no volleys. Let it bounce (or step back)',
  'hint.postVolley': 'No stepping into the kitchen within 0.6 s of a volley!',

  'fault.out': 'Out',
  'fault.net': 'Into the net',
  'fault.doubleBounce': 'Double bounce',
  'fault.kitchen': 'Kitchen fault',
  'fault.twoBounceRule': 'Two-bounce violation',
  'fault.serveShort': 'Short serve',
  'fault.serveWrongCourt': 'Wrong service court',
  'fault.bodyHit': 'Hit by the ball',
  'fault.generic': 'Fault',
  'fault.point': 'Point',
  'fault.kitchen.d': 'Volleyed in the kitchen (or stepped in after a volley)',
  'fault.twoBounceRule.d': 'Serve and return must each bounce before any volley',
  'fault.serveShort.d': 'A serve must clear the kitchen line',
  'fault.serveWrongCourt.d': 'A serve must land in the diagonal service court',
  'point.us': 'Your side +1', 'point.them': 'Opponents +1',
  'point.sideOut': 'Side out', 'point.secondServer': 'Second server',
  'hl.smash': 'Smash winner!', 'hl.atp': 'Around-the-post winner!', 'hl.lob': 'Lob winner!', 'hl.longRally': 'Great rally: {n} shots',

  'replay.title': 'HIGHLIGHT', 'replay.tag': 'REPLAY',
  'replay.skip': 'Press R or click to skip',

  'player.you': 'You', 'player.mate': 'Partner', 'player.oppA': 'Opp A', 'player.oppB': 'Opp B', 'player.opp': 'Opponent',
};

const zh = {
  'app.title': 'Pickle Ball Dual',
  'app.sub': '3D 匹克球 · 對戰 AI',
  'meta.ogLocale': 'zh_TW', 'meta.ogLocaleAlt': 'en_US',
  'meta.title': 'Pickle Ball Dual 匹克球：免費瀏覽器 3D 匹克球遊戲',
  'meta.description': '免費的 3D 匹克球遊戲，開瀏覽器就能玩：單打、雙打對戰 DUPR 3.0 至 6.0 的 AI，採用真實規則，免下載、免註冊。',
  'app.noWebgl': '無法啟動 3D 畫面（WebGL）。請使用最新版 Chrome / Safari 並開啟硬體加速。',
  'canvas.aria': 'Pickle Ball Dual 匹克球場：用鍵盤操作',
  'lang.label': '語言 / Language',
  'lang.toggleAria': '語言',

  'main.tag': '免費的瀏覽器 3D 匹克球遊戲：單打、雙打對戰 DUPR 3.0 到 6.0 的 AI，採用真實規則，免下載、免註冊。',
  'main.guide.aria': '遊戲指南與規則',
  'main.guide.how': '操作說明', 'main.guide.rules': '規則', 'main.guide.faq': '常見問題',
  'guide.how.href': 'zh-tw/how-to-play/', 'guide.rules.href': 'zh-tw/rules/', 'guide.faq.href': 'zh-tw/faq/',
  'main.play': '開始比賽',
  'main.playSub': '設定對手強度與規則',
  'main.help': '操作說明',
  'main.settings': '設定',
  'main.foot': 'W A S D 移動 · Space 抽球 · J 吊球 · K Dink · L 高吊',

  'common.back': '返回',
  'common.on': '開', 'common.off': '關', 'common.muted': '靜音',
  'common.show': '顯示', 'common.hide': '隱藏',
  'common.low': '低', 'common.medium': '中', 'common.high': '高',
  'common.right': '右手', 'common.left': '左手',

  'setup.title': '比賽設定',
  'setup.mode': '模式',
  'setup.scoring': '計分',
  'setup.opp': '對手強度 DUPR',
  'setup.mate': '隊友強度 DUPR',
  'setup.hand': '持拍手',
  'setup.quality': '畫質',
  'setup.start': '開始比賽',
  'mode.doubles': '雙打', 'mode.singles': '單打',
  'scoring.sideout': '傳統 11 分',
  'scoring.rally': 'Rally 15 分',
  'scoring.sideout.note': '只有發球方得分；雙打每輪有兩次發球機會，先到 11 分且領先 2 分。',
  'scoring.rally.note': '每一球都得分；先到 15 分且領先 2 分。',
  'dupr.3': '新手：移動較慢、常失誤，適合熟悉操作。',
  'dupr.4': '中階：偶爾吊球、會上網打 Dink。',
  'dupr.5': '進階：穩定吊球、有耐性，會攻擊高球。',
  'dupr.6': '高手：幾乎不失誤，會變速、搶網、甚至繞網柱。',

  'help.title': '操作說明',
  'help.rules': '規則重點',
  'help.rings': '腳下光圈＝出手時機',
  'help.tip': '球的落點會出現黃色圓圈。光圈變綠時按下擊球鍵，球拍約 0.17 秒後碰到球；亮黃綠代表正好落在最佳時機。',
  'key.move': '移動', 'key.drive': '抽球', 'key.drop': '吊球', 'key.dink': '短球 Dink', 'key.lob': '高吊球', 'key.aim': '瞄準', 'key.serve': '發球', 'key.other': '其他',
  'key.move.d': '（或方向鍵）W 往網前、S 往後',
  'key.drive.d': '快速點一下＝普通抽球；按住蓄力、放開擊球（高球自動變殺球）',
  'key.drop.d': '柔和的弧線，落進對方廚房區（第三拍經典吊球）',
  'key.dink.d': '輕輕過網、落在廚房區；站在網前效果最好',
  'key.lob.d': '拉出高弧線，把對手逼回底線',
  'key.aim.d': '擊球瞬間按住 A／← 打向左、D／→ 打向右，不按＝中路安全',
  'key.serve.d': '輪到你發球時按任一擊球鍵：Space＝快速深球、L＝高球、J／K＝柔和發球',
  'key.other.d': 'Esc 暫停／繼續 · M 靜音 · H 隱藏操作提示 · R 跳過重播',
  'rule.1': '發球必須落在對角的發球區，且越過廚房線（廚房線上算短球犯規）。',
  'rule.2': '兩跳規則：接發球與發球方的第三拍，都必須讓球先彈地一次才能擊球。',
  'rule.3': '廚房區（網前 2.13 公尺內）不能截擊——球沒彈地就不能在區內或踩線擊球，截擊後 0.6 秒內也不能衝入。',
  'rule.4': '球出界、未過網、彈地兩次、打到身體都算失分。邊線與底線都算界內。',
  'cue.amber': '琥珀', 'cue.green': '綠色', 'cue.lime': '亮黃綠', 'cue.red': '紅色',
  'cue.amber.d': '球來了：還沒到時機，先準備',
  'cue.green.d': '現在按擊球鍵，就一定打得到',
  'cue.lime.d': '完美時機：現在按，擊球最穩最有力',
  'cue.red.d': '現在揮拍會犯規（球還沒彈地的截擊、或站在廚房區內）',

  'settings.title': '設定',
  'settings.sound': '音效',
  'settings.volume': '音量',
  'settings.voice': '裁判語音（英文）',
  'settings.legend': '操作提示',
  'settings.saved': '設定會自動儲存在這個瀏覽器。',

  'pause.title': '暫停',
  'pause.resume': '繼續',
  'pause.restart': '重新開始',
  'pause.main': '回主選單',
  'pause.foot': '按 Esc 繼續',

  'go.win': '你贏了！', 'go.lose': '再接再厲！',
  'go.winSub': 'VICTORY', 'go.loseSub': 'GAME OVER',
  'go.aces': '愛司球 Ace', 'go.winners': '致勝球 Winner', 'go.faults': '犯規／失誤',
  'go.longest': '最長回合',
  'go.longestVal': '{n} 拍',
  'go.rallies': '共 {n} 回合',
  'go.again': '再來一局',

  'hud.callLabel': '報分',
  'hud.server': '發球 {n}',
  'hud.gamePoint': '賽末點 GAME POINT',
  'hud.rally': '連續擊球',
  'hud.charge': '蓄力',
  'hud.power': '力道 {n}%',
  'hud.start': '比賽開始',
  'hud.pause': '暫停', 'hud.pauseTitle': '暫停 (Esc)',
  'hud.muteTitle': '靜音 (M)', 'hud.mute': '靜音',
  'hud.legendTitle': '按鍵提示 (H)', 'hud.legendAria': '按鍵提示',
  'legend.title': '操作',
  'legend.move': '移動',
  'legend.drive': '抽球（按住蓄力，放開擊球）',
  'legend.drop': '吊球', 'legend.dink': '短球 Dink', 'legend.lob': '高吊球',
  'legend.aim': '擊球瞬間按住＝瞄準左／右',
  'legend.pause': '暫停', 'legend.mute': '靜音', 'legend.hide': '隱藏按鍵提示',
  'legend.rings': '腳下光圈',
  'legend.ring.amber': '球來了',
  'legend.ring.green': '按下去就打得到',
  'legend.ring.lime': '完美時機',
  'legend.ring.red': '現在揮拍會犯規',

  'shot.drive': '抽球', 'shot.drop': '吊球', 'shot.dink': '短球 Dink', 'shot.lob': '高吊球', 'shot.smash': '殺球', 'shot.serve': '發球', 'shot.atp': '繞網柱 ATP',
  'shot.drive.sub': 'DRIVE', 'shot.drop.sub': 'DROP', 'shot.dink.sub': 'DINK', 'shot.lob.sub': 'LOB', 'shot.smash.sub': 'SMASH', 'shot.serve.sub': 'SERVE', 'shot.atp.sub': 'ATP',

  'hint.serve': '輪到你發球 — 按 Space 快速發球（J／K 柔和、L 高球），按住 A／D 決定左右',
  'hint.serveUrge': '輪到你發球 — 按 Space！（J／K 柔和、L 高球，按住 A／D 決定左右）',
  'hint.receive': '對手發球 — 準備接發球，球要先彈地一次才能回擊',
  'hint.twoBounce1': '兩跳規則：接發球要讓球先彈地一下，再回擊',
  'hint.twoBounce2': '兩跳規則：第三拍也要讓球先彈地，才能擊球',
  'hint.kitchen': '你站在廚房區 — 球沒彈地不能截擊，等它彈起再打（或退後一步）',
  'hint.postVolley': '截擊後 0.6 秒內不能踏進廚房區！',

  'fault.out': '球出界',
  'fault.net': '球未過網',
  'fault.doubleBounce': '球彈地兩次',
  'fault.kitchen': '廚房區違例',
  'fault.twoBounceRule': '違反兩跳規則',
  'fault.serveShort': '發球落入廚房區',
  'fault.serveWrongCourt': '發球落錯發球區',
  'fault.bodyHit': '球擊中身體',
  'fault.generic': '犯規',
  'fault.point': '得分',
  'fault.kitchen.d': '在廚房區內截擊（或截擊後衝入廚房）',
  'fault.twoBounceRule.d': '發球與接發球後各需先彈地一次才能截擊',
  'fault.serveShort.d': '發球必須越過廚房線',
  'fault.serveWrongCourt.d': '發球必須落在對角的發球區',
  'point.us': '我方得分 +1', 'point.them': '對手得分 +1',
  'point.sideOut': '換發球', 'point.secondServer': '第二發球員',
  'hl.smash': '殺球致勝！', 'hl.atp': '繞網柱致勝！', 'hl.lob': '高吊球致勝！', 'hl.longRally': '精彩對攻 {n} 拍',

  'replay.title': '精彩重播', 'replay.tag': 'REPLAY',
  'replay.skip': '按 R 或點擊畫面跳過',

  'player.you': '你', 'player.mate': '隊友', 'player.oppA': '對手A', 'player.oppB': '對手B', 'player.opp': '對手',
};

export const LANGS = [
  { code: 'en', name: 'English', htmlLang: 'en' },
  { code: 'zh-TW', name: '繁體中文', htmlLang: 'zh-Hant-TW' },
];
const DICTS = { en, 'zh-TW': zh };

let lang = 'en';
const listeners = [];

export const isLang = (c) => LANGS.some((l) => l.code === c);
/** zh-* browsers get Traditional Chinese, everything else English */
export function detectLang() {
  try { if (/^zh/i.test((typeof navigator !== 'undefined' && navigator.language) || '')) return 'zh-TW'; } catch (e) { /* ignore */ }
  return 'en';
}
export const getLang = () => lang;
export function has(key) { return !!(DICTS[lang] && key in DICTS[lang]) || key in en; }
export function t(key, params) {
  let s = DICTS[lang] && DICTS[lang][key];
  if (s === undefined) s = en[key];
  if (s === undefined) s = key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  return s;
}
/** translate a sim player name: stable keys ('you', 'mate', ...) are looked up, anything else is shown as is */
export function playerName(name) { const k = `player.${name}`; return k in en ? t(k) : name; }

export function setLang(code, { silent = false } = {}) {
  if (!isLang(code)) code = 'en';
  const changed = code !== lang;
  lang = code;
  try { document.documentElement.lang = LANGS.find((l) => l.code === code).htmlLang; } catch (e) { /* no DOM */ }
  if (changed && !silent) for (const cb of listeners.slice()) cb(code);
  return changed;
}
export function onLangChange(cb) { listeners.push(cb); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }; }

/** fill static markup: data-i18n (text), data-i18n-aria (aria-label), data-i18n-title, plus the meta description */
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  if (root !== document) return;
  document.title = t('meta.title');
  const set = (sel, attr, v) => { const e = document.querySelector(sel); if (e) e.setAttribute(attr, v); };
  set('meta[name="description"]', 'content', t('meta.description'));
  set('meta[property="og:title"]', 'content', t('meta.title'));
  set('meta[property="og:description"]', 'content', t('meta.description'));
  set('meta[property="og:locale"]', 'content', t('meta.ogLocale'));
  set('meta[property="og:locale:alternate"]', 'content', t('meta.ogLocaleAlt'));
  set('meta[name="twitter:title"]', 'content', t('meta.title'));
  set('meta[name="twitter:description"]', 'content', t('meta.description'));
  set('meta[name="apple-mobile-web-app-title"]', 'content', t('app.title'));
  set('meta[name="application-name"]', 'content', t('app.title'));
}
