import { NETWORK } from './config';

// fetch with a hard timeout. A connection that accepts but never answers would
// otherwise hang the splash screen or a planner spinner forever. Rejects with an
// Error whose code is 'TIMEOUT' when the deadline passes.
export async function fetchWithTimeout(url, opts = {}, timeoutMs = NETWORK.timeoutMs) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error('The network is slow or unavailable. Try again.');
      e.code = 'TIMEOUT';
      reject(e);          // settle first so the race reports TIMEOUT, not AbortError
      if (ctrl) ctrl.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([fetch(url, ctrl ? { ...opts, signal: ctrl.signal } : opts), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
