// The search pipeline, run each time you press "Αναζήτηση":
//
//   1. Read each source's listing pages and collect links to event pages.
//   2. Ask Claude which links may fall in your dates and are in Attica.
//   3. Read those event pages and ask Claude, a few at a time, for a Greek
//      summary, the venue, the dates and the ticket prices.
//   4. Keep the events that match your dates and price range.
//
// Step 3 results are cached for 3 days, so repeat searches are quick.

import { SOURCES } from './sources.js';
import { fetchPage } from './fetch.js';
import { extractLinks, extractJsonLd, extractText } from './extract.js';
import { askClaude } from './claude.js';
import { getCached, setCached, saveCache } from './cache.js';

const LINKS_PER_CALL = 150;
const PAGES_PER_CALL = 5;

const nullable = (type) => ({ type: [type, 'null'] });

const PICK_SCHEMA = {
  type: 'object',
  properties: { keep: { type: 'array', items: { type: 'integer' } } },
  required: ['keep'],
};

const EVENT_SCHEMA = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          is_event: { type: 'boolean' },
          in_attica: { type: 'boolean' },
          title: { type: 'string' },
          category: {
            type: 'string',
            enum: ['Μουσική', 'Θέατρο', 'Χορός', 'Έκθεση', 'Κινηματογράφος', 'Παιδικά', 'Αθλητικά', 'Stand-up', 'Ομιλία', 'Φεστιβάλ', 'Άλλο'],
          },
          summary: { type: 'string' },
          venue: nullable('string'),
          address: nullable('string'),
          occurrences: {
            type: 'array',
            items: {
              type: 'object',
              properties: { start: { type: 'string' }, end: nullable('string') },
              required: ['start'],
            },
          },
          run_start: nullable('string'),
          run_end: nullable('string'),
          schedule: nullable('string'),
          price_min: nullable('number'),
          price_max: nullable('number'),
          is_free: { type: 'boolean' },
          price_note: nullable('string'),
        },
        required: ['index', 'is_event', 'in_attica', 'title', 'category', 'summary', 'occurrences', 'is_free'],
      },
    },
  },
  required: ['events'],
};

const today = () => new Date().toISOString().slice(0, 10);

async function pickLinks(links, from, to) {
  const keep = new Set();
  for (let i = 0; i < links.length; i += LINKS_PER_CALL) {
    const chunk = links.slice(i, i + LINKS_PER_CALL);
    const list = chunk.map((l, j) => `[${i + j}] ${l.context || '(χωρίς κείμενο)'} — ${l.url}`).join('\n');
    const prompt = `Σήμερα είναι ${today()}. Παρακάτω είναι σύνδεσμοι από σελίδα με εκδηλώσεις στην Ελλάδα, ο καθένας με το κείμενο της κάρτας του.

Κράτησε τους αριθμούς των συνδέσμων που:
- είναι συγκεκριμένη εκδήλωση (συναυλία, παράσταση, έκθεση, προβολή, αγώνας κ.λπ.), όχι άρθρο ή κατηγορία, και
- ΜΠΟΡΕΙ να γίνεται μεταξύ ${from} και ${to}. Αν δεν φαίνεται ημερομηνία, κράτησέ τον.
- Αν φαίνεται ότι γίνεται εκτός Αττικής (π.χ. Θεσσαλονίκη, Πάτρα), απόρριψέ τον.

${list}`;
    const res = await askClaude(prompt, PICK_SCHEMA);
    for (const n of res.keep) if (n >= i && n < i + chunk.length) keep.add(n);
  }
  return links.filter((_, n) => keep.has(n));
}

async function describePages(pages) {
  const body = pages
    .map((p, i) => {
      const ld = p.jsonLd.length ? `\nΔομημένα δεδομένα (JSON-LD): ${JSON.stringify(p.jsonLd).slice(0, 2500)}` : '';
      return `=== ΣΕΛΙΔΑ ${i} === ${p.url}${ld}\nΚείμενο: ${p.text}`;
    })
    .join('\n\n');
  const prompt = `Σήμερα είναι ${today()}. Για κάθε σελίδα εκδήλωσης παρακάτω, δώσε στοιχεία στα ελληνικά. Χρησιμοποίησε μόνο ό,τι γράφει η σελίδα· μην επινοείς τίποτα.

- index: ο αριθμός της σελίδας.
- is_event: false αν δεν είναι σελίδα συγκεκριμένης εκδήλωσης.
- in_attica: true αν γίνεται στην Αθήνα ή αλλού στην Αττική.
- title: ο τίτλος όπως τον γράφει η σελίδα (στα ελληνικά αν υπάρχει).
- summary: έως 40 λέξεις στα ελληνικά, τι είναι και γιατί να πάει κανείς.
- venue, address: χώρος και διεύθυνση, αν υπάρχουν.
- occurrences: κάθε συγκεκριμένη ημερομηνία/ώρα που αναφέρεται (έως 40), σε μορφή "YYYY-MM-DDTHH:MM" ή "YYYY-MM-DD" αν δεν δίνεται ώρα. Αν λείπει το έτος, βάλε το επόμενο που ταιριάζει από σήμερα.
- run_start, run_end, schedule: για παραστάσεις ή εκθέσεις που τρέχουν για διάστημα με τακτικό πρόγραμμα, η πρώτη και η τελευταία ημέρα (YYYY-MM-DD) και το πρόγραμμα σε λίγες λέξεις (π.χ. "Πέμ.–Κυρ. 21:00"). Αλλιώς null.
- price_min, price_max: φθηνότερο και ακριβότερο κανονικό εισιτήριο σε ευρώ. null αν δεν αναφέρεται τιμή.
- is_free: true μόνο αν η είσοδος είναι ελεύθερη/δωρεάν.
- price_note: μειωμένα εισιτήρια ή άλλες σημειώσεις για την τιμή, σύντομα, αλλιώς null.

${body}`;
  const res = await askClaude(prompt, EVENT_SCHEMA);
  return res.events;
}

