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

export async function fetchPage(url) {
  const release = await slot(new URL(url).host);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { url: res.url || url, html: await res.text() };
  } finally {
    release();
  }
}
