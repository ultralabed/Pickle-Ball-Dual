// English referee via speechSynthesis. Fails silently; every spoken line is also logged (and shown by the HUD).
// Kept at module level: Chrome garbage-collects an utterance that is only referenced by the engine and then never fires onend.
let currentUtterance = null;
const NOVELTY = new Set(['Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Good News', 'Jester', 'Organ', 'Superstar',
  'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Fred', 'Junior', 'Ralph', 'Kathy', 'Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley']);
const isNovelty = (name) => NOVELTY.has(String(name).replace(/\s*\(.*\)\s*$/, '').trim());

export function createVoice() {
  const synth = (typeof window !== 'undefined' && 'speechSynthesis' in window) ? window.speechSynthesis : null;
  let enabled = true, voice = null, muted = false;
  const queue = [];
  const api = { log: [], last: '', onLine: null };

  function pickVoice() {
    if (!synth) return;
    try {
      const vs = synth.getVoices();
      if (!vs || !vs.length) return;
      const us = vs.filter((v) => /^en[-_]US$/i.test(v.lang));
      const ok = vs.filter((v) => /^en[-_](US|GB)$/i.test(v.lang) && !isNovelty(v.name));
      voice = null;
      for (const n of ['Samantha', 'Alex', 'Google US English', 'Daniel']) {
        voice = us.find((v) => v.name.includes(n)) || (n === 'Daniel' ? ok.find((v) => v.name.includes(n)) : null);
        if (voice) break;
      }
      if (!voice) voice = ok.find((v) => /^en[-_]US$/i.test(v.lang)) || ok[0] || null;
    } catch (e) { voice = null; }
  }
  if (synth) {
    pickVoice();
    try { synth.addEventListener('voiceschanged', pickVoice); } catch (e) { /* ignore */ }
    try { if (!synth.onvoiceschanged) synth.onvoiceschanged = pickVoice; } catch (e) { /* ignore */ }
  }

  function pump() {
    if (!synth || !enabled || muted || !queue.length) return;
    try {
      if (synth.speaking || synth.pending) return;
      if (!voice) pickVoice();
      const line = queue.shift();
      const u = new SpeechSynthesisUtterance(line);
      u.lang = 'en-US'; if (voice) u.voice = voice; u.rate = 0.98; u.pitch = 0.95; u.volume = 1;
      const done = () => { if (currentUtterance === u) currentUtterance = null; setTimeout(pump, 30); };
      u.onend = done; u.onerror = done;
      currentUtterance = u;
      synth.resume();   // a previous pause() (without resume) leaves Chrome/Safari silent forever
      synth.speak(u);
    } catch (e) { /* ignore */ }
  }
  api.say = (text, { flush = false } = {}) => {
    api.log.push(text); if (api.log.length > 400) api.log.shift();
    api.last = text;
    if (api.onLine) api.onLine(text);
    if (!synth || !enabled || muted) return;
    try {
      if (flush) { queue.length = 0; currentUtterance = null; synth.cancel(); }
      if (queue.length > 3) queue.shift();
      queue.push(text); pump();
    } catch (e) { /* ignore */ }
  };
  api.setEnabled = (v) => { enabled = !!v; if (!enabled) api.stop(); };
  api.setMuted = (v) => { muted = !!v; if (muted) api.stop(); };
  api.stop = () => { queue.length = 0; currentUtterance = null; try { if (synth) { synth.cancel(); synth.resume(); } } catch (e) { /* ignore */ } };
  api.pause = () => { try { synth && synth.pause(); } catch (e) { /* ignore */ } };
  api.resume = () => { try { synth && synth.resume(); } catch (e) { /* ignore */ } };

  const FAULT_SAY = { out: 'Out', net: 'Net', doubleBounce: 'Two bounces', kitchen: 'Fault, kitchen', twoBounceRule: 'Fault, two bounce rule',
    serveShort: 'Fault, short serve', serveWrongCourt: 'Fault, wrong court', bodyHit: 'Fault, body hit' };
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

  /** Turn a batch of sim events into referee calls. `state` = sim.state after the batch. */
  api.onEvents = (events, state) => {
    for (const e of events) {
      if (e.type === 'fault') api.say(FAULT_SAY[e.reason] || 'Fault');
      else if (e.type === 'rallyEnd') {
        if (state.score.winner !== null) continue; // "Game" comes with gameOver
        if (e.sideOut) api.say('Side out');
        else if (e.secondServer) api.say('Second server');
        else if (e.pointScored) api.say('Point');
      } else if (e.type === 'serveReady') {
        const words = (e.callWords || []).join(', ');
        api.say(words, { flush: true });
        if (state.score.gamePoint) api.say('Game point');
      } else if (e.type === 'gameOver') {
        const [a, b] = e.points; const w = e.winnerTeam;
        const hi = w === 0 ? a : b, lo = w === 0 ? b : a;
        api.say(`Game. ${WORDS[hi] || hi}, ${WORDS[lo] || lo}`, { flush: false });
      }
    }
  };
  return api;
}
