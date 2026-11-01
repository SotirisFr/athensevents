// Where events are collected from.
//
// Each source lists one or more listing pages and a pattern that picks out
// the links to individual event pages. Listing pages are read first; Claude
// keeps only the links whose dates may fall in the requested range, then the
// event pages themselves are read and summarized.
//
// To add a source, add an entry here and run `npm run check-sources`.

export const SOURCES = [
  {
    id: 'more',
    name: 'more.com',
    listings: [
      'https://www.more.com/gr-el/tickets/music/',
      'https://www.more.com/gr-el/tickets/theatre/',
      'https://www.more.com/gr-el/tickets/dance/',
      'https://www.more.com/gr-el/tickets/stand-up-comedy/',
      'https://www.more.com/gr-el/tickets/child/',
      'https://www.more.com/gr-el/tickets/museums/',
      'https://www.more.com/gr-el/tickets/sports/',
    ],
    // e.g. /gr-el/tickets/theater/mcneal/ or /gr-el/tickets/music/festival/x/y/
    detail: /^https:\/\/www\.more\.com\/gr-el\/tickets\/[a-z-]+\/[^?#]+\/$/,
    // Category pages themselves also match the pattern above; skip them.
    exclude: /^https:\/\/www\.more\.com\/gr-el\/tickets\/[a-z-]+\/$/,
    maxDetails: 30,
  },
  {
    id: 'athinorama',
    name: 'Athinorama',
    listings: [
      'https://www.athinorama.gr/music/guide/all/',
      'https://www.athinorama.gr/theatre/guide/',
      'https://www.athinorama.gr/texnes/guide/',
      'https://www.athinorama.gr/child/guide/',
    ],
    // e.g. /music/gig/david_morales-10091025/ , /theatre/performance/x-123/
    detail: /^https:\/\/www\.athinorama\.gr\/(music|theatre|texnes|child)\/[a-z_]+\/[^/?#]+-\d+\/?$/,
    maxDetails: 30,
  },
  {
    id: 'thisisathens',
    name: 'This is Athens',
    listings: ['https://www.thisisathens.org/events'],
    // e.g. /events/athens-palestine-film-festival-at-onassis-stegi
    detail: /^https:\/\/www\.thisisathens\.org\/events\/[^/?#]+$/,
    maxDetails: 20,
  },
];