const dateOf = (s) => (s || '').slice(0, 10);

export const normalizeTitle = (t) =>
  (t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export function matches(ev, q) {
  const occ = ev.occurrences.filter((o) => dateOf(o.start) >= q.from && dateOf(o.start) <= q.to);
  const runOverlaps = ev.run_start && ev.run_end && ev.run_start <= q.to && ev.run_end >= q.from;
  if (!occ.length && !runOverlaps) return null;

  const unknownPrice = !ev.is_free && ev.price_min == null && ev.price_max == null;
  if (unknownPrice) {
    if (!q.includeUnknown) return null;
  } else {
    const lo = ev.is_free ? 0 : (ev.price_min ?? ev.price_max);
    const hi = ev.is_free ? 0 : (ev.price_max ?? ev.price_min);
    if (q.max != null && lo > q.max) return null;
    if (q.min != null && hi < q.min) return null;
  }
  return { ...ev, occurrences: occ };
}

/**
 * Runs a search. `emit` receives progress messages and each matching event
 * as soon as it is ready.
 */
export async function search(q, emit) {
  const found = new Set();

  await Promise.all(
    SOURCES.map(async (source) => {
      try {
        // 1. Listing pages.
        const links = new Map();
        for (const listing of source.listings) {
          try {
            const page = await fetchPage(listing);
            for (const l of extractLinks(page.html, page.url, source)) {
              if (!links.has(l.url) || l.context.length > links.get(l.url).context.length) links.set(l.url, l);
            }
          } catch (e) {
            emit({ type: 'warn', text: `${source.name}: δεν διαβάστηκε η σελίδα ${listing} (${e.message})` });
          }
        }
        emit({ type: 'progress', text: `${source.name}: βρέθηκαν ${links.size} σύνδεσμοι` });

        // Already-summarized pages skip Claude entirely.
        const fresh = [];
        for (const l of links.values()) {
          const cached = getCached(l.url);
          if (cached) report(cached);
          else fresh.push(l);
        }
        if (!fresh.length) return;

        // 2. Which links are worth opening.
        const picked = (await pickLinks(fresh, q.from, q.to)).slice(0, source.maxDetails);
        emit({ type: 'progress', text: `${source.name}: ανοίγουν ${picked.length} σελίδες εκδηλώσεων` });

        // 3. Read event pages and summarize them in batches.
        const batches = [];
        for (let i = 0; i < picked.length; i += PAGES_PER_CALL) batches.push(picked.slice(i, i + PAGES_PER_CALL));
        await Promise.all(
          batches.map(async (batch) => {
            const pages = [];
            for (const l of batch) {
              try {
                const p = await fetchPage(l.url);
                pages.push({ url: l.url, jsonLd: extractJsonLd(p.html), text: extractText(p.html) });
              } catch (e) {
                emit({ type: 'warn', text: `${source.name}: ${l.url} (${e.message})` });
              }
            }
            if (!pages.length) return;
            try {
              for (const ev of await describePages(pages)) {
                const page = pages[ev.index];
                if (!page) continue;
                const full = { ...ev, url: page.url, source: source.name };
                delete full.index;
                setCached(page.url, full);
                report(full);
              }
            } catch (e) {
              emit({ type: 'warn', text: `${source.name}: το Claude απέτυχε (${e.message})` });
            }
          }),
        );
      } catch (e) {
        emit({ type: 'warn', text: `${source.name}: ${e.message}` });
      }
    }),
  );
  saveCache();

  // The same show is often listed on more than one site; keep the first.
  function report(ev) {
    const key = normalizeTitle(ev.title);
    if (!ev.is_event || !ev.in_attica || found.has(key)) return;
    const hit = matches(ev, q);
    if (!hit) return;
    found.add(key);
    emit({ type: 'event', event: hit });
  }

  return found.size;
}
