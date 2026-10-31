/* Astera Studio mockup. Three places (Ask, Dashboard, Pipelines), a Search circle beside them, and one action dial.
   State lives in S; every view is a function of S. URL flags make any state reachable for review:
   #/dashboard?dial=place   #/dashboard?dial=chart   #/ask?demo=1   #/pipelines/regional_targets?step=s3   ?static=1
   #/dashboard?sheet=region   #/dashboard?sheet=range   #/dashboard?sheet=figures   #/dashboard?range=2025-q3&region=eu */
(function () {
  'use strict';
  const D = window.STUDIO, C = window.Charts;
  const { esc, money, nf0, nf1 } = C;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const mq = q => window.matchMedia(q).matches;
  const isPhone = () => window.innerWidth < 700;
  const isRail = () => window.innerWidth >= 1280; // desktop: the circles stand in a rail on the left
  // phones and tablets (or any touch screen) get full-size buttons where desktop uses inline text links
  const touchUI = () => !isRail() || mq('(pointer: coarse)');
  // The canvas flows left to right only when the whole graph fits the width it has; otherwise top to bottom.
  // So it adapts to the real width, not to a device name.
  const canvasMode = p => {
    if (!p || window.innerWidth < 700) return 'ttb';
    return layout(p, 'ltr').W <= window.innerWidth - (isRail() ? 88 : 0) - 48 ? 'ltr' : 'ttb';
  };
  // Ctrl/Cmd+K is a keyboard shortcut, so it is only ever mentioned where a keyboard is likely
  const KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K';
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------------- state ---------------- */
  const S = {
    place: 'dashboard', pipelineId: null, stepId: null, stepTab: 'settings',
    dash: 'sales', range: D.YEAR + '-q3', region: 'all',
    drill: {}, sel: {}, kind: {},
    // every chat keeps its own thread; S.thread always points at the open one
    chats: [], chatId: null, chatSeq: 1,
    thread: [], askContext: null, pinned: [], seq: 1,
    lineage: null, drafts: {}, listFilter: 'all', zoom: 1,
    statics: false, alerts: {},
    // figures pinned per dashboard, seeded from each dashboard's defaults
    kpiPins: Object.fromEntries(D.DASHBOARDS.map(d => [d.id, d.kpis.slice()])),
    rangeTab: 'year', rgDraft: null,
    failOpen: false, spOpen: {}
  };
  let lastInput = 'pointer';
  document.addEventListener('keydown', e => { if (!e.metaKey && !e.ctrlKey && e.key !== 'Shift') lastInput = 'keyboard'; }, true);
  document.addEventListener('pointerdown', () => { lastInput = 'pointer'; }, true);
  const P = id => D.PIPELINES.find(p => p.id === id);
  const node = (p, id) => p.nodes.find(n => n.id === id);
  const steps = p => p.nodes.filter(n => n.kind === 'step');
  const stepNo = (p, id) => steps(p).findIndex(n => n.id === id) + 1;
  const range = id => D.RANGES.find(r => r.id === (id || S.range));
  const contObj = id => D.CONTINENTS.find(c => c.id === id);
  const countryObj = name => D.COUNTRIES.find(c => c.name === name);
  // region: 'all' | continent id | 'c:<country>'
  const regionName = (r = S.region) => r === 'all' ? 'Global' : r.startsWith('c:') ? r.slice(2) : contObj(r).name;
  const regionCont = (r = S.region) => r === 'all' ? null : r.startsWith('c:') ? countryObj(r.slice(2)).cont : r;
  // how a period reads inside a sentence: "Q3" this year, "Q3 2025" or "2025" in the archive
  const periodWord = rg => rg.kind === 'fy' ? String(rg.year) : rg.kind === 'ytd' ? 'year-to-date' : rg.archived ? rg.label : 'Q' + (rg.q + 1);

  /* ---------------- status vocabulary (always icon + word) ---------------- */
  const ST = {
    succeeded: { word: 'Succeeded', icon: 'check-circle' },
    failed: { word: 'Failed', icon: 'xmark-circle' },
    running: { word: 'Running', icon: 'refresh', spin: true },
    scheduled: { word: 'Scheduled', icon: 'clock' },
    pending: { word: 'Waiting', icon: 'clock' },
    skipped: { word: 'Skipped', icon: 'skip-next' },
    stale: { word: 'Stale', icon: 'warning-circle' }
  };
  const stIcon = (st, cls) => ic(ST[st].icon, (cls || 'sm') + (ST[st].spin ? ' spin' : ''));
  const TYPE_ICON = { read: 'page', database: 'database', filter: 'filter', join: 'intersect', transform: 'calculator', load: 'upload' };

  function runLine(p) {
    const n = steps(p).length;
    if (p.status === 'failed') return `Failed ${p.lastRun.ago} at step ${stepNo(p, p.failedAt)} of ${n}`;
    if (p.status === 'running') return `Running, step ${Math.max(1, stepNo(p, p.runningAt))} of ${n}`;
    if (p.status === 'succeeded') return `Succeeded ${p.lastRun.ago}`;
    return `Scheduled for ${p.next.toLowerCase()}`;
  }
  function freshness(p, live) {
    // archived periods are closed: a pipeline run today no longer changes them
    if (!live && range().archived) return { cls: 'archived', short: 'Archived', long: `Closed figures for ${range().label}.` };
    if (p.status === 'failed') return { cls: 'stale', short: 'From ' + p.dataFrom, long: `${p.name} failed ${p.lastRun.ago}. Showing data from ${p.dataFrom}.` };
    if (p.status === 'running') return { cls: 'running', short: 'Updating now', long: `${p.name} is running now. The figure updates when it finishes.` };
    if (p.status === 'succeeded') return { cls: 'succeeded', short: 'Updated ' + p.lastRun.ago, long: `Updated ${p.lastRun.ago} by ${p.name}.` };
    return { cls: 'scheduled', short: 'Next ' + p.schedule.time, long: `From yesterday's run of ${p.name}. Next run ${p.next.toLowerCase()}.` };
  }

  /* ---------------- numbers behind the dashboard ---------------- */
  const r3 = v => +v.toFixed(3);
  function regionItems(rid) {
    const rg = range(rid);
    return D.CONTINENTS.map(c => { const v = D.sum(c.id, rg.year, rg.months); return { key: c.id, label: c.name, actual: r3(v.a), target: r3(v.t) }; });
  }
  function countryItems(contId, rid) {
    const rg = range(rid);
    return D.COUNTRIES.filter(c => c.cont === contId).map(c => { const v = D.sum('c:' + c.name, rg.year, rg.months); return { key: c.name, label: c.name, actual: r3(v.a), target: r3(v.t) }; });
  }
  function monthly(rid, global) {
    const rg = range(rid), region = global ? 'all' : S.region, n = D.monthsIn(rg.year);
    const ms = Array.from({ length: n }, (_, i) => i), r2 = v => +v.toFixed(4);
    return {
      labels: D.MONTHS.slice(0, n), a: D.series(region, rg.year, ms).map(r2), b: D.series(region, rg.year - 1, ms).map(r2),
      aLabel: String(rg.year), bLabel: String(rg.year - 1),
      band: rg.kind === 'ytd' || rg.kind === 'fy' ? null : [rg.months[0], rg.months[rg.months.length - 1]]
    };
  }
  // Active customers follow revenue per month at a damped rate, anchored to 12,480 worldwide in Q3 2026.
  function customers(year, months, region = S.region) {
    const anchor = D.sum('all', D.YEAR, D.QUARTER_MONTHS[2]).a / 3;
    const all = D.sum('all', year, months).a, mine = D.sum(region, year, months).a;
    return 12480 * Math.pow(all / months.length / anchor, 0.8) * mine / all;
  }
  /* ---------- numbers only Ask makes: they combine pipelines or derive a new measure ---------- */
  const Q3 = () => D.YEAR + '-q3';
  // Customers per dollar differ by region (more, smaller accounts in Asia, Latin America and Africa).
  // Shares are weighted so the regions add up to the Active customers figure.
  const CUST_MIX = { na: 0.9, eu: 1.08, as: 1.22, sa: 1.3, oc: 0.86, af: 1.45 };
  function custByRegion(rid = Q3()) {
    const rg = range(rid), total = customers(rg.year, rg.months, 'all');
    const rows = D.CONTINENTS.map(c => ({ c, rev: D.sum(c.id, rg.year, rg.months).a }));
    const w = rows.map(r => r.rev * CUST_MIX[r.c.id]), ws = w.reduce((s, v) => s + v, 0);
    return rows.map((r, i) => Object.assign(r, { cust: total * w[i] / ws }));
  }
  // revenue in regions below target, for any date range
  function atRisk(rid) {
    const items = regionItems(rid), miss = items.filter(i => i.actual < i.target);
    const v = miss.reduce((s, i) => s + i.actual, 0), all = items.reduce((s, i) => s + i.actual, 0);
    return { v, share: all ? v / all * 100 : 0, regions: miss.map(i => i.label), all };
  }
  // Q4: October is real; November and December get last year's lift over October.
  function q4Forecast() {
    const oct = D.series('all', D.YEAR, [9])[0], ly = D.series('all', D.YEAR - 1, [9, 10, 11]);
    const v = [oct * ly[1] / ly[0], oct * ly[2] / ly[0]];
    const target = 3 * D.sum('all', D.YEAR, [9]).t; // data.js keeps October's target as a third of the quarter's
    const proj = oct + v[0] + v[1];
    return { oct, v, lo: v.map(x => x * 0.96), hi: v.map(x => x * 1.04), target, proj, gap: (proj / target - 1) * 100 };
  }

  function kpiValue(id) {
    const rg = range(), cur = D.sum(S.region, rg.year, rg.months), prev = D.sum(S.region, rg.prev.year, rg.prev.months);
    const sign = d => (d >= 0 ? '+' : '−');
    const upTo = Array.from({ length: rg.months[rg.months.length - 1] + 1 }, (_, i) => i);
    if (id === 'kpi_risk') {
      const r = atRisk(rg.id);
      const qs = D.RANGES.filter(x => x.year === rg.year && x.kind.startsWith('q') && x.months.length);
      return { v: money(r.v), d: nf0.format(Math.round(r.share)) + '% of sales, ' + (r.regions.length ? r.regions.length + ' regions' : 'no region') + ' below target', up: false, good: !r.regions.length, spark: qs.map(x => atRisk(x.id).share) };
    }
    if (id === 'kpi_revenue') {
      const d = (cur.a / prev.a - 1) * 100;
      return { v: money(cur.a), d: sign(d) + nf1.format(Math.abs(d)) + '% ' + rg.compare, up: d >= 0, good: d >= 0, spark: D.series(S.region, rg.year, upTo.slice(-6)) };
    }
    if (id === 'kpi_attainment') {
      const pct = cur.a / cur.t * 100, d = pct - prev.a / prev.t * 100;
      const qs = D.QUARTER_MONTHS.map(q => q.filter(m => upTo.includes(m))).filter(q => q.length);
      const pts = (qs.length < 2 ? [D.QUARTER_MONTHS[3]].map(q => ({ y: rg.year - 1, q })) : []).concat(qs.map(q => ({ y: rg.year, q })));
      return { v: nf1.format(pct) + '%', d: sign(d) + nf1.format(Math.abs(d)) + ' pts ' + rg.compare, up: d >= 0, good: d >= 0, spark: pts.map(x => { const v = D.sum(S.region, x.y, x.q); return v.a / v.t; }) };
    }
    if (id === 'kpi_customers') {
      const c1 = customers(rg.year, rg.months), c0 = customers(rg.prev.year, rg.prev.months), d = (c1 / c0 - 1) * 100;
      return { v: nf0.format(Math.round(c1 / 10) * 10), d: sign(d) + nf1.format(Math.abs(d)) + '% ' + rg.compare, up: d >= 0, good: d >= 0, spark: upTo.slice(-6).map(m => customers(rg.year, [m])) };
    }
    if (id === 'kpi_adspend') {
      // made-up spend: a steady share of sales, a little higher than the period before
      const v1 = cur.a * 0.061, v0 = prev.a * 0.058, d = (v1 / v0 - 1) * 100;
      return { v: money(v1), d: sign(d) + nf1.format(Math.abs(d)) + '% ' + rg.compare, up: d >= 0, good: d <= 0, spark: D.series(S.region, rg.year, upTo.slice(-6)).map(x => x * 0.061) };
    }
    // stock is a live figure: it does not follow the date range
    return { v: '18 days', d: '−2 days vs last week', up: false, good: false, spark: [22, 21, 21, 20, 20, 19, 18], live: true };
  }

  /* chart content for a tile or an answer: returns {title, sub, html, source, kinds, items?} */
  function chartModel(spec, opts = {}) {
    const rg = range(spec.range);
    const per = periodWord(rg);
    if (spec.type === 'bridge') {
      const items = regionItems(Q3()).map(i => ({ key: i.key, label: i.label, d: i.actual - i.target, actual: i.actual, target: i.target })).sort((a, b) => b.d - a.d);
      const t = items.reduce((s, i) => s + i.target, 0), a = items.reduce((s, i) => s + i.actual, 0);
      const neg = items.filter(i => i.d < 0).sort((x, y) => x.d - y.d), short = -neg.reduce((s, i) => s + i.d, 0);
      const share = Math.round((neg[0].d + (neg[1] ? neg[1].d : 0)) / -short * 100);
      return { title: `${neg[0].label}${neg[1] ? ' and ' + neg[1].label : ''} make up ${share}% of the ${money(short)} shortfall`,
        sub: `Gap to target by region, Q3 ${D.YEAR}`, bridge: { start: { label: 'Q3 target', v: t }, items, end: { label: 'Q3 sales', v: a } },
        kinds: ['bridge', 'table'], source: 'regional_targets', sources: ['regional_targets'], tag: 'New chart',
        steps: ['Read 21 countries from Regional targets', 'Group them into six regions', 'Subtract each region’s target from its sales', 'Order from the largest gain to the largest gap'] };
    }
    if (spec.type === 'ratio') {
      const rows = custByRegion();
      const items = rows.map(r => ({ key: r.c.id, label: r.c.name, v: r.rev * 1e6 / r.cust, note: nf0.format(Math.round(r.cust / 10) * 10) + ' customers' })).sort((x, y) => y.v - x.v);
      const avg = rows.reduce((s, r) => s + r.rev, 0) * 1e6 / rows.reduce((s, r) => s + r.cust, 0);
      const k = items[0].v / items[items.length - 1].v;
      return { title: `A customer in ${items[0].label} spends ${nf1.format(k)}× one in ${items[items.length - 1].label}`,
        sub: `Q3 ${D.YEAR} revenue per active customer, by region`, ratio: { items, avg },
        kinds: ['hbars', 'table'], source: 'sales_daily', sources: ['sales_daily', 'customer_360'], tag: 'Combines 2 pipelines',
        steps: ['Read Q3 sales by region from Daily sales', 'Read active customers by region from Customer 360', 'Join the two on region', 'Divide revenue by active customers'] };
    }
    if (spec.type === 'forecast') {
      const f = q4Forecast(), ms = Array.from({ length: 10 }, (_, i) => i);
      const line = { labels: D.MONTHS.slice(), a: D.series('all', D.YEAR, ms), b: D.series('all', D.YEAR - 1, D.MONTHS.map((_, i) => i)),
        aLabel: String(D.YEAR), bLabel: String(D.YEAR - 1), band: [9, 11], proj: { v: f.v, lo: f.lo, hi: f.hi },
        pace: { v: f.target / 3, from: 9, label: 'Q4 target, per month', short: 'target' } };
      const on = f.gap >= 0;
      return { title: on ? `Q4 is on track: ${money(f.proj)} projected, ${nf1.format(f.gap)}% above target` : `Q4 is tracking ${nf1.format(-f.gap)}% short of its ${money(f.target)} target`,
        sub: `Monthly revenue with November and December projected, ${D.YEAR}`, line, forecast: f,
        kinds: ['line', 'table'], source: 'sales_daily', sources: ['sales_daily', 'regional_targets'], tag: 'Forecast',
        steps: ['Read monthly sales, January to October, from Daily sales', 'Read the Q4 target from Regional targets', 'Apply 2025’s November and December lift to October', 'Compare the projected quarter with its target'] };
    }
    if (spec.type === 'risk') {
      const r = atRisk(Q3());
      return { title: `${money(r.v)} of Q3 sales came from regions below target`, sub: `Revenue at risk, Q3 ${D.YEAR}`,
        figure: { id: 'kpi_risk', label: 'Revenue at risk', v: money(r.v), d: `${Math.round(r.share)}% of ${money(r.all)} Q3 sales`, how: `Sales in ${listWords(r.regions)}, divided by all Q3 sales` },
        kinds: ['figure'], source: 'regional_targets', sources: ['regional_targets'], tag: 'New figure',
        steps: ['Read Q3 sales and targets from Regional targets', 'Keep the regions below target', 'Add up their sales', 'Divide by all Q3 sales'] };
    }
    if (spec.type === 'regions') {
      const picked = !opts.drill && S.region.startsWith('c:') ? S.region.slice(2) : null;
      const drill = opts.drill || regionCont();
      if (drill) {
        const r = contObj(drill), items = countryItems(drill, rg.id);
        const worst = items.slice().sort((x, y) => x.actual / x.target - y.actual / y.target);
        const misses = items.filter(i => i.actual < i.target);
        let title;
        if (picked) {
          const it = items.find(i => i.key === picked), d = Math.round((it.actual / it.target - 1) * 100);
          title = d === 0 ? `${picked} landed on its ${per} target` : `${picked} was ${Math.abs(d)}% ${d < 0 ? 'under' : 'over'} its ${per} target`;
        } else {
          title = !misses.length ? `Every country in ${r.name} beat its target` :
            misses.length === 1 ? `${worst[0].label} was the only country in ${r.name} below target` :
            `${worst[0].label} and ${worst[1].label} were furthest behind in ${r.name}`;
        }
        return { title, sub: `Sales against target by country, ${r.name}, ${rg.label}`, items, kinds: ['bars', 'table'], source: 'regional_targets', crumb: r, focus: picked };
      }
      let items = regionItems(rg.id);
      if (spec.onlyMissed) items = items.filter(i => i.actual < i.target);
      const missed = items.filter(i => i.actual < i.target).length;
      const title = spec.onlyMissed ? `${items.map(i => i.label).join(', ').replace(/, ([^,]*)$/, ' and $1')} missed their ${per} target` :
        missed === 0 ? `Every region hit its ${per} target` :
        `${cap(WORDS[missed])} of ${WORDS[items.length]} regions missed their ${per} target`;
      return { title, sub: `Sales against target by region, ${rg.label}`, items, kinds: ['bars', 'table'], source: 'regional_targets' };
    }
    if (spec.type === 'line') {
      const d = monthly(spec.range, !!spec.range);
      let title;
      if (d.band && d.band[0] === d.band[1]) {
        const m = d.band[0], g = Math.round((d.a[m] / d.b[m] - 1) * 100);
        title = `${D.MONTH_NAMES[m]} revenue was ${money(d.a[m])}, ${Math.abs(g)}% ${g >= 0 ? 'above' : 'below'} ${D.MONTH_NAMES[m]} ${rg.year - 1}`;
      } else {
        const i0 = d.band ? d.band[0] : 0, i1 = d.band ? d.band[1] : d.a.length - 1;
        const g = Math.round((d.a[i1] / d.a[i0] - 1) * 100);
        title = `Revenue ${g >= 0 ? 'grew' : 'fell'} ${Math.abs(g)}% from ${D.MONTH_NAMES[i0]} to ${D.MONTH_NAMES[i1]}`;
      }
      return { title, sub: `Monthly revenue${S.region !== 'all' && !spec.range ? ', ' + regionName() : ''}, ${rg.year} against ${rg.year - 1}`, line: d, kinds: ['line', 'cols', 'table'], source: 'sales_daily' };
    }
    if (spec.type === 'compare') {
      const items = regionItems(D.YEAR + '-q3'), prev = regionItems(D.YEAR + '-q2');
      const rows = items.map((i, k) => { const a3 = i.actual / i.target * 100, a2 = prev[k].actual / prev[k].target * 100; return { label: i.label, a2, a3, d: a3 - a2 }; });
      const worst = rows.slice().sort((x, y) => x.d - y.d)[0];
      return { title: `${worst.label} fell furthest from Q2 to Q3`, sub: `Target attainment by region, Q2 against Q3 ${D.YEAR}`, compare: rows, kinds: ['table'], source: 'regional_targets' };
    }
    return null;
  }

  /* the sentences under an answer, worked out from the data so they always match the chart */
  const listWords = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  function regionsSummary(onlyMissed) {
    const items = regionItems(D.YEAR + '-q3');
    const miss = items.filter(i => i.actual < i.target).map(i => Object.assign({ gap: i.target - i.actual, pct: (1 - i.actual / i.target) * 100 }, i));
    const byGap = miss.slice().sort((a, b) => b.gap - a.gap), byPct = miss.slice().sort((a, b) => b.pct - a.pct);
    if (onlyMissed) return `${byGap[0].label} has the largest gap in dollars (${money(byGap[0].gap)}). ${byPct[0].label} has the largest gap as a share of its target (${Math.round(byPct[0].pct)}%).`;
    const hit = items.filter(i => i.actual >= i.target).map(i => i.label);
    return `${byGap[0].label} had the largest gap at ${money(byGap[0].gap)} (${Math.round(byGap[0].pct)}% under). ${listWords(byGap.slice(1).map(i => i.label))} also missed. ${listWords(hit)} met or beat target.`;
  }
  function compareSummary() {
    const rows = chartModel({ type: 'compare' }).compare, down = rows.filter(r => r.d < 0), up = rows.filter(r => r.d >= 0);
    return `Attainment dropped in ${WORDS[down.length]} of ${WORDS[rows.length]} regions. ${up.length === 1 ? up[0].label + ' is the only region that improved on Q2.' : listWords(up.map(r => r.label)) + ' improved on Q2.'}`;
  }
  function trendSummary() {
    const d = monthly(D.YEAR + '-ytd', true), last = d.a.length - 1;
    const ahead = d.a.every((v, i) => v > d.b[i]);
    const peak = d.a.indexOf(Math.max(...d.a));
    return `${D.YEAR} was ${ahead ? 'ahead of' : 'mixed against'} ${D.YEAR - 1} in ${ahead ? 'every month' : 'the year'}. ${D.MONTH_NAMES[peak]} set a record at ${money(d.a[peak])}, and ${D.MONTH_NAMES[last]} so far is ${money(d.a[last])}.`;
  }

  function chartHTML(model, kind, id, opts = {}) {
    if (model.figure) {
      const f = model.figure;
      return `<div class="ans-fig"><span class="kpi-l">${esc(f.label)}</span><span class="kpi-v">${esc(f.v)}</span>
        <span class="kpi-d st-failed">${ic('warning-circle', 'sm')}${esc(f.d)}</span><p class="ans-fig-how">${ic('calculator', 'sm')}${esc(f.how)}</p></div>`;
    }
    if (model.bridge) {
      if (kind === 'table') return C.table(['Region', 'Sales', 'Target', 'Gap'], model.bridge.items.map(i => [i.label, money(i.actual), money(i.target), { v: (i.d >= 0 ? '+' : '−') + money(Math.abs(i.d)), cls: i.d < 0 ? 'st-failed' : 'st-succeeded' }]), { caption: model.title });
      return C.bridge(model.bridge, { id, caption: model.sub });
    }
    if (model.ratio) {
      const fmt = v => '$' + nf0.format(Math.round(v));
      if (kind === 'table') return C.table(['Region', 'Per customer', 'Customers'], model.ratio.items.map(i => [i.label, fmt(i.v), i.note.replace(' customers', '')]), { caption: model.title });
      return C.hbars(model.ratio.items, { id, fmt, ref: model.ratio.avg, refLabel: 'Company average', caption: model.sub });
    }
    if (model.forecast) {
      const l = model.line;
      if (kind === 'table') return C.table(['Month', String(D.YEAR), String(D.YEAR - 1)], l.labels.map((m, i) => [m, i < l.a.length ? money(l.a[i]) : { v: money(l.proj.v[i - l.a.length]) + ' projected', cls: 'muted' }, money(l.b[i])]), { caption: model.title });
      return C.line(l, { id, caption: model.sub });
    }
    if (model.compare) {
      return C.table(['Region', 'Q2', 'Q3', 'Change'], model.compare.map(r => [r.label, nf1.format(r.a2) + '%', nf1.format(r.a3) + '%', { v: (r.d >= 0 ? '+' : '−') + nf1.format(Math.abs(r.d)) + ' pts', cls: r.d < 0 ? 'st-failed' : 'st-succeeded' }]), { caption: model.title });
    }
    if (model.items) {
      if (kind === 'table') return C.vsTargetTable(model.items, model.title);
      return C.vsTarget(model.items, { id, drillable: !model.crumb && opts.drillable !== false, selected: S.sel[id] || model.focus, caption: model.sub });
    }
    if (model.line) {
      if (kind === 'table') return C.lineTable(model.line, model.title);
      if (kind === 'cols') return C.columns(model.line, { id, caption: model.sub });
      return C.line(model.line, { id, caption: model.sub });
    }
    return '';
  }

  /* ---------------- shell ---------------- */
  const PLACES = [
    { id: 'ask', label: 'Ask', icon: 'chat-bubble' },
    { id: 'dashboard', label: 'Dashboard', icon: 'view-grid' },
    { id: 'pipelines', label: 'Pipelines', icon: 'network-right' }
  ];
  function placesHTML() {
    return PLACES.map(pl => {
      const on = S.place === pl.id;
      return `<button type="button" class="place${on ? ' on' : ''}" data-action="place" data-place="${pl.id}" ${on ? `aria-current="page" aria-haspopup="dialog" aria-label="${pl.label}, actions"` : `aria-label="${pl.label}"`}>
        <span class="pl-disc">${ic(pl.icon)}${on ? '<span class="pl-dots" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>' : ''}</span>
        <span class="pl-l" aria-hidden="true">${pl.label}</span></button>`;
    }).join('') +
    // Search sits with the places, in the same circle, so every screen size finds it in the same spot.
    // The shortcut is only a tooltip: touch screens have no Ctrl+K.
    `<span class="pl-sep" aria-hidden="true"></span><button type="button" class="place tool" data-action="search" aria-label="Search all actions" aria-haspopup="dialog" title="Search all actions (${KEY})">
      <span class="pl-disc">${ic('search')}</span><span class="pl-l" aria-hidden="true">Search</span></button>`;
  }
  const order = s => ({ failed: 0, running: 1, succeeded: 2, scheduled: 3 }[s]);
  const searchBtn = () => $(isPhone() ? '.placebar .place.tool' : '.places.top .place.tool');

  // every dashboard is a tab, plus New. Drawn in the page (iPad, desktop) and in the phone's top row.
  const dashTabsHTML = fk => `<div class="dash-tabs" role="tablist" aria-label="Dashboards">${D.DASHBOARDS.map(d => `<button type="button" role="tab" class="dash-tab" aria-selected="${d.id === S.dash}" data-action="set-dash" data-d="${d.id}" data-fk="${fk}-${d.id}">${esc(d.name)}</button>`).join('')}
      <button type="button" class="dash-tab new" data-action="new-dash" data-fk="${fk}-new">${ic('plus', 'sm')}New</button></div>`;
  // Phone: the top row is the menu plus whatever the screen needs most: the dashboard tabs,
  // the way back from a pipeline, or the place's name. No wordmark, so the row earns its height.
  function topCtxHTML() {
    // the dashboard keeps its tabs in the page; the top row stays menu + wordmark there
    if (S.place === 'dashboard') return `<span class="wordmark">Astera <span>Studio</span></span>`;
    if (S.place === 'pipelines' && S.pipelineId) return `<button type="button" class="back" data-action="go" data-h="#/pipelines">${ic('nav-arrow-left')}Pipelines</button>`;
    if (S.place === 'ask') return chatTopHTML();
    return `<span class="tb-title">Pipelines</span>`;
  }
  function topbarHTML() {
    let crumb = '';
    // breadcrumbs only where they add a level; the page title already names the current place
    if (S.place === 'pipelines' && S.pipelineId) crumb = `<button type="button" class="crumb" data-action="go" data-h="#/pipelines">Pipelines</button>${ic('nav-arrow-right', 'sm')}<span class="crumb-cur">${esc(P(S.pipelineId).name)}</span>`;
    // desktop rail, bottom: chats, New chat, then settings for the account and organization.
    // iPhone and iPad: one menu button that always opens the chats drawer, with the account at its foot.
    const left = isRail()
      ? `<button type="button" class="icon-btn menu-btn rail-btn" data-action="chats" aria-haspopup="dialog" data-fk="chats">${ic('menu')}<span class="rail-l">Chats</span></button>
        <button type="button" class="icon-btn menu-btn rail-btn" data-action="new-chat" data-fk="new-chat-rail">${ic('chat-plus-in')}<span class="rail-l">New chat</span></button>
        <button type="button" class="icon-btn menu-btn rail-btn" data-action="menu" aria-haspopup="dialog" title="Account and organization">${ic('settings')}<span class="rail-l">Settings</span></button>`
      : `<button type="button" class="icon-btn menu-btn" data-action="chats" aria-haspopup="dialog" aria-label="Chats and account" data-fk="chats">${ic('menu')}</button>`;
    return `<div class="tb-left">${left}<span class="wordmark tb-word">Astera <span>Studio</span></span><span class="tb-crumbs">${crumb}</span></div>
      <div class="tb-ctx">${topCtxHTML()}</div>
      <nav class="places top" aria-label="Places">${placesHTML()}</nav>
      <div class="tb-right">${S.place === 'ask' && !isRail() ? `<button type="button" class="btn quiet" data-action="new-chat" data-fk="new-chat-tb">${ic('chat-plus-in')}New chat</button>` : ''}</div>`;
  }

  function render() {
    const app = $('#app');
    const keep = snapshot();
    app.dataset.place = S.place;
    document.documentElement.classList.toggle('touch-ui', touchUI());
    $('#topbar').innerHTML = topbarHTML();
    $('#placebar').innerHTML = placesHTML();
    const v = $('#view');
    v.innerHTML = S.place === 'ask' ? viewAsk(true) : S.place === 'dashboard' ? viewDashboard() : S.pipelineId ? viewPipeline() : viewPipelines();
    C.attachLine(document);
    restore(keep);
    coach();
  }
  /* keep scroll and focus across re-renders */
  function snapshot() {
    const a = document.activeElement;
    return {
      view: $('#view') && $('#view').scrollTop,
      thread: $$('.thread').map(t => t.scrollTop),
      canvas: $('.canvas') ? [$('.canvas').scrollLeft, $('.canvas').scrollTop] : null,
      fk: a && a.closest && a.closest('[data-fk]') ? a.closest('[data-fk]').dataset.fk : null
    };
  }
  function restore(k) {
    if (k.view != null) $('#view').scrollTop = k.view;
    $$('.thread').forEach((t, i) => { if (k.thread[i] != null) t.scrollTop = k.thread[i]; });
    if (k.canvas && $('.canvas')) { $('.canvas').scrollLeft = k.canvas[0]; $('.canvas').scrollTop = k.canvas[1]; }
    if (k.fk) { const el = $(`[data-fk="${k.fk}"]`); if (el) el.focus({ preventScroll: true }); }
  }

  /* ---------------- dashboard ---------------- */
  const pinnedKpis = (dash = S.dash) => S.kpiPins[dash].map(id => D.KPIS.find(k => k.id === id));
  const CHART_NAME = { chart_sales_target: 'the region chart', chart_revenue_trend: 'the revenue chart' };
  function viewDashboard() {
    const dash = D.DASHBOARDS.find(d => d.id === S.dash), rg = range();
    const kpis = pinnedKpis();
    const pins = S.pinned.filter(x => x.dash === S.dash);
    const srcIds = [...new Set(kpis.map(k => k.source).concat(dash.charts.map(c => c === 'chart_sales_target' ? 'regional_targets' : 'sales_daily'), pins.flatMap(x => x.model.sources || [x.model.source])))];
    const sources = srcIds.map(P).sort((a, b) => order(a.status) - order(b.status));
    const failed = sources.filter(p => p.status === 'failed');
    const newest = sources.find(p => p.status === 'succeeded');
    const empty = !kpis.length && !dash.charts.length && !pins.length;
    // every dashboard is one tap away, and a new one is too: the title alone hid that there were others
    const tabs = dashTabsHTML('tab');
    const sub = empty ? 'Empty. Ask for a chart or a figure to start it.' : rg.archived ? `Archived period, ${rg.long}. Pipeline runs no longer change these figures.` :
      // with a failure the red line below explains it, so the subtitle only points to it instead of repeating it
      failed.length ? `${newest ? 'Updated ' + newest.lastRun.ago + ', except the figures flagged below.' : 'Some figures are out of date.'}`
        : `${newest ? 'Updated ' + newest.lastRun.ago + '. ' : ''}${sources.length === 1 ? 'Its source is' : sources.length === 2 ? 'Both sources are' : 'All ' + WORDS[sources.length] + ' sources are'} healthy.`;
    const n = kpis.length, room = n < D.MAX_KPIS;
    if (empty) return `<div class="page dash">${tabs}
      <header class="page-h"><div class="ph-main"><h1>${esc(dash.name)}</h1><p class="ph-sub">${sub}</p></div></header>
      <section class="dash-empty" aria-label="Start this dashboard"><h2>Nothing here yet</h2>
        <p>Ask a question and pin the answer. These are a good start, and each one is something your other dashboards don’t have.</p>
        ${aiCardsHTML('ask-for')}</section>
    </div>`;
    return `<div class="page dash">
      ${tabs}
      <header class="page-h">
        <div class="ph-main">
          <h1>${esc(dash.name)}</h1>
          <p class="ph-sub">${sub}</p>
        </div>
        <div class="filters" role="group" aria-label="Filters">
          <button type="button" class="chip${rg.archived ? ' archived' : ''}" data-action="filter" data-f="range" aria-label="Date range: ${esc(rg.label)}${rg.archived ? ', archived' : ''}. Change">${ic(rg.archived ? 'archive' : 'calendar')}${esc(rg.label)}${ic('nav-arrow-down', 'sm')}</button>
          <button type="button" class="chip" data-action="filter" data-f="region" aria-label="Region: ${esc(regionName())}. Change">${ic('globe')}${esc(regionName())}${ic('nav-arrow-down', 'sm')}</button>
        </div>
      </header>
      ${rg.archived ? '' : failed.length > 1 ? groupAlertHTML(failed) : failed.map(alertHTML).join('')}
      ${rg.archived ? '' : sources.filter(p => p.status === 'running' && p.id === 'regional_targets').map(runningAlertHTML).join('')}
      <section class="figs" aria-label="Key figures">
        ${touchUI() ? `<div class="kpis" style="--n:${Math.max(1, n)}">${kpis.map(kpiHTML).join('')}
          <button type="button" class="kpi-edit" data-action="figures" data-fk="kpi-edit">${ic(room ? 'plus' : 'edit-pencil')}<span>${room ? 'Add or remove figures' : 'Change figures'}</span><small>${n} of ${D.MAX_KPIS}</small>${ic('nav-arrow-right', 'sm')}</button></div>`
        : `<div class="kpis${room && n ? ' has-add' : ''}" style="--n:${Math.max(1, n)}">${kpis.map(kpiHTML).join('')}${room ? `<button type="button" class="kpi kpi-add" data-action="figures" data-fk="kpi-add">${ic('plus')}<span>Add a figure</span></button>` : ''}</div>
        ${room ? '' : `<p class="figs-foot"><span>${n} of ${D.MAX_KPIS} figures pinned</span><button type="button" class="link" data-action="figures">Edit figures</button></p>`}`}
      </section>
      <div class="tiles">
        ${dash.charts.map(cid => tileHTML(cid)).join('')}
        ${pins.map(pinTileHTML).join('')}
        <button type="button" class="tile tile-ask" data-action="ask-for" data-fk="tile-ask">${ic('chat-plus-in')}<b>Ask for a chart</b><span>Gaps, forecasts, or numbers that combine pipelines. Pin the answer here.</span></button>
      </div>
    </div>`;
  }
  // names only what this dashboard actually shows from the failed pipeline
  function affectedNames(p) {
    const dash = D.DASHBOARDS.find(d => d.id === S.dash);
    const names = p.feeds.map(id => { const k = S.kpiPins[S.dash].includes(id) && D.KPIS.find(x => x.id === id); return k ? k.label : dash.charts.includes(id) ? CHART_NAME[id] : null; }).filter(Boolean);
    // figures and charts made in Ask name their own sources
    S.kpiPins[S.dash].forEach(id => { const k = D.KPIS.find(x => x.id === id); if (k && k.source === p.id && !p.feeds.includes(id)) names.push(k.label); });
    const pins = S.pinned.filter(x => x.dash === S.dash && (x.model.sources || [x.model.source]).includes(p.id));
    if (pins.length) names.push(pins.length === 1 ? 'one pinned chart' : WORDS[pins.length] + ' pinned charts');
    return names;
  }
  function affectedText(p) {
    const names = affectedNames(p);
    if (!names.length) return 'Nothing on this dashboard uses it.';
    const s = listWords(names);
    return `${cap(s)} ${names.length === 1 ? 'shows' : 'show'} data from ${p.dataFrom}.`;
  }
  function alertHTML(p) {
    return `<section class="alert" aria-label="Data problem">
      <span class="well st-failed">${ic('xmark-circle')}</span>
      <div class="alert-b"><p class="alert-t">${esc(p.name)} failed ${esc(p.lastRun.ago)}</p>
        <p>${esc(affectedText(p))}</p></div>
      <div class="alert-a">
        <button type="button" class="btn${touchUI() ? '' : ' quiet'}" data-action="open-pipeline" data-p="${p.id}" data-fk="alert-view-${p.id}">Details</button>
        <button type="button" class="btn primary" data-action="rerun" data-p="${p.id}" data-from="${p.failedAt}" data-fk="alert-rerun-${p.id}">${ic('refresh')}Re-run</button>
      </div>
    </section>`;
  }
  // Several failures share one line, so they never push the figures off a phone screen.
  // The list opens on demand, one compact row per pipeline.
  function groupAlertHTML(list) {
    const open = !!S.failOpen;
    const names = [...new Set(list.flatMap(affectedNames))];
    return `<section class="alert multi${open ? ' open' : ''}" aria-label="Data problems">
      <span class="well st-failed">${ic('xmark-circle')}</span>
      <div class="alert-b"><p class="alert-t">${cap(WORDS[list.length] || String(list.length))} pipelines failed</p>
        <p>${names.length ? `${esc(cap(listWords(names)))} show older data.` : 'Nothing on this dashboard uses them.'}</p></div>
      <div class="alert-a">
        <button type="button" class="btn${touchUI() ? '' : ' quiet'}" data-action="fail-toggle" aria-expanded="${open}" aria-controls="fail-list" data-fk="fail-toggle">${open ? 'Hide' : 'Show'}${ic(open ? 'nav-arrow-up' : 'nav-arrow-down', 'sm')}</button>
        <button type="button" class="btn primary" data-action="rerun-all" data-fk="rerun-all">${ic('refresh')}Re-run all</button>
      </div>
      <ul class="alert-list" id="fail-list"${open ? '' : ' hidden'}>${list.map(p => {
        const n = node(p, p.failedAt);
        return `<li><button type="button" class="al-main" data-action="open-pipeline" data-p="${p.id}" data-step="${p.failedAt}">
            <span class="al-t">${esc(p.name)}</span><span class="al-s">${esc(n.short || n.error)} · ${esc(p.lastRun.ago)}</span></button>
          <button type="button" class="btn" data-action="rerun" data-p="${p.id}" data-from="${p.failedAt}" aria-label="Re-run ${esc(p.name)}">${ic('refresh')}<span class="al-rl">Re-run</span></button></li>`;
      }).join('')}</ul>
    </section>`;
  }
  function runningAlertHTML(p) {
    const n = steps(p).length, k = Math.max(1, stepNo(p, p.runningAt));
    return `<section class="alert running" aria-label="Pipeline running">
      <span class="well st-running">${ic('refresh', 'spin')}</span>
      <div class="alert-b"><p class="alert-t">Re-running ${esc(p.name)}</p><p>Step ${k} of ${n}: ${esc(node(p, p.runningAt).name)}</p>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${k - 1}" aria-label="Run progress"><i style="transform:scaleX(${((k - 1) / n).toFixed(2)})"></i></div></div>
    </section>`;
  }
  // A figure only mentions freshness when something is off (stale, updating, waiting for its next run).
  // Up-to-date figures stay quiet: the page subtitle already says when the data was updated.
  function kpiFresh(k, v) {
    const p = P(k.source);
    if (v.live && range().archived) return { cls: 'scheduled', short: 'Today, not by date', icon: 'clock', long: 'A live figure: it does not follow the date range.' };
    const f = freshness(p, v.live);
    const icon = { running: 'refresh', stale: 'warning-circle', scheduled: 'clock' }[f.cls];
    return Object.assign(f, { icon, quiet: !icon });
  }
  function kpiHTML(k) {
    const v = kpiValue(k.id), f = kpiFresh(k, v);
    const dir = v.up ? 'arrow-up' : 'arrow-down';
    return `<button type="button" class="kpi" data-action="kpi" data-k="${k.id}" data-fk="kpi-${k.id}" data-dial-target="kpi:${k.id}"
        aria-label="${esc(`${k.label}: ${v.v}, ${v.d.replace('−', 'minus ')}. ${f.long}`)}">
      <span class="kpi-l">${esc(k.label)}</span>
      <span class="kpi-v">${esc(v.v)}</span>
      <span class="kpi-d ${v.good ? 'st-succeeded' : 'st-failed'}">${ic(dir, 'sm')}${esc(v.d)}</span>
      ${C.spark(v.spark)}
      ${f.quiet ? '' : `<span class="kpi-f st-${f.cls}">${ic(f.icon, 'sm' + (f.cls === 'running' ? ' spin' : ''))}${esc(f.short)}</span>`}
    </button>`;
  }
  const TILE_SPEC = { chart_sales_target: { type: 'regions' }, chart_revenue_trend: { type: 'line' } };
  function tileHTML(cid) {
    const spec = TILE_SPEC[cid];
    const model = chartModel(spec, { drill: S.drill[cid] });
    const kind = model.kinds.includes(S.kind[cid]) ? S.kind[cid] : model.kinds[0];
    const p = P(model.source), f = freshness(p);
    const sel = S.sel[cid] && model.items ? model.items.find(i => i.key === S.sel[cid]) : null;
    return `<article class="tile${cid === 'chart_sales_target' ? ' wide' : ''}${S.flash === cid ? ' flash' : ''}" id="tile-${cid}" data-dial-target="chart:${cid}">
      <header class="tile-h">
        <div class="tile-t"><h2>${esc(model.title)}</h2><p class="tile-sub">${esc(model.sub)}</p></div>
        <button type="button" class="icon-btn" data-action="dial" data-dial="chart:${cid}" data-fk="dial-${cid}" aria-label="Actions for this chart">${ic('more-horiz')}</button>
      </header>
      ${model.crumb && S.drill[cid] ? `<nav class="crumbs" aria-label="Drill path"><button type="button" class="link" data-action="undrill" data-chart="${cid}">All regions</button>${ic('nav-arrow-right', 'sm')}<span>${esc(model.crumb.name)}</span></nav>` : ''}
      <div class="tile-body${S.refetch ? ' refetch' : ''}">${chartHTML(model, kind, cid)}</div>
      ${sel ? C.barTip(sel, { drill: !model.crumb, chart: cid }) : ''}
      ${srcLine(p, 'footer', cid)}
    </article>`;
  }
  function pinTileHTML(pin) {
    const m = pin.model, kind = pin.kind;
    return `<article class="tile${S.flash === pin.id ? ' flash' : ''}" id="tile-${pin.id}" data-dial-target="pin:${pin.id}">
      <header class="tile-h"><div class="tile-t">${m.tag ? `<p class="ai-tag">${ic(TAG_ICON[m.tag] || 'stats-report', 'sm')}${esc(m.tag)}</p>` : ''}<h2>${esc(m.title)}</h2><p class="tile-sub">${esc(m.sub)}. Pinned from Ask</p></div>
        <button type="button" class="icon-btn" data-action="dial" data-dial="pin:${pin.id}" aria-label="Actions for this chart">${ic('more-horiz')}</button></header>
      <div class="tile-body">${chartHTML(m, kind, pin.id, { drillable: false })}</div>
      ${(m.sources || [m.source]).map(id => srcLine(P(id), 'footer', null, true)).join('')}
    </article>`;
  }
  // live: answers and pinned answers always use current data, whatever range the dashboard shows
  function srcLine(p, tag, lineage, live) {
    const f = freshness(p, live);
    const icon = f.cls === 'stale' ? ic('warning-circle', 'sm') : f.cls === 'archived' ? ic('archive', 'sm') : stIcon(p.status);
    // touch: the whole line is one tappable row with a chevron, not a small underlined link
    if (touchUI()) return `<${tag} class="src src-touch st-${f.cls}"><button type="button" class="src-row" data-action="open-pipeline" data-p="${p.id}"${lineage ? ` data-lineage="${lineage}"` : ''}>${icon}<span>${esc(f.long)}</span><span class="src-go">Pipeline${ic('nav-arrow-right', 'sm')}</span></button></${tag}>`;
    return `<${tag} class="src st-${f.cls}">${f.cls === 'stale' ? ic('warning-circle', 'sm') : f.cls === 'archived' ? ic('archive', 'sm') : stIcon(p.status)}<span>${esc(f.long)} <button type="button" class="link" data-action="open-pipeline" data-p="${p.id}"${lineage ? ` data-lineage="${lineage}"` : ''}>View pipeline</button></span></${tag}>`;
  }

  /* ---------------- ask ---------------- */
  // Questions a fixed dashboard can't answer: each builds a new chart or figure, joins pipelines, or forecasts.
  const AI_QS = [
    { q: 'What explains the gap to target in Q3?', tag: 'New chart', icon: 'stats-report', note: 'A bridge from target to sales, one step per region' },
    { q: 'How much revenue is at risk?', tag: 'New figure', icon: 'warning-circle', note: 'A figure you can pin next to Revenue' },
    { q: 'What is revenue per active customer by region?', tag: 'Combines 2 pipelines', icon: 'git-merge', note: 'Daily sales joined with Customer 360' },
    { q: 'Will we hit the Q4 target?', tag: 'Forecast', icon: 'graph-up', note: 'October’s pace projected to December' }
  ];
  const TAG_ICON = Object.fromEntries(AI_QS.map(x => [x.tag, x.icon]));
  const aiCardsHTML = (action = 'ask') => `<ul class="ai-cards">${AI_QS.map(x => `<li><button type="button" class="ai-card" data-action="${action}" data-q="${esc(x.q)}">
      <span class="ai-tag">${ic(x.icon, 'sm')}${esc(x.tag)}</span><b>${esc(x.q)}</b><small>${esc(x.note)}</small></button></li>`).join('')}</ul>`;
  const askForDash = () => S.askFor && D.DASHBOARDS.find(d => d.id === S.askFor);

  /* ---------------- chats ----------------
     Ask opens the current chat. Past chats live in a drawer that slides in from the left.
     On iPhone and iPad the top-left menu button opens that drawer, with the account at its foot.
     On desktop the rail ends with Chats, New chat and Settings. */
  const curChat = () => S.chats.find(c => c.id === S.chatId);
  const pastChats = () => S.chats.filter(c => c.thread.length);
  function openChat(id) {
    const c = S.chats.find(x => x.id === id); if (!c) return;
    if (c.id !== S.chatId) S.askContext = null;
    S.chatId = c.id; S.thread = c.thread; S.askFor = c.askFor;
  }
  // reuses the open chat when it is still empty, so New chat never piles up blank ones
  function newChat(askFor) {
    let c = curChat();
    if (!c || c.thread.length) { c = { id: 'c' + S.chatSeq++, title: '', thread: [], askFor: null, updated: 'Just now' }; S.chats.unshift(c); }
    c.askFor = askFor || null;
    openChat(c.id);
  }
  const chatSub = c => { const n = c.thread.filter(m => m.role === 'answer').length; return `${n === 1 ? '1 answer' : n + ' answers'} · ${c.updated}`; };
  function chatRowHTML(c) {
    const on = c.id === S.chatId;
    return `<li class="row${on ? ' on' : ''}" data-dial-target="chat:${c.id}">
      <button type="button" class="row-main" data-action="open-chat" data-c="${c.id}" data-fk="chat-${c.id}"${on ? ' aria-current="true"' : ''}>
        <span class="row-t">${esc(c.title)}</span><span class="row-s">${esc(chatSub(c))}</span></button>
      <button type="button" class="icon-btn" data-action="dial" data-dial="chat:${c.id}" aria-label="Actions for “${esc(c.title)}”">${ic('more-horiz')}</button></li>`;
  }
  // iPhone's top row on Ask: the chat's name and New chat. iPad puts New chat in the top bar, desktop in the rail.
  function chatTopHTML() {
    const c = curChat();
    return `<div class="chat-top"><p class="chat-name">${esc((c && c.title) || 'New chat')}</p>
      <button type="button" class="icon-btn" data-action="new-chat" aria-label="New chat" title="New chat" data-fk="new-chat">${ic('chat-plus-in')}</button></div>`;
  }
  function chatsDrawer() {
    const list = pastChats(), today = list.filter(c => /Just now|Today/.test(c.updated)), earlier = list.filter(c => !today.includes(c));
    const group = (t, l) => l.length ? `<h3 class="dr-h">${t}</h3><ul class="rows plain chat-list">${l.map(chatRowHTML).join('')}</ul>` : '';
    openSheet('Chats', `<button type="button" class="btn primary block" data-action="new-chat">${ic('chat-plus-in')}New chat</button>
      ${list.length ? group('Today', today) + group('Earlier', earlier) : '<p class="empty">No chats yet. Your questions and answers are kept here.</p>'}`,
    { cls: 'chat-drawer', foot: !isRail() ? `<button type="button" class="dr-acct" data-action="menu">${ic('settings')}<span>Account and organization</span>${ic('nav-arrow-right', 'sm')}</button>` : '' });
  }
  function startChat() {
    closeSheet(); newChat(); go('#/ask/' + S.chatId);
    setTimeout(() => { const inp = $('.cmp-in'); inp && inp.focus(); }, 80);
  }
  function deleteChat(id) {
    const i = S.chats.findIndex(c => c.id === id); if (i < 0) return;
    const [gone] = S.chats.splice(i, 1), wasOpen = gone.id === S.chatId, drawerOpen = sheet().open;
    if (wasOpen) { newChat(); go('#/ask/' + S.chatId); }
    else render();
    if (drawerOpen && !wasOpen) chatsDrawer();
    toast('Chat deleted', { label: 'Undo', run: () => { S.chats.splice(i, 0, gone); render(); } });
  }

  function viewAsk(wide) {
    const empty = !S.thread.length, target = askForDash();
    return `<div class="ask${wide ? ' wide' : ''}">
      <div class="thread" aria-live="polite">
        ${empty ? `<div class="ask-empty"><h1>Ask for what your dashboards don’t show</h1><p>Studio reads your pipelines, combines them and works out new numbers. Every answer is a chart or a figure you can pin.</p>
          ${aiCardsHTML()}
          <h2 class="ask-quick">Or check something quickly</h2>
          <div class="ask-chips">${D.SUGGESTIONS.map(s => `<button type="button" class="chip" data-action="ask" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`
          : S.thread.map(messageHTML).join('')}
      </div>
      <form class="composer" data-form="ask">
        ${target ? `<div class="ctx"><span>${ic('pin', 'sm')}Charts you pin go to <b>${esc(target.name)}</b></span><button type="button" class="icon-btn" data-action="askfor-clear" aria-label="Choose the dashboard each time instead">${ic('xmark', 'sm')}</button></div>` : ''}
        ${S.askContext ? `<div class="ctx"><span>${ic('stats-up-square', 'sm')}About: <b>${esc(S.askContext.title)}</b></span><button type="button" class="icon-btn" data-action="ctx-clear" aria-label="Remove the attached chart">${ic('xmark', 'sm')}</button></div>
          <div class="ctx-sugg">${['Show it as a table', 'Only the regions that missed', 'Compare with Q2'].map(s => `<button type="button" class="chip" data-action="ask" data-q="${s}">${s}</button>`).join('')}</div>` : ''}
        <div class="cmp-row">
          <label class="sr-only" for="q-${wide ? 'w' : 'p'}">Ask a question</label>
          <input id="q-${wide ? 'w' : 'p'}" class="cmp-in" name="q" placeholder="Ask about your data" autocomplete="off" enterkeyhint="send">
          <button type="submit" class="send" aria-label="Send">${ic('arrow-up')}</button>
        </div>
      </form>
    </div>`;
  }
  function messageHTML(m) {
    if (m.role === 'user') return `<p class="msg-u">${esc(m.text)}</p>`;
    // while it works, the agent shows its plan and ticks each step off
    if (m.loading) return `<div class="ans loading" id="ans-${m.id}" aria-busy="true"><ol class="ans-steps" aria-label="Working">${m.steps.map((s, i) => {
      const st = i < m.done ? 'done' : i === m.done ? 'now' : '';
      return `<li class="${st}">${ic(st === 'done' ? 'check' : st === 'now' ? 'refresh' : 'clock', 'sm' + (st === 'now' ? ' spin' : ''))}${esc(s)}</li>`;
    }).join('')}</ol><div class="sk sk-c"></div></div>`;
    if (m.text) {
      return `<article class="ans" id="ans-${m.id}"><h3 class="ans-t">${esc(m.title)}</h3><p class="ans-s">${esc(m.text)}</p>
        ${m.actions ? `<div class="ans-act">${m.actions}</div>` : ''}</article>`;
    }
    const model = m.model, kind = m.kind;
    const target = askForDash(), fig = !!model.figure;
    const pinLabel = fig ? 'Pin as a figure' : m.replaces ? 'Pin as new tile' : 'Pin to dashboard';
    return `<article class="ans" id="ans-${m.id}" data-dial-target="answer:${m.id}">
      ${model.tag ? `<p class="ai-tag">${ic(TAG_ICON[model.tag] || 'stats-report', 'sm')}${esc(model.tag)}</p>` : ''}
      <h3 class="ans-t">${esc(model.title)}</h3>
      <p class="ans-s">${esc(m.summary)}</p>
      <figure class="ans-c${fig ? ' fig' : ''}" aria-label="${esc(model.sub)}">
        ${model.kinds.length > 1 ? `<div class="ans-c-h"><div class="seg" role="group" aria-label="Chart type">${model.kinds.map(k => `<button type="button" data-action="kind" data-a="${m.id}" data-k="${k}" aria-pressed="${k === kind}">${{ bars: 'Bars', table: 'Table', line: 'Line', cols: 'Columns', bridge: 'Bridge', hbars: 'Bars' }[k]}</button>`).join('')}</div></div>` : ''}
        ${chartHTML(model, kind, 'a' + m.id, { drillable: false })}</figure>
      ${S.sel['a' + m.id] && model.items && kind !== 'table' ? C.barTip(model.items.find(i => i.key === S.sel['a' + m.id]) || model.items[0], {}) : ''}
      ${(model.sources || [model.source]).map(id => srcLine(P(id), 'p', null, true)).join('')}
      ${model.steps ? `<details class="how"><summary>${ic('task-list', 'sm')}How I made this <span class="muted">· ${model.steps.length} steps</span></summary>
        <ol>${model.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}
      <div class="ans-act">
        ${m.pinned ? `<button type="button" class="btn" disabled>${ic('check')}${fig ? 'Added to the figures on' : 'Pinned to'} ${esc(D.DASHBOARDS.find(d => d.id === m.pinned).name)}</button>`
          : target && !m.replaces ? `<button type="button" class="btn primary" data-action="pin-to" data-a="${m.id}" data-d="${target.id}" data-fk="pin-${m.id}">${ic('pin')}${fig ? 'Pin as a figure to' : 'Pin to'} ${esc(target.name)}</button>`
          : `<button type="button" class="btn primary" data-action="pin" data-a="${m.id}" data-fk="pin-${m.id}">${ic('pin')}${pinLabel}</button>`}
        ${m.replaces && !m.pinned ? `<button type="button" class="btn" data-action="replace-tile" data-a="${m.id}">Replace tile</button>` : ''}
        <button type="button" class="icon-btn" data-action="dial" data-dial="answer:${m.id}" aria-label="More actions for this answer">${ic('more-horiz')}</button>
      </div>
      ${S.thread[S.thread.length - 1] === m ? followUpsHTML(m) : ''}
    </article>`;
  }
  // Ways to change the latest chart by asking, so "ask the chat to change a chart" is one tap, not a blank box.
  // Each one is a question the canned interpreter below already answers.
  function followUpsHTML(m) {
    const s = m.spec || {};
    const qs = s.type === 'bridge' ? ['How much revenue is at risk?', 'Break Europe down by country', 'Will we hit the Q4 target?']
      : s.type === 'risk' ? ['What explains the gap to target in Q3?', 'Only the regions that missed']
      : s.type === 'ratio' ? ['What explains the gap to target in Q3?', 'Will we hit the Q4 target?']
      : s.type === 'forecast' ? ['What explains the gap to target in Q3?', 'How much revenue is at risk?']
      : s.type === 'line' ? ['Show sales by region', 'Will we hit the Q4 target?']
      : s.type === 'compare' ? ['Only the regions that missed', 'How did revenue trend this year?']
      : m.drill ? ['Only the regions that missed', 'How did revenue trend this year?']
      : s.onlyMissed ? ['Break Europe down by country', 'Compare with Q2', 'Why did Regional targets fail?']
      : ['Only the regions that missed', 'Break Europe down by country', 'Compare with Q2'];
    return `<div class="ans-next"><p>${s.type === 'risk' ? 'Go further' : 'Change or extend this'}</p>${qs.map(q => `<button type="button" class="chip" data-action="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
  }

  /* the tiny canned "AI" behind the mockup */
  function interpret(q) {
    const t = q.toLowerCase();
    const ctx = S.askContext;
    if (/why|fail|broke|error|stale/.test(t)) return { text: true, source: /marketing|ad spend|ads/.test(t) ? 'marketing_spend' : 'regional_targets' };
    if (ctx && /table/.test(t)) return { spec: { type: ctx.type }, kind: 'table', summary: 'The same figures as a table, so you can read the exact values.' };
    // the answers only an agent can give: a new chart type, a derived figure, a join, a forecast
    if (/gap|explain|bridge|waterfall|shortfall/.test(t)) return { spec: { type: 'bridge' }, kind: 'bridge' };
    if (/risk|share of (revenue|sales)/.test(t)) return { spec: { type: 'risk' }, kind: 'figure' };
    if (/per (active )?customer|per client/.test(t)) return { spec: { type: 'ratio' }, kind: 'hbars' };
    if (/forecast|q4|on track|will we|project/.test(t)) return { spec: { type: 'forecast' }, kind: 'line' };
    if (/only.*miss|missed only|just.*miss/.test(t)) return { spec: { type: 'regions', onlyMissed: true, range: D.YEAR + '-q3' }, kind: 'bars', summary: regionsSummary(true) };
    if (/compare|q2|last quarter vs|versus/.test(t) && !/miss/.test(t)) return { spec: { type: 'compare' }, kind: 'table', summary: compareSummary() };
    if (/europe|country|countries/.test(t)) return { spec: { type: 'regions', range: D.YEAR + '-q3' }, drill: 'eu', kind: 'bars', summary: 'Germany and the UK make up 64% of Europe. Spain and Italy account for more than half of the $0.7M gap to target.' };
    if (/trend|month|revenue|line|over time|grow/.test(t)) return { spec: { type: 'line', range: D.YEAR + '-ytd' }, kind: 'line', summary: trendSummary() };
    if (/table/.test(t)) return { spec: { type: 'regions', range: D.YEAR + '-q3' }, kind: 'table', summary: `Sales and target for each region in Q3 ${D.YEAR}.` };
    if (/region|target|miss|sales|quarter/.test(t)) return { spec: { type: 'regions', range: D.YEAR + '-q3' }, kind: 'bars', summary: regionsSummary(false) };
    return { fallback: true };
  }
  // the two sentences under a new kind of answer, worked out from the same model as its chart
  function aiSummary(model) {
    if (model.bridge) {
      const it = model.bridge.items, gain = it.filter(i => i.d > 0), loss = it.filter(i => i.d < 0);
      const g = gain.reduce((s, i) => s + i.d, 0), l = -loss.reduce((s, i) => s + i.d, 0);
      return `Sales came in ${money(l - g)} under the ${money(model.bridge.start.v)} target. ${listWords(gain.map(i => i.label))} beat ${gain.length > 1 ? 'theirs' : 'its'} by ${money(g)}, which covers ${Math.round(g / l * 100)}% of what ${listWords(loss.map(i => i.label))} missed.`;
    }
    if (model.ratio) {
      const it = model.ratio.items, fmt = v => '$' + nf0.format(Math.round(v));
      return `The company average is ${fmt(model.ratio.avg)} per customer. ${it[it.length - 1].label} and ${it[it.length - 2].label} have many small accounts, so larger orders there would lift revenue without new customers.`;
    }
    if (model.forecast) {
      const f = model.forecast;
      return `October came in at ${money(f.oct)}. If November and December rise the way they did in ${D.YEAR - 1}, Q4 lands at ${money(f.proj)} against a ${money(f.target)} target. The shaded range is 4% either way.`;
    }
    if (model.figure) {
      const r = atRisk(Q3());
      return `${listWords(r.regions)} missed target in Q3. Together they brought in ${money(r.v)}, ${Math.round(r.share)}% of all sales. Pin it as a figure to watch it every quarter.`;
    }
    return '';
  }
  const STEPS = {
    regions: ['Read Regional targets', 'Group countries into regions', 'Compare sales with target'],
    line: ['Read Daily sales', 'Add up each month', `Line up ${D.YEAR} with ${D.YEAR - 1}`],
    compare: ['Read Q2 and Q3 from Regional targets', 'Work out attainment per region', 'Subtract Q2 from Q3'],
    text: ['Read the last run of Regional targets', 'Read the log of step 3', 'Check the CRM maintenance calendar'],
    textMkt: ['Read the last run of Marketing spend', 'Read the log of step 1', 'Check the ad platform connection'],
    fallback: ['Look for a dataset that matches']
  };
  function ask(q, opts = {}) {
    q = (q || '').trim(); if (!q) return;
    const keepCtx = S.askContext, keepFor = S.askFor;
    if (!curChat()) newChat(keepFor);
    S.askContext = keepCtx;
    if (!opts.quiet && location.hash.split('?')[0] !== '#/ask/' + S.chatId) go('#/ask/' + S.chatId);
    const chat = curChat();
    if (chat) { if (!chat.title) chat.title = q.length > 60 ? q.slice(0, 58) + '…' : q; chat.askFor = S.askFor; chat.updated = 'Just now'; }
    S.thread.push({ role: 'user', text: q });
    const r = interpret(q);
    const id = S.seq++;
    const src = r.text ? r.source : r.spec ? (r.spec.type === 'line' ? 'sales_daily' : 'regional_targets') : 'sales_daily';
    const plan = r.spec ? chartModel(r.spec, { drill: r.drill }) : null;
    const steps = (plan && plan.steps) || STEPS[r.text ? (r.source === 'marketing_spend' ? 'textMkt' : 'text') : r.fallback ? 'fallback' : r.spec.type] || STEPS.regions;
    const m = { role: 'answer', id, loading: true, source: src, steps, done: 0 };
    S.thread.push(m);
    const ctx = S.askContext; S.askContext = null;
    if (!opts.quiet) { render(); scrollThread(); }
    // tick the plan off one step at a time, redrawing only this message
    const STEP_MS = S.statics ? 0 : 320;
    for (let i = 1; i <= steps.length && STEP_MS; i++) setTimeout(() => {
      if (!m.loading) return;
      m.done = i; const el = $('#ans-' + id); if (el) el.outerHTML = messageHTML(m);
    }, i * STEP_MS);
    setTimeout(() => {
      m.loading = false;
      if (r.fallback) {
        m.text = 'I can answer questions about sales by region, revenue over time, and why a pipeline failed. Try one of the questions below.';
        m.title = 'I don’t have data for that yet';
        m.actions = D.SUGGESTIONS.slice(0, 2).map(s => `<button type="button" class="chip" data-action="ask" data-q="${esc(s)}">${esc(s)}</button>`).join('');
      } else if (r.text && r.source === 'marketing_spend') {
        const p = P('marketing_spend');
        if (p.status === 'failed') {
          m.title = 'Marketing spend failed because its ad platform login expired';
          m.text = 'Step 1, Read ad platform, was turned away by the ad platform: the saved login expired on Oct 30. Nothing else in the pipeline is wrong. Ask someone with access to the Marketing account to sign in again, then re-run it. Until then Ad spend shows data from Oct 30.';
          m.actions = `<button type="button" class="btn primary" data-action="rerun" data-p="marketing_spend" data-from="s1">${ic('refresh')}Re-run from step 1</button><button type="button" class="btn" data-action="open-pipeline" data-p="marketing_spend" data-step="s1">Open the failed step</button>`;
        } else {
          m.title = 'Marketing spend is healthy now';
          m.text = `The last run ${p.status === 'running' ? 'is still going' : 'succeeded ' + p.lastRun.ago}. The earlier failure came from an expired ad platform login.`;
        }
      } else if (r.text) {
        const p = P('regional_targets');
        if (p.status === 'failed') {
          m.title = 'Regional targets failed because the CRM database was offline';
          m.text = 'Step 3, Join with database, waited 240 seconds for crm.sales_orders and gave up. The CRM was in maintenance from 05:45 to 06:30, and the run started at 06:00. Nothing in the pipeline is broken. Re-run it now, or let it wait longer so maintenance does not stop it next time.';
          m.actions = `<button type="button" class="btn primary" data-action="rerun" data-p="regional_targets" data-from="s3">${ic('refresh')}Re-run from step 3</button><button type="button" class="btn" data-action="open-pipeline" data-p="regional_targets" data-step="s3">Open the failed step</button>`;
        } else {
          m.title = 'Regional targets is healthy now';
          m.text = `The last run ${p.status === 'running' ? 'is still going' : 'succeeded ' + p.lastRun.ago}. The earlier failure came from CRM maintenance between 05:45 and 06:30.`;
        }
      } else {
        const model = plan;
        if (!model.steps) model.steps = steps;
        m.model = model; m.kind = r.kind && model.kinds.includes(r.kind) ? r.kind : model.kinds[0]; m.summary = r.summary || aiSummary(model); m.spec = r.spec; m.drill = r.drill;
        if (ctx && ctx.tile) m.replaces = ctx.tile;
      }
      render(); scrollThread();
    }, STEP_MS ? (steps.length + 1) * STEP_MS : 0);
  }
  function scrollThread() { if (!S.thread.length) return; $$('.thread').forEach(t => { t.scrollTop = t.scrollHeight; }); }

  /* ---------------- pipelines ---------------- */
  const GROUPS = [['failed', 'Needs attention'], ['running', 'Running'], ['succeeded', 'Succeeded'], ['scheduled', 'Scheduled']];
  // The status strip is the summary and the filter in one: each cell counts a status, and tapping it shows only that group.
  function statusStripHTML() {
    const f = S.listFilter;
    return `<div class="stat-strip" role="group" aria-label="Show pipelines by status">${GROUPS.map(([st]) => {
      const n = D.PIPELINES.filter(p => p.status === st).length, on = f === st;
      return `<button type="button" class="stat st-${st}${on ? ' on' : ''}" data-action="list-filter" data-v="${st}" data-fk="stat-${st}" aria-pressed="${on}"${n ? '' : ' disabled'}
          aria-label="${n} ${ST[st].word.toLowerCase()}${on ? ', showing only these. Tap to show all' : ''}">
        <span class="well st-${st}">${stIcon(st, '')}</span><span class="stat-n">${n}</span><span class="stat-w">${ST[st].word}</span></button>`;
    }).join('')}</div>`;
  }
  function viewPipelines() {
    const f = S.listFilter;
    const fail = D.PIPELINES.filter(p => p.status === 'failed').length, run = D.PIPELINES.filter(p => p.status === 'running').length;
    return `<div class="page pipes">
      <header class="page-h"><div class="ph-main"><h1>Pipelines</h1><p class="ph-sub">${D.PIPELINES.length} pipelines. ${fail ? cap(WORDS[fail]) + (fail > 1 ? ' need attention' : ' needs attention') : 'None need attention'}${run ? ', ' + WORDS[run] + ' running' : ''}.</p></div></header>
      ${statusStripHTML()}
      ${f !== 'all' ? `<p class="filter-note">Showing ${ST[f].word.toLowerCase()} only. <button type="button" class="link" data-action="list-filter" data-v="all">Show all</button></p>` : ''}
      ${(() => {
        // one list, most urgent first. Group headings would only repeat the status strip and each row's own status line.
        const list = D.PIPELINES.filter(p => f === 'all' || p.status === f).sort((a, b) => order(a.status) - order(b.status));
        if (!list.length) return `<p class="empty">No ${ST[f].word.toLowerCase()} pipelines right now.</p>`;
        return `<section class="group" aria-label="${f === 'all' ? 'All pipelines' : ST[f].word + ' pipelines'}"><ul class="rows plain">${list.map(pipeRowHTML).join('')}</ul></section>`;
      })()}
    </div>`;
  }
  function pipeRowHTML(p) {
    const feeds = p.feeds.map(id => (D.KPIS.find(k => k.id === id) || { label: id === 'chart_sales_target' ? 'Region chart' : 'Revenue chart' }).label);
    return `<li class="row" data-dial-target="pipeline:${p.id}">
      <span class="well st-${p.status}">${stIcon(p.status, '')}</span>
      <button type="button" class="row-main" data-action="open-pipeline" data-p="${p.id}" data-fk="row-${p.id}">
        <span class="row-t">${esc(p.name)}</span><span class="row-s st-${p.status}">${esc(runLine(p))}</span>
        <span class="row-m">Feeds ${esc(feeds.join(', '))}</span></button>
      ${p.status === 'failed' ? `<button type="button" class="btn" data-action="rerun" data-p="${p.id}" data-from="${p.failedAt}">${ic('refresh')}Re-run</button>` : ''}
      ${ic('nav-arrow-right', 'row-chev')}
    </li>`;
  }

  function viewPipeline() {
    const p = P(S.pipelineId);
    const n = steps(p).length;
    const meta = [['Last run', `${p.lastRun.when}, ${p.lastRun.duration}`], ['Next run', p.next], ['Schedule', p.schedule.label], ['Owner', p.owner]];
    const lin = S.lineage && S.lineage.pipelineId === p.id ? S.lineage : null;
    const draftN = Object.keys(S.drafts[p.id] || {}).length;
    const primary = p.status === 'failed' ? `<button type="button" class="btn primary" data-action="rerun" data-p="${p.id}" data-from="${p.failedAt}" data-fk="pd-rerun">${ic('refresh')}Re-run from step ${stepNo(p, p.failedAt)}</button>`
      : p.status === 'running' ? `<button type="button" class="btn" disabled>${ic('refresh', 'spin')}Running</button>`
      : `<button type="button" class="btn primary" data-action="rerun" data-p="${p.id}" data-fk="pd-run">${ic('play')}Run now</button>`;
    return `<div class="page pipe" data-dial-target="pipeline:${p.id}">
      <button type="button" class="back" data-action="go" data-h="#/pipelines">${ic('nav-arrow-left')}Pipelines</button>
      <header class="pd-h">
        <div class="pd-t"><h1>${esc(p.name)}</h1>
          <p class="status st-${p.status}">${stIcon(p.status)}${esc(runLine(p))}</p></div>
        <div class="pd-a">${primary}
          <button type="button" class="btn map-btn" data-action="map" data-p="${p.id}">${ic('map')}Map</button>
          <button type="button" class="icon-btn" data-action="dial" data-dial="pipeline:${p.id}" aria-label="Actions for ${esc(p.name)}">${ic('more-horiz')}</button></div>
      </header>
      <dl class="pd-meta">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}
        <div class="pd-runs"><dt>Last 10 runs</dt><dd><button type="button" class="runs-btn" data-action="history" data-p="${p.id}" aria-label="Show run history">${C.runHistory(p.history)}</button></dd></div></dl>
      ${lin ? `<div class="lineage">${ic('path-arrow')}<p>Showing the ${n} steps behind <b>${esc(lin.title)}</b>.</p><button type="button" class="btn quiet" data-action="go" data-h="#/dashboard">Back to dashboard</button></div>` : ''}
      ${isPhone() ? spineHTML(p) : canvasHTML(p)}
      ${!isPhone() && canvasMode(p) === 'ltr' ? `<section class="inspector" aria-label="Step details">${S.stepId ? stepPanelHTML(p, node(p, S.stepId), true) : `<p class="insp-empty">${ic('frame-tool')}Select a step to see its settings, a preview of its rows and its log.</p>`}</section>` : ''}
      ${draftN ? draftBarHTML(p, draftN) : ''}
    </div>`;
  }
  function draftBarHTML(p, n) {
    return `<div class="draftbar" role="region" aria-label="Unsaved changes"><p>${n === 1 ? '1 change' : n + ' changes'} not saved</p>
      <button type="button" class="btn quiet" data-action="discard" data-p="${p.id}">Discard</button>
      <button type="button" class="btn primary" data-action="save-run" data-p="${p.id}">${ic('refresh')}Save and re-run</button></div>`;
  }

  /* graph layout: rank = longest path from a source; side inputs sit in lane 1 next to the step they feed */
  function layout(p, dir) {
    const NW = dir === 'ltr' ? 184 : 232, NH = dir === 'ltr' ? 100 : 92, GX = dir === 'ltr' ? 44 : 40, GY = dir === 'ltr' ? 48 : 52, PAD = 24;
    const rank = {}, lane = {};
    steps(p).forEach(n => { const ins = (n.inputs || []).filter(i => node(p, i).kind === 'step'); rank[n.id] = ins.length ? Math.max(...ins.map(i => rank[i])) + 1 : 0; lane[n.id] = 0; });
    p.nodes.filter(n => n.kind === 'source').forEach(s => { const t = steps(p).find(x => (x.inputs || []).includes(s.id)); rank[s.id] = Math.max(0, rank[t.id] - 1); lane[s.id] = 1; });
    const pos = {};
    p.nodes.forEach(n => {
      pos[n.id] = dir === 'ltr'
        ? { x: PAD + rank[n.id] * (NW + GX), y: PAD + lane[n.id] * (NH + GY) + (lane[n.id] ? 0 : 0) }
        : { x: PAD + lane[n.id] * (NW + GX), y: PAD + rank[n.id] * (NH + GY) };
    });
    // in LTR put side inputs above the chain so the chain reads on one line
    if (dir === 'ltr') p.nodes.forEach(n => { if (lane[n.id]) pos[n.id].y = PAD; else pos[n.id].y = PAD + (p.nodes.some(m => m.kind === 'source') ? NH + GY : 0); });
    // extra room at the bottom so the zoom control never sits on a node
    const W = Math.max(...Object.values(pos).map(q => q.x)) + NW + PAD, H = Math.max(...Object.values(pos).map(q => q.y)) + NH + PAD + 48;
    return { pos, NW, NH, W, H, GX, GY };
  }
  function edgePath(a, b, L, dir) {
    if (dir === 'ltr') {
      const x1 = a.x + L.NW, y1 = a.y + L.NH / 2, x2 = b.x, y2 = b.y + L.NH / 2;
      if (Math.abs(y1 - y2) < 1) return { d: `M${x1} ${y1} H${x2}`, lx: (x1 + x2) / 2, ly: y1 - 10 };
      // side input from the lane above: across, then down into the top of the step it feeds
      const tx = b.x + L.NW / 2, ty = b.y, r = 10;
      return { d: `M${x1} ${y1} H${tx - r} Q${tx} ${y1} ${tx} ${y1 + r} V${ty}`, lx: (x1 + tx) / 2, ly: y1 - 10, side: true };
    }
    const x1 = a.x + L.NW / 2, y1 = a.y + L.NH, x2 = b.x + L.NW / 2, y2 = b.y;
    if (Math.abs(x1 - x2) < 1) return { d: `M${x1} ${y1} V${y2}`, lx: x1 + 12, ly: (y1 + y2) / 2, v: true };
    // side input on the right: down from its bottom, then left into the step's right edge
    const ex = b.x + L.NW, ey = b.y + L.NH / 2, r = 10;
    return { d: `M${x1} ${y1} V${ey - r} Q${x1} ${ey} ${x1 - r} ${ey} H${ex}`, lx: x1 + 12, ly: (y1 + ey) / 2, v: true, side: true };
  }
  function canvasHTML(p, opts = {}) {
    const dir = opts.dir || canvasMode(p);
    const L = layout(p, dir), z = opts.fit ? Math.min(1, (Math.min(window.innerWidth, 640) - 72) / L.W) : S.zoom;
    const lin = S.lineage && S.lineage.pipelineId === p.id;
    const edges = [], labels = [];
    p.nodes.forEach(n => (n.inputs || []).forEach(i => {
      const a = node(p, i), e = edgePath(L.pos[i], L.pos[n.id], L, dir);
      const flowing = n.status === 'running' || (a.kind === 'source' && a.status === 'running');
      const done = a.status === 'succeeded' || (a.kind === 'source' && a.rowsOut && n.status !== 'pending' && n.status !== 'failed');
      edges.push(`<path class="edge${flowing ? ' flow' : ''}${done ? ' done' : ''}${n.status === 'failed' && a.kind === 'source' ? ' broken' : ''}" d="${e.d}"/>`);
      const rows = a.kind === 'source' ? (n.status === 'failed' ? 'No rows read' : a.rowsOut && n.status !== 'pending' ? nf0.format(a.rowsOut) + ' rows' : '') : a.rowsOut != null && a.status === 'succeeded' ? nf0.format(a.rowsOut) + ' rows' : '';
      if (rows && (dir !== 'ltr' || e.side)) labels.push(`<span class="elabel${e.v ? ' v' : ''}${n.status === 'failed' && a.kind === 'source' ? ' st-failed' : ''}" style="left:${e.lx}px;top:${e.ly}px">${rows}</span>`);
    }));
    const nodesHTML = p.nodes.map(n => {
      const q = L.pos[n.id];
      if (n.kind === 'source') {
        return `<div class="node src${n.status === 'running' ? ' reading' : ''}" style="left:${q.x}px;top:${q.y}px;width:${L.NW}px;height:${L.NH}px">
          <span class="node-ic">${ic('database')}</span><span class="node-b"><span class="node-k">Input</span><span class="node-n">${esc(n.name)}</span><span class="node-d">${esc(n.detail)}</span></span></div>`;
      }
      const k = stepNo(p, n.id), st = n.status;
      const stText = st === 'failed' ? 'Failed, ' + n.time : st === 'running' ? 'Running' + (n.time ? ', ' + n.time : '') : st === 'succeeded' ? (dir === 'ltr' && n.rowsOut != null ? nf0.format(n.rowsOut) + ' rows out' : 'Done in ' + n.time) : st === 'skipped' ? 'Skipped' : 'Waiting';
      return `<button type="button" class="node st-${st}${S.stepId === n.id ? ' sel' : ''}${lin ? ' lin' : ''}${draftOf(p, n.id) ? ' drafted' : ''}" style="left:${q.x}px;top:${q.y}px;width:${L.NW}px;height:${L.NH}px"
          data-action="step" data-s="${n.id}" data-dial-target="step:${p.id}:${n.id}" data-fk="node-${n.id}" aria-pressed="${S.stepId === n.id}" aria-label="Step ${k}, ${esc(n.name)}, ${ST[st].word}${n.error ? '. ' + esc(n.error) : ''}">
        <span class="node-ic">${ic(TYPE_ICON[n.type])}<span class="node-no" aria-hidden="true">${k}</span></span>
        <span class="node-b"><span class="node-n">${esc(n.name)}</span><span class="node-d">${esc(n.detail)}</span></span>
        <span class="node-st status st-${st}">${st === 'pending' ? '<i class="dot"></i>' : stIcon(st)}${esc(stText)}</span>
      </button>`;
    }).join('');
    return `<div class="canvas-wrap${opts.fit ? ' fit' : ''}" data-dir="${dir}">
      <div class="canvas" ${opts.fit ? '' : 'tabindex="-1"'}>
        <div class="cv-size" style="width:${L.W * z}px;height:${L.H * z}px">
          <div class="cv-inner" style="width:${L.W}px;height:${L.H}px;transform:scale(${z})">
            <svg class="edges" width="${L.W}" height="${L.H}" aria-hidden="true">${edges.join('')}</svg>
            ${labels.join('')}${nodesHTML}
          </div>
        </div>
      </div>
      ${opts.fit ? '' : `<div class="zoom" role="group" aria-label="Zoom">
        <button type="button" class="icon-btn" data-action="zoom" data-z="-1" aria-label="Zoom out">${ic('minus')}</button>
        <span class="zoom-v num" aria-live="polite">${Math.round(S.zoom * 100)}%</span>
        <button type="button" class="icon-btn" data-action="zoom" data-z="1" aria-label="Zoom in">${ic('plus')}</button>
        <button type="button" class="icon-btn" data-action="zoom" data-z="0" aria-label="Reset zoom">${ic('expand')}</button></div>`}
    </div>`;
  }
  function spineHTML(p) {
    const lin = S.lineage && S.lineage.pipelineId === p.id;
    return `<ol class="spine${lin ? ' lin' : ''}" aria-label="Steps, in order">${steps(p).map((n, idx) => {
      const k = idx + 1, st = n.status, open = st === 'failed';
      const side = (n.inputs || []).map(i => node(p, i)).filter(x => x.kind === 'source');
      const next = steps(p)[idx + 1];
      return `<li class="sp st-${st}${open ? ' open' : ''}${draftOf(p, n.id) ? ' drafted' : ''}" data-dial-target="step:${p.id}:${n.id}">
        <button type="button" class="sp-head" data-action="step" data-s="${n.id}" data-fk="sp-${n.id}" aria-label="Step ${k}, ${esc(n.name)}, ${ST[st].word}. Open details">
          <span class="sp-n well st-${st}">${st === 'pending' ? k : st === 'running' ? ic('refresh', 'sm spin') : st === 'failed' ? ic('xmark', 'sm') : st === 'skipped' ? ic('skip-next', 'sm') : ic('check', 'sm')}</span>
          <span class="sp-main"><span class="sp-name">${esc(n.name)}</span><span class="sp-det">${ic(TYPE_ICON[n.type], 'sm')}${esc(n.detail)}</span></span>
          <span class="sp-st st-${st}">${st === 'succeeded' ? esc(n.time) : st === 'pending' ? 'Waiting' : ST[st].word}</span>
        </button>
        ${side.map(s => `<p class="sp-side">${ic('database', 'sm')}<span>Reads <b>${esc(s.name)}</b>, ${esc(s.detail)}</span></p>`).join('')}
        ${open ? (() => {
          // one line of reason and one action by default; the full error and the other fixes open on demand
          const more = !!S.spOpen[p.id + ':' + n.id], id = 'sp-more-' + n.id;
          return `<div class="sp-err${more ? ' more' : ''}"><p class="sp-why">${esc(n.short || n.error.split('. ')[0])}</p>
          <div class="sp-err-a"><button type="button" class="btn primary" data-action="rerun" data-p="${p.id}" data-from="${n.id}">${ic('refresh')}Re-run from here</button>
            <button type="button" class="btn quiet sp-more" data-action="sp-toggle" data-p="${p.id}" data-s="${n.id}" aria-expanded="${more}" aria-controls="${id}" data-fk="sp-more-${n.id}">${more ? 'Less' : 'Details'}${ic(more ? 'nav-arrow-up' : 'nav-arrow-down', 'sm')}</button></div>
          <div class="sp-detail" id="${id}"${more ? '' : ' hidden'}><p>${esc(n.error)}</p>
            <div class="sp-err-a">${n.edit ? `<button type="button" class="btn" data-action="step" data-s="${n.id}">${ic('edit-pencil')}${n.edit.type === 'timeout' ? 'Wait longer' : 'Edit'}</button>` : ''}
            <button type="button" class="btn" data-action="ask" data-q="Why did ${esc(p.name)} fail?">Ask why</button></div></div></div>`;
        })() : ''}
        ${next ? `<p class="sp-rows${n.status === 'succeeded' ? '' : ' none'}">${n.status === 'succeeded' && n.rowsOut != null ? nf0.format(n.rowsOut) + ' rows' : ''}</p>` : ''}
      </li>`;
    }).join('')}</ol>`;
  }
  const draftOf = (p, sid) => (S.drafts[p.id] || {})[sid];

  function stepPanelHTML(p, n, inline) {
    const k = stepNo(p, n.id), st = n.status;
    const tab = S.stepTab;
    const draft = draftOf(p, n.id);
    let body = '';
    if (tab === 'settings') {
      body = `<dl class="kv">${n.config.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>
        ${n.edit ? editHTML(p, n, draft) : `<p class="hint">${ic('help-circle', 'sm')}This step can be changed on desktop. On a phone or tablet you can edit filters, timeouts and schedules.</p>`}
        <label class="tg-row"><span><b>Skip this step</b><small>Turn off for the next run without deleting it</small></span>
          <input type="checkbox" class="toggle" data-change="skip" data-p="${p.id}" data-s="${n.id}"${(draft && draft.skip) || st === 'skipped' ? ' checked' : ''}${n.type === 'read' || n.type === 'load' ? ' disabled' : ''}></label>`;
    } else if (tab === 'preview') {
      body = previewHTML(p, n);
    } else {
      body = `<pre class="log">${logLines(p, n).map(esc).join('\n')}</pre>`;
    }
    return `<div class="stp" data-step="${n.id}">
      <header class="stp-h"><span class="node-ic">${ic(TYPE_ICON[n.type])}</span>
        <div><p class="stp-k">Step ${k} of ${steps(p).length}</p><h2>${esc(n.name)}</h2><p class="status st-${st}">${stIcon(st)}${ST[st].word}${n.time && st !== 'pending' ? ', ' + esc(n.time) : ''}</p></div>
        ${inline ? `<button type="button" class="icon-btn" data-action="dial" data-dial="step:${p.id}:${n.id}" aria-label="Actions for this step">${ic('more-horiz')}</button>` : ''}
      </header>
      ${n.error && st === 'failed' ? `<p class="err">${ic('warning-circle', 'sm')}<span>${esc(n.error)}</span></p>` : ''}
      <div class="seg tabs" role="tablist" aria-label="Step details">${[['settings', 'Settings'], ['preview', 'Preview'], ['log', 'Log']].map(([k2, l]) => `<button type="button" role="tab" data-action="step-tab" data-t="${k2}" aria-selected="${tab === k2}" aria-pressed="${tab === k2}">${l}</button>`).join('')}</div>
      <div class="stp-b" role="tabpanel">${body}</div>
      <footer class="stp-f">
        ${st === 'failed' ? `<button type="button" class="btn primary" data-action="rerun" data-p="${p.id}" data-from="${n.id}">${ic('refresh')}Re-run from here</button><button type="button" class="btn" data-action="ask" data-q="Why did ${esc(p.name)} fail?">Ask why</button>`
          : `<button type="button" class="btn" data-action="rerun" data-p="${p.id}" data-from="${n.id}"${p.status === 'running' ? ' disabled' : ''}>${ic('refresh')}Re-run from here</button>`}
      </footer>
    </div>`;
  }
  function editHTML(p, n, draft) {
    const e = n.edit, val = draft && draft.value !== undefined ? draft.value : e.value;
    if (e.type === 'timeout') {
      return `<fieldset class="edit"><legend>${esc(e.label)}</legend>
        <div class="seg" role="group">${e.options.map(o => `<button type="button" data-action="edit" data-p="${p.id}" data-s="${n.id}" data-v="${o}" aria-pressed="${+val === o}">${o / 60} min</button>`).join('')}</div>
        <p class="hint">${+val > 240 ? 'A slow database will no longer stop this run.' : 'The run stops if the database takes longer than this.'}</p></fieldset>`;
    }
    return `<div class="edit"><label for="ed-${n.id}">${esc(e.label)}</label>
      <select id="ed-${n.id}" class="select" data-change="edit" data-p="${p.id}" data-s="${n.id}">${e.options.map(o => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
  }
  function previewHTML(p, n) {
    if (n.status === 'pending' || n.status === 'failed') return `<p class="empty">${n.status === 'failed' ? 'This step failed, so it has no rows yet. Re-run it to see a preview.' : 'No rows yet. This step runs after the steps before it.'}</p>`;
    const rows = [['North America', 'United States', '9.6', '10.1'], ['Europe', 'Germany', '3.0', '2.9'], ['Europe', 'United Kingdom', '2.5', '2.4'], ['APAC', 'Japan', '2.3', '2.2'], ['LATAM', 'Brazil', '1.5', '1.6']];
    return `<p class="hint">First 5 of ${nf0.format(n.rowsOut || 0)} rows</p>` + C.table(['Region', 'Country', 'Target $M', 'Actual $M'], rows.map(r => [r[0], r[1], r[2], r[3]]), { caption: 'Preview rows' });
  }
  function logLines(p, n) {
    if (n.status === 'failed') return ['06:00:02  Started', '06:00:04  Connecting to CRM (SQL Server)', '06:00:05  Reading crm.sales_orders', '06:04:04  No response after 240 s', '06:04:04  Step failed: timeout'];
    if (n.status === 'pending') return ['Waiting for the steps before this one.'];
    if (n.status === 'running') return ['Started', 'Working…'];
    return [`Started`, `Finished in ${n.time}`, n.rowsOut != null ? `${nf0.format(n.rowsOut)} rows out` : 'Done'];
  }

  /* ---------------- run simulation ---------------- */
  function rerun(pid, from) {
    const p = P(pid);
    if (!p || p.status === 'running') return;
    commitDrafts(p);
    const list = steps(p);
    let i = Math.max(0, from ? list.findIndex(s => s.id === from) : 0);
    list.slice(i).forEach(s => { if (s.status !== 'skipped') s.status = 'pending'; });
    p.status = 'running'; p.runningAt = list[i].id; p.failedAt = null;
    p.lastRun = { when: 'Today, 12:01', ago: 'Started just now', duration: 'running' };
    p.history = p.history.slice(1).concat('run');
    S.lineage = S.lineage && S.lineage.pipelineId === pid ? S.lineage : null;
    toast(`Re-running ${p.name} from step ${i + 1}`);
    render();
    const tick = () => {
      const s = list[i];
      if (!s) {
        p.status = 'succeeded'; p.runningAt = null; p.dataFrom = null;
        p.lastRun = { when: 'Today, 12:02', ago: 'just now', duration: '41s' };
        p.history[p.history.length - 1] = 'ok';
        render();
        const n = p.feeds.length;
        toast(`${p.name} succeeded. ${cap(WORDS[n])} ${n === 1 ? 'tile' : 'tiles'} updated.`, S.place === 'dashboard' ? null : { label: 'View dashboard', run: () => go('#/dashboard') });
        return;
      }
      if (s.status === 'skipped') { i++; return tick(); }
      s.status = 'running'; s.time = null; p.runningAt = s.id;
      (s.inputs || []).forEach(x => { const src = node(p, x); if (src.kind === 'source') src.status = 'running'; });
      render();
      setTimeout(() => {
        s.status = 'succeeded';
        s.time = ['3s', '1s', '38s', '2s', '6s'][i % 5];
        if (s.rowsOut == null) s.rowsOut = 1198;
        (s.inputs || []).forEach(x => { const src = node(p, x); if (src.kind === 'source') src.status = 'idle'; });
        i++; tick();
      }, S.statics ? 0 : 1100);
    };
    setTimeout(tick, S.statics ? 0 : 500);
  }
  function commitDrafts(p) {
    const d = S.drafts[p.id]; if (!d) return;
    Object.entries(d).forEach(([sid, ch]) => {
      const n = node(p, sid);
      if (ch.value !== undefined && n.edit) {
        n.edit.value = ch.value;
        if (n.edit.type === 'timeout') {
          const row = ['Wait up to', ch.value / 60 + ' minutes'], k = n.config.findIndex(c => c[0] === 'Wait up to');
          if (k >= 0) n.config[k] = row; else n.config.push(row);
        }
        if (n.edit.type === 'exclude') { n.detail = `Region is not “${ch.value}”`; n.config[0] = ['Keep rows where', n.detail]; }
        if (n.edit.type === 'status') { n.detail = `Status is “${ch.value}”`; n.config[0] = ['Keep rows where', n.detail]; }
      }
      if (ch.skip !== undefined) n.status = ch.skip ? 'skipped' : 'pending';
    });
    delete S.drafts[p.id];
  }
  // Customer 360 finishes a little while after the page opens, so the dashboard shows a status change on its own.
  function finishBackgroundRun() {
    const p = P('customer_360');
    if (p.status !== 'running') return;
    const s3 = node(p, 's3'), s4 = node(p, 's4');
    s3.status = 'succeeded'; s3.time = '1m 48s'; s3.rowsOut = 6102; s4.status = 'running'; p.runningAt = 's4'; render();
    setTimeout(() => { s4.status = 'succeeded'; s4.time = '9s'; s4.rowsOut = 6102; p.status = 'succeeded'; p.runningAt = null; p.lastRun = { when: 'Today, 12:01', ago: 'just now', duration: '4m 06s' }; p.history[p.history.length - 1] = 'ok'; render(); }, 2500);
  }

  /* ---------------- sheets ---------------- */
  const sheet = () => $('#sheet');
  function openSheet(title, body, opts = {}) {
    const dlg = sheet();
    if (dlg._globe) { dlg._globe.destroy(); dlg._globe = null; }
    dlg.className = 'sheet' + (opts.cls ? ' ' + opts.cls : '');
    dlg.innerHTML = `<div class="sh-grab" aria-hidden="true"><i></i></div>
      <header class="sh-h"><h2 id="sh-title" tabindex="-1" autofocus>${esc(title)}</h2><button type="button" class="icon-btn" data-action="sheet-close" aria-label="Close">${ic('xmark')}</button></header>
      <div class="sh-b">${body}</div>${opts.foot ? `<footer class="sh-f">${opts.foot}</footer>` : ''}`;
    dlg.setAttribute('aria-labelledby', 'sh-title');
    if (!dlg.open) dlg.showModal();
    dlg._ctx = opts.ctx || null;
    requestAnimationFrame(() => dlg.classList.add('in'));
  }
  function closeSheet() {
    const dlg = sheet(); if (!dlg.open) return;
    dlg.classList.remove('in'); dlg.classList.add('out');
    setTimeout(() => { dlg.classList.remove('out'); if (dlg.open) dlg.close(); dlg._ctx = null; if (dlg._globe) { dlg._globe.destroy(); dlg._globe = null; } }, 200);
  }
  function refreshSheet() { const dlg = sheet(); if (dlg.open && dlg._ctx && dlg._ctx.step) openStepSheet(dlg._ctx.p, dlg._ctx.step, true); }
  function openStepSheet(pid, sid, keep) {
    const p = P(pid), n = node(p, sid);
    openSheet(p.name, stepPanelHTML(p, n, false) + (Object.keys(S.drafts[pid] || {}).length ? draftBarHTML(p, Object.keys(S.drafts[pid]).length) : ''), { cls: 'step-sheet', ctx: { step: sid, p: pid } });
  }
  function filterSheet(which) { if (which === 'range') rangeSheet(); else regionSheet(); }

  /* Date range: this year's quarters up front, earlier years in an Archive tab (like a seasonal archive).
     Every option names its year, so a past quarter can't be picked by mistake. */
  function rangeSheet() {
    S.rangeTab = range().archived ? 'archive' : 'year';
    openSheet('Date range', `<div class="seg tabs rg-tabs" role="tablist" aria-label="Period">${[['year', 'This year'], ['archive', 'Archive']].map(([k, l]) =>
      `<button type="button" role="tab" data-action="range-tab" data-t="${k}" aria-selected="${S.rangeTab === k}" aria-pressed="${S.rangeTab === k}">${l}</button>`).join('')}</div>
      <div class="rg-body">${rangeBody()}</div>`, { cls: 'range-sheet', ctx: { range: true } });
  }
  function rangeBody() {
    if (S.rangeTab === 'year') {
      return `<ul class="opts" role="listbox" aria-label="Date range, ${D.YEAR}">${D.RANGES.filter(r => !r.archived).map(r =>
        `<li><button type="button" class="opt" role="option" aria-selected="${S.range === r.id}" data-action="set-range" data-v="${r.id}"><span><b>${esc(r.label)}</b><small>${esc(r.long)}</small></span>${S.range === r.id ? ic('check') : ''}</button></li>`).join('')}</ul>
        <p class="hint">${ic('archive', 'sm')}Earlier years are in the Archive.</p>`;
    }
    return `<div class="arch">${D.ARCHIVE_YEARS.map(y => `<section class="arch-y" aria-labelledby="ay-${y}"><h3 id="ay-${y}">${y}</h3>
      <div class="arch-row">${D.RANGES.filter(r => r.year === y).map(r => {
        const on = S.range === r.id;
        return `<button type="button" class="arch-b${r.kind === 'fy' ? ' fy' : ''}${on ? ' on' : ''}" data-action="set-range" data-v="${r.id}" aria-pressed="${on}" aria-label="${esc(r.label)}">${r.kind === 'fy' ? 'Full year' : 'Q' + (r.q + 1)}</button>`;
      }).join('')}</div></section>`).join('')}</div>`;
  }

  /* Region: a globe that turns to what you pick. Global, then a continent, then (optionally) a country.
     Picking only turns the globe; Apply changes the dashboard. */
  function regionSheet() {
    S.rgDraft = S.region;
    S.rgStep = S.region === 'all' ? 'cont' : 'country';
    openSheet('Region', `<div class="rg"><div class="globe-wrap"><canvas class="globe" aria-hidden="true"></canvas></div>
      <div class="rg-list">${regionListHTML()}</div></div>`,
      { cls: 'region-sheet', ctx: { region: true }, foot: `<button type="button" class="btn primary block rg-apply" data-action="region-apply" data-fk="rg-apply">${esc(applyLabel())}</button>` });
    const dlg = sheet();
    requestAnimationFrame(() => {
      const cv = dlg.querySelector('canvas.globe');
      if (!cv || !window.Globe) return;
      if (dlg._globe) dlg._globe.destroy();
      dlg._globe = Globe.mount(cv);
      showGlobe();
    });
  }
  const applyLabel = () => S.rgDraft === S.region ? 'Done' : 'Show ' + regionName(S.rgDraft);
  function showGlobe() {
    const g = sheet()._globe; if (!g) return;
    const r = S.rgDraft, cont = regionCont(r);
    g.show(cont ? contObj(cont).globe : null, r.startsWith('c:') ? window.GEO.countries.indexOf(r.slice(2)) : null);
  }
  function regionListHTML() {
    const r = S.rgDraft, rg = range();
    const val = id => money(D.sum(id, rg.year, rg.months).a);
    const opt = (v, label, icon, more) => `<button type="button" class="rg-opt${r === v ? ' on' : ''}" role="option" aria-selected="${r === v}" data-action="rg-pick" data-v="${esc(v)}" data-fk="rg-${esc(v)}">
      ${icon ? ic(icon) : ''}<span><b>${esc(label)}</b><small class="num">${val(v)}</small></span>${more ? ic('nav-arrow-right', 'sm rg-more') : r === v ? ic('check', 'sm rg-more') : ''}</button>`;
    if (S.rgStep === 'cont') {
      return `<p class="rg-k" id="rg-k">Continent <span class="muted">${esc(rg.label)} sales</span></p>
        <div class="rg-grid" role="listbox" aria-labelledby="rg-k">${opt('all', 'Global', 'globe')}${D.CONTINENTS.map(c => opt(c.id, c.name, null, true)).join('')}</div>`;
    }
    const c = contObj(regionCont(r));
    return `<button type="button" class="link rg-back" data-action="rg-back" data-fk="rg-back">${ic('nav-arrow-left', 'sm')}All continents</button>
      <p class="rg-k" id="rg-k">${esc(c.name)} <span class="muted">Pick a country for finer detail</span></p>
      <div class="rg-grid" role="listbox" aria-labelledby="rg-k">${opt(c.id, 'All of ' + c.name)}${D.COUNTRIES.filter(x => x.cont === c.id).map(x => opt('c:' + x.name, x.name)).join('')}</div>`;
  }
  function refreshRegion(focusKey) {
    const dlg = sheet(); if (!dlg.open || !dlg._ctx || !dlg._ctx.region) return;
    $('.rg-list', dlg).innerHTML = regionListHTML();
    $('.rg-apply', dlg).textContent = applyLabel();
    showGlobe();
    const el = focusKey && $(`[data-fk="${focusKey}"]`, dlg); if (el) el.focus({ preventScroll: true });
  }

  /* Figures: people pin the few they need (at most four), so the dashboard stays quiet */
  function figuresSheet() {
    openSheet('Figures on ' + D.DASHBOARDS.find(d => d.id === S.dash).name, figuresBody(), { cls: 'figs-sheet', ctx: { figs: true } });
  }
  function figuresBody() {
    const pins = S.kpiPins[S.dash], full = pins.length >= D.MAX_KPIS;
    return `<p class="hint">Pin the figures you check most, up to ${D.MAX_KPIS}. Fewer figures keep the important ones easy to spot.</p>
      <ul class="rows plain figs-list">${D.KPIS.map(k => {
        const on = pins.includes(k.id), v = kpiValue(k.id), p = P(k.source), off = !on && full;
        return `<li class="row"><span class="row-main static"><span class="row-t">${esc(k.label)}</span><span class="row-s">${esc(v.v)} <span class="muted">${esc(k.about)}</span></span><span class="row-m">From ${esc(p.name)}</span></span>
          <button type="button" class="btn pin-tg${on ? ' on' : ''}" data-action="fig-toggle" data-k="${k.id}" data-fk="fig-${k.id}" aria-pressed="${on}"${off ? ' aria-disabled="true"' : ''} aria-label="${on ? 'Unpin' : 'Pin'} ${esc(k.label)}">${ic(on ? 'pin-solid' : 'pin')}${on ? 'Pinned' : 'Pin'}</button></li>`;
      }).join('')}</ul>`;
  }
  function toggleFigure(id) {
    const pins = S.kpiPins[S.dash], k = D.KPIS.find(x => x.id === id), at = pins.indexOf(id);
    if (at >= 0) {
      pins.splice(at, 1);
      toast(`${k.label} unpinned`, { label: 'Undo', run: () => { if (!pins.includes(id) && pins.length < D.MAX_KPIS) { pins.splice(at, 0, id); render(); refreshFigures(); } } });
    } else if (pins.length >= D.MAX_KPIS) {
      toast(`Up to ${D.MAX_KPIS} figures. Unpin one first.`); return;
    } else { pins.push(id); toast(`${k.label} pinned`); }
    render(); refreshFigures();
  }
  function refreshFigures() {
    const dlg = sheet(); if (!dlg.open || !dlg._ctx || !dlg._ctx.figs) return;
    $('.sh-b', dlg).innerHTML = figuresBody();
  }

  /* Account and organization: kept out of the main navigation, one tap away behind the menu button */
  function accountSheet() {
    const rows = [['building', 'Organization', 'Astera Finance'], ['credit-card', 'Billing', 'Team plan, 12 seats'], ['settings', 'Settings', 'Notifications and language'], ['log-out', 'Sign out', '']];
    openSheet('Account', `<div class="acct-user"><span class="avatar" aria-hidden="true">SM</span><span><b>Sara M.</b><small>Finance analytics</small></span></div>
      <ul class="rows plain acct">${rows.map(([icon, l, s]) => `<li class="row"><button type="button" class="row-main acct-row" data-action="acct" data-v="${l}">${ic(icon)}<span><span class="row-t">${l}</span>${s ? `<span class="row-m">${s}</span>` : ''}</span></button></li>`).join('')}</ul>
      <p class="hint">${ic('help-circle', 'sm')}Account pages are outside this mockup.</p>`, { cls: 'drawer' });
  }

  function kpiSheet(id) {
    const k = D.KPIS.find(x => x.id === id), p = P(k.source), v = kpiValue(id), f = freshness(p, true);
    const closed = range().archived && !v.live;
    const msg = closed ? `These are closed figures for ${range().label}. Pipeline runs no longer change them.` :
      { stale: `This figure uses data from ${p.dataFrom}.`, running: 'This figure updates when the run finishes.', succeeded: 'This figure is up to date.', scheduled: `This figure is from yesterday's run. Next run ${p.next.toLowerCase()}.` }[f.cls];
    openSheet(k.label, `<p class="sheet-big">${esc(v.v)}</p><p class="${v.good ? 'st-succeeded' : 'st-failed'} status">${ic(v.up ? 'arrow-up' : 'arrow-down', 'sm')}${esc(v.d)}</p>
      <p class="muted kpi-about">${esc(k.about)}${v.live ? '. A live figure: it does not follow the date range' : ''}.</p>
      <div class="src-card"><span class="well st-${p.status}">${stIcon(p.status, '')}</span><div><p><b>${esc(p.name)}</b></p><p class="st-${p.status}">${esc(runLine(p))}</p><p class="muted">${esc(msg)}</p></div></div>`,
      { foot: `${p.status === 'failed' && !closed ? `<button type="button" class="btn primary" data-action="rerun" data-p="${p.id}" data-from="${p.failedAt}">${ic('refresh')}Re-run</button>` : ''}<button type="button" class="btn" data-action="open-pipeline" data-p="${p.id}">View pipeline</button><button type="button" class="btn quiet" data-action="fig-unpin" data-k="${k.id}">${ic('pin-slash')}Unpin</button>` });
  }
  function pinSheet(aid) {
    const m = S.thread.find(x => x.id === aid), fig = m && m.model && m.model.figure;
    const count = d => { const c = d.charts.length + S.pinned.filter(x => x.dash === d.id).length, k = S.kpiPins[d.id].length; return !c && !k ? 'Empty' : `${k} figure${k === 1 ? '' : 's'}, ${c} chart${c === 1 ? '' : 's'}`; };
    openSheet(fig ? 'Pin as a figure' : 'Pin to dashboard', `<ul class="opts" role="listbox" aria-label="Dashboard">${D.DASHBOARDS.map((d, i) => `<li><button type="button" class="opt" role="option" aria-selected="${i === 0}" data-action="pin-to" data-a="${aid}" data-d="${d.id}"><span><b>${esc(d.name)}</b><small>${count(d)}</small></span>${ic('nav-arrow-right', 'sm')}</button></li>`).join('')}
      <li><button type="button" class="opt" data-action="new-dash" data-a="${aid}"><span><b>New dashboard</b><small>Start a clean one with this ${fig ? 'figure' : 'chart'}</small></span>${ic('plus', 'sm')}</button></li></ul>`);
  }
  // A new dashboard starts empty. When it is made from Pin, the answer lands on it straight away.
  function newDashSheet(aid) {
    openSheet('New dashboard', `<div class="edit"><label for="nd-name">Name</label>
      <input id="nd-name" class="input" value="${esc('Dashboard ' + (D.DASHBOARDS.length + 1))}" autocomplete="off" enterkeyhint="done"></div>
      <p class="hint">${aid ? 'The answer is pinned to it as soon as you create it.' : 'It starts empty. Ask for charts and figures, then pin them here.'}</p>`,
      { foot: `<button type="button" class="btn quiet" data-action="sheet-close">Cancel</button><button type="button" class="btn primary" data-action="create-dash" data-a="${aid || ''}" data-fk="nd-create">Create</button>` });
    setTimeout(() => { const i = $('#nd-name'); if (i) { i.focus(); i.select(); } }, 80);
  }
  function createDash(name, aid) {
    const id = 'd' + (S.seq++);
    D.DASHBOARDS.push({ id, name: name || 'Untitled dashboard', charts: [], kpis: [] });
    S.kpiPins[id] = [];
    closeSheet();
    if (aid) { pinAnswer(aid, id); return; }
    S.dash = id; S.askFor = id; S.range = D.YEAR + '-q3'; S.region = 'all';
    if (S.place !== 'dashboard') go('#/dashboard'); else render();
    toast(`${name} created`);
  }
  const RISK_KPI = { id: 'kpi_risk', label: 'Revenue at risk', source: 'regional_targets', kind: 'money', about: 'Sales in regions below target' };
  function showOnDash(d, flashId) {
    S.dash = d; S.flash = flashId; go('#/dashboard');
    setTimeout(() => { const el = $('#tile-' + flashId) || $(`[data-fk="kpi-${flashId}"]`); el && el.scrollIntoView({ block: 'center' }); setTimeout(() => { S.flash = null; }, 1600); }, 60);
  }
  function pinAnswer(aid, d) {
    const m = S.thread.find(x => x.id === aid), name = D.DASHBOARDS.find(x => x.id === d).name;
    closeSheet();
    if (m.model.figure) {
      if (!D.KPIS.some(k => k.id === RISK_KPI.id)) D.KPIS.push(RISK_KPI);
      const pins = S.kpiPins[d];
      if (!pins.includes(RISK_KPI.id)) {
        if (pins.length >= D.MAX_KPIS) { S.dash = d; go('#/dashboard'); setTimeout(() => figuresSheet(), 80); toast(`${name} already shows ${D.MAX_KPIS} figures. Unpin one to make room.`); return; }
        pins.push(RISK_KPI.id);
      }
      m.pinned = d; render();
      toast(`Added to the figures on ${name}`, { label: 'View', run: () => showOnDash(d, RISK_KPI.id) });
      return;
    }
    const pin = { id: 'pin' + m.id, dash: d, model: m.model, kind: m.kind };
    S.pinned.push(pin); m.pinned = d; render();
    toast(`Pinned to ${name}`, { label: 'View', run: () => showOnDash(d, pin.id) });
  }
  function mapSheet(pid) {
    const p = P(pid);
    openSheet('Map of ' + p.name, `<p class="hint">The whole pipeline at once. Tap a step to open it.</p>${canvasHTML(p, { dir: 'ttb', fit: true })}`, { cls: 'map-sheet' });
  }
  function historySheet(pid) {
    const p = P(pid);
    const days = ['Oct 21', 'Oct 22', 'Oct 23', 'Oct 24', 'Oct 25', 'Oct 26', 'Oct 27', 'Oct 28', 'Oct 29', 'Oct 30'];
    openSheet('Run history', `<ul class="rows plain">${p.history.slice().reverse().map((h, i) => { const st = h === 'ok' ? 'succeeded' : h === 'fail' ? 'failed' : 'running'; return `<li class="row"><span class="well st-${st}">${stIcon(st, '')}</span><span class="row-main static"><span class="row-t">${days[9 - i]}</span><span class="row-s st-${st}">${ST[st].word}</span></span></li>`; }).join('')}</ul>`);
  }
  function scheduleSheet(pid) {
    const p = P(pid);
    openSheet('Schedule', `<div class="edit"><label for="sch-t">Run daily at</label><select id="sch-t" class="select" data-change="schedule" data-p="${p.id}">${['05:00', '06:00', '07:00', '08:00'].map(t => `<option${t === p.schedule.time ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <label class="tg-row"><span><b>Run on weekends</b><small>Saturday and Sunday</small></span><input type="checkbox" class="toggle" data-change="weekends" data-p="${p.id}"${p.schedule.weekends ? ' checked' : ''}></label>`);
  }
  function dashSheet() {
    openSheet('Dashboards', `<ul class="opts" role="listbox" aria-label="Dashboards">${D.DASHBOARDS.map(d => `<li><button type="button" class="opt" role="option" aria-selected="${S.dash === d.id}" data-action="set-dash" data-d="${d.id}"><span><b>${esc(d.name)}</b></span>${S.dash === d.id ? ic('check') : ''}</button></li>`).join('')}</ul>`);
  }

  /* ---------------- toast ---------------- */
  function toast(msg, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
    if (action) t.querySelector('button').onclick = () => { t.classList.remove('on'); action.run(); };
    t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 4500);
  }

  /* ---------------- dial contexts ----------------
     Each dial has a pool of actions in priority order. Six slots are filled one of three ways, chosen per dial:
     - rec  (Recommended): the first six that work right now, so no slot is greyed out
     - used (Most used):   what this person runs most from this dial, topped up with recommended ones
     - mine (My choice):   the six they picked, in the slots they picked (fixed, for spatial memory)
     Preferences and usage stay in this browser only. */
  const DIAL_NAMES = { chat: 'Chat', dashboard: 'Dashboard', pipelines: 'Pipelines', ask: 'Ask', chart: 'Chart', answer: 'Answer', pipeline: 'Pipeline', step: 'Step', kpi: 'Figure' };
  const DIAL_SCOPE = { chart: 'every chart', answer: 'every answer', pipeline: 'every pipeline', step: 'every pipeline step', kpi: 'every figure' };
  const DIAL_STORE = 'studio.dial';
  const dialMem = (() => { try { return JSON.parse(localStorage.getItem(DIAL_STORE)) || {}; } catch (e) { return {}; } })();
  dialMem.prefs = dialMem.prefs || {}; dialMem.use = dialMem.use || {};
  const saveDialMem = () => { try { localStorage.setItem(DIAL_STORE, JSON.stringify(dialMem)); } catch (e) { /* storage blocked: choices last until reload */ } };
  const dialPref = key => dialMem.prefs[key] || { mode: 'rec', mine: [] };
  function trackUse(key, id) {
    const u = dialMem.use[key] = dialMem.use[key] || {};
    u[id] = { n: ((u[id] && u[id].n) || 0) + 1, t: Date.now() };
    saveDialMem();
  }
  // the six that fill the ring, per the dial's mode
  function arrange(c) {
    const pref = dialPref(c.key), on = c.pool.filter(i => !i.disabled), byId = id => c.pool.find(i => i.id === id);
    let pick;
    if (pref.mode === 'mine' && pref.mine.length) pick = pref.mine.map(byId).filter(Boolean);
    else {
      const rec = on.concat(c.pool.filter(i => i.disabled));
      const used = pref.mode === 'used' ? Object.entries(dialMem.use[c.key] || {}).sort((x, y) => y[1].n - x[1].n || y[1].t - x[1].t).map(([id]) => byId(id)).filter(i => i && !i.disabled) : [];
      pick = used.concat(rec.filter(i => !used.includes(i)));
    }
    return pick.slice(0, 6);
  }

  function dialConfig(ctx) {
    const [type, a, b] = ctx.split(':');
    const act = (id, label, icon, run, extra = {}) => Object.assign({ id, label, icon, run }, extra);
    const failed = D.PIPELINES.filter(p => p.status === 'failed');
    const rerunFailed = () => failed.forEach(p => rerun(p.id, p.failedAt));
    if (type === 'place' && a === 'dashboard') {
      const dash = D.DASHBOARDS.find(d => d.id === S.dash);
      return { key: 'dashboard', subject: dash.name, pool: [
        act('range', 'Date range', 'calendar', () => filterSheet('range')),
        act('region', 'Region', 'globe', () => filterSheet('region')),
        act('figures', 'Figures', 'stats-report', () => figuresSheet()),
        act('rerun', 'Re-run failed', 'refresh', rerunFailed, { disabled: !failed.length || range().archived, hint: range().archived ? 'Archived figures don’t change' : 'No pipeline has failed' }),
        act('switch', 'Switch dashboard', 'view-columns-2', () => dashSheet()),
        act('new', 'New dashboard', 'plus-circle', () => newDashSheet()),
        act('ask', 'Ask about it', 'chat-plus-in', () => go('#/ask')),
        act('archive', 'Archive', 'archive', () => { rangeSheet(); const t2 = $('.rg-tabs [data-t="archive"]'); t2 && t2.click(); }),
        act('reset', 'Reset filters', 'undo', () => { S.region = 'all'; setFilter('range', D.YEAR + '-q3'); toast('Showing Q3 ' + D.YEAR + ', Global'); }, { disabled: S.region === 'all' && S.range === D.YEAR + '-q3', hint: 'Filters are already at their defaults' }),
        act('sources', 'Data sources', 'network-right', () => go('#/pipelines')),
        act('share', 'Share link', 'share-ios', () => toast(`Link to ${dash.name} copied`))
      ] };
    }
    if (type === 'kpi') {
      const k = D.KPIS.find(x => x.id === a), p = P(k.source);
      return { key: 'kpi', subject: k.label, pool: [
        act('details', 'Details', 'eye', () => kpiSheet(k.id)),
        act('rerun', 'Re-run source', 'refresh', () => rerun(p.id, p.failedAt), { disabled: p.status !== 'failed', hint: p.status === 'running' ? 'Already running' : 'Its pipeline has not failed' }),
        act('pipeline', 'View pipeline', 'path-arrow', () => openPipeline(p.id)),
        act('ask', 'Ask about it', 'chat-plus-in', () => { go('#/ask'); ask(k.id === 'kpi_revenue' ? 'How did revenue trend this year?' : 'Which regions missed their sales target last quarter?'); }),
        act('unpin', 'Unpin', 'pin-slash', () => toggleFigure(k.id)),
        act('figures', 'Figures', 'stats-report', () => figuresSheet()),
        act('range', 'Date range', 'calendar', () => filterSheet('range')),
        act('share', 'Share', 'share-ios', () => toast(`Link to ${k.label} copied`))
      ] };
    }
    if (type === 'chart' || type === 'pin') {
      const cid = a, isPin = type === 'pin';
      const pin = isPin ? S.pinned.find(x => x.id === cid) : null;
      const model = isPin ? pin.model : chartModel(TILE_SPEC[cid], { drill: S.drill[cid] });
      const src = model.source;
      const drillable = !isPin && cid === 'chart_sales_target' && !S.drill[cid];
      const selKey = S.sel[cid];
      return { key: 'chart', subject: model.title, pool: [
        act('drill', drillable && selKey ? 'Drill into ' + contObj(selKey).short : 'Drill down', 'zoom-in', () => {
          if (selKey) { S.drill[cid] = selKey; S.sel[cid] = null; render(); } else { S.sel[cid] = 'eu'; render(); toast('Tap a region, then See by country'); }
        }, { disabled: !drillable, hint: S.drill[cid] ? 'Already at country level' : 'This chart has no detail level' }),
        act('change', 'Change chart', 'stats-up-square', () => askAbout(cid, model), { disabled: isPin, hint: 'Ask again to change a pinned answer' }),
        act('explain', 'Explain', 'help-circle', () => { S.askContext = null; go('#/ask'); ask(cid === 'chart_revenue_trend' ? 'How did revenue trend this year?' : 'Which regions missed their sales target last quarter?'); }),
        act('pipeline', 'View pipeline', 'path-arrow', () => openPipeline(src, isPin ? null : cid)),
        isPin ? act('unpin', 'Unpin', 'pin-slash', () => { const idx = S.pinned.indexOf(pin); S.pinned.splice(idx, 1); render(); toast('Unpinned', { label: 'Undo', run: () => { S.pinned.splice(idx, 0, pin); render(); } }); })
          : act('table', S.kind[cid] === 'table' ? 'Chart view' : 'Table view', 'table', () => { S.kind[cid] = S.kind[cid] === 'table' ? null : 'table'; render(); }),
        act('range', 'Date range', 'calendar', () => filterSheet('range'), { disabled: isPin, hint: 'Pinned answers keep the filters they were asked with' }),
        act('region', 'Region', 'globe', () => filterSheet('region'), { disabled: isPin, hint: 'Pinned answers keep the filters they were asked with' }),
        act('download', 'Download', 'database-export', () => toast('Downloaded as CSV')),
        act('share', 'Share', 'share-ios', () => toast('Link to this chart copied'))
      ] };
    }
    if (type === 'chat') {
      const c = S.chats.find(x => x.id === a); if (!c) return null;
      return { key: 'chat', subject: c.title, pool: [
        act('open', 'Open', 'chat-bubble', () => { closeSheet(); go('#/ask/' + c.id); }, { disabled: c.id === S.chatId && S.place === 'ask', hint: 'Already open' }),
        act('delete', 'Delete', 'xmark', () => deleteChat(c.id))
      ] };
    }
    if (type === 'answer') {
      const m = S.thread.find(x => x.id === +a);
      if (!m || !m.model) return null;
      return { key: 'answer', subject: m.model.title, pool: [
        act('pin', m.pinned ? 'Pinned' : 'Pin', 'pin', () => pinSheet(m.id), { disabled: !!m.pinned, hint: 'Already pinned' }),
        act('change', 'Change chart', 'stats-up-square', () => { const ks = m.model.kinds; m.kind = ks[(ks.indexOf(m.kind) + 1) % ks.length]; render(); }, { disabled: m.model.kinds.length < 2, hint: 'This answer has one chart type' }),
        act('drill', 'Drill down', 'zoom-in', () => ask('Break down Europe by country'), { disabled: !m.model.items || !!m.model.crumb, hint: 'No detail level for this chart' }),
        act('follow', 'Follow up', 'chat-plus-in', () => { const inp = $('.cmp-in'); inp && inp.focus(); }),
        act('pipeline', 'View pipeline', 'path-arrow', () => openPipeline(m.model.source)),
        act('table', m.kind === 'table' ? 'Chart view' : 'Table view', 'table', () => { m.kind = m.kind === 'table' ? m.model.kinds[0] : 'table'; render(); }, { disabled: !m.model.kinds.includes('table') || m.model.kinds.length < 2, hint: 'This answer is already a table' }),
        act('copy', 'Copy', 'copy', () => toast('Chart copied as an image')),
        act('share', 'Share', 'share-ios', () => toast('Link to this answer copied'))
      ] };
    }
    if (type === 'pipeline' || (type === 'place' && a === 'pipelines' && S.pipelineId)) {
      const p = P(type === 'pipeline' ? a : S.pipelineId), isFail = p.status === 'failed';
      return { key: 'pipeline', subject: p.name, pool: [
        act('run', isFail ? 'Re-run' : 'Run now', isFail ? 'refresh' : 'play', () => rerun(p.id, p.failedAt), { disabled: p.status === 'running', hint: 'Already running' }),
        act('failstep', 'Failed step', 'warning-circle', () => { go('#/pipelines/' + p.id + '/' + p.failedAt); if (isPhone() || canvasMode(p) === 'ttb') setTimeout(() => openStepSheet(p.id, p.failedAt), 60); }, { disabled: !isFail, hint: 'Nothing failed in the last run' }),
        act('why', 'Ask why', 'help-circle', () => { go('#/ask'); ask(`Why did ${p.name} fail?`); }, { disabled: !isFail, hint: 'Nothing failed in the last run' }),
        act('schedule', 'Schedule', 'calendar-rotate', () => scheduleSheet(p.id)),
        act('history', 'Run history', 'list', () => historySheet(p.id)),
        act('alerts', S.alerts[p.id] ? 'Alerts off' : 'Alerts', 'bell', () => { S.alerts[p.id] = !S.alerts[p.id]; toast(S.alerts[p.id] ? `You will get a notification if ${p.name} fails` : 'Alerts off'); }),
        act('map', 'Map', 'map', () => mapSheet(p.id)),
        act('dashboard', 'Dashboard', 'view-grid', () => go('#/dashboard')),
        act('share', 'Share', 'share-ios', () => toast(`Link to ${p.name} copied`))
      ] };
    }
    if (type === 'step') {
      const p = P(a), n = node(p, b);
      const open = tab => { S.stepId = n.id; S.stepTab = tab; if (isPhone() || canvasMode(p) === 'ttb') openStepSheet(p.id, n.id); else render(); };
      return { key: 'step', subject: n.name, pool: [
        act('edit', 'Edit', 'edit-pencil', () => open('settings')),
        act('rerun', 'Re-run here', 'refresh', () => rerun(p.id, n.id), { disabled: p.status === 'running', hint: 'Wait for the current run to finish' }),
        act('why', 'Ask why', 'help-circle', () => { go('#/ask'); ask(`Why did ${p.name} fail?`); }, { disabled: n.status !== 'failed', hint: 'This step did not fail' }),
        act('preview', 'Preview', 'table', () => open('preview')),
        act('log', 'Log', 'page-search', () => open('log')),
        act('skip', 'Skip step', 'skip-next', () => { setDraft(p.id, n.id, { skip: true }); render(); refreshSheet(); toast('Step will be skipped once you save'); }, { disabled: n.type === 'read' || n.type === 'load', hint: 'Inputs and outputs cannot be skipped' }),
        act('map', 'Map', 'map', () => mapSheet(p.id)),
        act('history', 'Run history', 'list', () => historySheet(p.id))
      ] };
    }
    if (type === 'place' && a === 'pipelines') {
      const filt = st => act('f-' + st, ST[st].word + ' only', ST[st].icon, () => { S.listFilter = st; render(); }, { disabled: !D.PIPELINES.some(p => p.status === st), hint: 'No pipeline is ' + ST[st].word.toLowerCase() });
      return { key: 'pipelines', subject: 'Pipelines', pool: [
        act('rerun', 'Re-run failed', 'refresh', rerunFailed, { disabled: !failed.length, hint: 'Nothing has failed' }),
        act('openfail', 'Open failed', 'warning-circle', () => openPipeline(failed[0].id), { disabled: !failed.length, hint: 'Nothing has failed' }),
        filt('failed'), filt('running'),
        act('all', 'Show all', 'list', () => { S.listFilter = 'all'; render(); }, { disabled: S.listFilter === 'all', hint: 'Already showing all' }),
        act('alerts', 'Alerts', 'bell', () => toast('Alerts are on for pipelines you own')),
        filt('succeeded'), filt('scheduled'),
        act('dashboard', 'Dashboard', 'view-grid', () => go('#/dashboard'))
      ] };
    }
    if (type === 'place' && a === 'ask') {
      const last = [...S.thread].reverse().find(x => x.model);
      if (last) return dialConfig('answer:' + last.id);
      return { key: 'ask', subject: 'Ask', pool: D.SUGGESTIONS.map((s, i) => act('s' + i, ['Missed targets', 'Revenue trend', 'Why it failed'][i], ['stats-up-square', 'graph-up', 'help-circle'][i], () => ask(s))).concat([
        act('type', 'Type a question', 'edit-pencil', () => { const inp = $('.cmp-in'); inp && inp.focus(); }),
        act('dashboard', 'Dashboard', 'view-grid', () => go('#/dashboard')),
        act('pipelines', 'Pipelines', 'network-right', () => go('#/pipelines')),
        act('new', 'New chat', 'chat-plus-in', startChat, { disabled: !S.thread.length, hint: 'This chat is already empty' }),
        act('chats', 'Chats', 'list', chatsDrawer)]) };
    }
    return null;
  }

  /* Customize: per dial, pick Recommended, Most used, or My choice (and which six) */
  function dialSheet(ctx) {
    const c = dialConfig(ctx); if (!c) return;
    openSheet(DIAL_NAMES[c.key] + ' dial', dialSheetBody(ctx), { cls: 'dial-sheet', ctx: { dial: ctx },
      foot: `<button type="button" class="btn quiet" data-action="dial-reset">Reset</button><button type="button" class="btn primary" data-action="sheet-close">Done</button>` });
  }
  function dialSheetBody(ctx) {
    const c = dialConfig(ctx), pref = dialPref(c.key), items = arrange(c), n = items.length;
    const modes = [['rec', 'Recommended'], ['used', 'Most used'], ['mine', 'My choice']];
    const usedAny = Object.keys(dialMem.use[c.key] || {}).length;
    const about = {
      rec: 'The six most useful actions that work right now. Ones that can’t run here, like Re-run when nothing failed, make room for the next.',
      used: usedAny ? 'The actions you run most from this dial come first. Empty slots are topped up with recommended ones.' : 'Nothing used from this dial yet, so it starts with the recommended six and learns as you go.',
      mine: 'Pick up to six. They stay in the same slots every time, clockwise from the top.'
    }[pref.mode];
    const ring = `<div class="dprev" aria-hidden="true"><span class="dprev-c">${ic('xmark', 'sm')}</span>${items.map((it, i) => {
      const ang = i * 2 * Math.PI / n, x = 50 + 36 * Math.sin(ang), y = 50 - 36 * Math.cos(ang);
      return `<span class="dprev-i${it.disabled ? ' off' : ''}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%">${ic(it.icon, 'sm')}<em>${esc(it.label)}</em></span>`;
    }).join('')}</div>`;
    const list = pref.mode !== 'mine' ? '' : `<ul class="rows plain dpick" aria-label="Actions for this dial">${c.pool.map(it => {
      const k = pref.mine.indexOf(it.id), on = k >= 0;
      return `<li class="row"><button type="button" class="row-main dpick-b${on ? ' on' : ''}" data-action="dial-pick" data-id="${it.id}" data-fk="dp-${it.id}" aria-pressed="${on}">
        <span class="dpick-n" aria-hidden="true">${on ? k + 1 : ''}</span>${ic(it.icon)}<span class="row-t">${esc(it.label)}</span>${on ? `<span class="row-m">Slot ${k + 1}</span>` : ''}</button></li>`;
    }).join('')}</ul>`;
    return `<p class="hint">${ic('help-circle', 'sm')}<span>Choose what fills this dial${DIAL_SCOPE[c.key] ? ', for ' + DIAL_SCOPE[c.key] : ''}. Search still finds every action.</span></p>
      <div class="seg dmode" role="radiogroup" aria-label="How the dial fills">${modes.map(([k, l]) => `<button type="button" role="radio" data-action="dial-mode" data-m="${k}" aria-checked="${pref.mode === k}" aria-pressed="${pref.mode === k}">${l}</button>`).join('')}</div>
      <p class="dmode-about">${about}</p>${ring}${list}`;
  }
  function refreshDialSheet(focusKey) {
    const dlg = sheet(); if (!dlg.open || !dlg._ctx || !dlg._ctx.dial) return;
    $('.sh-b', dlg).innerHTML = dialSheetBody(dlg._ctx.dial);
    const el = focusKey && $(`[data-fk="${focusKey}"]`, dlg); if (el) el.focus({ preventScroll: true });
  }
  function dialKey() { const dlg = sheet(); return dlg._ctx && dlg._ctx.dial ? dialConfig(dlg._ctx.dial).key : null; }

  function allActions() {
    const list = [];
    PLACES.forEach(pl => list.push({ label: 'Go to ' + pl.label, icon: pl.icon, scope: 'Navigate', run: () => go('#/' + pl.id) }));
    D.PIPELINES.forEach(p => {
      list.push({ label: 'Open ' + p.name, icon: 'network-right', scope: 'Pipeline', keywords: 'pipeline ' + p.status, run: () => openPipeline(p.id) });
      if (p.status !== 'running') list.push({ label: (p.status === 'failed' ? 'Re-run ' : 'Run ') + p.name, icon: 'refresh', scope: 'Pipeline', keywords: 'rerun run retry', run: () => rerun(p.id, p.failedAt) });
    });
    const toDash = () => { if (S.place !== 'dashboard') go('#/dashboard'); };
    D.RANGES.forEach(r => list.push({ label: 'Show ' + r.label, icon: r.archived ? 'archive' : 'calendar', scope: r.archived ? 'Archive' : 'Date range', keywords: 'date filter period quarter year ' + r.year, run: () => { setFilter('range', r.id); toDash(); } }));
    ['all'].concat(D.CONTINENTS.map(c => c.id), D.COUNTRIES.map(c => 'c:' + c.name)).forEach(id => list.push({ label: 'Show ' + regionName(id), icon: 'globe', scope: 'Region', keywords: 'region filter continent country world', run: () => { setFilter('region', id); toDash(); } }));
    list.push({ label: 'Edit figures', icon: 'stats-report', scope: 'Dashboard', keywords: 'kpi pin metrics numbers', run: () => { toDash(); setTimeout(figuresSheet, 60); } });
    list.push({ label: 'Customize this dial', icon: 'edit-pencil', scope: 'Dial', keywords: 'radial menu settings most used recent favorite', run: () => dialSheet('place:' + S.place) });
    list.push({ label: 'Account', icon: 'menu', scope: 'Account', keywords: 'organization billing settings sign out profile', run: () => accountSheet() });
    D.SUGGESTIONS.forEach(s => list.push({ label: s, icon: 'chat-bubble', scope: 'Ask', run: () => { go('#/ask'); ask(s); } }));
    list.push({ label: 'New chat', icon: 'chat-plus-in', scope: 'Ask', keywords: 'conversation start clear', run: startChat });
    pastChats().forEach(c => list.push({ label: c.title, icon: 'chat-bubble', scope: 'Chats', keywords: 'chat history conversation ' + c.updated, run: () => go('#/ask/' + c.id) }));
    list.push({ label: 'Pin last answer', icon: 'pin', scope: 'Ask', keywords: 'save dashboard', run: () => { const m = [...S.thread].reverse().find(x => x.model && !x.pinned); if (m) pinSheet(m.id); else toast('Ask a question first'); } });
    return list;
  }
  function openDial(ctx, anchorEl, pt) {
    const c = dialConfig(ctx.replace(/:search$/, '')); if (!c) return;
    // every run from the dial (ring or "Here" search results) counts toward Most used
    const wrap = it => Object.assign({}, it, { run: () => { trackUse(c.key, it.id); it.run(); } });
    const items = arrange(c).map(wrap);
    let anchor = null;
    if (pt) anchor = pt;
    else if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      anchor = !anchorEl.classList.contains('place') ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        : isRail() ? { x: r.right, y: r.top + r.height / 2, side: true } : { x: r.left + r.width / 2, y: r.bottom, below: true };
    }
    hideCoach(true);
    Dial.open({ subject: c.subject, items, anchor, returnFocus: anchorEl || document.activeElement,
      actions: () => c.pool.filter(i => !i.disabled).map(i => Object.assign({ scope: 'Here' }, wrap(i))).concat(allActions()),
      onCustomize: () => dialSheet(ctx.replace(/:search$/, '')),
      focusSearch: ctx.endsWith(':search'), viaKeyboard: lastInput === 'keyboard' });
  }

  /* ---------------- search: a plain dropdown, not the dial ----------------
     Empty, it lists what can be done on this screen. Typing narrows every action in the app. */
  let pal = null;
  function searchMatches(list, q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return list.map(a => {
      const hay = (a.label + ' ' + (a.keywords || '') + ' ' + (a.scope || '')).toLowerCase();
      if (!words.every(w => hay.includes(w))) return null;
      const l = a.label.toLowerCase();
      return { a, s: (l.startsWith(words[0]) ? 0 : l.includes(words[0]) ? 1 : 2) };
    }).filter(Boolean).sort((x, y) => x.s - y.s).map(x => x.a);
  }
  function openSearch(anchorEl) {
    if (pal) { closeSearch(); return; }
    if (Dial.isOpen()) Dial.close(true);
    closeSheet();
    hideCoach(true);
    const c = dialConfig('place:' + S.place);
    const here = c ? c.pool.filter(i => !i.disabled).map(i => Object.assign({}, i, { scope: 'This screen', run: () => { trackUse(c.key, i.id); i.run(); } })) : [];
    const all = here.concat(allActions());
    let results = here.slice(0, 8), idx = 0;
    const layer = document.createElement('div');
    layer.className = 'pal-layer' + (isPhone() ? ' phone' : '');
    layer.innerHTML = `<div class="pal-scrim" data-pal-close></div>
      <div class="pal" role="dialog" aria-modal="true" aria-label="Search all actions">
        <div class="pal-in">${ic('search')}<input type="search" class="pal-input" placeholder="Search actions, pipelines, filters" aria-label="Search all actions"
          role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" autocomplete="off" enterkeyhint="go">
          <button type="button" class="icon-btn pal-x" data-pal-close aria-label="Close search">${ic('xmark', 'sm')}</button></div>
        <p class="pal-h" id="pal-h"></p>
        <ul class="pal-list" id="pal-list" role="listbox" aria-labelledby="pal-h"></ul>
      </div>`;
    document.body.appendChild(layer);
    const box = $('.pal', layer), input = $('.pal-input', layer), list = $('.pal-list', layer), head = $('.pal-h', layer);
    // where it opens: beside the rail on desktop, under the Search circle on a tablet, along the top on a phone
    if (!isPhone() && anchorEl) {
      const r = anchorEl.getBoundingClientRect(), w = Math.min(440, window.innerWidth - 32);
      if (isRail()) { box.style.left = (r.right + 16) + 'px'; box.style.top = Math.max(16, Math.min(r.top - 12, window.innerHeight - 460)) + 'px'; }
      else { box.style.left = Math.max(16, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 16)) + 'px'; box.style.top = (r.bottom + 10) + 'px'; }
      box.style.width = w + 'px';
    }
    const draw = () => {
      const q = input.value.trim();
      results = q ? searchMatches(all, q).slice(0, 8) : here.slice(0, 8);
      idx = results.length ? Math.min(idx, results.length - 1) : -1;
      head.textContent = q ? (results.length ? 'Results' : '') : 'On this screen';
      list.innerHTML = results.map((a, i) => `<li role="option" id="pal-o${i}" class="pal-o${i === idx ? ' on' : ''}" aria-selected="${i === idx}" data-i="${i}">
          ${ic(a.icon)}<span>${esc(a.label)}</span>${q && a.scope ? `<small>${esc(a.scope)}</small>` : ''}</li>`).join('') ||
        `<li class="pal-none">No action matches “${esc(q)}”</li>`;
      if (idx >= 0) input.setAttribute('aria-activedescendant', 'pal-o' + idx); else input.removeAttribute('aria-activedescendant');
      const on = $('.pal-o.on', list); if (on) on.scrollIntoView({ block: 'nearest' });
    };
    const run = a => { if (!a) return; closeSearch(true); setTimeout(() => a.run(), 40); };
    input.addEventListener('input', () => { idx = 0; draw(); });
    layer.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
      else if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); idx = (idx + 1) % results.length; draw(); }
      else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); idx = (idx - 1 + results.length) % results.length; draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(results[idx]); }
      else if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === input ? $('.pal-x', layer) : input).focus(); }
    });
    layer.addEventListener('click', e => {
      if (e.target.closest('[data-pal-close]')) { closeSearch(); return; }
      const o = e.target.closest('.pal-o'); if (o) run(results[+o.dataset.i]);
    });
    pal = { layer, back: anchorEl || document.activeElement };
    draw();
    requestAnimationFrame(() => { layer.classList.add('open'); input.focus({ preventScroll: true }); });
  }
  function closeSearch(keepFocus) {
    if (!pal) return;
    const { layer, back } = pal; pal = null;
    layer.classList.remove('open');
    setTimeout(() => layer.remove(), 150);
    if (!keepFocus && back && document.contains(back)) back.focus({ preventScroll: true });
  }

  /* ---------------- navigation ---------------- */
  function go(h) { if (location.hash !== h) location.hash = h; else route(); }
  function openPipeline(pid, lineageTile, step) {
    if (lineageTile) {
      const model = chartModel(TILE_SPEC[lineageTile] || { type: 'regions' }, { drill: S.drill[lineageTile] });
      S.lineage = { pipelineId: pid, tile: lineageTile, title: model.title };
    } else if (!S.lineage || S.lineage.pipelineId !== pid) S.lineage = null;
    closeSheet();
    go('#/pipelines/' + pid + (step ? '/' + step : ''));
  }
  function askAbout(cid, model) {
    S.askContext = { tile: cid, title: model.sub.split(',')[0], type: TILE_SPEC[cid] ? TILE_SPEC[cid].type : 'regions' };
    go(S.chatId ? '#/ask/' + S.chatId : '#/ask');
    setTimeout(() => { const inp = $('.ask.wide .cmp-in') || $('.cmp-in'); inp && inp.focus(); }, 50);
  }
  function setFilter(kind, v) {
    if (kind === 'range') S.range = v; else S.region = v;
    S.drill = {}; S.sel = {};
    S.refetch = true; render();
    setTimeout(() => { S.refetch = false; $$('.tile-body.refetch').forEach(b => b.classList.remove('refetch')); }, 260);
  }
  function setDraft(pid, sid, change) {
    S.drafts[pid] = S.drafts[pid] || {};
    S.drafts[pid][sid] = Object.assign({}, S.drafts[pid][sid], change);
  }
  function route() {
    const [path, qs] = location.hash.replace(/^#/, '').split('?');
    const parts = path.split('/').filter(Boolean);
    const flags = new URLSearchParams(qs || '');
    const prevPlace = S.place, prevPipe = S.pipelineId;
    S.place = ['ask', 'dashboard', 'pipelines'].includes(parts[0]) ? parts[0] : 'dashboard';
    S.pipelineId = S.place === 'pipelines' && parts[1] && P(parts[1]) ? parts[1] : null;
    if (S.pipelineId !== prevPipe) {
      S.stepId = null; S.zoom = 1;
      // the wide canvas has an inspector under it: open it on the failed step, as the phone list does, rather than empty
      const np = S.pipelineId && P(S.pipelineId);
      if (np && np.status === 'failed' && canvasMode(np) === 'ltr') S.stepId = np.failedAt;
    }
    if (S.place === 'ask') {
      if (parts[1] && S.chats.some(c => c.id === parts[1])) openChat(parts[1]);
      else if (!curChat()) newChat();
    }
    if (S.pipelineId && parts[2]) S.stepId = parts[2];
    if (flags.get('step')) S.stepId = flags.get('step');
    if (flags.get('tab')) S.stepTab = flags.get('tab');
    closeSheet();
    closeSearch(true);
    if (Dial.isOpen()) Dial.close(true);
    render();
    if (prevPlace !== S.place || prevPipe !== S.pipelineId) $('#view').scrollTop = 0;
    applyFlags(flags);
    if (S.place === 'ask') scrollThread();
  }
  function applyFlags(f) {
    if (f.get('static')) S.statics = true;
    if (f.get('demo') && !S.thread.length) {
      const st = S.statics; S.statics = true; ask(D.SUGGESTIONS[0]); S.statics = st;
      if (f.get('demo') === '2') { S.statics = true; ask('How did revenue trend this year?'); S.statics = st; }
    }
    if (f.get('ctx')) askAbout('chart_sales_target', chartModel({ type: 'regions' }));
    if (f.get('sel')) { S.sel.chart_sales_target = f.get('sel'); render(); }
    if (f.get('drill')) { S.drill.chart_sales_target = f.get('drill'); render(); }
    if (f.get('lineage')) { S.lineage = { pipelineId: S.pipelineId || 'regional_targets', tile: 'chart_sales_target', title: chartModel({ type: 'regions' }).title }; render(); }
    const dial = f.get('dial');
    if (dial) setTimeout(() => {
      if (dial === 'place') openDial('place:' + S.place, $(isPhone() ? '.placebar .place.on' : '.places.top .place.on'));
      else if (dial === 'chart') openDial('chart:chart_sales_target', $('[data-dial="chart:chart_sales_target"]'));
      else if (dial === 'search') openSearch(searchBtn());
      else if (dial === 'step') openDial('step:' + S.pipelineId + ':' + (S.stepId || 's3'), $('.node.sel') || $('.sp.open .sp-head'));
      else if (dial === 'pipeline') openDial('pipeline:' + S.pipelineId, $('[data-dial^="pipeline:"]'));
    }, 120);
    const sh = f.get('sheet');
    if (sh) setTimeout(() => {
      if (sh === 'step') openStepSheet(S.pipelineId || 'regional_targets', S.stepId || 's3');
      if (sh === 'pin') { const m = S.thread.find(x => x.model); if (m) pinSheet(m.id); }
      if (sh === 'range') filterSheet('range');
      if (sh === 'map') mapSheet(S.pipelineId || 'regional_targets');
      if (sh === 'kpi') kpiSheet('kpi_attainment');
      if (sh === 'region') regionSheet();
      if (sh === 'figures') figuresSheet();
      if (sh === 'menu') accountSheet();
      if (sh === 'archive') { rangeSheet(); const t = $('.rg-tabs [data-t="archive"]'); t && t.click(); }
    }, 120);
    if (f.get('draft')) { setDraft('regional_targets', 's3', { value: 600 }); render(); }
    if (f.get('range') && range(f.get('range'))) { S.range = f.get('range'); render(); }
    if (f.get('region')) { S.region = f.get('region'); render(); }
  }

  /* ---------------- coach mark (first visit, phone) ---------------- */
  // A one-time hint on the phone dashboard: the filled circle is also the dial. Shown once, gone after 6 s or the first tap.
  let coachShown = false;
  function coach() {
    const el = $('#coach');
    let seen = true; try { seen = localStorage.getItem('studio.dialHint') === '1'; } catch (e) { seen = true; }
    if (coachShown || seen || S.statics || !isPhone() || S.place !== 'dashboard') { if (!coachShown) el.hidden = true; return; }
    const on = $('.placebar .place.on'); if (!on) return;
    coachShown = true;
    el.hidden = false;
    const r = on.getBoundingClientRect(), w = el.offsetWidth;
    el.style.left = Math.min(Math.max(r.left + r.width / 2, w / 2 + 12), window.innerWidth - w / 2 - 12) + 'px';
    el.style.top = (r.top - 14) + 'px';
    el.style.setProperty('--arrow-x', (r.left + r.width / 2 - (parseFloat(el.style.left) - w / 2)) + 'px');
    setTimeout(() => hideCoach(false), 6000);
    document.addEventListener('pointerdown', () => hideCoach(false), { once: true, capture: true });
  }
  function hideCoach(remember) {
    $('#coach').hidden = true;
    if (remember) { try { localStorage.setItem('studio.dialHint', '1'); } catch (e) { /* storage blocked: the hint simply shows again next time */ } }
  }

  /* ---------------- events ---------------- */
  let longPress = null, suppressClick = false;
  document.addEventListener('click', e => {
    if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
    const t = e.target.closest('[data-action]');
    if (!t || t.closest('.dial-layer')) return;
    const A = t.dataset;
    switch (A.action) {
      case 'place':
        if (A.place === S.place) { hideCoach(true); openDial('place:' + S.place, t); }
        else go('#/' + A.place);
        break;
      case 'dial': openDial(A.dial, t); break;
      case 'search': openSearch(t); break;
      case 'go': go(A.h); break;
      case 'bar': {
        const cid = A.chart;
        S.sel[cid] = S.sel[cid] === A.key ? null : A.key; render();
        const tip = $(`#tile-${cid} .tip .btn`); if (tip && S.sel[cid]) tip.focus({ preventScroll: true });
        break;
      }
      case 'drill': S.drill[A.chart] = A.key; S.sel[A.chart] = null; render(); break;
      case 'undrill': S.drill[A.chart] = null; render(); break;
      case 'filter': filterSheet(A.f); break;
      case 'set-range': closeSheet(); setFilter('range', A.v); break;
      case 'set-region': closeSheet(); setFilter('region', A.v); break;
      case 'kpi': kpiSheet(A.k); break;
      case 'rerun': closeSheet(); rerun(A.p, A.from); break;
      case 'rerun-all': D.PIPELINES.filter(p => p.status === 'failed').forEach(p => rerun(p.id, p.failedAt)); break;
      case 'fail-toggle': S.failOpen = !S.failOpen; render(); break;
      case 'sp-toggle': { const k = A.p + ':' + A.s; S.spOpen[k] = !S.spOpen[k]; render(); break; }
      case 'open-pipeline': openPipeline(A.p, A.lineage, A.step); break;
      case 'step':
        S.stepId = A.s;
        if (isPhone() || canvasMode(P(S.pipelineId)) === 'ttb') { render(); openStepSheet(S.pipelineId, A.s); }
        else render();
        break;
      case 'step-tab': S.stepTab = A.t; if (sheet().open) refreshSheet(); else render(); break;
      case 'edit': setDraft(A.p, A.s, { value: +A.v }); render(); refreshSheet(); break;
      case 'save-run': closeSheet(); rerun(A.p, P(A.p).failedAt || Object.keys(S.drafts[A.p] || {})[0]); break;
      case 'discard': delete S.drafts[A.p]; render(); refreshSheet(); toast('Changes discarded'); break;
      case 'map': mapSheet(A.p); break;
      case 'history': historySheet(A.p); break;
      case 'zoom': S.zoom = A.z === '0' ? 1 : Math.min(1.5, Math.max(0.6, +(S.zoom + 0.1 * +A.z).toFixed(1))); render(); break;
      case 'ask': ask(A.q); break;
      case 'ctx-clear': S.askContext = null; render(); break;
      case 'pin': pinSheet(+A.a); break;
      case 'pin-to': pinAnswer(+A.a, A.d); break;
      case 'new-dash': newDashSheet(A.a ? +A.a : null); break;
      case 'create-dash': { const i = $('#nd-name'); createDash(i ? i.value.trim() : '', A.a ? +A.a : null); break; }
      case 'chats': chatsDrawer(); break;
      case 'new-chat': startChat(); break;
      case 'open-chat': closeSheet(); go('#/ask/' + A.c); break;
      case 'del-chat': deleteChat(A.c); break;
      case 'ask-for': {
        // asked from a dashboard: a fresh chat whose pins go back to that dashboard
        newChat(S.dash);
        if (A.q) ask(A.q); else { go('#/ask/' + S.chatId); setTimeout(() => { const inp = $('.cmp-in'); inp && inp.focus(); }, 80); }
        break;
      }
      case 'askfor-clear': S.askFor = null; if (curChat()) curChat().askFor = null; render(); break;
      case 'replace-tile': {
        const m = S.thread.find(x => x.id === +A.a);
        if (m.model.items) S.kind[m.replaces] = m.kind;
        m.pinned = S.dash; render();
        toast('Tile updated on Sales Overview', { label: 'View', run: () => { S.flash = m.replaces; go('#/dashboard'); setTimeout(() => { S.flash = null; }, 1600); } });
        break;
      }
      case 'kind': { const m = S.thread.find(x => x.id === +A.a); m.kind = A.k; render(); break; }
      case 'sheet-close': closeSheet(); break;
      case 'dial-mode': {
        const k = dialKey(); if (!k) break;
        const pref = dialMem.prefs[k] = Object.assign({ mine: [] }, dialPref(k), { mode: A.m });
        // starting "My choice" from what the dial shows now, so nothing jumps
        if (A.m === 'mine' && !pref.mine.length) pref.mine = arrange(dialConfig(sheet()._ctx.dial)).map(i => i.id);
        saveDialMem(); refreshDialSheet(); break;
      }
      case 'dial-pick': {
        const k = dialKey(); if (!k) break;
        const pref = dialMem.prefs[k], at = pref.mine.indexOf(A.id);
        if (at >= 0) pref.mine.splice(at, 1);
        else if (pref.mine.length >= 6) { toast('A dial holds six. Remove one first.'); break; }
        else pref.mine.push(A.id);
        saveDialMem(); refreshDialSheet('dp-' + A.id); break;
      }
      case 'dial-reset': { const k = dialKey(); if (!k) break; delete dialMem.prefs[k]; delete dialMem.use[k]; saveDialMem(); refreshDialSheet(); toast(DIAL_NAMES[k] + ' dial reset'); break; }
      case 'switch-dash': dashSheet(); break;
      case 'set-dash': closeSheet(); S.dash = A.d; if (S.place !== 'dashboard') go('#/dashboard'); else render(); break;
      case 'list-filter': S.listFilter = A.v === S.listFilter ? 'all' : A.v; render(); break;
      case 'menu': accountSheet(); break;
      case 'acct': closeSheet(); toast(A.v + ' is not part of this mockup'); break;
      case 'figures': figuresSheet(); break;
      case 'fig-toggle': toggleFigure(A.k); break;
      case 'fig-unpin': closeSheet(); toggleFigure(A.k); break;
      case 'range-tab': {
        S.rangeTab = A.t;
        $$('.rg-tabs [role="tab"]').forEach(b => { const on = b.dataset.t === A.t; b.setAttribute('aria-selected', on); b.setAttribute('aria-pressed', on); });
        $('.rg-body').innerHTML = rangeBody();
        break;
      }
      case 'rg-pick': {
        const v = A.v;
        S.rgDraft = v;
        if (v !== 'all' && !v.startsWith('c:') && S.rgStep === 'cont') { S.rgStep = 'country'; refreshRegion('rg-' + v); }
        else refreshRegion('rg-' + v);
        break;
      }
      case 'rg-back': S.rgStep = 'cont'; refreshRegion('rg-' + (regionCont(S.rgDraft) || 'all')); break;
      case 'region-apply': closeSheet(); if (S.rgDraft !== S.region) setFilter('region', S.rgDraft); break;
      case 'coach-close': hideCoach(true); break;
    }
  });
  document.addEventListener('change', e => {
    const t = e.target.closest('[data-change]'); if (!t) return;
    const A = t.dataset;
    if (A.change === 'edit') { setDraft(A.p, A.s, { value: t.value }); render(); refreshSheet(); }
    if (A.change === 'skip') { setDraft(A.p, A.s, { skip: t.checked }); render(); refreshSheet(); }
    if (A.change === 'schedule') { const p = P(A.p); p.schedule.time = t.value; p.schedule.label = 'Daily at ' + t.value; render(); toast(`${p.name} now runs daily at ${t.value}`); }
    if (A.change === 'weekends') { P(A.p).schedule.weekends = t.checked; toast(t.checked ? 'Runs on weekends' : 'Skips weekends'); }
  });
  // Enter in the new-dashboard name creates it, like a form
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'nd-name') { e.preventDefault(); const b = $('[data-action="create-dash"]'); b && b.click(); }
  });
  document.addEventListener('submit', e => {
    const f = e.target.closest('[data-form="ask"]'); if (!f) return;
    e.preventDefault();
    const inp = f.querySelector('.cmp-in'); const q = inp.value; inp.value = ''; ask(q);
  });
  // long-press (touch) and right-click (mouse) open an object's dial
  document.addEventListener('pointerdown', e => {
    const t = e.target.closest('[data-dial-target]');
    if (!t || e.pointerType !== 'touch' || e.target.closest('input,select,textarea')) return;
    const x = e.clientX, y = e.clientY;
    longPress = { x, y, t: setTimeout(() => { longPress = null; suppressClick = true; setTimeout(() => { suppressClick = false; }, 600); openDial(t.dataset.dialTarget, t.querySelector('[data-action="dial"]') || t, { x, y }); }, 480) };
  });
  ['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => { if (longPress) { clearTimeout(longPress.t); longPress = null; } }));
  document.addEventListener('pointermove', e => { if (longPress && Math.hypot(e.clientX - longPress.x, e.clientY - longPress.y) > 10) { clearTimeout(longPress.t); longPress = null; } });
  document.addEventListener('contextmenu', e => {
    const t = e.target.closest('[data-dial-target]'); if (!t || e.target.closest('input,textarea')) return;
    e.preventDefault(); openDial(t.dataset.dialTarget, t.querySelector('[data-action="dial"]'), { x: e.clientX, y: e.clientY });
  });
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(searchBtn()); }
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      const t = document.activeElement && document.activeElement.closest('[data-dial-target]');
      if (t) { e.preventDefault(); openDial(t.dataset.dialTarget, document.activeElement); }
    }
  });
  // sheet: backdrop click and Escape close it; drag the grabber down to dismiss on touch
  document.addEventListener('DOMContentLoaded', () => {});
  function wireSheet() {
    const dlg = sheet();
    dlg.addEventListener('click', e => { if (e.target === dlg) closeSheet(); });
    dlg.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
    let drag = null;
    dlg.addEventListener('pointerdown', e => {
      if (!e.target.closest('.sh-grab, .sh-h') || e.target.closest('button')) return;
      drag = { y: e.clientY, t: Date.now() }; dlg.setPointerCapture(e.pointerId); dlg.classList.add('dragging');
    });
    dlg.addEventListener('pointermove', e => { if (!drag) return; const dy = Math.max(0, e.clientY - drag.y); dlg.style.translate = `0 ${dy}px`; });
    const end = e => {
      if (!drag) return;
      const dy = Math.max(0, e.clientY - drag.y), v = dy / Math.max(1, Date.now() - drag.t);
      dlg.classList.remove('dragging'); dlg.style.translate = '';
      if (dy > 120 || v > 0.6) closeSheet();
      drag = null;
    };
    dlg.addEventListener('pointerup', end); dlg.addEventListener('pointercancel', end);
  }

  /* ---------------- boot ---------------- */
  document.body.insertAdjacentHTML('afterbegin', window.ICON_SPRITE);
  wireSheet();
  window.addEventListener('hashchange', route);
  let lastW = window.innerWidth;
  let rz;
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    if ((w < 700) !== (lastW < 700) || (w >= 1000) !== (lastW >= 1000) || (w >= 1280) !== (lastW >= 1280)) render();
    else if (S.pipelineId) { clearTimeout(rz); rz = setTimeout(render, 150); }
    lastW = w;
  });
  const initFlags = new URLSearchParams((location.hash.split('?')[1]) || '');
  if (initFlags.get('static')) S.statics = true;
  // two earlier chats, so the Chats list has history; the session opens on a fresh one
  [['How did revenue trend this year?', 'Yesterday'], ['Why did Regional targets fail?', 'Today, 09:12']].forEach(([q, when]) => {
    newChat(); const st = S.statics; S.statics = true; ask(q, { quiet: true }); S.statics = st; curChat().updated = when;
  });
  newChat();
  route();
  if (!S.statics) setTimeout(finishBackgroundRun, 40000);
  $('#coach').addEventListener('click', e => { if (e.target.closest('[data-action="coach-close"]')) hideCoach(true); });
  window.__studio = { S, render, rerun, ask, go };
})();
