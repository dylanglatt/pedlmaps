import { NETWORK } from './config';

function timeoutError() {
  const e = new Error('The network is slow or unavailable. Try again.');
  e.code = 'TIMEOUT';
  return e;
}

// fetch with a hard deadline that covers the WHOLE exchange: connecting, headers,
// and reading the body (res.json()/res.text()). A connection that accepts but
// never answers, or sends headers then stalls, would otherwise hang the splash
// screen or a planner spinner forever. Rejects with code 'TIMEOUT'.
// Returns a minimal response: { ok, status, headers, json(), text() }.
export async function fetchWithTimeout(url, opts = {}, timeoutMs = NETWORK.timeoutMs) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(timeoutError()); // settle first so races report TIMEOUT, not AbortError
      if (ctrl) ctrl.abort();
    }, timeoutMs);
  });
  deadline.catch(() => {}); // nobody may be listening if the body is never read
  let res;
  try {
    res = await Promise.race([fetch(url, ctrl ? { ...opts, signal: ctrl.signal } : opts), deadline]);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
  const read = (method) => () =>
    Promise.race([res[method](), deadline]).finally(() => clearTimeout(timer));
  return { ok: res.ok, status: res.status, headers: res.headers, json: read('json'), text: read('text') };
}
