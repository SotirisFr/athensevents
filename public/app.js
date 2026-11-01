// Search form, results list and calendar buttons.

const form = document.getElementById('search');
const results = document.getElementById('results');
const statusBox = document.getElementById('status');
const statusLine = document.getElementById('status-line');
const log = document.getElementById('log');
const filters = document.getElementById('filters');
const tpl = document.getElementById('card');

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Default range: today to a week from today.
const now = new Date();
form.from.value = isoDay(now);
form.to.value = isoDay(new Date(now.getTime() + 7 * 864e5));

let events = [];
let activeCategory = null;

const DAYS = ['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ'];
function formatWhen(s) {
  const [d, t] = s.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const wd = DAYS[new Date(y, m - 1, day).getDay()];
  return `${wd} ${pad(day)}/${pad(m)}${t ? ' ' + t.slice(0, 5) : ''}`;
}

function formatPrice(ev) {
  if (ev.is_free) return 'Δωρεάν';
  const lo = ev.price_min ?? ev.price_max;
  const hi = ev.price_max ?? ev.price_min;
  if (lo == null) return 'Η τιμή δεν αναγράφεται';
  return lo === hi ? `€${lo}` : `€${lo}–€${hi}`;
}

// ---- Calendar ------------------------------------------------------------

const compact = (s) => s.replace(/[-:]/g, '');
function addMinutes(local, minutes) {
  const [d, t] = local.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [h, min] = t.split(':').map(Number);
  const dt = new Date(y, m - 1, day, h, min + minutes);
  return `${isoDay(dt)}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
function nextDay(d) {
  const [y, m, day] = d.split('-').map(Number);
  return isoDay(new Date(y, m - 1, day + 1));
}

/** Start/end of one calendar entry: timed (2 hours if no end) or all-day. */
function slot(start, end) {
  if (start.includes('T')) {
    const s = start.slice(0, 16);
    const e = end && end.includes('T') ? end.slice(0, 16) : addMinutes(s, 120);
    return { allDay: false, start: s, end: e };
  }
  return { allDay: true, start, end: nextDay(start) };
}

function details(ev) {
  return [ev.summary, ev.schedule && `Πρόγραμμα: ${ev.schedule}`, `Τιμή: ${formatPrice(ev)}`, ev.price_note, ev.url]
    .filter(Boolean)
    .join('\n\n');
}
const place = (ev) => [ev.venue, ev.address].filter(Boolean).join(', ');

function googleUrl(ev, s) {
  const fmt = (x) => (s.allDay ? compact(x) : compact(x) + '00');
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${fmt(s.start)}/${fmt(s.end)}`,
    details: details(ev),
    location: place(ev),
    ctz: 'Europe/Athens',
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

function icsFile(ev, s) {
  const esc = (x) => x.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
  const when = s.allDay
    ? [`DTSTART;VALUE=DATE:${compact(s.start)}`, `DTEND;VALUE=DATE:${compact(s.end)}`]
    : [`DTSTART;TZID=Europe/Athens:${compact(s.start)}00`, `DTEND;TZID=Europe/Athens:${compact(s.end)}00`];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const text = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//athensevents//EL', 'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@athensevents`, `DTSTAMP:${stamp}`, ...when,
    `SUMMARY:${esc(ev.title)}`, `LOCATION:${esc(place(ev))}`, `DESCRIPTION:${esc(details(ev))}`, `URL:${ev.url}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  a.download = `${ev.title.slice(0, 40).replace(/[^\p{L}\p{N}]+/gu, '-')}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** A date picker (when there is a choice) plus the two calendar buttons. */
function calendarActions(ev, box) {
  let pick;
  if (ev.occurrences.length) {
    pick = document.createElement('select');
    pick.setAttribute('aria-label', 'Ημερομηνία');
    ev.occurrences.forEach((o, i) => pick.add(new Option(formatWhen(o.start), i)));
    if (ev.occurrences.length > 1) box.append(pick);
  } else {
    // A run (exhibition, theatre season): choose the day you want to go.
    pick = document.createElement('input');
    pick.type = 'date';
    pick.setAttribute('aria-label', 'Ημέρα που θα πάτε');
    pick.min = ev.run_start > form.from.value ? ev.run_start : form.from.value;
    pick.max = ev.run_end < form.to.value ? ev.run_end : form.to.value;
    pick.value = pick.min;
    box.append(pick);
  }
  const current = () =>
    ev.occurrences.length
      ? slot(ev.occurrences[pick.value].start, ev.occurrences[pick.value].end)
      : slot(pick.value);

  const g = document.createElement('a');
  g.className = 'btn';
  g.target = '_blank';
  g.rel = 'noopener';
  g.textContent = 'Προσθήκη στο Google Calendar';
  const refresh = () => (g.href = googleUrl(ev, current()));
  pick.addEventListener('change', refresh);
  refresh();

  const ics = document.createElement('button');
  ics.type = 'button';
  ics.className = 'btn secondary';
  ics.textContent = 'Αρχείο .ics';
  ics.title = 'Για Apple Calendar, Outlook κ.ά.';
  ics.addEventListener('click', () => icsFile(ev, current()));

  box.append(g, ics);
}

// ---- Results -------------------------------------------------------------

const firstDate = (ev) => (ev.occurrences[0]?.start || (ev.run_start > form.from.value ? ev.run_start : form.from.value));

function render() {
  const shown = events
    .filter((ev) => !activeCategory || ev.category === activeCategory)
    .sort((a, b) => firstDate(a).localeCompare(firstDate(b)));
  results.replaceChildren(
    ...shown.map((ev) => {
      const card = tpl.content.cloneNode(true);
      card.querySelector('.category').textContent = ev.category;
      card.querySelector('.source').textContent = ev.source;
      const link = card.querySelector('h2 a');
      link.href = ev.url;
      link.textContent = ev.title;
      card.querySelector('.summary').textContent = ev.summary;

      const where = card.querySelector('.where');
      if (place(ev)) {
        const map = document.createElement('a');
        map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place(ev) + ', Αττική')}`;
        map.target = '_blank';
        map.rel = 'noopener';
        map.textContent = place(ev);
        where.append('📍 ', map);
      } else where.remove();

      card.querySelector('.when').textContent = ev.occurrences.length
        ? '🗓 ' + ev.occurrences.map((o) => formatWhen(o.start)).join(' · ')
        : `🗓 ${formatWhen(ev.run_start)} – ${formatWhen(ev.run_end)}${ev.schedule ? ` (${ev.schedule})` : ''}`;

      const price = card.querySelector('.price');
      price.textContent = formatPrice(ev);
      if (ev.price_note) {
        const note = document.createElement('small');
        note.textContent = ` · ${ev.price_note}`;
        price.append(note);
      }
      calendarActions(ev, card.querySelector('.actions'));
      return card;
    }),
  );
}

function renderFilters() {
  const cats = [...new Set(events.map((e) => e.category))].sort();
  filters.hidden = cats.length < 2;
  filters.replaceChildren(
    ...[null, ...cats].map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c ?? 'Όλα';
      b.setAttribute('aria-pressed', String(activeCategory === c));
      b.addEventListener('click', () => {
        activeCategory = c;
        renderFilters();
        render();
      });
      return b;
    }),
  );
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (form.from.value > form.to.value) {
    alert('Η ημερομηνία «Έως» πρέπει να είναι μετά την «Από».');
    return;
  }
  events = [];
  activeCategory = null;
  results.replaceChildren();
  log.replaceChildren();
  renderFilters();
  statusBox.hidden = false;
  statusLine.textContent = 'Αναζήτηση… Μπορεί να πάρει μερικά λεπτά την πρώτη φορά.';
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;

  const params = new URLSearchParams({
    from: form.from.value,
    to: form.to.value,
    min: form.min.value,
    max: form.max.value,
    unknown: form.unknown.checked ? '1' : '0',
  });
  const source = new EventSource(`/api/search?${params}`);
  const addLog = (text) => {
    const li = document.createElement('li');
    li.textContent = text;
    log.append(li);
  };
  const finish = (text) => {
    source.close();
    button.disabled = false;
    statusLine.textContent = text;
    if (!events.length) results.innerHTML = '<p class="empty">Δεν βρέθηκαν εκδηλώσεις με αυτά τα κριτήρια.</p>';
  };
  source.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.type === 'event') {
      events.push(msg.event);
      statusLine.textContent = `Αναζήτηση… ${events.length} εκδηλώσεις μέχρι στιγμής.`;
      renderFilters();
      render();
    } else if (msg.type === 'progress' || msg.type === 'warn') {
      addLog(msg.text);
    } else if (msg.type === 'done') {
      finish(`Βρέθηκαν ${events.length} εκδηλώσεις.`);
    } else if (msg.type === 'error') {
      finish(`Σφάλμα: ${msg.text}`);
    }
  };
  source.onerror = () => {
    if (button.disabled) finish('Η σύνδεση με την εφαρμογή διακόπηκε. Τρέχει ακόμη το `npm start`;');
  };
});
