// No-money check (owner rule, docs/design/DESIGN_SYSTEM.md): scans rendered text and title/aria-label/placeholder
// on every route in Simple and Advanced. Usage: node scripts/no-money.cjs [url]  (default: ../socialadz-studio.html)
const { chromium } = require('playwright');
const path = require('path'); const URL = process.argv[2] || 'file://' + path.resolve(__dirname, '../../socialadz-studio.html');
const RX = /₹|\bRs\.?\s?\d|\bINR\b|\$\s?\d|\b(price|prices|pricing|priced|cost|costs|credit|credits|fee|fees|subscription|subscriptions|paid)\b/i;
(async () => {
  const b = await chromium.launch(); const hits = [];
  for (const mode of ['simple', 'advanced']) {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.addInitScript(m => { try { localStorage.setItem('sa-mode', m) } catch {} }, mode);
    for (const r of ['', '#/studio/brief', '#/studio/openings', '#/studio/making', '#/studio/result', '#/studio/ads', '#/studio/moments', '#/studio/brand']) {
      await p.goto(URL + r); await p.waitForTimeout(700);
      // open every dialog trigger text is hard; collect text + attrs
      const txt = await p.evaluate(() => document.body.innerText + '\n' + [...document.querySelectorAll('[title],[aria-label],[placeholder]')].map(e => [e.getAttribute('title'), e.getAttribute('aria-label'), e.getAttribute('placeholder')].filter(Boolean).join(' ')).join('\n'));
      for (const line of txt.split('\n')) if (RX.test(line)) hits.push(`${mode} ${r || 'landing'}: ${line.trim().slice(0, 120)}`);
    }
    // open pickers on brief
    await p.goto('file:///home/claude/socialadzgen-v2/mockup/socialadz-studio.html#/studio/brief'); await p.waitForTimeout(600);
    for (const label of [/voice/i, /model/i]) {
      const btn = p.getByRole('button', { name: label }).first();
      if (await btn.count()) { await btn.click().catch(() => {}); await p.waitForTimeout(500);
        const t = await p.evaluate(() => document.body.innerText);
        for (const line of t.split('\n')) if (RX.test(line)) hits.push(`${mode} picker ${label}: ${line.trim().slice(0, 120)}`);
        await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
    }
    await ctx.close();
  }
  await b.close();
  console.log(hits.length ? hits.join('\n') : 'no-money check: 0 hits across 16 screens + pickers');
})();
