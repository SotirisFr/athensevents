// Turns raw HTML into what Claude needs: event links from listing pages, and
// readable text plus any schema.org Event data from event pages.
//
// Plain regular expressions, no HTML parser, so the app needs no packages.
// Claude reads the result, so rough edges in the text do no harm.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', euro: '€', ndash: '–', mdash: '—' };

export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

/** Text of an HTML fragment: scripts and styles dropped, tags removed, entities decoded. */
function toText(html) {
  return clean(
    decode(
      html
        .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' '),
    ),
  );
}

/**
 * Links on a listing page that match the source's event-page pattern, each
 * with the text of its card: everything from the link up to the next event
 * link, which usually carries the title, dates and venue.
 */
export function extractLinks(html, pageUrl, source) {
  const anchors = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href;
    try {
      href = new URL(decode(m[1]), pageUrl).href.split('#')[0];
    } catch {
      continue;
    }
    if (!source.detail.test(href)) continue;
    if (source.exclude && source.exclude.test(href)) continue;
    // An image link and a title link to the same page count as one card.
    if (anchors.length && anchors.at(-1).url === href) continue;
    anchors.push({ url: href, at: m.index });
  }

  const seen = new Map();
  anchors.forEach((a, i) => {
    const end = i + 1 < anchors.length ? anchors[i + 1].at : a.at + 1500;
    const context = toText(html.slice(a.at, Math.min(end, a.at + 3000))).slice(0, 300);
    const prev = seen.get(a.url);
    if (prev === undefined || context.length > prev.length) seen.set(a.url, context);
  });
  return [...seen].map(([url, context]) => ({ url, context }));
}

/** schema.org Event objects found in JSON-LD blocks. */
export function extractJsonLd(html) {
  const out = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const type = [].concat(node['@type'] || []).join(' ');
    if (/Event/i.test(type)) out.push(node);
    if (node['@graph']) walk(node['@graph']);
  };
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      walk(JSON.parse(m[1]));
    } catch {
      /* ignore malformed blocks */
    }
  }
  return out;
}

/** The readable text of an event page, without menus, footers and scripts. */
export function extractText(html, maxChars = 5000) {
  const title = toText((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const description = decode(
    (html.match(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["']/i) || [])[1] || '',
  );
  let body = (html.match(/<main\b[^>]*>([\s\S]*)<\/main>/i) || html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i) || [])[1] ?? html;
  body = body
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|form)\b[\s\S]*?<\/\1>/gi, ' ');
  return clean(`${title}\n${clean(description)}\n${toText(body)}`).slice(0, maxChars);
}
