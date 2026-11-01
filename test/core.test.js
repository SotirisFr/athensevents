import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLinks, extractJsonLd, extractText } from '../src/extract.js';
import { matches, normalizeTitle } from '../src/search.js';
import { SOURCES } from '../src/sources.js';

const more = SOURCES.find((s) => s.id === 'more');
const athinorama = SOURCES.find((s) => s.id === 'athinorama');

test('extractLinks keeps event pages and drops category pages', () => {
  const html = `
    <ul>
      <li><a href="/gr-el/tickets/theater/mcneal/">McNeal</a> 1 Νοε - 17 Ιαν · Θέατρο Αθηνών</li>
      <li><a href="/gr-el/tickets/music/">Μουσική</a></li>
      <li><a href="https://www.more.com/gr-el/tickets/music/festival/release-athens-2027/fontaines-d-c/">Fontaines D.C.</a></li>
      <li><a href="/gr-el/tickets/theater/mcneal/#info">McNeal</a></li>
    </ul>`;
  const links = extractLinks(html, 'https://www.more.com/gr-el/tickets/theatre/', more);
  assert.deepEqual(
    links.map((l) => l.url),
    [
      'https://www.more.com/gr-el/tickets/theater/mcneal/',
      'https://www.more.com/gr-el/tickets/music/festival/release-athens-2027/fontaines-d-c/',
    ],
  );
  assert.match(links[0].context, /17 Ιαν/);
});

test('athinorama pattern matches gig pages, not articles', () => {
  assert.ok(athinorama.detail.test('https://www.athinorama.gr/music/gig/david_morales-10091025/'));
  assert.ok(!athinorama.detail.test('https://www.athinorama.gr/theatre/3080261/theatro-ton-noembrio/'));
});

test('extractJsonLd finds events inside @graph', () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"MusicEvent","name":"X"}]}</script>`;
  assert.deepEqual(extractJsonLd(html).map((e) => e.name), ['X']);
});

test('extractText drops scripts and menus', () => {
  const text = extractText('<title>T</title><nav>Menu</nav><main><p>Συναυλία   απόψε</p><script>x()</script></main>');
  assert.equal(text, 'T Συναυλία απόψε');
});

test('extractText keeps ticket prices found only in scripts', () => {
  const html =
    '<title>T</title><main><p>Live</p><script>x = {"discount-name":"early bird - Κανονικό","price":32.0},{"discount-name":"presale","price":35.0},{"price":0}</script></main>';
  assert.equal(extractText(html), 'T Τιμές εισιτηρίων: 32 € (early bird - Κανονικό), 35 € (presale) Live');
});

const base = {
  occurrences: [{ start: '2026-11-05T21:00' }, { start: '2026-11-20T21:00' }],
  price_min: 15,
  price_max: 40,
  is_free: false,
};
const q = { from: '2026-11-01', to: '2026-11-08', min: null, max: null, includeUnknown: true };

test('matches keeps only dates in range', () => {
  assert.deepEqual(matches(base, q).occurrences, [{ start: '2026-11-05T21:00' }]);
  assert.equal(matches(base, { ...q, from: '2026-12-01', to: '2026-12-31' }), null);
});

test('matches uses price overlap', () => {
  assert.ok(matches(base, { ...q, max: 20 }));
  assert.equal(matches(base, { ...q, max: 10 }), null);
  assert.equal(matches(base, { ...q, min: 50 }), null);
  assert.ok(matches({ ...base, is_free: true, price_min: null, price_max: null }, { ...q, min: 0, max: 0 }));
});

test('matches handles unknown prices and runs', () => {
  const run = { occurrences: [], run_start: '2026-10-01', run_end: '2027-01-31', is_free: false, price_min: null, price_max: null };
  assert.ok(matches(run, q));
  assert.equal(matches(run, { ...q, includeUnknown: false }), null);
});

test('normalizeTitle ignores accents and punctuation', () => {
  assert.equal(normalizeTitle('Ο Γίγαντας!'), normalizeTitle('ο γιγαντας'));
});

test('extractLinks reads card text and decodes entities', () => {
  const html = `<div class="item"><a href="/events/a"><img></a><a href='/events/a'>Jazz &amp; Blues</a><span>5 Νοε &ndash; Gazarte</span></div>
    <div class="item"><a href="/events/b">Άλλο</a></div>`;
  const src = { detail: /^https:\/\/x\.gr\/events\/[a-z]+$/ };
  const links = extractLinks(html, 'https://x.gr/list', src);
  assert.equal(links.length, 2);
  assert.equal(links[0].context, 'Jazz & Blues 5 Νοε – Gazarte');
});

import { spreadAcross, isSameShow } from '../src/search.js';

test('spreadAcross alternates between listing pages', () => {
  const links = [0, 0, 0, 0, 1, 2, 2].map((group, i) => ({ url: `u${i}`, group }));
  assert.deepEqual(spreadAcross(links, 4).map((l) => l.url), ['u0', 'u4', 'u5', 'u1']);
});

test('isSameShow matches a longer title on the same date', () => {
  const a = { title: 'Pablo Ziegler', occurrences: [{ start: '2026-11-05T21:00' }] };
  const b = { title: 'PABLO ZIEGLER TRIO', occurrences: [{ start: '2026-11-05T21:30' }] };
  assert.ok(isSameShow(a, b));
  assert.ok(!isSameShow(a, { ...b, occurrences: [{ start: '2026-11-06T21:30' }] }));
  assert.ok(!isSameShow({ ...a, title: 'Jazz' }, { ...b, title: 'Jazz Night' }));
});
