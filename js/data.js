/* Astera Studio mockup: made-up sample data. The numbers add up on purpose:
   every figure is built from country-by-month values, so countries sum to their continent,
   continents sum to the world, and months sum to quarters and years. */
window.STUDIO = (function () {
  'use strict';

  const NOW_LABEL = 'Fri, Oct 30, 12:00';
  const YEAR = 2026;            // the current year; earlier years live in the archive
  const MONTHS_SO_FAR = 10;     // Jan to Oct 2026 (October runs to the 30th)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const QUARTER_MONTHS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];

  /* Continents, in the order the region chart lists them. `globe` indexes GEO.continents. */
  const CONTINENTS = [
    { id: 'na', name: 'North America', short: 'N. America', globe: 0 },
    { id: 'eu', name: 'Europe', short: 'Europe', globe: 2 },
    { id: 'as', name: 'Asia', short: 'Asia', globe: 3 },
    { id: 'sa', name: 'South America', short: 'S. America', globe: 1 },
    { id: 'oc', name: 'Oceania', short: 'Oceania', globe: 5 },
    { id: 'af', name: 'Africa', short: 'Africa', globe: 4 }
  ];

  /* Q3 2026 actual and target per country, $M. `shape` names the sales team whose
     quarter-to-quarter pattern the country follows in 2026 (actual and target for Q1, Q2, Q3). */
  const SHAPE = {
    na: [[10.9, 10.8], [11.6, 11.2], [12.4, 11.8]],
    eu: [[8.0, 8.2], [8.6, 8.5], [8.3, 9.0]],
    apac: [[5.5, 5.6], [5.8, 6.0], [6.1, 6.5]],
    latam: [[2.5, 2.4], [2.8, 2.7], [3.0, 2.8]],
    mea: [[1.8, 1.9], [2.1, 2.2], [1.9, 2.4]]
  };
  const OCT_PACE = { na: 1.06, eu: 0.97, apac: 1.04, latam: 1.02, mea: 0.95 }; // October 2026 against a third of Q3
  const COUNTRIES = [
    ['United States', 'na', 'na', 10.1, 9.6], ['Canada', 'na', 'na', 1.7, 1.6], ['Mexico', 'na', 'na', 0.6, 0.6],
    ['Germany', 'eu', 'eu', 2.9, 3.0], ['United Kingdom', 'eu', 'eu', 2.4, 2.5], ['France', 'eu', 'eu', 1.6, 1.7], ['Spain', 'eu', 'eu', 0.8, 1.0], ['Italy', 'eu', 'eu', 0.6, 0.8],
    ['Japan', 'as', 'apac', 2.2, 2.3], ['Singapore', 'as', 'apac', 1.2, 1.3], ['India', 'as', 'apac', 0.9, 1.1], ['UAE', 'as', 'mea', 0.9, 1.1], ['Saudi Arabia', 'as', 'mea', 0.6, 0.8],
    ['Brazil', 'sa', 'latam', 1.6, 1.5], ['Chile', 'sa', 'latam', 0.8, 0.7], ['Colombia', 'sa', 'latam', 0.6, 0.6],
    ['Australia', 'oc', 'apac', 1.5, 1.5], ['New Zealand', 'oc', 'apac', 0.3, 0.3],
    ['South Africa', 'af', 'mea', 0.25, 0.3], ['Egypt', 'af', 'mea', 0.1, 0.12], ['Nigeria', 'af', 'mea', 0.05, 0.08]
  ].map(([name, cont, shape, a, t], i) => ({ id: name, name, cont, shape, q3: [a, t], i }));

  /* Company revenue per month, $M. 2026 runs Jan to Sep here; October is the sum of the countries below. */
  const HISTORY = {
    2020: [5.0, 5.1, 5.3, 5.4, 5.5, 5.7, 5.6, 5.8, 6.0, 6.1, 6.2, 6.7],
    2021: [5.6, 5.7, 6.0, 6.1, 6.2, 6.4, 6.3, 6.5, 6.7, 6.8, 7.0, 7.5],
    2022: [6.2, 6.4, 6.6, 6.8, 6.9, 7.1, 7.0, 7.2, 7.5, 7.6, 7.8, 8.4],
    2023: [6.9, 7.0, 7.4, 7.5, 7.6, 7.9, 7.7, 8.0, 8.2, 8.4, 8.6, 9.3],
    2024: [7.6, 7.8, 8.1, 8.2, 8.5, 8.7, 8.4, 8.8, 9.1, 9.2, 9.4, 10.2],
    2025: [8.4, 8.5, 9.0, 9.1, 9.3, 9.6, 9.4, 9.7, 10.0, 10.1, 10.4, 11.2],
    2026: [9.2, 9.4, 10.1, 9.9, 10.3, 10.7, 9.8, 10.6, 11.3]
  };
  const ARCHIVE_YEARS = [2025, 2024, 2023, 2022, 2021]; // 2020 only feeds comparisons
  // Each continent's share drifts a little per year back in time (Europe was relatively larger, Asia smaller).
  const DRIFT = { na: 0, eu: 0.015, as: -0.02, sa: 0, oc: 0.005, af: 0 };

  /* ---- build country x month [actual, target] tables ---- */
  const TABLE = {}; // TABLE[year] = { totals:[12], rows: [countryIndex][month] = [a, t] }
  (function build() {
    // 2026: quarter values per country from its team's shape
    const q26 = COUNTRIES.map(c => {
      const s = SHAPE[c.shape], [a3, t3] = c.q3;
      const qs = s.map(([sa, st]) => [a3 * sa / s[2][0], t3 * st / s[2][1]]);
      qs.push([a3 / 3 * OCT_PACE[c.shape], t3 * 1.03]); // Q4: October actual only, the quarter's target
      return qs;
    });
    const tot26 = HISTORY[YEAR].slice();
    tot26.push(q26.reduce((s, q) => s + q[3][0], 0)); // October
    const rows26 = COUNTRIES.map((c, ci) => tot26.map((T, m) => {
      const q = Math.floor(m / 3), qa = q26.reduce((s, x) => s + x[q][0], 0);
      return q === 3 ? [q26[ci][3][0], q26[ci][3][1] / 3] : [T * q26[ci][q][0] / qa, q26[ci][q][1] / 3];
    }));
    TABLE[YEAR] = { totals: tot26, rows: rows26 };

    // archive years: Q3 2026 shares with a yearly drift, targets from a repeatable attainment pattern
    const baseA = COUNTRIES.reduce((s, c) => s + c.q3[0], 0);
    const contIx = id => CONTINENTS.findIndex(c => c.id === id);
    Object.keys(HISTORY).map(Number).filter(y => y < YEAR).forEach(y => {
      const back = YEAR - y;
      const w = COUNTRIES.map(c => c.q3[0] / baseA * (1 + DRIFT[c.cont] * back));
      const wSum = w.reduce((s, v) => s + v, 0);
      const totals = HISTORY[y];
      const rows = COUNTRIES.map((c, ci) => totals.map((T, m) => {
        const q = Math.floor(m / 3), k = contIx(c.cont);
        const qT = QUARTER_MONTHS[q].reduce((s, mm) => s + totals[mm], 0) * w[ci] / wSum;
        const att = 0.94 + ((k * 7 + back * 5 + q * 3) % 11) * 0.012;
        const tq = qT / att * (1 + ((ci % 3) - 1) * 0.015);
        return [T * w[ci] / wSum, tq / 3];
      }));
      TABLE[y] = { totals, rows };
    });
  })();

  /* ---- scope and sums ---- */
  // region: 'all' | continent id | 'c:<country name>'
  const inScope = (c, region) => region === 'all' || !region ? true : region.startsWith('c:') ? c.name === region.slice(2) : c.cont === region;
  function sum(region, year, months) {
    const t = TABLE[year]; let a = 0, g = 0;
    COUNTRIES.forEach((c, ci) => { if (inScope(c, region)) months.forEach(m => { const v = t.rows[ci][m]; if (v) { a += v[0]; g += v[1]; } }); });
    return { a, t: g };
  }
  function series(region, year, months) {
    const t = TABLE[year];
    return months.map(m => COUNTRIES.reduce((s, c, ci) => s + (inScope(c, region) && t.rows[ci][m] ? t.rows[ci][m][0] : 0), 0));
  }
  const monthsIn = y => (y === YEAR ? MONTHS_SO_FAR : 12);

  /* ---- date ranges. Every label carries its year, so Q3 2025 can't be mistaken for Q3 2026. ---- */
  function makeRange(year, kind) {
    const n = monthsIn(year), cur = year === YEAR;
    const r = { id: year + '-' + kind, year, kind, archived: !cur };
    if (kind === 'ytd' || kind === 'fy') {
      r.months = Array.from({ length: kind === 'fy' ? 12 : n }, (_, i) => i);
      r.label = kind === 'fy' ? 'Full year ' + year : year + ' to date';
      r.long = kind === 'fy' ? `Jan 1 to Dec 31, ${year}` : `Jan 1 to Oct 30, ${year}`;
      r.prev = { year: year - 1, months: r.months.slice() };
      r.compare = 'vs ' + (kind === 'fy' ? year - 1 : 'same period ' + (year - 1));
      return r;
    }
    const q = +kind.slice(1) - 1;
    r.q = q;
    r.months = QUARTER_MONTHS[q].filter(m => m < n);
    r.partial = r.months.length < 3;
    r.label = `Q${q + 1} ${year}`;
    r.long = r.partial ? `So far: Oct 1 to 30, ${year}` : `${MONTHS[r.months[0]]} to ${MONTHS[r.months[2]]} ${year}`;
    if (r.partial) { r.prev = { year: year - 1, months: r.months.slice() }; r.compare = `vs ${MONTHS[r.months[0]]} ${year - 1}`; }
    else if (q === 0) { r.prev = { year: year - 1, months: QUARTER_MONTHS[3] }; r.compare = `vs Q4 ${year - 1}`; }
    else { r.prev = { year, months: QUARTER_MONTHS[q - 1] }; r.compare = `vs Q${q}`; }
    return r;
  }
  const RANGES = ['q1', 'q2', 'q3', 'q4', 'ytd'].map(k => makeRange(YEAR, k))
    .concat(...ARCHIVE_YEARS.map(y => ['q1', 'q2', 'q3', 'q4', 'fy'].map(k => makeRange(y, k))));

  /* Pipelines. Status: running | succeeded | failed | scheduled. Step status adds pending | skipped.
     `inputs` lists the nodes that feed a step, so the canvas can draw a graph, not just a line. */
  const PIPELINES = [
    {
      id: 'regional_targets', name: 'Regional targets', status: 'failed', owner: 'Sara M.',
      schedule: { label: 'Daily at 06:00', time: '06:00', weekends: true },
      lastRun: { when: 'Today, 06:00', ago: '6h ago', duration: '4m 12s' }, next: 'Tomorrow, 06:00',
      failedAt: 's3', dataFrom: 'Oct 29',
      feeds: ['kpi_attainment', 'chart_sales_target'],
      history: ['ok', 'ok', 'ok', 'ok', 'fail', 'ok', 'ok', 'ok', 'ok', 'fail'],
      nodes: [
        { id: 's1', kind: 'step', type: 'read', name: 'Read Excel file', detail: 'Q3_regional_targets.xlsx', status: 'succeeded', time: '8s', rowsOut: 1240,
          config: [['Source', 'SharePoint, Finance folder'], ['File', 'Q3_regional_targets.xlsx'], ['Sheet', 'Targets'], ['Header row', '1']] },
        { id: 's2', kind: 'step', type: 'filter', name: 'Filter rows', detail: 'Region is not “Test”', status: 'succeeded', time: '1s', rowsOut: 1198, inputs: ['s1'],
          config: [['Keep rows where', 'Region is not “Test”'], ['Rows removed', '42']],
          edit: { type: 'exclude', label: 'Exclude rows where region is', value: 'Test', options: ['Test', 'Internal', 'Test or Internal'] } },
        { id: 'db1', kind: 'source', type: 'database', name: 'CRM database', detail: 'crm.sales_orders', status: 'idle', rowsOut: 86410 },
        { id: 's3', kind: 'step', type: 'join', name: 'Join with database', detail: 'Match on region_id', status: 'failed', time: '4m 02s', rowsOut: null, inputs: ['s2', 'db1'],
          config: [['Database', 'CRM (SQL Server)'], ['Table', 'crm.sales_orders'], ['Join', 'Keep all target rows (left join)'], ['Match on', 'region_id']],
          short: 'CRM was down for maintenance',
          error: 'Timed out after 240 seconds while reading crm.sales_orders. The CRM database was in maintenance from 05:45 to 06:30, and this run started at 06:00.',
          edit: { type: 'timeout', label: 'Wait for the database up to', value: 240, options: [240, 600, 900] } },
        { id: 's4', kind: 'step', type: 'transform', name: 'Calculate attainment', detail: 'Actual divided by target', status: 'pending', time: null, rowsOut: null, inputs: ['s3'],
          config: [['New column', 'attainment_pct'], ['Formula', 'actual_sales / target * 100'], ['Round to', '1 decimal']] },
        { id: 's5', kind: 'step', type: 'load', name: 'Load to dashboard', detail: 'Sales Overview dataset', status: 'pending', time: null, rowsOut: null, inputs: ['s4'],
          config: [['Destination', 'Sales Overview dataset'], ['Mode', 'Replace existing rows']] }
      ]
    },
    {
      id: 'customer_360', name: 'Customer 360', status: 'running', owner: 'Omar K.',
      schedule: { label: 'Daily at 11:55', time: '11:55', weekends: false },
      lastRun: { when: 'Today, 11:57', ago: 'Started 3 min ago', duration: '3m so far' }, next: 'Tomorrow, 11:55',
      runningAt: 's3', feeds: ['kpi_customers'],
      history: ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'fail', 'ok', 'ok', 'run'],
      nodes: [
        { id: 's1', kind: 'step', type: 'read', name: 'Read CSV file', detail: 'web_signups.csv', status: 'succeeded', time: '12s', rowsOut: 6210,
          config: [['Source', 'S3 bucket, exports'], ['File', 'web_signups.csv']] },
        { id: 'db1', kind: 'source', type: 'database', name: 'CRM database', detail: 'crm.customers', status: 'idle', rowsOut: 48200 },
        { id: 's2', kind: 'step', type: 'join', name: 'Join with database', detail: 'Match on email', status: 'succeeded', time: '1m 50s', rowsOut: 6188, inputs: ['s1', 'db1'],
          config: [['Table', 'crm.customers'], ['Match on', 'email']] },
        { id: 's3', kind: 'step', type: 'transform', name: 'Remove duplicates', detail: 'Keep the newest row per customer', status: 'running', time: '1m 04s', rowsOut: null, inputs: ['s2'],
          config: [['Key', 'customer_id'], ['Keep', 'Newest row']] },
        { id: 's4', kind: 'step', type: 'load', name: 'Load to dashboard', detail: 'Customer dataset', status: 'pending', time: null, rowsOut: null, inputs: ['s3'],
          config: [['Destination', 'Customer dataset']] }
      ]
    },
    {
      id: 'sales_daily', name: 'Daily sales', status: 'succeeded', owner: 'Sara M.',
      schedule: { label: 'Every 4 hours', time: 'every 4h', weekends: true },
      lastRun: { when: 'Today, 10:00', ago: '2h ago', duration: '2m 48s' }, next: 'Today, 14:00',
      feeds: ['kpi_revenue', 'chart_revenue_trend'],
      history: ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'],
      nodes: [
        { id: 's1', kind: 'step', type: 'database', name: 'Read database', detail: 'erp.orders, last 24 hours', status: 'succeeded', time: '41s', rowsOut: 18402,
          config: [['Database', 'ERP (PostgreSQL)'], ['Table', 'erp.orders']] },
        { id: 's2', kind: 'step', type: 'filter', name: 'Filter rows', detail: 'Status is “Completed”', status: 'succeeded', time: '2s', rowsOut: 17960, inputs: ['s1'],
          config: [['Keep rows where', 'Status is “Completed”']],
          edit: { type: 'status', label: 'Keep orders with status', value: 'Completed', options: ['Completed', 'Completed or Shipped'] } },
        { id: 's3', kind: 'step', type: 'transform', name: 'Convert currency', detail: 'To USD at the daily rate', status: 'succeeded', time: '1m 30s', rowsOut: 17960, inputs: ['s2'],
          config: [['Rates', 'ECB daily feed']] },
        { id: 's4', kind: 'step', type: 'load', name: 'Load to dashboard', detail: 'Sales Overview dataset', status: 'succeeded', time: '35s', rowsOut: 17960, inputs: ['s3'],
          config: [['Destination', 'Sales Overview dataset']] }
      ]
    },
    {
      id: 'marketing_spend', name: 'Marketing spend', status: 'failed', owner: 'Lina R.',
      schedule: { label: 'Daily at 07:00', time: '07:00', weekends: true },
      lastRun: { when: 'Today, 07:00', ago: '5h ago', duration: '9s' }, next: 'Tomorrow, 07:00',
      failedAt: 's1', dataFrom: 'Oct 30',
      feeds: ['kpi_adspend'],
      history: ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'fail'],
      nodes: [
        { id: 's1', kind: 'step', type: 'database', name: 'Read ad platform', detail: 'Campaign spend, last 24 hours', status: 'failed', time: '9s', rowsOut: null,
          config: [['Connection', 'Ads API, Marketing account'], ['Signed in as', 'marketing@company.com'], ['Fields', 'campaign, date, spend']],
          short: 'The ad platform login expired',
          error: 'The ad platform rejected the saved login. It expired on Oct 30, so no spend could be read. Someone with access to the Marketing account needs to sign in again.' },
        { id: 's2', kind: 'step', type: 'transform', name: 'Convert currency', detail: 'To USD at the daily rate', status: 'pending', time: null, rowsOut: null, inputs: ['s1'],
          config: [['Rates', 'ECB daily feed']] },
        { id: 's3', kind: 'step', type: 'load', name: 'Load to dashboard', detail: 'Marketing dataset', status: 'pending', time: null, rowsOut: null, inputs: ['s2'],
          config: [['Destination', 'Marketing dataset'], ['Mode', 'Append new days']] }
      ]
    },
    {
      id: 'inventory_sync', name: 'Inventory sync', status: 'scheduled', owner: 'Omar K.',
      schedule: { label: 'Daily at 02:00', time: '02:00', weekends: true },
      lastRun: { when: 'Yesterday, 02:00', ago: 'Yesterday', duration: '6m 30s' }, next: 'Tonight, 02:00',
      feeds: ['kpi_stock'],
      history: ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'],
      nodes: [
        { id: 's1', kind: 'step', type: 'read', name: 'Read Excel file', detail: 'warehouse_stock.xlsx', status: 'succeeded', time: '22s', rowsOut: 3420,
          config: [['Source', 'SharePoint, Operations folder'], ['File', 'warehouse_stock.xlsx']] },
        { id: 's2', kind: 'step', type: 'filter', name: 'Filter rows', detail: 'Quantity above 0', status: 'succeeded', time: '1s', rowsOut: 3105, inputs: ['s1'],
          config: [['Keep rows where', 'Quantity is above 0']] },
        { id: 's3', kind: 'step', type: 'load', name: 'Load to dashboard', detail: 'Stock dataset', status: 'succeeded', time: '5m 50s', rowsOut: 3105, inputs: ['s2'],
          config: [['Destination', 'Stock dataset']] }
      ]
    }
  ];

  /* Figures (KPIs). Each names the pipeline that feeds it, so freshness comes from pipeline status. */
  const KPIS = [
    { id: 'kpi_revenue', label: 'Revenue', source: 'sales_daily', kind: 'money', about: 'Completed orders in the date range' },
    { id: 'kpi_attainment', label: 'Target attainment', source: 'regional_targets', kind: 'pct', about: 'Sales as a share of target' },
    { id: 'kpi_customers', label: 'Active customers', source: 'customer_360', kind: 'count', about: 'Customers with an order in the last 90 days' },
    { id: 'kpi_adspend', label: 'Ad spend', source: 'marketing_spend', kind: 'money', about: 'Paid campaign spend in the date range' },
    { id: 'kpi_stock', label: 'Stock cover', source: 'inventory_sync', kind: 'days', about: 'Days of sales the warehouse stock covers' }
  ];
  const MAX_KPIS = 4;

  /* `kpis` is the default set of pinned figures. People pin more (up to 4) or unpin them. */
  const DASHBOARDS = [
    { id: 'sales', name: 'Sales Overview', charts: ['chart_sales_target', 'chart_revenue_trend'], kpis: ['kpi_revenue', 'kpi_attainment', 'kpi_adspend'] },
    { id: 'exec', name: 'Exec weekly', charts: ['chart_revenue_trend'], kpis: ['kpi_revenue'] }
  ];

  const SUGGESTIONS = [
    'Which regions missed their sales target last quarter?',
    'How did revenue trend this year?',
    'Why did Regional targets fail?'
  ];

  return {
    NOW_LABEL, YEAR, MONTHS, MONTH_NAMES, QUARTER_MONTHS, CONTINENTS, COUNTRIES, ARCHIVE_YEARS, RANGES,
    TABLE, inScope, sum, series, monthsIn, PIPELINES, KPIS, MAX_KPIS, DASHBOARDS, SUGGESTIONS
  };
})();
