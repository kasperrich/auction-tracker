// Usage: node update.mjs <snapshot.txt>
// Validates a snapshot produced by extract.js, appends it to data/snapshots.jsonl,
// logs every bid change to data/changes.jsonl and regenerates overzicht.html.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
const SNAPSHOTS = path.join(DATA, 'snapshots.jsonl');
const CHANGES = path.join(DATA, 'changes.jsonl');
const AUCTION_URL = 'https://auctivo.net/nl/auction/b10e4c75-ae8c-4562-8f48-b853ec689a24';

function fail(msg) { console.error('ERROR: ' + msg); process.exit(1); }

function parseSnapshot(text) {
  const raw = text.trim().replace(/^"|"$/g, '');
  const [t, sumStr, body] = raw.split('|');
  if (!t || !sumStr || !body || isNaN(Date.parse(t))) fail('snapshot is not in "<time>|<checksum>|<rows>" format');
  const rows = {};
  for (const r of body.split(';')) {
    const [n, min, bid, cnt, open, closes] = r.split(',');
    if (!n || closes === undefined) fail('bad row: ' + r);
    rows[n] = [+min, +bid, +cnt, +open, closes];
  }
  const sum = Object.values(rows).reduce((a, r) => a + r[1] + r[2], 0);
  if (sum !== +sumStr) fail(`checksum mismatch (expected ${sumStr}, got ${sum}) - the snapshot was copied incorrectly`);
  return { t, rows };
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

const input = process.argv[2];
if (!input) fail('usage: node update.mjs <snapshot.txt>');
const snap = parseSnapshot(fs.readFileSync(input, 'utf8'));
const snapshots = readJsonl(SNAPSHOTS);
const prev = snapshots.at(-1);
if (prev && prev.t === snap.t) fail('this snapshot was already stored');

const lots = JSON.parse(fs.readFileSync(path.join(DATA, 'lots.json'), 'utf8'));
const known = new Set(lots.map(l => String(l[0])));
const unknown = Object.keys(snap.rows).filter(n => !known.has(n));
const missing = [...known].filter(n => !(n in snap.rows));
if (missing.length) fail(`incomplete snapshot, ${missing.length} known lots missing (e.g. ${missing.slice(0, 5).join(',')}) - reload the page and extract again`);

// A change is any difference in highest bid, bid count, open state or closing time.
const changes = [];
for (const [n, r] of Object.entries(snap.rows)) {
  const p = prev?.rows[n];
  if (!p) { if (prev) changes.push({ t: snap.t, n: +n, bid: r[1], cnt: r[2], prevBid: null, prevCnt: null, open: r[3], closes: r[4], note: 'nieuw' }); continue; }
  if (p[1] !== r[1] || p[2] !== r[2] || p[3] !== r[3] || p[4] !== r[4]) {
    changes.push({ t: snap.t, n: +n, bid: r[1], cnt: r[2], prevBid: p[1], prevCnt: p[2], open: r[3], closes: r[4],
      note: p[4] !== r[4] ? 'sluittijd verlengd' : p[3] !== r[3] ? (r[3] ? 'heropend' : 'gesloten') : '' });
  }
}

fs.mkdirSync(DATA, { recursive: true });
fs.appendFileSync(SNAPSHOTS, JSON.stringify(snap) + '\n');
if (changes.length) fs.appendFileSync(CHANGES, changes.map(c => JSON.stringify(c)).join('\n') + '\n');

const all = [...snapshots, snap];
const allChanges = readJsonl(CHANGES);

// Rows for the shared dashboard: one file, a `soort` column tells lots, changes and measurements apart.
// Amounts are in euros.
const eur = c => c == null ? null : c / 100;
// Own grouping of lots (data/categories.json); lots not listed there count as "Overig".
const catFile = path.join(DATA, 'categories.json');
const catOf = {};
if (fs.existsSync(catFile)) {
  for (const [cat, nums] of Object.entries(JSON.parse(fs.readFileSync(catFile, 'utf8')))) for (const n of nums) catOf[n] = cat;
}
const cat = n => catOf[n] || 'Overig';
const titleOf = Object.fromEntries(lots.map(l => [String(l[0]), l[1]]));
const idOf = Object.fromEntries(lots.map(l => [String(l[0]), l[2]]));
const lastChange = {};
for (const c of allChanges) lastChange[c.n] = c.t;
const before = all.at(-2);
const dashRows = [];
for (const [n, r] of Object.entries(snap.rows)) {
  const p = before?.rows[n];
  dashRows.push({ soort: 'kavel', kavel: +n, categorie: cat(n), titel: titleOf[n] || '(onbekende kavel)',
    link: idOf[n] ? `${AUCTION_URL}/lot/${idOf[n]}` : AUCTION_URL,
    minimum: eur(r[0]), hoogste_bod: eur(r[1]), biedingen: r[2],
    bod_erbij: p ? eur(r[1] - p[1]) : 0, biedingen_erbij: p ? r[2] - p[2] : 0,
    laatste_wijziging: lastChange[n] || null, sluit: r[4], open: r[3] === 1 });
}
for (const c of allChanges) {
  dashRows.push({ soort: 'wijziging', moment: c.t, kavel: c.n, categorie: cat(c.n), titel: titleOf[c.n] || '(onbekende kavel)',
    bod_voor: eur(c.prevBid), bod_na: eur(c.bid), biedingen_voor: c.prevCnt, biedingen_na: c.cnt, opmerking: c.note || '' });
}
for (const s of all) {
  const rs = Object.values(s.rows);
  dashRows.push({ soort: 'meting', moment: s.t, totaal_bod: eur(rs.reduce((a, r) => a + r[1], 0)),
    totaal_biedingen: rs.reduce((a, r) => a + r[2], 0), kavels_met_bod: rs.filter(r => r[2] > 0).length,
    kavels_open: rs.filter(r => r[3] === 1).length });
  const byCat = {};
  for (const [n, r] of Object.entries(s.rows)) {
    const g = byCat[cat(n)] ||= { bod: 0, biedingen: 0, met_bod: 0, kavels: 0 };
    g.bod += r[1]; g.biedingen += r[2]; g.met_bod += r[2] > 0 ? 1 : 0; g.kavels += 1;
  }
  for (const [c, g] of Object.entries(byCat)) {
    dashRows.push({ soort: 'meting_categorie', moment: s.t, categorie: c, totaal_bod: eur(g.bod),
      totaal_biedingen: g.biedingen, kavels_met_bod: g.met_bod, kavels: g.kavels });
  }
}
fs.writeFileSync(path.join(DATA, 'dashboard.json'), JSON.stringify(dashRows));

// Standalone overview page (works without claude.ai), served by GitHub Pages from the repository root.
const payload = { auctionUrl: AUCTION_URL, generated: new Date().toISOString(), rows: dashRows };
const template = fs.readFileSync(path.join(ROOT, 'overzicht.template.html'), 'utf8');
const html = template.replace('/*__DATA__*/null', JSON.stringify(payload).replace(/</g, '\\u003c'));
fs.writeFileSync(path.join(ROOT, 'index.html'), html);

console.log(`OK: snapshot ${snap.t} stored (${Object.keys(snap.rows).length} lots, ${changes.length} changes since previous, ${all.length} snapshots total).`);
if (unknown.length) console.log('NEW_LOTS: ' + unknown.join(',') + ' (run extract.js with FULL = true and add them to data/lots.json)');
for (const c of changes.slice(0, 30)) {
  console.log(`  kavel ${c.n}: ${c.prevBid == null ? '-' : '€' + c.prevBid / 100} -> €${c.bid / 100} (${c.prevCnt ?? '-'} -> ${c.cnt} biedingen)${c.note ? ' ' + c.note : ''}`);
}
if (changes.length > 30) console.log(`  ... and ${changes.length - 30} more`);
