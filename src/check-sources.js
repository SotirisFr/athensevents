// Checks that each source's listing pages can be read and still contain
// event links, without calling Claude. Run with `npm run check-sources`
// when a site seems to return nothing.

import { SOURCES } from './sources.js';
import { fetchPage } from './fetch.js';
import { extractLinks } from './extract.js';

for (const source of SOURCES) {
  console.log(`\n${source.name}`);
  for (const listing of source.listings) {
    try {
      const page = await fetchPage(listing);
      const links = extractLinks(page.html, page.url, source);
      console.log(`  ${links.length.toString().padStart(4)} links  ${listing}`);
      for (const l of links.slice(0, 3)) console.log(`        ${l.url}\n          ${l.context.slice(0, 100)}`);
    } catch (e) {
      console.log(`  FAILED      ${listing} (${e.message})`);
    }
  }
}
