// Keep the visible app awake. Backgrounding, closing, or unmounting releases
// the lock; returning to the app requests it again. No polling or media hacks.
export function keepScreenAwake(doc = document, nav = navigator, win = window) {
  if (!nav.wakeLock?.request) return () => {};

  let lock = null;
  let pending = false;
  let disposed = false;
  let pageActive = true;
  let generation = 0;
  const visible = () => !disposed && pageActive && doc.visibilityState === 'visible';
  const release = async sentinel => {
    try { await sentinel?.release(); } catch { /* The browser may already have released it. */ }
  };
  const suspend = () => {
    generation += 1;
    const previous = lock;
    lock = null;
    void release(previous);
  };
  const acquire = async () => {
    if (!visible() || pending || (lock && !lock.released)) return;
    pending = true;
    const requestedGeneration = generation;
    try {
      const sentinel = await nav.wakeLock.request('screen');
      if (!visible() || requestedGeneration !== generation) {
        await release(sentinel);
      } else if (!sentinel.released) {
        lock = sentinel;
        sentinel.addEventListener('release', () => {
          if (lock === sentinel) lock = null;
        }, { once: true });
      }
    } catch {
      // Unsupported policies or power saving can deny the request. Retry on
      // the next visit/tap, never in a loop that fights the device's decision.
    } finally {
      pending = false;
      if (visible() && requestedGeneration !== generation) void acquire();
    }
  };
  const onVisibility = () => { if (visible()) void acquire(); else suspend(); };
  const onPageHide = () => { pageActive = false; suspend(); };
  const onPageShow = () => { pageActive = true; void acquire(); };
  doc.addEventListener('visibilitychange', onVisibility);
  doc.addEventListener('pointerdown', acquire, { passive: true });
  doc.addEventListener('keydown', acquire);
  win.addEventListener('focus', acquire);
  win.addEventListener('pagehide', onPageHide);
  win.addEventListener('pageshow', onPageShow);
  void acquire();

  return () => {
    disposed = true;
    doc.removeEventListener('visibilitychange', onVisibility);
    doc.removeEventListener('pointerdown', acquire);
    doc.removeEventListener('keydown', acquire);
    win.removeEventListener('focus', acquire);
    win.removeEventListener('pagehide', onPageHide);
    win.removeEventListener('pageshow', onPageShow);
    suspend();
  };
}
