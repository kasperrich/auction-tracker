// Run in the browser on the auction page (javascript_tool). Reads the lots the page itself
// loaded (Apollo cache), visiting every result page. Set FULL = true to also return titles.
// Output (compact): "<ISO time>|<checksum>|<rows>" with rows "lot,minCents,bidCents,bidCount,open,closesOn" joined by ";".
// checksum = sum of (bidCents + bidCount) over all rows, so update.mjs can detect copy errors.
(async (FULL = false) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cache = () => ({ ...(globalThis.apolloAnnoClientCache?.extract() || {}), ...(globalThis.apolloClientCache?.extract() || {}) });
  const count = () => Object.keys(cache()).filter(k => k.startsWith('IncrementalLotState:')).length;
  for (let i = 0; i < 40 && count() === 0; i++) await sleep(500);
  const pages = [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(x => /^\d+$/.test(x)).map(Number);
  const last = Math.max(1, ...pages);
  // The site remembers the last viewed page, so visit every page number, including 1.
  for (let p = 1; p <= last; p++) {
    const before = count();
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === String(p));
    if (!btn) continue;
    btn.click();
    for (let i = 0; i < 20 && count() === before; i++) await sleep(300);
    await sleep(300);
  }
  const c = cache();
  const lots = [];
  for (const [k, d] of Object.entries(c)) {
    if (!k.startsWith('IncrementalLotDetails:')) continue;
    const s = c['IncrementalLotState:' + d.id] || {};
    lots.push({ n: d.lotNumber, title: d.title, id: d.id, min: +d.minimumStartBidAmount || 0,
      bid: +(s.amount ?? d.currentBidAmount) || 0, cnt: s.bidCount ?? 0, open: s.isOpen === false ? 0 : 1,
      closes: s.closesOn || d.closingOn });
  }
  lots.sort((a, b) => a.n - b.n);
  if (FULL) return JSON.stringify(lots.map(l => [l.n, l.title, l.id]));
  const sum = lots.reduce((a, l) => a + l.bid + l.cnt, 0);
  return new Date().toISOString() + '|' + sum + '|' + lots.map(l => [l.n, l.min, l.bid, l.cnt, l.open, l.closes].join(',')).join(';');
})()
