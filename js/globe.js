/* The region globe: a dot-matrix world on <canvas>, drawn by hand (no library, works from file://).
   It turns to show what you pick: Global, a continent, or a country. Drag to spin it.
   Motion explains the choice; with reduced motion it jumps straight there. */
window.Globe = (function () {
  'use strict';
  const G = window.GEO;
  const RAD = Math.PI / 180;
  const ease = t => 1 - Math.pow(1 - t, 3); // close to --ease-out
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function css(el, name, fallback) {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* mount(canvas) returns { show(contIndex, countryIndex), draw, destroy } */
  function mount(canvas) {
    const ctx = canvas.getContext('2d');
    const view = { lon: -20, lat: 20, zoom: 1 };
    let anim = null, sel = { cont: -1, country: -1 }, drag = null;
    const colors = {
      land: css(canvas, '--globe-land', '#b9c0cc'),
      on: css(canvas, '--primary', '#2f5bc2'),
      sea: css(canvas, '--globe-sea', '#ffffff'),
      rim: css(canvas, '--hairline', '#e2e6ee')
    };

    function size() {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      return { w, h, dpr };
    }

    function draw() {
      const { w, h, dpr } = size();
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 * 0.92 * view.zoom;
      const l0 = view.lon * RAD, p0 = view.lat * RAD, sp0 = Math.sin(p0), cp0 = Math.cos(p0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, Math.min(R, Math.hypot(w, h)), 0, Math.PI * 2);
      ctx.fillStyle = colors.sea; ctx.fill();
      ctx.lineWidth = dpr; ctx.strokeStyle = colors.rim; ctx.stroke();
      const base = Math.max(0.8 * dpr, R * 0.0135); // about a third of the dot spacing (2.4 degrees)
      const d = G.dots;
      const sel1 = [], sel2 = [];
      ctx.fillStyle = colors.land;
      ctx.beginPath();
      for (let i = 0; i < d.length; i += 4) {
        const lat = d[i] / 10 * RAD, lon = d[i + 1] / 10 * RAD;
        const cl = Math.cos(lat), dl = lon - l0;
        const cosc = sp0 * Math.sin(lat) + cp0 * cl * Math.cos(dl);
        if (cosc <= 0.02) continue;
        const x = cx + R * cl * Math.sin(dl), y = cy - R * (cp0 * Math.sin(lat) - sp0 * cl * Math.cos(dl));
        if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
        const r = base * (0.55 + 0.45 * cosc);
        const isC = sel.country >= 0 && d[i + 3] === sel.country, isK = sel.cont >= 0 && d[i + 2] === sel.cont;
        if (isC) { sel2.push(x, y, r); continue; }
        if (isK) { sel1.push(x, y, r); continue; }
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
      // the continent in primary, softened when a country inside it is picked
      ctx.fillStyle = colors.on;
      ctx.globalAlpha = sel.country >= 0 ? 0.35 : 1;
      ctx.beginPath();
      for (let i = 0; i < sel1.length; i += 3) { ctx.moveTo(sel1[i] + sel1[i + 2], sel1[i + 1]); ctx.arc(sel1[i], sel1[i + 1], sel1[i + 2], 0, Math.PI * 2); }
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      for (let i = 0; i < sel2.length; i += 3) { const r = sel2[i + 2] * 1.25; ctx.moveTo(sel2[i] + r, sel2[i + 1]); ctx.arc(sel2[i], sel2[i + 1], r, 0, Math.PI * 2); }
      ctx.fill();
      // a ring marks the picked country, so a one-dot country like Singapore is still easy to see
      if (sel.country >= 0) {
        const [la, lo] = G.countryFocus[sel.country];
        const lat = la * RAD, dl = lo * RAD - l0, cl = Math.cos(lat);
        if (sp0 * Math.sin(lat) + cp0 * cl * Math.cos(dl) > 0) {
          const x = cx + R * cl * Math.sin(dl), y = cy - R * (cp0 * Math.sin(lat) - sp0 * cl * Math.cos(dl));
          ctx.beginPath(); ctx.arc(x, y, 10 * dpr, 0, Math.PI * 2);
          ctx.lineWidth = 2 * dpr; ctx.strokeStyle = colors.on; ctx.stroke();
        }
      }
      ctx.restore();
    }

    function tween(to, ms) {
      cancelAnimationFrame(anim);
      if (reduce() || !ms) { Object.assign(view, to); draw(); return; }
      const from = Object.assign({}, view);
      let dLon = ((to.lon - from.lon + 540) % 360) - 180; // the short way round
      const t0 = performance.now();
      const step = now => {
        const k = ease(Math.min(1, (now - t0) / ms));
        view.lon = from.lon + dLon * k; view.lat = from.lat + (to.lat - from.lat) * k; view.zoom = from.zoom + (to.zoom - from.zoom) * k;
        draw();
        if (k < 1) anim = requestAnimationFrame(step); else anim = null;
      };
      anim = requestAnimationFrame(step);
    }

    /* show(region): 'all' | continent index | { cont, country } */
    function show(cont, country) {
      sel = { cont: cont == null ? -1 : cont, country: country == null ? -1 : country };
      let to;
      if (sel.country >= 0) { const [la, lo] = G.countryFocus[sel.country]; to = { lat: la, lon: lo, zoom: 1.5 }; }
      else if (sel.cont >= 0) { const [la, lo] = G.continentFocus[sel.cont]; to = { lat: la, lon: lo, zoom: 1.15 }; }
      else to = { lat: 20, lon: view.lon, zoom: 1 };
      tween(to, 650);
    }

    // drag to spin (pointer and touch); the picked region stays highlighted
    canvas.addEventListener('pointerdown', e => {
      cancelAnimationFrame(anim);
      drag = { x: e.clientX, y: e.clientY, lon: view.lon, lat: view.lat };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const k = 0.4 / view.zoom;
      view.lon = drag.lon - (e.clientX - drag.x) * k;
      view.lat = Math.max(-60, Math.min(70, drag.lat + (e.clientY - drag.y) * k));
      draw();
    });
    const end = () => { drag = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => draw()) : null;
    if (ro) ro.observe(canvas);
    draw();
    return { show, draw, destroy: () => { cancelAnimationFrame(anim); if (ro) ro.disconnect(); } };
  }

  return { mount };
})();
