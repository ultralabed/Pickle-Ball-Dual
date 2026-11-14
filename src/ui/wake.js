// Screen wake lock while a match is running (phones dim and lock the screen otherwise). Every call is best effort:
// unsupported browsers, rejected requests (battery saver, background tab) and released sentinels are all tolerated,
// and the lock is re-acquired when the page becomes visible again.
export function createWakeLock() {
  let want = false, sentinel = null, busy = false;
  const supported = typeof navigator !== 'undefined' && !!navigator.wakeLock && typeof navigator.wakeLock.request === 'function';
  async function acquire() {
    if (!supported || !want || busy || sentinel || document.hidden) return;
    busy = true;
    try {
      const s = await navigator.wakeLock.request('screen');
      if (!want) { try { await s.release(); } catch (e) { /* ignore */ } }
      else { sentinel = s; s.addEventListener('release', () => { if (sentinel === s) sentinel = null; }); }
    } catch (e) { /* NotAllowedError etc: fine */ }
    busy = false;
  }
  function drop() {
    const s = sentinel; sentinel = null;
    if (s) { try { const p = s.release(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) acquire(); });
  return {
    supported,
    /** true while a match is on (play / replay / pause screens all keep the screen awake) */
    set(on) { want = !!on; if (want) acquire(); else drop(); },
    get active() { return !!sentinel; },
  };
}
