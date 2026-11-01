/* Lightweight SVG charts: score ring and competency radar. */
(function (root) {
  const UXM = root.UXM;

  function scoreRing(score, size = 150) {
    const r = size / 2 - 10, c = 2 * Math.PI * r;
    const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Overall match ${score}%">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="12"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--tone)" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${dash} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${size / 5}" font-weight="700" fill="var(--text)">${score}%</text>
    </svg>`;
  }

  // Candidate evidence vs JD expectation per competency.
  function radar(rows, size = 340) {
    const cx = size / 2, cy = size / 2, R = size / 2 - 58, n = rows.length;
    const pt = (i, v) => {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      return [cx + Math.cos(a) * R * (v / 100), cy + Math.sin(a) * R * (v / 100)];
    };
    const poly = (vals) => vals.map((v, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
    let grid = '';
    for (const lv of [25, 50, 75, 100]) {
      grid += `<polygon points="${poly(rows.map(() => lv))}" fill="none" stroke="var(--border)" stroke-width="1"/>`;
    }
    let axes = '', labels = '';
    rows.forEach((r, i) => {
      const [x, y] = pt(i, 100);
      axes += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--border)"/>`;
      const [lx, ly] = pt(i, 122);
      const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end';
      labels += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="central" font-size="11" fill="var(--muted)">${r.short}</text>`;
    });
    return `<svg viewBox="-50 0 ${size + 100} ${size}" width="100%" style="max-width:${size + 100}px;display:block;margin:auto" role="img" aria-label="Competency radar">
      ${grid}${axes}
      <polygon points="${poly(rows.map((r) => r.expectation))}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 3"/>
      <polygon points="${poly(rows.map((r) => r.evidence))}" fill="var(--accent)" fill-opacity="0.22" stroke="var(--accent)" stroke-width="2"/>
      ${rows.map((r, i) => { const [x, y] = pt(i, r.evidence); return `<circle cx="${x}" cy="${y}" r="3" fill="var(--accent)"/>`; }).join('')}
      ${labels}
    </svg>`;
  }

  UXM.charts = { scoreRing, radar };
})(window);
