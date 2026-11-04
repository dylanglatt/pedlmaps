// Strip PII and secrets before anything reaches Sentry. Request URLs to Google
// carry the rider's coordinates, typed addresses and the API key in the query
// string; feedback posts to a Discord webhook whose URL is itself a credential.
// We keep only scheme + host + path, and drop the path entirely for webhooks.

const SECRET_HEADERS = /^(x-goog-api-key|authorization|cookie)$/i;

export function scrubUrl(u) {
  if (typeof u !== 'string' || !u) return u;
  const noQuery = u.split(/[?#]/)[0];
  if (/discord(app)?\.com\/api\/webhooks/i.test(noQuery)) return noQuery.replace(/\/api\/webhooks\/.*/i, '/api/webhooks/[redacted]');
  return noQuery;
}

// Replace any URL inside a free-text string (span descriptions like "GET https://...").
export function scrubText(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/https?:\/\/[^\s"']+/g, (m) => scrubUrl(m));
}

function scrubHeaders(h) {
  if (!h || typeof h !== 'object') return h;
  const out = {};
  for (const k of Object.keys(h)) out[k] = SECRET_HEADERS.test(k) ? '[redacted]' : h[k];
  return out;
}

export function scrubBreadcrumb(b) {
  if (!b) return b;
  if (b.data) {
    const d = { ...b.data };
    if (d.url) d.url = scrubUrl(d.url);
    if (d.to) d.to = scrubText(d.to);
    if (d.from) d.from = scrubText(d.from);
    delete d.request_body_size; delete d.response_body_size;
    b = { ...b, data: d };
  }
  if (b.message) b = { ...b, message: scrubText(b.message) };
  return b;
}

export function scrubEvent(e) {
  if (!e) return e;
  if (e.request) {
    e.request = { ...e.request, url: scrubUrl(e.request.url), query_string: undefined, headers: scrubHeaders(e.request.headers), data: undefined };
  }
  if (Array.isArray(e.breadcrumbs)) e.breadcrumbs = e.breadcrumbs.map(scrubBreadcrumb);
  if (e.message) e.message = scrubText(e.message);
  if (e.exception && Array.isArray(e.exception.values)) {
    e.exception.values = e.exception.values.map((v) => ({ ...v, value: scrubText(v.value) }));
  }
  if (Array.isArray(e.spans)) {
    e.spans = e.spans.map((s) => ({ ...s, description: scrubText(s.description), data: s.data && s.data.url ? { ...s.data, url: scrubUrl(s.data.url) } : s.data }));
  }
  if (e.user) e.user = { id: e.user.id }; // never IP/email
  return e;
}
