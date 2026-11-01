// Polite page fetching: a browser-like user agent, a timeout, at most two
// requests at a time per site, and a short pause between them.

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const PER_HOST = 2;
const PAUSE_MS = 400;
const TIMEOUT_MS = 20000;

const hosts = new Map(); // host -> { active, queue }

function slot(host) {
  if (!hosts.has(host)) hosts.set(host, { active: 0, queue: [] });
  const h = hosts.get(host);
  return new Promise((resolve) => {
    const take = () => {
      h.active++;
      resolve(() => {
        setTimeout(() => {
          h.active--;
          const next = h.queue.shift();
          if (next) next();
        }, PAUSE_MS);
      });
    };
    if (h.active < PER_HOST) take();
    else h.queue.push(take);
  });
}

// Cookies kept for the app's lifetime, like a browser does. more.com sends
// event pages through Queue-it, which sets a cookie and redirects back; without
// cookies that becomes an endless redirect loop. When a real queue is active,
// the page is skipped rather than waited for.
const jar = new Map(); // "domain|name" -> { domain, name, value }
const MAX_REDIRECTS = 10;

function storeCookies(res, host) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair, ...attrs] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const domainAttr = attrs.map((a) => a.trim()).find((a) => /^domain=/i.test(a));
    const domain = (domainAttr ? domainAttr.slice(7) : host).replace(/^\./, '').toLowerCase();
    const expired = attrs.some((a) => /^\s*max-age=\s*(0|-)/i.test(a));
    if (expired) jar.delete(`${domain}|${name}`);
    else jar.set(`${domain}|${name}`, { domain, name, value });
  }
}

function cookieHeader(host) {
  return [...jar.values()]
    .filter((c) => host === c.domain || host.endsWith('.' + c.domain))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

const isQueuePage = (url) => /(^|\.)queue-it\.net$/i.test(new URL(url).hostname);

export async function fetchPage(url) {
  const release = await slot(new URL(url).host);
  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const host = new URL(current).hostname.toLowerCase();
      const cookies = cookieHeader(host);
      const res = await fetch(current, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
          Accept: 'text/html,application/xhtml+xml',
          ...(cookies ? { Cookie: cookies } : {}),
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      storeCookies(res, host);
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        current = new URL(location, current).href;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (isQueuePage(current)) throw new Error('ουρά αναμονής ενεργή, παραλείπεται');
      return { url: current, html: await res.text() };
    }
    throw new Error('πάρα πολλές ανακατευθύνσεις');
  } finally {
    release();
  }
}
