// Turns raw HTML into what Claude needs: event links from listing pages, and
// readable text plus any schema.org Event data from event pages.

import * as cheerio from 'cheerio';

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

/** Links on a listing page that match the source's event-page pattern. */
export function extractLinks(html, pageUrl, source) {
  const $ = cheerio.load(html);
  const seen = new Map();
  $('a[href]').each((_, a) => {
    let href;
    try {
      href = new URL($(a).attr('href'), pageUrl).href.split('#')[0];
    } catch {
      return;
    }
    if (!source.detail.test(href)) return;
    if (source.exclude && source.exclude.test(href)) return;
    // The link text plus its card's text usually carries the title, dates and venue.
    const card = $(a).closest('li, article, .card, [class*="item"], [class*="event"]');
    const context = clean((card.length ? card : $(a)).text()).slice(0, 300);
    const prev = seen.get(href);
    if (!prev || context.length > prev.length) seen.set(href, context);
  });
  return [...seen].map(([url, context]) => ({ url, context }));
}

/** schema.org Event objects found in JSON-LD blocks. */
export function extractJsonLd(html) {
  const $ = cheerio.load(html);
  const out = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const type = [].concat(node['@type'] || []).join(' ');
    if (/Event|TheaterEvent|MusicEvent|ExhibitionEvent/i.test(type)) out.push(node);
    if (node['@graph']) walk(node['@graph']);
  };
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      walk(JSON.parse($(s).contents().text()));
    } catch {
      /* ignore malformed blocks */
    }
  });
  return out;
}

/** The readable text of an event page, without menus, footers and scripts. */
export function extractText(html, maxChars = 5000) {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, nav, footer, header, iframe, form').remove();
  const main = $('main').length ? $('main') : $('body');
  const title = clean($('title').text());
  const description = clean($('meta[name="description"]').attr('content'));
  return clean(`${title}\n${description}\n${main.text()}`).slice(0, maxChars);
}
