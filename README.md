# Athens Events

Finds events in Athens for the dates and price range you choose, summarizes each one in Greek, and adds it to Google Calendar when you ask. It runs on your own computer only when you start it. There is no server and nothing runs in the background.

## What you need

- [Node.js](https://nodejs.org) 20 or newer.
- [Claude Code](https://claude.com/claude-code), signed in. The app runs the `claude` command with your own login, so no API key is needed. Check that `claude -p "γεια"` answers in a terminal.

## Run it

```bash
npm install        # first time only
npm start
```

The app opens in your browser at http://localhost:3737. Pick the dates, optionally a price range, and press **Αναζήτηση**. Events appear as they are found. Close the terminal (or press Ctrl+C) to stop it.

Each event shows a short Greek summary, the venue with a Google Maps link, the dates in your range and the ticket price. **Προσθήκη στο Google Calendar** opens Google Calendar with everything filled in, and you press Save. **Αρχείο .ics** downloads the event for Apple Calendar, Outlook and others. For exhibitions and theatre seasons, pick the day you plan to go first.

## How a search works

1. It reads the listing pages of [more.com](https://www.more.com/gr-el/tickets/), [Athinorama](https://www.athinorama.gr) and [This is Athens](https://www.thisisathens.org/events) (viva.gr now redirects to more.com).
2. Claude picks the links that may fall in your dates and are in Attica.
3. It reads those event pages, and Claude writes the summary and extracts the venue, dates and prices.
4. It keeps the events that match your dates and prices. Free events count as €0. Events with no listed price appear only if the checkbox is ticked.

Summaries are cached in `.cache/` for 3 days, so a second search over similar dates is much faster. The first search can take a few minutes. Each search uses some of your Claude plan's usage; it runs the small Haiku model by default.

## Settings

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3737` | Local port |
| `CLAUDE_MODEL` | `haiku` | Model the `claude` command uses |
| `CLAUDE_PARALLEL` | `3` | How many `claude` calls run at once |
| `NO_OPEN` | unset | Set to skip opening the browser |

## When a source returns nothing

Sites change their pages. Run `npm run check-sources` to see how many event links each listing page still yields, without using Claude. If one shows 0 links, update its listing URLs or link pattern in `src/sources.js`.

## Development

```bash
npm test
```
