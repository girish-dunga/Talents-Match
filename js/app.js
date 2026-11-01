/*
 * UI controller for practice resource fulfilment:
 * demand (JD) + resource profile → match details → share pack for the account team → resource pipeline.
 */
(function () {
  const UXM = window.UXM;
  const $ = (sel, el = document) => el.querySelector(sel);
  const STORE_KEY = 'uxm.assessments';
  const DRAFT_KEY = 'uxm.draft';
  const BENCH_KEY = 'uxm.bench';
  const BENCH_SEEDED_KEY = 'uxm.benchSeeded';
  const PIPELINE_SEEDED_KEY = 'uxm.pipelineSeeded';
  const GUIDE_KEY = 'uxm.guideOpen';
  const THEME_KEY = 'uxm.theme';
  const PIPE_VIEW_KEY = 'uxm.pipelineView';
  const REJECT_REASONS = ['Skills gap', 'Level / seniority mismatch', 'Availability or start date', 'Domain experience', 'Location', 'Cost / rate', 'Interview performance', 'Client chose another candidate', 'Demand cancelled', 'Other'];
  const NEXT_STATUS = { Shortlisted: 'Shared with account', 'Shared with account': 'Account interview', 'Account interview': 'Selected', Selected: 'Allocated' };
  const today = () => new Date().toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  const RES_STATUSES = ['Bench', 'Rolling off', 'Partially allocated', 'Allocated'];
  const MAX_UPLOAD = 15 * 1024 * 1024;
  const STATUSES = ['Shortlisted', 'Shared with account', 'Account interview', 'Selected', 'Allocated', 'Rejected', 'On hold'];
  const STATUS_TONE = { Shortlisted: 'good', 'Shared with account': 'strong', 'Account interview': 'strong', Selected: 'excellent', Allocated: 'excellent', Rejected: 'weak', 'On hold': 'moderate' };

  const state = {
    current: null, // { id, inputs, jd, profile, levelId, weightMode, customWeights, overrides, result, openRows, file, fileName }
    profileFile: null, // original résumé file from the latest upload
    pipelineFilter: { demand: '', account: '', resource: '', status: '' },
    summaryBy: 'demand', // pipeline summary grouping: demand | resource | account
    matchMode: 'bench', // 'bench' = rank the bench roster, 'single' = one uploaded profile
    include: new Set(['Bench', 'Rolling off', 'Partially allocated']),
    ranking: null,
    benchFilter: { q: '', level: '', status: '' },
    benchEditId: null,
    benchFile: null,
    compare: new Set(), // bench ids picked for side-by-side comparison
    showAllRanked: false,
    pipelineView: null, // 'board' | 'table'
    view: 'home',
    detailFrom: 'home', // the screen a match was opened from, for the back link
  };

  // ---------- utils ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; } },
  };
  const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;
  const chips = (list, cls, empty = '—') => (list.length ? list.map((t) => chip(t, cls)).join('') : `<span class="muted small">${empty}</span>`);
  const priorityLabel = { critical: 'Critical', important: 'Important', nice: 'Nice-to-have', none: 'Not mentioned' };
  const fmtDate = (iso) => (iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const isoIn = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
  const slug = (s) => String(s || '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  function downloadBlob(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Original résumé files live in IndexedDB (too large for localStorage).
  const fileStore = {
    db: null,
    open() {
      this.db = this.db || new Promise((resolve, reject) => {
        const req = indexedDB.open('uxm-files', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('files');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return this.db;
    },
    async run(mode, fn) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('files', mode);
        const req = fn(tx.objectStore('files'));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
      });
    },
    put(id, file) { return this.run('readwrite', (s) => s.put({ blob: file, name: file.name }, id)).catch(() => null); },
    get(id) { return this.run('readonly', (s) => s.get(id)).catch(() => null); },
    del(id) { return this.run('readwrite', (s) => s.delete(id)).catch(() => null); },
  };

  // ---------- navigation ----------
  // Match details ('results') is a detail page, not a tab: it opens from a person and keeps the tab it came from highlighted.
  function showView(id) {
    if (id === 'results' && !state.current) id = 'home';
    if (id === 'results' && state.view !== 'results') state.detailFrom = state.view;
    state.view = id;
    const tab = id === 'results' ? state.detailFrom : id;
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === tab)));
    ['home', 'assess', 'bench', 'results', 'pipeline', 'framework'].forEach((v) => $('#view-' + v).classList.toggle('hidden', v !== id));
    if (id === 'home') renderHome();
    if (id === 'assess') renderBenchPanel();
    if (id === 'bench') renderBench();
    if (id === 'results') renderResults();
    if (id === 'pipeline') renderPipeline();
    window.scrollTo({ top: 0 });
  }

  // ---------- inputs ----------
  const FIELDS = {
    demandId: '#demand-id', account: '#account', jdTitle: '#jd-title', location: '#demand-location', startDate: '#start-date',
    jdText: '#jd-text', name: '#cand-name', empId: '#emp-id', resStatus: '#res-status', availableFrom: '#available-from',
    years: '#cand-years', profileText: '#profile-text', levelChoice: '#level-choice', weightMode: '#weight-mode',
  };

  function readInputs() {
    const i = {};
    for (const k in FIELDS) i[k] = $(FIELDS[k]).value;
    for (const k of ['demandId', 'account', 'jdTitle', 'location', 'name', 'empId']) i[k] = i[k].trim();
    return i;
  }

  function writeInputs(i) {
    for (const k in FIELDS) {
      const el = $(FIELDS[k]);
      if (i[k] != null) el.value = i[k];
      else if (el.tagName !== 'SELECT') el.value = '';
    }
    if (!$('#level-choice').value) $('#level-choice').value = 'auto';
    if (!$('#weight-mode').value) $('#weight-mode').value = 'auto';
    if (!$('#res-status').value) $('#res-status').value = 'Bench';
  }

  function saveDraft() { store.set(DRAFT_KEY, readInputs()); }

  // ---------- run a match ----------
  // saved: a pipeline entry to reopen. extra: { inputs, benchId, fileName, navigate } for bench resources.
  function runAssessment(saved, extra = {}) {
    const inputs = saved ? saved.inputs : extra.inputs || readInputs();
    const err = $('#assess-error');
    err.textContent = '';
    if ((inputs.jdText || '').trim().length < 40) { err.textContent = 'Please upload or paste the job description for the demand.'; return false; }
    if ((inputs.profileText || '').trim().length < 40) { err.textContent = 'Please upload or paste the resource profile.'; return false; }

    const jd = UXM.analyzeJD(inputs.jdText, inputs.jdTitle);
    if (saved && saved.priorities) for (const id in saved.priorities) jd.competencies[id].priority = saved.priorities[id];
    const profile = UXM.analyzeProfile(inputs.profileText, inputs.years);
    state.current = {
      id: saved ? saved.id : null,
      inputs, jd, profile,
      levelId: saved ? saved.levelId : inputs.levelChoice === 'auto' ? jd.level : inputs.levelChoice,
      weightMode: saved ? saved.weightMode : inputs.weightMode,
      customWeights: saved ? saved.customWeights : null,
      overrides: saved ? saved.overrides || {} : {},
      openRows: new Set(),
      file: saved || extra.benchId ? null : state.profileFile,
      fileName: saved ? saved.fileName : extra.benchId ? extra.fileName : state.profileFile && state.profileFile.name,
      benchId: saved ? saved.benchId || null : extra.benchId || null,
    };
    recompute();
    if (extra.navigate !== false) showView('results');
    return true;
  }

  function currentWeights() {
    const c = state.current;
    if (c.weightMode === 'custom' && c.customWeights) return c.customWeights;
    if (UXM.WEIGHT_PRESETS[c.weightMode]) return { ...UXM.WEIGHT_PRESETS[c.weightMode].weights };
    return UXM.autoWeights(c.jd, c.levelId);
  }

  function recompute() {
    const c = state.current;
    c.result = UXM.evaluate(c.jd, c.profile, { levelId: c.levelId, weights: currentWeights(), overrides: c.overrides });
  }

  const resourceName = (i) => i.name || 'Unnamed resource';
  const roleName = (c) => c.inputs.jdTitle || c.result.level.name;

  // Availability against the demand's start date.
  function availability(i) {
    const notes = [];
    if (i.availableFrom && i.startDate && i.availableFrom > i.startDate) {
      const days = Math.round((new Date(i.availableFrom) - new Date(i.startDate)) / 86400000);
      notes.push(`Available ${days} day${days === 1 ? '' : 's'} after the required start date (${fmtDate(i.availableFrom)} vs ${fmtDate(i.startDate)})`);
    }
    if (i.resStatus === 'Allocated') notes.push('Resource is currently fully allocated — confirm release before proposing');
    return notes;
  }

  function availabilityText(i) {
    const when = i.availableFrom ? (i.availableFrom <= new Date().toISOString().slice(0, 10) ? 'Available now' : `Available from ${fmtDate(i.availableFrom)}`) : 'Availability not set';
    return `${i.resStatus || 'Bench'} · ${when}`;
  }

  // ---------- results ----------
  function renderResults() {
    const view = $('#view-results');
    const c = state.current;
    if (!c) {
      view.innerHTML = `<div class="card empty"><h2>No match yet</h2>
        <p class="muted">Open a person from the ranking or the pipeline to see their match.</p>
        <button class="btn btn-primary" data-action="go-assess">Start a new match</button></div>`;
      return;
    }
    const r = c.result;
    view.innerHTML = [
      actionsBar(c),
      checksCard(c, r),
      guideCard(c, r),
      summaryCard(c, r),
      breakdownCard(c, r),
      jdCard(c, r, c.jd),
      evidenceCard(r, c.profile),
      levelCard(c, r),
      gapsCard(r),
      recommendationsCard(r),
      roadmapCard(r),
    ].join('');
  }

  const BACK_LABEL = { home: 'Home', assess: 'ranking', bench: 'bench', pipeline: 'pipeline', framework: 'How it works' };

  function actionsBar(c) {
    const saved = c.id && store.get(STORE_KEY, []).find((x) => x.id === c.id);
    const i = c.inputs;
    return `<div class="detail-head">
      <div>
        <button class="btn-link back-link" data-action="back">← Back to ${BACK_LABEL[state.detailFrom] || 'Home'}</button>
        <h1 class="detail-title">${esc(resourceName(i))} <span class="arrow" aria-label="for">→</span> ${esc(roleName(c))}</h1>
        <div class="small muted">${esc([i.demandId, i.account].filter(Boolean).join(' · '))}${saved ? ` · In pipeline: <span class="tone-${STATUS_TONE[saved.status]}"><span class="status">${esc(saved.status)}</span></span>` : ' · Not in the pipeline yet'}${saved && saved.feedbackAt ? ` · Feedback sent to resource ${esc(fmtDate(saved.feedbackAt.slice(0, 10)))}` : ''}</div>
      </div>
      <div class="result-actions">
        ${!saved ? '<button class="btn btn-sm" data-action="save" title="Start tracking this person for this demand">+ Add to pipeline</button>'
          : unsavedChanges(c, saved).length ? '' : '<span class="saved-pill" title="The pipeline shows exactly this score and recommendation">✓ Saved in pipeline</span>'}
        <button class="btn btn-sm" data-action="export">Export JSON</button>
        <button class="btn btn-sm" data-action="share-resource" title="Send the resource feedback on what to improve for this demand">Send feedback to resource</button>
        <button class="btn btn-sm btn-primary" data-action="share">Share with account team →</button>
      </div></div>
      ${saved ? unsavedBar(c, saved) : ''}`;
  }

  // What differs between the match on screen and the copy saved in the pipeline.
  function unsavedChanges(c, saved) {
    const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
    const pri = {};
    for (const k in c.jd.competencies) pri[k] = c.jd.competencies[k].priority;
    const changes = [];
    if (!same(c.overrides && Object.keys(c.overrides).length ? c.overrides : null, saved.overrides && Object.keys(saved.overrides).length ? saved.overrides : null)) changes.push('skill score adjustments');
    if (saved.priorities && !same(pri, saved.priorities)) changes.push('JD priorities');
    if (c.weightMode !== saved.weightMode || !same(c.customWeights, saved.customWeights)) changes.push('weights');
    if (c.levelId !== saved.levelId) changes.push('assessed level');
    if (c.inputs.profileText !== saved.inputs.profileText) changes.push('profile (updated on the bench)');
    if (c.inputs.availableFrom !== saved.inputs.availableFrom) changes.push('available-from date');
    return changes;
  }

  function unsavedBar(c, saved) {
    const changes = unsavedChanges(c, saved);
    if (!changes.length) return '';
    const before = Math.round(saved.overall), after = Math.round(c.result.overall);
    const recChanged = saved.fulfilment !== c.result.fulfilment.action;
    return `<div class="unsaved-bar" role="status">
      <span class="unsaved-dot" aria-hidden="true"></span>
      <div><b>This match has changed — not saved yet.</b>
        <div class="small">${esc(changes.join(', ').replace(/^./, (m) => m.toUpperCase()))} changed${before !== after ? `, so the score moved <b>${before}% → ${after}%</b>` : ''}${recChanged ? ` and the recommendation is now <b>${esc(c.result.fulfilment.action)}</b>` : ''}. The pipeline card still shows ${before}%${recChanged ? ` and “${esc(saved.fulfilment)}”` : ''}.</div></div>
      <div class="result-actions">
        <button class="btn btn-sm" data-action="discard">Discard changes</button>
        <button class="btn btn-sm btn-primary" data-action="save">Save to pipeline</button>
      </div>
    </div>`;
  }

  const isDirty = () => {
    const c = state.current;
    const saved = c && c.id && store.get(STORE_KEY, []).find((x) => x.id === c.id);
    return !!(saved && unsavedChanges(c, saved).length);
  };

  const help = (text) => `<p class="help">${text}</p>`;

  // What the resource manager should do for each fulfilment recommendation.
  const NEXT_STEP = {
    'Propose to account': 'Share the profile with the account team now.',
    'Propose with ramp-up plan': 'Share the profile, and include a short plan for how the critical gap will be closed in the first weeks.',
    'Propose — validate gaps': 'Share the profile, but tell the account team about the gaps up front and check them in the interview.',
    'Consider with upskilling': 'Only propose if there is no better resource. Use "Send feedback to resource" so they can strengthen their profile, or look for a demand at the suggested level.',
    'Not suitable for this demand': 'Do not propose. Use "Fit across role levels" to find a demand that suits this resource better.',
  };

  // Plain-language reading of this result.
  function plainReading(c, r) {
    const name = esc(resourceName(c.inputs));
    const relevant = r.rows.filter((x) => x.priority !== 'none');
    const weakest = relevant.slice().sort((a, b) => a.match - b.match)[0];
    const strongest = r.rows.filter((x) => x.priority !== 'none' && x.match >= 80).sort((a, b) => b.weight - a.weight).slice(0, 3).map((x) => esc(x.name));
    const list = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0] || '');
    const gaps = r.criticalGaps.map((g) => esc(g.name));
    return [
      `<b>${name}</b> meets <b>${r.overall}%</b> of what this <b>${esc(roleName(c))}</b> demand asks for (fit band: <b>${esc(r.fit.label)}</b>).`,
      gaps.length
        ? `${r.overall >= 60 ? 'However, ' : ''}<b>${list(gaps)}</b> ${gaps.length > 1 ? 'are' : 'is'} critical for this demand and below ${UXM.CRITICAL_THRESHOLD}%${r.overall >= 60 ? ', so the result is conditional' : ''}.`
        : '',
      strongest.length ? `Strongest in what the JD asks for: ${list(strongest)}.` : '',
      weakest && weakest.match < 80 ? `Weakest JD area: ${esc(weakest.name)} (${weakest.match}%).` : '',
    ].filter(Boolean).join(' ');
  }

  // The decision as a path of six checks leading to the recommendation; each check links to its evidence.
  function matchChecks(c, r) {
    const i = c.inputs, jd = c.jd, p = c.profile;
    const idx = (id) => UXM.ROLE_LEVELS.findIndex((l) => l.id === id);
    const lvlDiff = idx(r.suggested.id) - idx(c.levelId);
    const avail = availability(i);
    const need = r.tools.required.length + r.domain.required.length;
    const have = r.tools.matched.length + r.domain.matched.length;
    const missingTD = [...r.domain.required.filter((x) => !r.domain.matched.includes(x)), ...r.tools.required.filter((x) => !r.tools.matched.includes(x))];
    return [
      { label: 'Skills match', target: 'sec-breakdown',
        state: r.overall >= 80 ? 'pass' : r.overall >= 60 ? 'warn' : 'fail',
        value: `${Math.round(r.overall)}%`, note: r.overall >= 80 ? 'Meets the demand' : r.overall >= 60 ? 'Some gaps' : 'Large gaps' },
      { label: 'Critical skills', target: 'sec-breakdown',
        state: r.criticalGaps.length ? 'fail' : 'pass',
        value: r.criticalGaps.length ? `${r.criticalGaps.length} missing` : 'All met', note: r.criticalGaps.length ? r.criticalGaps.map((g) => g.name).join(', ') : `None below ${UXM.CRITICAL_THRESHOLD}%` },
      { label: 'Level', target: 'sec-levels',
        state: lvlDiff === 0 ? 'pass' : lvlDiff === -1 || lvlDiff === 1 ? 'warn' : 'fail',
        value: lvlDiff === 0 ? 'Right level' : lvlDiff > 0 ? 'Above' : 'Below', note: `Reads as ${r.suggested.name}` },
      { label: 'Experience', target: 'sec-signals',
        state: jd.requiredYears == null || p.years >= jd.requiredYears ? 'pass' : p.years >= jd.requiredYears - 2 ? 'warn' : 'fail',
        value: `${p.years} yrs`, note: jd.requiredYears == null ? 'No minimum in JD' : `JD asks ${jd.requiredYears}+` },
      { label: 'Availability', target: 'sec-summary',
        state: i.resStatus === 'Allocated' ? 'fail' : avail.length ? 'warn' : 'pass',
        value: i.resStatus === 'Allocated' ? 'Allocated' : avail.length ? 'Late start' : 'On time', note: availabilityText(i) },
      { label: 'Domain & tools', target: 'sec-signals',
        state: !need || have === need ? 'pass' : have ? 'warn' : 'fail',
        value: need ? `${have}/${need}` : 'Not required', note: missingTD.length ? `Missing: ${missingTD.slice(0, 2).join(', ')}` : need ? 'All present' : 'JD names none' },
    ];
  }

  function checksCard(c, r) {
    const checks = matchChecks(c, r);
    const passed = checks.filter((x) => x.state === 'pass').length;
    const icon = { pass: '✓', warn: '!', fail: '✕' };
    return `<div class="card checks-card">
      <div class="card-head"><div><h2>Decision path</h2><span class="muted small">${passed} of ${checks.length} checks passed · click a check to see the evidence</span></div></div>
      <ol class="checks">
        ${checks.map((x) => `<li><button class="check ${x.state}" data-action="jump" data-target="${x.target}" title="${esc(x.note)}">
          <span class="check-icon" aria-label="${x.state === 'pass' ? 'Passed' : x.state === 'warn' ? 'Warning' : 'Failed'}">${icon[x.state]}</span>
          <span class="check-label">${esc(x.label)}</span>
          <b class="check-value">${esc(x.value)}</b>
          <span class="check-note">${esc(x.note)}</span></button></li>`).join('')}
        <li class="check-decision tone-${r.verdictTone}"><span class="small muted">Recommendation</span><b>${esc(r.fulfilment.action)}</b></li>
      </ol>
      <div class="guide-reading"><p>${plainReading(c, r)}</p>
        <p><b>Next step:</b> ${esc(NEXT_STEP[r.fulfilment.action] || r.fulfilment.detail)}</p></div>
    </div>`;
  }

  // Reference guide to the sections and terms on this page.
  function guideCard(c, r) {
    const sections = [
      ['sec-summary', 'Resource summary', 'The headline: overall match, fit band, the recommendation and any warnings.'],
      ['sec-breakdown', 'Competency breakdown', 'How the score was built, skill by skill. Click a row to see the résumé lines used as evidence.'],
      ['sec-demand', 'Demand analysis', 'What the app read from the JD and how much each skill counts. Change it if the JD was misread.'],
      ['sec-signals', 'Profile validation signals', 'Facts from the résumé: years, portfolio, tools, domain, leadership examples.'],
      ['sec-levels', 'Fit across levels', 'How the same person would score at other levels. Useful when they suit a different demand.'],
      ['sec-gaps', 'Gap analysis', 'What is missing for this demand: skills, experience and specific sub-skills.'],
      ['sec-recs', 'Recommendations', 'What to check in the account interview and what to upskill.'],
      ['sec-roadmap', 'Development roadmap', 'A 0–12 month plan to close the gaps or grow to the next level.'],
    ];
    const terms = [
      ['Evidence', 'How strongly the résumé shows a skill (0–100), from matching skills, ownership verbs ("led", "owned") and measured results.'],
      ['Expectation', 'The evidence this demand needs for that skill. Higher for senior levels and critical skills. Shown as the dashed mark on the bar.'],
      ['Match %', 'Evidence ÷ expectation, capped at 100%. 100% means the résumé meets or exceeds what the demand needs.'],
      ['Weight', 'How much a skill counts towards the overall score, based on how strongly the JD asks for it.'],
      ['Points', 'Match × weight: what each skill adds to the overall score.'],
      ['JD priority', 'Critical (must have), Important, Nice-to-have or Not mentioned, read from the JD wording.'],
      ['Critical gap', `A critical skill under ${UXM.CRITICAL_THRESHOLD}%. It makes the result a Conditional Fit whatever the overall score.`],
      ['Assessor adjustment', 'Your own correction of a skill score when you know the person better than the résumé shows. Not shown in the account report.'],
    ];
    const open = store.get(GUIDE_KEY, false);
    return `<details class="card guide" ${open ? 'open' : ''}>
      <summary><h2>How to read this page</h2><span class="muted small">${open ? 'Hide' : 'Show'} guide</span></summary>
      <div class="guide-body">
        <div class="grid grid-2">
          <div><h4>What each section tells you</h4>
            <ul class="guide-list">${sections.map(([id, t, d]) => `<li><button class="btn-link" data-action="jump" data-target="${id}">${t}</button> — ${d}</li>`).join('')}</ul></div>
          <div><h4>Key terms</h4>
            <dl class="guide-terms">${terms.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl></div>
        </div>
        <div><h4>Fulfilment recommendations and what to do</h4>
          <div class="table-scroll"><table class="guide-table"><tbody>${Object.entries(NEXT_STEP).map(([k, v]) => `<tr class="${k === r.fulfilment.action ? 'top-row' : ''}"><td><b>${k}</b></td><td>${v}</td></tr>`).join('')}</tbody></table></div></div>
      </div>
    </details>`;
  }

  function summaryCard(c, r) {
    const i = c.inputs, jd = c.jd, p = c.profile;
    const levelOpts = UXM.ROLE_LEVELS.map((l) => `<option value="${l.id}" ${l.id === c.levelId ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
    const yearsNote = { stated: 'stated', dates: 'from dates', entered: 'entered', none: 'not found' }[p.yearsSource];
    const allFlags = [...r.flags, ...availability(i)];
    const flags = allFlags.length || r.criticalGaps.length
      ? `<div class="flags">${r.criticalGaps.map((g) => `<div class="flag"><span><b>Critical skill gap:</b> ${esc(g.name)} is marked critical in the JD but matches only ${g.match}% (threshold ${UXM.CRITICAL_THRESHOLD}%).</span></div>`).join('')}
         ${allFlags.map((f) => `<div class="flag"><span>${esc(f)}</span></div>`).join('')}</div>`
      : '';
    const demandLine = [i.demandId, i.account].filter(Boolean).join(' · ');
    return `<div class="card tone-${r.verdictTone}" id="sec-summary">
      <div class="summary">
        <div>
          <h4>Resource summary</h4>
          <div class="summary-name">${esc(resourceName(i))}</div>
          <div class="small muted">${[i.empId, availabilityText(i)].filter(Boolean).map(esc).join(' · ')}</div>
          <dl class="kv">
            <dt>Demand</dt><dd>${esc(roleName(c))}${demandLine ? ` <span class="muted small">(${esc(demandLine)})</span>` : ''}</dd>
            ${i.startDate || i.location ? `<dt>Start / location</dt><dd>${esc([fmtDate(i.startDate), i.location].filter(Boolean).join(' · '))}</dd>` : ''}
            <dt>Assessed as</dt><dd><select data-action="level" style="width:auto;padding:2px 6px">${levelOpts}</select>
              <span class="muted small">${i.levelChoice === 'auto' && c.levelId === jd.level ? `(detected from ${jd.levelSource})` : ''}</span></dd>
            <dt>Experience</dt><dd>${p.years} yrs <span class="muted small">(${yearsNote}${jd.requiredYears != null ? ` · JD asks ${jd.requiredYears}+` : ''})</span></dd>
            <dt>Suggested level</dt><dd>${esc(r.suggested.name)}${r.suggested.alt ? ` <span class="muted small">· ${esc(r.suggested.alt)}-ready</span>` : ''}</dd>
            <dt>Role readiness</dt><dd>${r.readiness}</dd>
          </dl>
        </div>
        <div class="ring-wrap">${UXM.charts.scoreRing(r.overall)}<div class="ring-label">Overall match score</div></div>
        <div class="verdict">
          <div><span class="badge">${esc(r.verdict)}</span></div>
          <div class="small">Career readiness scale: <b>${esc(r.readinessScale)}</b></div>
          <div class="decision"><span class="small muted">Fulfilment recommendation</span><strong>${esc(r.fulfilment.action)}</strong><span class="small muted">${esc(r.fulfilment.detail)}</span></div>
          <div><h4 style="margin:4px 0 6px">Top strengths</h4>${chips(r.strengths.slice(0, 5), 'ok', 'No competency above 80% yet')}</div>
        </div>
      </div>
      ${flags}
    </div>`;
  }

  function breakdownCard(c, r) {
    const rows = r.rows.map((row) => {
      const open = c.openRows.has(row.id);
      const def = UXM.COMPETENCIES.find((x) => x.id === row.id);
      const subs = def.subskills.map((s) => {
        const found = row.raw.found[s.name];
        const req = row.jdSubskills.includes(s.name);
        return chip(s.name + (req ? ' ★' : ''), found ? 'ok' : req ? 'miss' : '');
      }).join('');
      const quotes = row.raw.examples.length
        ? row.raw.examples.map((q) => `<div class="quote">“${esc(q)}”</div>`).join('')
        : '<p class="muted small">No supporting evidence found in the profile.</p>';
      const detail = open ? `<tr class="detail"><td colspan="7">
          <div class="detail-grid">
            <div><h4>Sub-skills <span class="muted" style="text-transform:none;letter-spacing:0">(★ = in JD · green = evidenced)</span></h4>${subs}
              <p class="small muted" style="margin-top:8px">${row.raw.sentences} supporting statements · ${row.raw.ownership} ownership verbs · ${row.raw.outcomes} quantified outcomes</p></div>
            <div><h4>Evidence from profile</h4>${quotes}</div>
          </div>
          <div class="slider-row">
            <span>Assessor adjustment:</span>
            <input type="range" min="0" max="100" value="${row.evidence}" data-action="override" data-id="${row.id}" aria-label="Evidence score for ${esc(row.name)}">
            <b data-out="${row.id}">${row.evidence}</b>
            ${row.overridden ? `<button class="btn-link" data-action="reset-override" data-id="${row.id}">reset to ${row.autoEvidence}</button>` : '<span class="muted small">auto</span>'}
          </div>
        </td></tr>` : '';
      return `<tr class="comp-row ${open ? 'open' : ''}" data-action="toggle-row" data-id="${row.id}">
          <td><span class="caret">▸</span><span class="comp-name">${esc(row.name)}</span>${row.overridden ? ' <span class="chip">adjusted</span>' : ''}</td>
          <td class="hide-sm">${chip(priorityLabel[row.priority], 'p-' + row.priority)}</td>
          <td class="num">${row.weight}%</td>
          <td class="hide-sm" title="Evidence ${row.evidence} vs JD expectation ${row.expectation}">
            <div class="bar"><span style="width:${row.evidence}%;--tone:var(--accent)"></span><i class="mark" style="left:${row.expectation}%"></i></div></td>
          <td class="tone-${row.status.tone}"><div class="bar-cell"><div class="bar"><span style="width:${row.match}%"></span></div><b>${row.match}%</b></div></td>
          <td class="num hide-sm">${row.contribution}</td>
          <td class="tone-${row.status.tone}"><span class="status">${row.status.label}</span></td>
        </tr>${detail}`;
    }).join('');
    return `<div class="breakdown" id="sec-breakdown">
      <div class="card">
        <div class="card-head"><h2>Competency breakdown</h2><span class="muted small">Click a row for evidence &amp; adjustment</span></div>
        ${help('Each row is one UX skill area. The <b>Evidence vs expectation</b> bar compares what the résumé shows (filled) with what this demand needs (dashed mark). Green status means the resource meets the need; amber or red means a gap.')}
        <div class="table-scroll"><table>
          <thead><tr><th>Competency</th><th class="hide-sm" title="How strongly the JD asks for this skill">JD priority</th><th class="num" title="How much this skill counts towards the overall score">Weight</th><th class="hide-sm" title="Filled bar: résumé evidence. Dashed mark: what the demand needs">Evidence vs expectation</th><th title="Evidence ÷ expectation, capped at 100%">Match</th><th class="num hide-sm" title="Match × weight: what this skill adds to the overall score">Points</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td colspan="2" class="hide-sm"></td><td class="num"><b>${Math.round(r.rows.reduce((a, x) => a + x.weight, 0))}%</b></td><td class="hide-sm"></td><td><b>Overall ${r.overall}%</b></td><td class="hide-sm"></td><td></td></tr></tfoot>
        </table></div>
        <p class="small muted" style="margin-top:10px">Match % = min(100, Resource evidence ÷ JD expectation) · Overall = Σ(Match × Weight). Expectation rises with role level and JD priority.</p>
      </div>
      <div class="card">
        <h2 style="margin-bottom:8px">Competency profile</h2>
        ${help('The shaded shape is the resource; the dashed outline is the demand. Where the shape falls inside the outline, there is a gap.')}
        ${UXM.charts.radar(r.rows)}
        <div class="legend"><span><i style="background:var(--accent);opacity:.6"></i>Resource evidence</span><span><i style="border:1.5px dashed var(--muted)"></i>JD expectation</span></div>
      </div>
    </div>`;
  }

  function jdCard(c, r, jd) {
    const byP = (p) => UXM.COMPETENCIES.filter((x) => jd.competencies[x.id].priority === p).map((x) => x.name);
    const presetOpts = [['auto', 'Dynamic — derived from JD'], ...Object.entries(UXM.WEIGHT_PRESETS).map(([k, v]) => [k, v.name]), ...(c.weightMode === 'custom' ? [['custom', 'Custom (edited)']] : [])]
      .map(([k, v]) => `<option value="${k}" ${k === c.weightMode ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const total = r.rows.reduce((a, x) => a + x.weight, 0);
    const wrows = r.rows.map((row) => `<tr>
        <td>${esc(row.name)}</td>
        <td><select data-action="priority" data-id="${row.id}">${UXM.PRIORITY_NAMES.slice().reverse().map((p) => `<option value="${p}" ${p === row.priority ? 'selected' : ''}>${priorityLabel[p]}</option>`).join('')}</select></td>
        <td class="num"><input type="number" min="0" max="100" step="0.5" value="${row.weight}" data-action="weight" data-id="${row.id}" aria-label="Weight for ${esc(row.name)}"></td>
      </tr>`).join('');
    return `<div class="card" id="sec-demand">
      <div class="card-head"><h2>Demand analysis &amp; dynamic weighting</h2></div>
      ${help('What the app understood from the JD. Skills the JD stresses get more weight. If something was misread, change the priority or weight on the right — the score updates immediately.')}
      <div class="grid grid-2">
        <div>
          <dl class="kv" style="margin-top:0">
            <dt>Detected level</dt><dd>${esc(UXM.levelById(jd.level).name)} <span class="muted small">(from ${jd.levelSource})</span></dd>
            <dt>Required experience</dt><dd>${jd.requiredYears != null ? jd.requiredYears + '+ years' : 'Not stated'}</dd>
            <dt>Industry</dt><dd>${jd.industries.length ? jd.industries.map(esc).join(', ') : 'Not specified'}</dd>
            <dt>AI / innovation</dt><dd>${jd.aiRequired ? 'Required or preferred' : 'Not mentioned'}</dd>
          </dl>
          <div style="margin-top:16px"><h4>Primary skills (critical)</h4>${chips(byP('critical'), 'p-critical')}</div>
          <div style="margin-top:10px"><h4>Secondary skills (important)</h4>${chips(byP('important'), 'p-important')}</div>
          <div style="margin-top:10px"><h4>Nice-to-have</h4>${chips([...byP('nice'), ...jd.extras.filter((e) => e.priority === 'nice').map((e) => e.name)], 'p-nice')}</div>
          <div style="margin-top:10px"><h4>Leadership expectations</h4>${chips(jd.leadershipExpectations, '', 'None stated')}</div>
          <div style="margin-top:10px"><h4>Tools</h4>${chips(jd.tools, '', 'None stated')}</div>
        </div>
        <div>
          <div class="field" style="margin-bottom:8px"><label>Weighting model</label><select data-action="preset">${presetOpts}</select></div>
          <div class="table-scroll"><table class="weights-table">
            <thead><tr><th>Competency</th><th>Priority</th><th class="num">Weight %</th></tr></thead>
            <tbody>${wrows}</tbody>
          </table></div>
          <p class="weight-total muted" style="margin-top:8px">Total ${Math.round(total * 10) / 10}% — scores are normalised, so weights needn't sum to exactly 100.</p>
        </div>
      </div>
    </div>`;
  }

  function evidenceCard(r, p) {
    const s = p.signals;
    const tile = (v, k) => `<div class="tile"><div class="v">${v}</div><div class="k">${k}</div></div>`;
    const extraChips = (all, req) => all.filter((t) => !req.includes(t)).map((t) => chip(t)).join('');
    return `<div class="card" id="sec-signals">
      <div class="card-head"><h2>Profile validation signals</h2></div>
      ${help('Facts found in the résumé that back up the scores. Green chips are tools or domains the JD asks for and the resource has; red ones are asked for but missing.')}
      <div class="tiles">
        ${tile(p.years + ' yrs', 'Years of experience')}
        ${tile(s.portfolio ? (s.caseStudies ? s.caseStudies + '×' : 'Yes') : 'No', 'Portfolio / case studies')}
        ${tile(r.tools.required.length ? `${r.tools.matched.length}/${r.tools.required.length}` : p.tools.length, r.tools.required.length ? 'JD tools matched' : 'Tools listed')}
        ${tile(r.domain.required.length ? `${r.domain.matched.length}/${r.domain.required.length}` : (p.industries.length || '—'), r.domain.required.length ? 'Domain match' : 'Domains in profile')}
        ${tile(s.leadershipExamples, 'Leadership examples')}
        ${tile(s.designSystemOwnership ? 'Yes' : 'No', 'Design system ownership')}
        ${tile(s.researchMethods, 'Research &amp; testing methods')}
        ${tile(s.quantifiedOutcomes, 'Quantified outcomes')}
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div><h4>Tools</h4>${r.tools.required.map((t) => chip(t, r.tools.matched.includes(t) ? 'ok' : 'miss')).join('')}${extraChips(p.tools, r.tools.required) || (r.tools.required.length ? '' : '<span class="muted small">None found</span>')}</div>
        <div><h4>Domain expertise</h4>${r.domain.required.map((t) => chip(t, r.domain.matched.includes(t) ? 'ok' : 'miss')).join('')}${extraChips(p.industries, r.domain.required) || (r.domain.required.length ? '' : '<span class="muted small">None found</span>')}</div>
      </div>
    </div>`;
  }

  function levelCard(c, r) {
    const hbar = (name, score, current) => {
      const tone = UXM.FIT_BANDS.find((b) => score >= b.min).tone;
      return `<div class="hbar tone-${tone} ${current ? 'current' : ''}"><span class="hbar-name">${esc(name)}${current ? ' ●' : ''}</span>
        <div class="bar"><span style="width:${score}%"></span></div><b class="num">${Math.round(score)}%</b></div>`;
    };
    return `<div class="grid grid-2" id="sec-levels">
      <div class="card">
        <h2>Fit across role levels</h2>
        <p class="small muted" style="margin:4px 0 10px">Same demand priorities, with expectations scaled to each level — useful for finding a better-suited demand.</p>
        ${r.levelFit.map((l) => hbar(l.name, l.score, l.id === c.levelId)).join('')}
      </div>
      <div class="card">
        <h2>Fit across role archetypes</h2>
        <p class="small muted" style="margin:4px 0 10px">The same profile scored against the framework's example weightings.</p>
        ${r.archetypes.map((a) => hbar(a.name, a.score, false)).join('')}
      </div>
    </div>`;
  }

  function gapsCard(r) {
    const g = r.gaps;
    const exp = g.experienceGaps.map((e) => e.name);
    if (g.yearsGap > 0) exp.unshift(`${g.yearsGap} more years of experience`);
    return `<div class="card" id="sec-gaps">
      <div class="card-head"><h2>Gap analysis</h2></div>
      ${help('What this resource is missing for this demand. Missing skills are JD areas below the expected level; sub-skills are specific items the JD names that the résumé never mentions — they may exist but be undocumented, so check them in the interview.')}
      <div class="grid grid-3">
        <div><h4>Missing skills</h4>${chips(g.missingSkills.map((e) => e.name), 'miss', 'No JD skill gaps')}
          ${g.growthAreas.length ? `<h4 style="margin-top:14px">Worth developing</h4>${chips(g.growthAreas.map((e) => e.name))}` : ''}</div>
        <div><h4>Experience gaps</h4>${chips(exp, 'miss', 'No experience gaps')}</div>
        <div><h4>JD sub-skills not evidenced</h4>${g.missingSubskills.length
          ? `<ul class="list-plain">${g.missingSubskills.map((m) => `<li><b>${esc(m.competency)}:</b> ${m.items.map(esc).join(', ')}</li>`).join('')}</ul>`
          : '<span class="muted small">All JD sub-skills evidenced</span>'}</div>
      </div>
    </div>`;
  }

  function recommendationsCard(r) {
    return `<div class="grid grid-2" id="sec-recs">
      <div class="card">
        <h2>Immediate recommendations</h2>
        ${help('Actions to take before or while proposing this resource.')}
        ${r.recommendations.immediate.length ? `<ol class="list">${r.recommendations.immediate.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '<p class="muted">No immediate actions — profile meets the demand’s expectations.</p>'}
      </div>
      <div class="card">
        <h2>Upskilling recommendations</h2>
        ${help('Training or practice that would close the gaps. "Prep for account interview" lists topics the account is likely to probe.')}
        <div style="margin-top:10px">${chips(r.recommendations.upskilling, '', 'None')}</div>
        ${r.interviewFocus.length ? `<h4 style="margin-top:18px">Prep for account interview</h4>${chips(r.interviewFocus, 'p-important')}` : ''}
      </div>
    </div>`;
  }

  function roadmapCard(r) {
    if (!r.roadmap.length) return '';
    return `<div class="card" id="sec-roadmap">
      <div class="card-head"><h2>Resource development roadmap</h2><span class="muted small">Current: ${esc(r.suggested.name)}</span></div>
      ${help('A suggested plan to discuss with the resource and their line manager — first the gaps for this demand, then growth towards the next level.')}
      <div class="timeline">${r.roadmap.map((ph) => `<div class="phase"><div class="period">${ph.period}</div><h3>${esc(ph.title)}</h3>
        <ul class="list">${ph.items.map((i) => `<li class="small">${esc(i)}</li>`).join('')}</ul></div>`).join('')}</div>
    </div>`;
  }

  // ---------- results interactions ----------
  function onResultsClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    const c = state.current;
    switch (el.dataset.action) {
      case 'go-assess': showView('assess'); break;
      case 'toggle-row':
        c.openRows.has(el.dataset.id) ? c.openRows.delete(el.dataset.id) : c.openRows.add(el.dataset.id);
        renderResults();
        break;
      case 'reset-override':
        delete c.overrides[el.dataset.id];
        recompute(); renderResults();
        break;
      case 'save': {
        const wasSaved = !!c.id;
        saveCurrent();
        toast(wasSaved ? 'Changes saved — the pipeline card now shows the new score' : `${resourceName(c.inputs)} added to the pipeline as Shortlisted`);
        break;
      }
      case 'discard': openSaved(c.id, true); toast('Showing the saved version'); break;
      case 'export':
        downloadBlob(`match-${slug(c.inputs.demandId || roleName(c))}-${slug(resourceName(c.inputs))}.json`,
          new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' }));
        break;
      case 'share': openShare(); break;
      case 'share-resource': openShare('resource'); break;
      case 'back':
        if (isDirty() && !confirm('You have unsaved changes to this match. Leave without saving them to the pipeline?')) break;
        showView(state.detailFrom);
        break;
      case 'jump': document.getElementById(el.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
    }
  }

  function onResultsChange(e) {
    const el = e.target, c = state.current, id = el.dataset.id;
    switch (el.dataset.action) {
      case 'level': c.levelId = el.value; break;
      case 'preset':
        c.weightMode = el.value;
        if (el.value !== 'custom') c.customWeights = null;
        break;
      case 'priority': c.jd.competencies[id].priority = el.value; break;
      case 'weight':
        c.customWeights = { ...currentWeights(), [id]: Math.max(0, +el.value || 0) };
        c.weightMode = 'custom';
        break;
      case 'override': c.overrides[id] = +el.value; break;
      default: return;
    }
    recompute();
    renderResults();
  }

  function onResultsInput(e) {
    if (e.target.dataset.action === 'override') {
      const out = document.querySelector(`[data-out="${e.target.dataset.id}"]`);
      if (out) out.textContent = e.target.value;
    }
  }

  function exportData() {
    const c = state.current, r = c.result, i = c.inputs;
    return {
      demand: { id: i.demandId, account: i.account, role: roleName(c), location: i.location, requiredStart: i.startDate },
      resource: { name: i.name, employeeId: i.empId, status: i.resStatus, availableFrom: i.availableFrom, years: c.profile.years },
      assessedLevel: r.level.name,
      overallMatch: r.overall,
      verdict: r.verdict,
      readiness: r.readiness,
      careerReadiness: r.readinessScale,
      fulfilmentRecommendation: r.fulfilment,
      suggestedLevel: r.suggested.name,
      flags: [...r.flags, ...availability(i)],
      competencies: r.rows.map((x) => ({ competency: x.name, jdPriority: x.priority, weight: x.weight, evidence: x.evidence, expectation: x.expectation, match: x.match, status: x.status.label, adjusted: x.overridden })),
      gaps: { missingSkills: r.gaps.missingSkills.map((e) => e.name), experienceGaps: r.gaps.experienceGaps.map((e) => e.name), missingSubskills: r.gaps.missingSubskills },
      recommendations: r.recommendations,
      roadmap: r.roadmap,
      generatedAt: new Date().toISOString(),
    };
  }

  // ---------- pipeline storage ----------
  function saveCurrent() {
    const c = state.current, r = c.result;
    const list = store.get(STORE_KEY, []);
    const id = c.id || 'a' + Date.now().toString(36);
    const prev = list.find((x) => x.id === id);
    const priorities = {};
    for (const k in c.jd.competencies) priorities[k] = c.jd.competencies[k].priority;
    const entry = {
      id, savedAt: new Date().toISOString(),
      name: resourceName(c.inputs), role: roleName(c), levelId: c.levelId,
      overall: r.overall, verdict: r.verdict, tone: r.verdictTone, readiness: r.readiness, fulfilment: r.fulfilment.action,
      status: prev ? prev.status : 'Shortlisted', history: prev ? prev.history : [{ status: 'Shortlisted', at: new Date().toISOString() }],
      fileName: c.fileName || (prev && prev.fileName) || null,
      benchId: c.benchId || null,
      inputs: c.inputs, weightMode: c.weightMode, customWeights: c.customWeights, overrides: c.overrides, priorities,
    };
    prev ? list.splice(list.indexOf(prev), 1, entry) : list.push(entry);
    if (!store.set(STORE_KEY, list)) toast('Could not save — browser storage is unavailable or full');
    if (c.file) fileStore.put(id, c.file);
    c.id = id;
    updateCount();
    if (!$('#view-results').classList.contains('hidden')) renderResults();
    return entry;
  }

  function setStatus(id, status, reject) {
    const list = store.get(STORE_KEY, []);
    const entry = list.find((x) => x.id === id);
    if (!entry || entry.status === status) return;
    entry.status = status;
    entry.history = [...(entry.history || []), { status, at: new Date().toISOString(), ...(reject && reject.reason ? { reason: reject.reason } : {}) }];
    if (status === 'Rejected') { entry.rejectReason = (reject && reject.reason) || ''; entry.rejectNote = (reject && reject.note) || ''; }
    store.set(STORE_KEY, list);
    // An allocation takes the resource off the bench.
    if (status === 'Allocated' && entry.benchId) {
      const bench = loadBench();
      const res = bench.find((r) => r.id === entry.benchId);
      if (res && res.status !== 'Allocated') {
        res.status = 'Allocated';
        saveBench(bench);
        toast(`${res.name} is now marked Allocated on the bench`);
        return true;
      }
    }
  }

  function updateCount() {
    const n = store.get(STORE_KEY, []).length;
    $('#pipe-count').textContent = n || '';
    $('#pipe-count').classList.toggle('hidden', !n);
    const b = store.get(BENCH_KEY, []).filter((r) => r.status !== 'Allocated').length;
    $('#bench-count').textContent = b || '';
    $('#bench-count').classList.toggle('hidden', !b);
  }

  // ---------- share with account team ----------
  function shareMessage(c) {
    const i = c.inputs, r = c.result;
    const strengths = r.rows.filter((x) => x.match >= 80).sort((a, b) => b.match - a.match).slice(0, 4).map((x) => x.name);
    const gaps = [...r.criticalGaps, ...r.rows.filter((x) => x.match < 70 && x.priority !== 'none' && !r.criticalGaps.includes(x))].slice(0, 3);
    const demandRef = [i.demandId, roleName(c), i.account].filter(Boolean).join(' – ');
    const subject = `Resource proposal: ${resourceName(i)} for ${demandRef}`;
    const lines = [
      'Hi team,',
      '',
      `Please find the proposed profile for ${i.demandId ? 'demand ' + i.demandId : 'your open demand'} (${roleName(c)}${i.account ? ', ' + i.account : ''}).`,
      '',
      `Resource: ${resourceName(i)}${i.empId ? ' (' + i.empId + ')' : ''}`,
      `Experience: ${c.profile.years} years · Assessed for ${r.level.name}`,
      `Availability: ${availabilityText(i)}${i.startDate ? ' (demand start ' + fmtDate(i.startDate) + ')' : ''}`,
      `Profile match: ${r.overall}% — ${r.verdict}`,
      '',
      strengths.length ? `Key strengths: ${strengths.join(', ')}.` : null,
      gaps.length ? `Development areas: ${gaps.map((g) => g.name).join(', ')} — a ramp-up plan is included in the attached report.` : 'No significant gaps against the demand requirements.',
      '',
      `${c.file || c.fileName ? 'The detailed profile match report and résumé are attached.' : 'The detailed profile match report (including the résumé) is attached.'} Happy to set up a discussion with the resource.`,
      '',
      'Regards,',
    ].filter((l) => l !== null);
    return { subject, body: lines.join('\n') };
  }

  // Original résumé: uploaded this session → saved with the pipeline entry → stored on the bench resource.
  async function getOriginalFile(c) {
    if (c.file) return c.file;
    for (const key of [c.id, c.benchId && 'bench:' + c.benchId]) {
      const rec = key && (await fileStore.get(key));
      if (rec) return new File([rec.blob], rec.name);
    }
    return null;
  }

  async function hasOriginalFile(c) {
    return !!(await getOriginalFile(c));
  }

  const SHARE_TEXT = {
    account: {
      title: 'Share with account team',
      desc: 'Propose this resource for the demand. The report leaves out internal-only details (assessor adjustments, weighting, interview probes).',
      to: 'Account team email(s)', placeholder: 'name@company.com; another@company.com',
      option: 'Include the résumé text as an appendix in the PDF report',
      pdf: '① Download profile report (PDF)', email: '③ Open email draft',
      hint: 'Email drafts can’t carry attachments automatically — attach the downloaded report and résumé before sending. Sharing marks the resource as “Shared with account” in the pipeline.',
    },
    resource: {
      title: 'Send feedback to the resource',
      desc: 'Help the resource strengthen their profile for this demand: what already matches, what to work on, and quick fixes to how their experience is written up. It leaves out internal details such as other candidates, ranking and the fit verdict.',
      to: 'Resource email', placeholder: 'firstname.lastname@company.com',
      option: 'Mention the account name',
      pdf: '① Download feedback report (PDF)', email: '② Open email draft',
      hint: 'Attach the feedback report before sending. When the resource sends an updated profile, update it on the Bench (Edit) — opening this match again will use it and show how the score moved.',
    },
  };

  async function openShare(audience = 'account') {
    $('#share-to').value = '';
    $('#share-dialog').showModal();
    await setShareAudience(audience);
  }

  async function setShareAudience(audience) {
    const c = state.current, t = SHARE_TEXT[audience];
    state.shareAudience = audience;
    document.querySelectorAll('[data-audience]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.audience === audience)));
    $('#share-title').textContent = t.title;
    $('#share-desc').textContent = t.desc;
    $('#share-to-label').textContent = t.to;
    $('#share-to').placeholder = t.placeholder;
    $('#share-option-text').textContent = t.option;
    $('#share-option').checked = true;
    $('#share-pdf-btn').textContent = t.pdf;
    $('#share-email-btn').textContent = t.email;
    $('#share-hint').textContent = t.hint;
    fillShareMessage();
    const btn = $('#share-resume-btn');
    btn.classList.toggle('hidden', audience === 'resource');
    if (audience === 'resource') return;
    btn.disabled = true;
    const has = await hasOriginalFile(c);
    btn.disabled = !has;
    btn.title = has ? c.fileName || '' : 'No original file — the résumé was pasted as text. The PDF report can include it as an appendix.';
  }

  function fillShareMessage() {
    const c = state.current;
    const { subject, body } = state.shareAudience === 'resource' ? feedbackMessage(c, $('#share-option').checked) : shareMessage(c);
    $('#share-subject').value = subject;
    $('#share-body').value = body;
  }

  // ---------- feedback for the resource ----------
  const firstName = (i) => resourceName(i).split(/\s+/)[0];
  const gentleFit = (overall) => (overall >= 80 ? 'Strong match' : overall >= 60 ? 'Good foundation — some gaps to close' : 'Several gaps to close');

  // Skill areas the demand asks for where the profile falls short, most important first.
  function workOn(r) {
    const rank = { critical: 0, important: 1, nice: 2 };
    return r.rows.filter((x) => x.priority !== 'none' && x.match < 80)
      .sort((a, b) => rank[a.priority] - rank[b.priority] || a.match - b.match);
  }

  // Concrete fixes to how the profile is written; experience that isn't written down can't be matched.
  function profileTips(c) {
    const r = c.result, p = c.profile, s = p.signals;
    const tips = [];
    const ownership = r.rows.reduce((a, x) => a + x.raw.ownership, 0);
    const missTools = r.tools.required.filter((t) => !r.tools.matched.includes(t));
    const missDomain = r.domain.required.filter((t) => !r.domain.matched.includes(t));
    r.gaps.missingSubskills.slice(0, 4).forEach((g) => tips.push(`${g.competency}: the role mentions ${g.items.join(', ')}. If you have done this, add one example and what changed as a result.`));
    if (s.quantifiedOutcomes < 3) tips.push(`Add measurable results, e.g. "cut checkout drop-off by 18%" or "task success rose from 62% to 85%". Your profile has ${s.quantifiedOutcomes} today.`);
    if (ownership < 6) tips.push('Say what you personally did — use verbs like "led", "owned", "designed", "ran" rather than "involved in" or "supported".');
    if (!s.portfolio) tips.push('Add a portfolio link with 2–3 case studies that show your process and outcomes.');
    if (missTools.length) tips.push(`If you use ${missTools.join(', ')}, list ${missTools.length > 1 ? 'them' : 'it'} in a tools section — the role asks for ${missTools.length > 1 ? 'them' : 'it'}.`);
    if (missDomain.length) tips.push(`If you have worked in ${missDomain.join(' or ')}, say so explicitly.`);
    if (p.yearsSource === 'none') tips.push('State your total years of UX experience near the top.');
    return tips;
  }

  function feedbackMessage(c, withAccount) {
    const i = c.inputs, r = c.result;
    const role = `${roleName(c)} role${withAccount && i.account ? ` at ${i.account}` : ''}`;
    const strengths = r.rows.filter((x) => x.priority !== 'none' && x.match >= 80).sort((a, b) => b.weight - a.weight).slice(0, 3).map((x) => x.name);
    const areas = workOn(r).slice(0, 3);
    const tips = profileTips(c).slice(0, 3);
    const lines = [
      `Hi ${firstName(i)},`,
      '',
      `You're being considered for the ${role}${i.demandId ? ` (${i.demandId})` : ''}. I've compared your profile with what the role asks for — the full feedback report is attached.`,
      '',
      strengths.length ? `Where you already match well: ${strengths.join(', ')}.` : null,
      areas.length ? 'What to work on:' : 'Your profile covers what the role asks for — just a few small improvements below.',
      ...areas.map((x, n) => `${n + 1}. ${x.name} — ${UXM.ACTIONS[x.id]}`),
      tips.length ? '' : null,
      tips.length ? 'Quick updates to your profile that would help:' : null,
      ...tips.map((t) => `- ${t}`),
      '',
      `Please update your profile with anything you've already done but haven't written down, and send it back to me${i.startDate ? ` before ${fmtDate(i.startDate)}` : ''}. I'll re-run the match with your updated profile.`,
      '',
      'Thanks,',
    ].filter((l) => l !== null);
    return { subject: `Profile feedback for the ${roleName(c)} role${i.demandId ? ` (${i.demandId})` : ''}`, body: lines.join('\n') };
  }

  // Resource-facing report: constructive, no verdict wording, no ranking or other candidates.
  function feedbackReport(c, withAccount) {
    const i = c.inputs, r = c.result;
    const strengths = r.rows.filter((x) => x.priority !== 'none' && x.match >= 80).sort((a, b) => b.weight - a.weight);
    const areas = workOn(r);
    const tips = profileTips(c);
    return `<article class="report">
      <header class="r-head">
        <div>
          <div class="r-kicker">Profile feedback</div>
          <h1>${esc(resourceName(i))}</h1>
          <div class="r-sub">For the ${esc(roleName(c))} role${withAccount && i.account ? ' · ' + esc(i.account) : ''}${i.demandId ? ' · ' + esc(i.demandId) : ''}</div>
        </div>
        <div class="r-score"><b>${Math.round(r.overall)}%</b><span>match to the role today</span><em>${gentleFit(r.overall)}</em></div>
      </header>
      <h2>In short</h2>
      <p>Your profile currently shows ${Math.round(r.overall)}% of what this role asks for.${strengths.length ? ` Your strongest areas are ${strengths.slice(0, 3).map((x) => esc(x.name)).join(', ')}.` : ''}${areas.length ? ` The biggest opportunities are ${areas.slice(0, 3).map((x) => esc(x.name)).join(', ')}.` : ' There are no significant gaps.'}
        Some gaps may simply be experience that isn't written down yet — the profile updates below are the quickest way to close those.</p>
      ${strengths.length ? `<h2>What's already working</h2>${strengths.slice(0, 4).map((x) => `<div class="r-ev"><b>${esc(x.name)} · ${x.match}%</b><span>${x.raw.examples.length ? `“${esc(x.raw.examples[0].replace(/[\s;:,]+$/, ''))}”` : 'Well evidenced across your profile.'}</span></div>`).join('')}` : ''}
      ${areas.length ? `<h2>What to work on</h2>
      <table class="r-table"><thead><tr><th>Skill area</th><th>Role needs it</th><th>Your match</th><th>Suggested action</th></tr></thead>
        <tbody>${areas.map((x) => `<tr><td><b>${esc(x.name)}</b>${UXM.UPSKILL[x.id] ? `<div class="r-sub" style="font-size:9pt">Learning: ${esc(UXM.UPSKILL[x.id])}</div>` : ''}</td><td>${priorityLabel[x.priority]}</td>
          <td><span class="r-bar"><span style="width:${x.match}%"></span></span> ${x.match}%</td><td>${esc(UXM.ACTIONS[x.id])}</td></tr>`).join('')}</tbody></table>` : ''}
      ${tips.length ? `<h2>Quick updates to your profile</h2><ul>${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${r.roadmap.length ? `<h2>Development plan</h2>${r.roadmap.map((ph) => `<p><b>${esc(ph.period)} — ${esc(ph.title)}</b></p><ul>${ph.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`).join('')}` : ''}
      ${r.interviewFocus.length ? `<h2>Prepare to talk about</h2><p>If you're interviewed for this role, be ready with examples of: ${r.interviewFocus.map(esc).join(', ')}.</p>` : ''}
      <h2>Next step</h2><p>Update your profile and send it back to your resource manager${i.startDate ? ` before ${esc(fmtDate(i.startDate))}` : ''}. The match will be re-run with your updated profile.</p>
      <footer class="r-foot">Generated ${fmtDate(today())} · UX Profile-to-JD Match Assessment</footer>
    </article>`;
  }

  // Note on the pipeline entry that feedback went to the resource (no stage change).
  function markFeedback() {
    const c = state.current;
    if (!c.id) return;
    const list = store.get(STORE_KEY, []);
    const entry = list.find((x) => x.id === c.id);
    if (!entry) return;
    entry.feedbackAt = new Date().toISOString();
    store.set(STORE_KEY, list);
  }

  function markShared() {
    const c = state.current;
    const entry = c.id ? store.get(STORE_KEY, []).find((x) => x.id === c.id) : saveCurrent();
    if (['Shortlisted', 'On hold'].includes(entry.status)) setStatus(entry.id, 'Shared with account');
    updateCount();
  }

  async function onShare(action) {
    const c = state.current;
    const toResource = state.shareAudience === 'resource';
    const mark = toResource ? markFeedback : markShared;
    if (action === 'pdf') {
      $('#share-report').innerHTML = toResource ? feedbackReport(c, $('#share-option').checked) : shareReport(c, $('#share-option').checked);
      document.body.classList.add('printing-share');
      const prevTitle = document.title;
      document.title = `${toResource ? 'Profile feedback' : 'Profile report'} - ${resourceName(c.inputs)} - ${c.inputs.demandId || roleName(c)}`;
      window.print();
      document.title = prevTitle;
      document.body.classList.remove('printing-share');
      mark();
      toast('Choose “Save as PDF” in the print dialog to create the report');
    }
    if (action === 'resume') {
      const file = await getOriginalFile(c);
      if (!file) return toast('Original résumé file is not available');
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
      downloadBlob(`${slug(resourceName(c.inputs))}-resume${ext}`, file);
      markShared();
    }
    if (action === 'email') {
      const to = $('#share-to').value.split(/[;,\s]+/).filter(Boolean).join(',');
      const body = $('#share-body').value.slice(0, 1800);
      window.location.href = `mailto:${encodeURIComponent(to).replace(/%2C/g, ',').replace(/%40/g, '@')}?subject=${encodeURIComponent($('#share-subject').value)}&body=${encodeURIComponent(body)}`;
      mark();
    }
    if (action === 'copy') {
      const text = `Subject: ${$('#share-subject').value}\n\n${$('#share-body').value}`;
      try { await navigator.clipboard.writeText(text); }
      catch { const ta = $('#share-body'); ta.select(); document.execCommand('copy'); }
      mark();
      toast('Message copied to clipboard');
    }
    if (!$('#view-results').classList.contains('hidden')) renderResults();
  }

  // Account-facing report: excludes internal-only details (adjustments, weighting, interview probes).
  function shareReport(c, includeResume) {
    const i = c.inputs, r = c.result, p = c.profile;
    const top = r.rows.filter((x) => x.match >= 80).sort((a, b) => b.match - a.match);
    const highlights = top.filter((x) => x.raw.examples.length).slice(0, 4);
    const devAreas = [...r.criticalGaps, ...r.rows.filter((x) => x.match < 70 && x.priority !== 'none' && !r.criticalGaps.includes(x))];
    const ramp = r.roadmap.length ? r.roadmap[0].items : [];
    const summary = `${resourceName(i)} brings ${p.years} years of UX experience${top.length ? `, with strongest evidence in ${top.slice(0, 3).map((x) => x.name).join(', ')}` : ''}. ` +
      `Overall match to this demand is ${r.overall}% (${r.fit.label}).`;
    const meta = [
      ['Demand', [i.demandId, roleName(c)].filter(Boolean).join(' · ')],
      ['Account', i.account],
      ['Location', i.location],
      ['Required start', fmtDate(i.startDate)],
      ['Employee ID', i.empId],
      ['Availability', availabilityText(i)],
      ['Experience', `${p.years} years`],
      ['Assessed level', r.level.name],
    ].filter(([, v]) => v);
    return `<article class="report">
      <header class="r-head">
        <div>
          <div class="r-kicker">Resource profile submission</div>
          <h1>${esc(resourceName(i))}</h1>
          <div class="r-sub">Proposed for ${esc(roleName(c))}${i.account ? ' · ' + esc(i.account) : ''}</div>
        </div>
        <div class="r-score"><b>${r.overall}%</b><span>profile match</span><em>${esc(r.verdict)}</em></div>
      </header>
      <table class="r-meta"><tbody>${meta.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
      <h2>Summary</h2><p>${esc(summary)}</p>
      <h2>Competency match</h2>
      <table class="r-table"><thead><tr><th>Competency</th><th>Demand priority</th><th>Match</th><th>Assessment</th></tr></thead>
        <tbody>${r.rows.filter((x) => x.weight >= 2).map((x) => `<tr><td>${esc(x.name)}</td><td>${priorityLabel[x.priority]}</td>
          <td><span class="r-bar"><span style="width:${x.match}%"></span></span> ${x.match}%</td><td>${x.status.label}</td></tr>`).join('')}</tbody></table>
      ${highlights.length ? `<h2>Evidence highlights</h2>${highlights.map((x) => `<div class="r-ev"><b>${esc(x.name)}</b><span>“${esc(x.raw.examples[0])}”</span></div>`).join('')}` : ''}
      <h2>Development areas &amp; ramp-up plan</h2>
      ${devAreas.length
        ? `<p>${devAreas.map((x) => `${esc(x.name)} (${x.match}%)`).join(', ')}</p>${ramp.length ? `<ul>${ramp.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`
        : '<p>No significant gaps against this demand’s requirements.</p>'}
      ${r.tools.candidate.length || r.domain.candidate.length ? `<h2>Tools &amp; domain</h2>
        ${r.tools.candidate.length ? `<p><b>Tools:</b> ${r.tools.candidate.map(esc).join(', ')}</p>` : ''}
        ${r.domain.candidate.length ? `<p><b>Domain experience:</b> ${r.domain.candidate.map(esc).join(', ')}</p>` : ''}` : ''}
      ${includeResume ? `<section class="r-appendix"><h2>Appendix — résumé</h2><pre>${esc(i.profileText)}</pre></section>` : ''}
      <footer class="r-foot">Generated ${fmtDate(new Date().toISOString().slice(0, 10))} · UX Profile-to-JD Match Assessment</footer>
    </article>`;
  }

  // ---------- pipeline view ----------
  const demandKey = (x) => x.inputs.demandId || x.role;
  const demandLabel = (x) => [x.inputs.demandId, x.role, x.inputs.account].filter(Boolean).join(' · ');

  // Pipeline entries are grouped by demand, resource or account for filters and the summary.
  const resourceKey = (x) => x.benchId || x.inputs.empId || x.name;
  const GROUPS = {
    demand: { label: 'Demand', key: demandKey, name: demandLabel },
    resource: { label: 'Resource', key: resourceKey, name: (x) => [x.name, x.inputs.empId].filter(Boolean).join(' · ') },
    account: { label: 'Account', key: (x) => x.inputs.account || '—', name: (x) => x.inputs.account || 'No account' },
  };
  const DECIDED = ['Selected', 'Allocated', 'Rejected'];
  const SHARED_PLUS = ['Shared with account', 'Account interview', 'Selected', 'Allocated', 'Rejected'];

  function filterPipeline(all, f) {
    return all.filter((x) => (!f.demand || demandKey(x) === f.demand) && (!f.account || GROUPS.account.key(x) === f.account)
      && (!f.resource || resourceKey(x) === f.resource) && (!f.status || x.status === f.status));
  }

  function renderPipeline() {
    const view = $('#view-pipeline');
    const all = store.get(STORE_KEY, []);
    if (!all.length) {
      view.innerHTML = `<div class="card empty"><h2>Pipeline is empty</h2><p class="muted">Match a resource to a demand and choose “Add to pipeline” or “Share with account team”.</p>
        <div class="row" style="justify-content:center"><button class="btn btn-primary" data-action="go-assess">New match</button>
        <button class="btn" data-action="add-samples">Add sample pipeline</button></div></div>`;
      return;
    }
    const f = state.pipelineFilter;
    const options = (g) => { const m = new Map(); all.forEach((x) => m.set(GROUPS[g].key(x), GROUPS[g].name(x))); return [...m].sort((a, b) => a[1].localeCompare(b[1])); };
    const opts = { demand: options('demand'), account: options('account'), resource: options('resource') };
    for (const g in opts) if (f[g] && !opts[g].some(([k]) => k === f[g])) f[g] = '';
    const list = filterPipeline(all, f).sort((a, b) => demandKey(a).localeCompare(demandKey(b)) || b.overall - a.overall);
    const active = Object.values(f).filter(Boolean).length;

    const demandKeys = new Set(list.map(demandKey));
    const openDemands = [...demandKeys].filter((k) => !all.some((x) => demandKey(x) === k && x.status === 'Allocated')).length;
    const shared = list.filter((x) => SHARED_PLUS.includes(x.status)).length;
    const won = list.filter((x) => ['Selected', 'Allocated'].includes(x.status)).length;
    const rejected = list.filter((x) => x.status === 'Rejected').length;
    const decided = list.filter((x) => DECIDED.includes(x.status)).length;
    const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
    const tile = (v, k, sub = '', action = '') => `<div class="tile ${action ? 'tile-link' : ''}" ${action}><div class="v">${v}</div><div class="k">${k}</div>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>`;
    const mode = state.pipelineView || store.get(PIPE_VIEW_KEY, 'board');
    const sel = (g, label) => `<div class="field" style="margin:0"><label for="pf-${g}">${label}</label><select id="pf-${g}" data-filter="${g}"><option value="">All ${label.toLowerCase()}s</option>${opts[g].map(([k, v]) => `<option value="${esc(k)}" ${k === f[g] ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>`;

    view.innerHTML = `<div class="tiles">
        ${tile(openDemands, 'Open demands')}
        ${tile(list.length, 'Proposals', active ? `of ${all.length} in total` : '')}
        ${tile(shared, 'Shared with accounts')}
        ${tile(won, 'Selected / allocated', pct(won, shared) + ' of shared')}
        ${tile(rejected, 'Rejected', `${pct(rejected, decided)} of decisions`, rejected ? 'data-action="quick-rejects" role="button" tabindex="0" title="Show rejected proposals"' : '')}
      </div>
      <div class="card">
        <div class="card-head"><h2>Resource pipeline</h2>
          <div class="row" style="align-items:center">
            <button class="btn-link" data-action="add-samples">Add sample data</button>
            <div class="segmented" role="group" aria-label="Pipeline layout">
              ${[['board', 'Board'], ['table', 'Table'], ['summary', 'Summary']].map(([m, n]) => `<button type="button" data-action="pipe-view" data-mode="${m}" aria-pressed="${mode === m}">${n}</button>`).join('')}
            </div>
          </div></div>
        <div class="filter-bar">
          ${sel('demand', 'Demand')}${sel('account', 'Account')}${sel('resource', 'Resource')}
          <div class="field" style="margin:0"><label for="pf-status">Status</label><select id="pf-status" data-filter="status"><option value="">All statuses</option>${STATUSES.map((st) => `<option ${st === f.status ? 'selected' : ''}>${st}</option>`).join('')}</select></div>
          <div class="filter-meta">${active ? `<span class="small muted">Showing ${list.length} of ${all.length}</span> <button class="btn-link" data-action="clear-filters">Clear filters</button>` : `<span class="small muted">${all.length} proposals</span>`}</div>
        </div>
        ${active ? `<div class="active-filters">${Object.entries(f).filter(([, v]) => v).map(([g, v]) => `<span class="chip">${g === 'status' ? esc(v) : esc((opts[g].find(([k]) => k === v) || [, v])[1])} <button class="chip-x" data-action="clear-filter" data-filter-key="${g}" aria-label="Remove filter">✕</button></span>`).join('')}</div>` : ''}
        ${mode === 'board' ? pipelineBoard(list) : mode === 'summary' ? pipelineSummary(list) : pipelineTable(list)}
      </div>`;
  }

  function rejectNote(x) {
    return x.status === 'Rejected' ? `<div class="small reject-reason" title="${esc(x.rejectNote || '')}">✕ ${esc(x.rejectReason || 'Reason not recorded')}${x.rejectNote ? ' · ' + esc(x.rejectNote) : ''}</div>` : '';
  }

  function pipelineTable(list) {
    return `<div class="table-scroll"><table>
      <thead><tr><th>Resource</th><th>Demand</th><th>Match</th><th class="hide-sm">Recommendation</th><th class="hide-sm">Availability</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map((x) => `<tr>
        <td><b>${esc(x.name)}</b><div class="small muted">${esc(x.inputs.empId || '')}</div></td>
        <td>${esc(x.role)}<div class="small muted">${esc([x.inputs.demandId, x.inputs.account].filter(Boolean).join(' · '))}</div></td>
        <td class="tone-${UXM.FIT_BANDS.find((b) => x.overall >= b.min).tone}"><div class="bar-cell"><div class="bar"><span style="width:${x.overall}%"></span></div><b>${Math.round(x.overall)}%</b></div>
          <div class="small tone-${x.tone}"><span class="status">${esc(x.verdict)}</span></div></td>
        <td class="hide-sm small">${esc(x.fulfilment || '')}</td>
        <td class="hide-sm small">${esc(availabilityText(x.inputs))}</td>
        <td><select data-action="status" data-id="${x.id}" style="width:auto" aria-label="Status for ${esc(x.name)}">${STATUSES.map((st) => `<option ${st === x.status ? 'selected' : ''}>${st}</option>`).join('')}</select>${rejectNote(x)}</td>
        <td style="white-space:nowrap"><button class="btn btn-sm" data-action="open" data-id="${x.id}">Open</button>
          <button class="btn btn-sm" data-action="share" data-id="${x.id}">Share</button>
          <button class="btn btn-sm" data-action="delete" data-id="${x.id}" aria-label="Remove ${esc(x.name)} from pipeline">✕</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="muted">No proposals match these filters.</td></tr>'}</tbody>
    </table></div>`;
  }

  // Outcome counts per demand, resource or account. Every count drills into the table with matching filters.
  function pipelineSummary(list) {
    const g = GROUPS[state.summaryBy];
    const rows = new Map();
    list.forEach((x) => {
      const k = g.key(x);
      if (!rows.has(k)) rows.set(k, { key: k, name: g.name(x), items: [] });
      rows.get(k).items.push(x);
    });
    const count = (items, st) => items.filter((x) => x.status === st).length;
    const reasonsOf = (items) => {
      const m = new Map();
      items.filter((x) => x.status === 'Rejected').forEach((x) => { const r = x.rejectReason || 'Not recorded'; m.set(r, (m.get(r) || 0) + 1); });
      return [...m].sort((a, b) => b[1] - a[1]);
    };
    const sorted = [...rows.values()].sort((a, b) => count(b.items, 'Rejected') - count(a.items, 'Rejected') || b.items.length - a.items.length);
    const cell = (k, st, n) => (n ? `<button class="count-btn ${st === 'Rejected' ? 'rej' : ''}" data-action="drill" data-group="${state.summaryBy}" data-key="${esc(k)}" data-status="${st || ''}" title="Show these proposals">${n}</button>` : '<span class="muted">·</span>');
    const rate = (items) => {
      const d = items.filter((x) => DECIDED.includes(x.status)).length, r = count(items, 'Rejected');
      return d ? `<div class="bar-cell tone-${r / d > 0.5 ? 'weak' : r / d > 0.25 ? 'moderate' : 'excellent'}"><div class="bar"><span style="width:${(r / d) * 100}%"></span></div><b>${Math.round((r / d) * 100)}%</b></div>` : '<span class="muted small">No decisions yet</span>';
    };
    const OTHER = STATUSES.filter((st) => st !== 'Rejected');
    const SHORT = { 'Shared with account': 'Shared', 'Account interview': 'Interview' };
    // Demand rows: ID on top, role and account underneath, so long titles wrap instead of widening the table.
    const groupCell = (row) => {
      const x = row.items[0];
      if (state.summaryBy === 'demand') return `<b>${esc(x.inputs.demandId || x.role)}</b><div class="small muted">${esc([x.inputs.demandId ? x.role : '', x.inputs.account].filter(Boolean).join(' · '))}</div>`;
      if (state.summaryBy === 'resource') return `<b>${esc(x.name)}</b><div class="small muted">${esc(x.inputs.empId || '')}</div>`;
      return `<b>${esc(row.name)}</b>`;
    };
    const stages = (k, items) => OTHER.filter((st) => count(items, st)).map((st) =>
      `<button class="stage-btn" data-action="drill" data-group="${state.summaryBy}" data-key="${esc(k)}" data-status="${st}">${SHORT[st] || st} <b>${count(items, st)}</b></button>`).join('') || '<span class="muted">·</span>';
    const allReasons = reasonsOf(list);
    const maxReason = Math.max(1, ...allReasons.map(([, n]) => n));
    return `<div class="summary-head">
        <span class="small muted">Group by</span>
        <div class="segmented" role="group" aria-label="Group summary by">${Object.entries(GROUPS).map(([id, x]) => `<button type="button" data-action="summary-by" data-by="${id}" aria-pressed="${state.summaryBy === id}">${x.label}</button>`).join('')}</div>
        <span class="small muted">Click any number to see those proposals.</span>
      </div>
      <div class="table-scroll"><table class="summary-table">
        <thead><tr><th>${g.label}</th><th class="num">Proposed</th><th class="num">Rejected</th><th title="Rejected ÷ (selected + allocated + rejected)">Rejection rate</th><th class="hide-sm">Top reject reason</th><th>Other stages</th></tr></thead>
        <tbody>${sorted.map((row) => `<tr>
          <td class="group-name">${groupCell(row)}</td>
          <td class="num">${cell(row.key, '', row.items.length)}</td>
          <td class="num">${cell(row.key, 'Rejected', count(row.items, 'Rejected'))}</td>
          <td style="min-width:120px">${rate(row.items)}</td>
          <td class="hide-sm small">${esc((reasonsOf(row.items)[0] || ['—'])[0])}</td>
          <td>${stages(row.key, row.items)}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="muted">No proposals match these filters.</td></tr>'}</tbody>
        ${sorted.length > 1 ? `<tfoot><tr><td><b>Total</b></td><td class="num"><b>${list.length}</b></td><td class="num"><b>${count(list, 'Rejected') || '·'}</b></td><td>${rate(list)}</td><td class="hide-sm"></td><td class="small muted">${OTHER.filter((st) => count(list, st)).map((st) => `${SHORT[st] || st} ${count(list, st)}`).join(' · ')}</td></tr></tfoot>` : ''}
      </table></div>
      <div class="reasons">
        <h3>Why proposals were rejected</h3>
        ${allReasons.length ? allReasons.map(([r, n]) => `<div class="hbar"><span class="hbar-name">${esc(r)}</span><div class="bar tone-weak"><span style="width:${(n / maxReason) * 100}%"></span></div><b class="num">${n}</b></div>`).join('')
          : '<p class="muted small">No rejections for these filters.</p>'}
      </div>`;
  }

  // Kanban view: drag a card to another column, or use → to move it to the next stage.
  function pipelineBoard(list) {
    const col = (st) => {
      const items = list.filter((x) => x.status === st).sort((a, b) => b.overall - a.overall);
      return `<div class="board-col ${NEXT_STATUS[st] || st === 'Allocated' ? '' : 'closed'}" data-drop="${st}">
        <div class="board-head tone-${STATUS_TONE[st]}"><span class="status">${st}</span><span class="chip">${items.length}</span></div>
        ${items.map((x) => {
          const since = x.history && x.history.length ? daysBetween(x.history[x.history.length - 1].at.slice(0, 10), today()) : 0;
          const stale = since >= 5 && ['Shared with account', 'Account interview'].includes(st);
          const tone = UXM.FIT_BANDS.find((b) => x.overall >= b.min).tone;
          return `<article class="board-card" draggable="true" data-id="${x.id}">
            <div class="bc-top"><b>${esc(x.name)}</b><span class="tone-${tone}"><span class="status">${Math.round(x.overall)}%</span></span></div>
            <div class="small">${esc(x.role)}</div>
            <div class="small muted">${esc([x.inputs.demandId, x.inputs.account].filter(Boolean).join(' · '))}</div>
            ${rejectNote(x)}
            <div class="bc-foot"><span class="small ${stale ? 'stale' : 'muted'}" title="${since} day${since === 1 ? '' : 's'} in this stage${stale ? ' — follow up with the account' : ''}">${since ? since + 'd' : 'Today'}${stale ? ' · chase' : ''}</span>
              <span class="bc-actions"><button class="btn btn-sm" data-action="open" data-id="${x.id}" aria-label="Open ${esc(x.name)}">Open</button>${NEXT_STATUS[st] ? `<button class="btn btn-sm" data-action="advance" data-id="${x.id}" title="Move to ${NEXT_STATUS[st]}" aria-label="Move ${esc(x.name)} to ${NEXT_STATUS[st]}">→</button>` : ''}</span></div>
          </article>`;
        }).join('') || '<div class="board-empty">Drop here</div>'}
      </div>`;
    };
    return `<div class="board">${STATUSES.map(col).join('')}</div>`;
  }

  async function movePipeline(id, status) {
    const x = store.get(STORE_KEY, []).find((e) => e.id === id);
    if (!x || x.status === status) return renderPipeline();
    let reason = null;
    if (status === 'Rejected') {
      reason = await askRejectReason(x);
      if (!reason) return renderPipeline(); // cancelled: leave the status as it was
    }
    const synced = setStatus(id, status, reason);
    renderPipeline();
    updateCount();
    if (!synced) toast(`${x.name} moved to “${status}”${reason && reason.reason ? ` · ${reason.reason}` : ''}`);
  }

  // Resolves to { reason, note } (reason may be '' when skipped) or null when cancelled.
  function askRejectReason(x) {
    const dlg = $('#reject-dialog');
    $('#reject-who').textContent = `${x.name} → ${x.role}${x.inputs.demandId ? ' (' + x.inputs.demandId + ')' : ''}`;
    $('#reject-reasons').innerHTML = REJECT_REASONS.map((r, n) => `<label class="reason-opt"><input type="radio" name="reject-reason" value="${esc(r)}" ${n === 0 ? 'required' : ''}> ${esc(r)}</label>`).join('');
    $('#reject-note').value = '';
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => {
        const picked = dlg.querySelector('input[name=reject-reason]:checked');
        if (dlg.returnValue === 'save') resolve({ reason: picked ? picked.value : '', note: $('#reject-note').value.trim() });
        else if (dlg.returnValue === 'skip') resolve({ reason: '', note: '' });
        else resolve(null);
      }, { once: true });
    });
  }

  function bindBoardDrag(view) {
    view.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.board-card');
      if (!card) return;
      e.dataTransfer.setData('text/plain', card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    view.addEventListener('dragend', (e) => { const c = e.target.closest('.board-card'); if (c) c.classList.remove('dragging'); });
    view.addEventListener('dragover', (e) => {
      const colEl = e.target.closest('[data-drop]');
      if (!colEl) return;
      e.preventDefault();
      view.querySelectorAll('.board-col.over').forEach((c) => c !== colEl && c.classList.remove('over'));
      colEl.classList.add('over');
    });
    view.addEventListener('dragleave', (e) => { const c = e.target.closest('[data-drop]'); if (c && !c.contains(e.relatedTarget)) c.classList.remove('over'); });
    view.addEventListener('drop', (e) => {
      const colEl = e.target.closest('[data-drop]');
      if (!colEl) return;
      e.preventDefault();
      e.stopPropagation();
      colEl.classList.remove('over');
      movePipeline(e.dataTransfer.getData('text/plain'), colEl.dataset.drop);
    });
  }

  // Reopen a pipeline entry. If the resource's bench profile or available-from date changed since, use the latest.
  function openSaved(id, exact = false) {
    let saved = store.get(STORE_KEY, []).find((x) => x.id === id);
    if (!saved) return false;
    const res = !exact && saved.benchId && loadBench().find((r) => r.id === saved.benchId);
    if (res && (res.profileText !== saved.inputs.profileText || res.availableFrom !== saved.inputs.availableFrom)) {
      saved = { ...saved, inputs: { ...saved.inputs, profileText: res.profileText, availableFrom: res.availableFrom } };
    }
    writeInputs(saved.inputs);
    runAssessment(saved);
    return true;
  }

  function onPipelineClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT') return;
    const id = el.dataset.id;
    if (el.dataset.action === 'go-assess') showView('assess');
    if (el.dataset.action === 'advance') { const x = store.get(STORE_KEY, []).find((e) => e.id === id); if (x) movePipeline(id, NEXT_STATUS[x.status]); }
    if (el.dataset.action === 'pipe-view') { state.pipelineView = el.dataset.mode; store.set(PIPE_VIEW_KEY, el.dataset.mode); renderPipeline(); }
    if (el.dataset.action === 'summary-by') { state.summaryBy = el.dataset.by; renderPipeline(); }
    if (el.dataset.action === 'clear-filters') { state.pipelineFilter = { demand: '', account: '', resource: '', status: '' }; renderPipeline(); }
    if (el.dataset.action === 'clear-filter') { state.pipelineFilter[el.dataset.filterKey] = ''; renderPipeline(); }
    if (el.dataset.action === 'quick-rejects') { state.pipelineFilter.status = 'Rejected'; state.pipelineView = 'summary'; renderPipeline(); }
    if (el.dataset.action === 'drill') {
      state.pipelineFilter = { ...state.pipelineFilter, [el.dataset.group]: el.dataset.key, status: el.dataset.status || state.pipelineFilter.status };
      state.pipelineView = 'table';
      renderPipeline();
    }
    if (el.dataset.action === 'add-samples') {
      const n = addSamplePipeline();
      renderPipeline();
      toast(n ? `Added ${n} sample pipeline entries` : 'Sample entries are already in the pipeline');
    }
    if (el.dataset.action === 'open') openSaved(id);
    if (el.dataset.action === 'share' && openSaved(id)) openShare();
    if (el.dataset.action === 'delete' && confirm('Remove this resource match from the pipeline?')) {
      store.set(STORE_KEY, store.get(STORE_KEY, []).filter((x) => x.id !== id));
      fileStore.del(id);
      if (state.current && state.current.id === id) state.current.id = null;
      updateCount();
      renderPipeline();
    }
  }

  function onPipelineChange(e) {
    const el = e.target;
    if (el.dataset.filter) { state.pipelineFilter[el.dataset.filter] = el.value; renderPipeline(); }
    if (el.dataset.action === 'status') movePipeline(el.dataset.id, el.value);
  }

  // ---------- file upload ----------
  async function loadFile(zone, file) {
    const status = $('#' + zone.dataset.status);
    const setMsg = (msg, cls) => { status.textContent = msg; status.className = 'dz-status ' + (cls || ''); };
    if (file.size > MAX_UPLOAD) return setMsg('File is larger than 15 MB.', 'err');
    setMsg('Reading ' + file.name + '…');
    try {
      const { text, format, warning } = await UXM.extractText(file);
      if (text.trim().length < 20) throw new Error('No readable text found — scanned/image PDFs need OCR. Paste the text instead.');
      $('#' + zone.dataset.target).value = text;
      // A new file usually means a new resource/demand, so replace stale details when we can infer them.
      if (zone.dataset.target === 'profile-text') {
        state.profileFile = file;
        $('#cand-name').value = guessName(text) || ($('#cand-name').value.trim() ? '' : $('#cand-name').value);
        $('#cand-years').value = '';
        $('#emp-id').value = (text.match(/\b(?:emp(?:loyee)?\.?\s*(?:id|no|number)?\s*[:#-]?\s*)([A-Z]{0,3}\d{4,8})\b/i) || [])[1] || '';
      }
      if (zone.dataset.target === 'jd-text') {
        $('#jd-title').value = guessTitle(text) || $('#jd-title').value;
        const demand = text.match(/\b(?:demand|requisition|req|position|job)\s*(?:id|no|number|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,15})/i);
        if (demand) $('#demand-id').value = demand[1];
      }
      const words = text.split(/\s+/).filter(Boolean).length;
      setMsg(warning ? `⚠ ${warning}` : `✓ ${file.name} · ${format} · ${words} words`, warning ? 'warn' : 'ok');
      saveDraft();
      if (zone.dataset.target === 'jd-text' && state.matchMode === 'bench') runRanking();
    } catch (err) {
      setMsg(err.message, 'err');
    }
  }

  // A résumé usually opens with the person's name on its own line.
  function guessName(text) {
    const first = text.split('\n').map((l) => l.trim()).find(Boolean) || '';
    return /^[\p{L}][\p{L}.'’-]*(\s+[\p{L}][\p{L}.'’-]*){1,3}$/u.test(first) && first.length <= 40 ? first : '';
  }

  function guessTitle(text) {
    const line = text.split('\n').map((l) => l.trim()).find((l) => /\b(designer|ux|ui|researcher|design manager|head of design|director)\b/i.test(l) && l.length <= 70);
    return line ? line.replace(/^(job title|position|role)\s*[:\-–]\s*/i, '') : '';
  }

  // ---------- bench roster ----------
  const loadBench = () => store.get(BENCH_KEY, []);
  function saveBench(list) {
    if (!store.set(BENCH_KEY, list)) toast('Could not save — browser storage is unavailable or full');
    updateCount();
  }
  const newId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function sampleBench() {
    return UXM.SAMPLE_BENCH.map((b) => ({
      id: newId('b'), name: b.name, empId: b.empId, status: b.status, availableFrom: isoIn(b.availableIn),
      location: b.location, profileText: b.text, fileName: null, addedAt: new Date().toISOString(),
    }));
  }

  function seedBench() {
    if (store.get(BENCH_SEEDED_KEY, false)) return;
    saveBench([...loadBench(), ...sampleBench()]);
    store.set(BENCH_SEEDED_KEY, true);
  }

  // Sample pipeline: the top-ranked bench resources for each sample demand, at different stages.
  // Each step is [status, days ago]; scores come from real matches against the current bench.
  const SAMPLE_PIPELINE = {
    lead: [[['Shared with account', 9], ['Account interview', 6], ['Selected', 2]], [['Shared with account', 9]], [['Shared with account', 9], ['Rejected', 5, 'Skills gap']]],
    research: [[['Shared with account', 4], ['Account interview', 1]], [['Shared with account', 4]]],
    product: [[['Shared with account', 18], ['Account interview', 14], ['Selected', 11], ['Allocated', 7]], [['Shared with account', 18], ['Rejected', 13, 'Level / seniority mismatch']]],
    manager: [[['Shared with account', 1]], [['On hold', 1]]],
  };

  function samplePipeline() {
    const bench = loadBench().filter((r) => r.status !== 'Allocated');
    const ago = (days) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString(); };
    const out = [];
    UXM.SAMPLE_JDS.forEach((s) => {
      const plan = SAMPLE_PIPELINE[s.id];
      if (!plan || !bench.length) return;
      const jd = UXM.analyzeJD(s.text, s.title);
      const startDate = isoIn(14);
      const ranked = UXM.rankResources(jd, bench, { levelId: jd.level, weights: UXM.autoWeights(jd, jd.level), startDate });
      const priorities = {};
      for (const k in jd.competencies) priorities[k] = jd.competencies[k].priority;
      plan.forEach((steps, n) => {
        const x = ranked[n];
        if (!x) return;
        const res = x.resource, r = x.result;
        const history = [{ status: 'Shortlisted', at: ago(steps[0][1] + 1) }, ...steps.map(([status, d, reason]) => ({ status, at: ago(d), ...(reason ? { reason } : {}) }))];
        const last = steps[steps.length - 1];
        out.push({
          id: newId('a'), savedAt: history[0].at,
          name: res.name, role: s.title, levelId: jd.level,
          overall: r.overall, verdict: r.verdict, tone: r.verdictTone, readiness: r.readiness, fulfilment: r.fulfilment.action,
          status: history[history.length - 1].status, history,
          fileName: res.fileName || null, benchId: res.id, sample: true,
          ...(last[2] ? { rejectReason: last[2], rejectNote: '' } : {}),
          inputs: {
            demandId: s.demandId, account: s.account, jdTitle: s.title, location: s.location, startDate, jdText: s.text,
            name: res.name, empId: res.empId, resStatus: res.status, availableFrom: res.availableFrom, years: '', profileText: res.profileText,
            levelChoice: 'auto', weightMode: 'auto',
          },
          weightMode: 'auto', customWeights: null, overrides: {}, priorities,
        });
      });
    });
    return out;
  }

  // Adds sample entries, skipping any resource already in the pipeline for the same demand.
  function addSamplePipeline() {
    const list = store.get(STORE_KEY, []);
    const have = new Set(list.map((x) => (x.inputs.empId || x.name) + '|' + demandKey(x)));
    const add = samplePipeline().filter((x) => !have.has((x.inputs.empId || x.name) + '|' + demandKey(x)));
    store.set(STORE_KEY, [...list, ...add]);
    updateCount();
    return add.length;
  }

  function seedPipeline() {
    if (store.get(PIPELINE_SEEDED_KEY, false)) return;
    addSamplePipeline();
    store.set(PIPELINE_SEEDED_KEY, true);
  }

  // Profile analysis is pure on the text, so cache it per profile.
  const infoCache = new Map();
  function benchInfo(res) {
    if (!infoCache.has(res.profileText)) {
      const p = UXM.analyzeProfile(res.profileText);
      const top = UXM.COMPETENCIES
        .map((c) => ({ name: c.short, n: Object.keys(p.competencies[c.id].found).length / c.subskills.length + p.competencies[c.id].sentences * 0.05 }))
        .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3).map((x) => x.name);
      infoCache.set(res.profileText, { years: p.years, level: UXM.suggestLevel(p), top });
    }
    return infoCache.get(res.profileText);
  }
  const benchAvail = (r) => availabilityText({ resStatus: r.status, availableFrom: r.availableFrom });

  function renderBenchPanel() {
    const list = loadBench();
    const panel = $('#bench-panel');
    if (!list.length) {
      panel.innerHTML = `<div class="empty" style="padding:30px 10px"><p class="muted">Your bench roster is empty.</p>
        <button class="btn btn-primary" data-action="go-bench">Add bench resources</button></div>`;
      return;
    }
    const pool = list.filter((r) => state.include.has(r.status));
    const levels = {};
    pool.forEach((r) => { const n = benchInfo(r).level.name; levels[n] = (levels[n] || 0) + 1; });
    panel.innerHTML = `
      <p style="margin:4px 0 14px"><b style="font-size:1.6rem">${pool.length}</b> <span class="muted">of ${list.length} resources on the roster will be ranked against this demand.</span></p>
      <h4>Include resources who are</h4>
      <div class="row" style="gap:16px;margin-bottom:16px">${RES_STATUSES.map((st) => {
        const n = list.filter((r) => r.status === st).length;
        return `<label class="toggle"><input type="checkbox" data-include="${st}" ${state.include.has(st) ? 'checked' : ''}> ${st} <span class="chip">${n}</span></label>`;
      }).join('')}</div>
      <h4>Levels in the pool</h4>
      <div>${UXM.ROLE_LEVELS.filter((l) => levels[l.name]).map((l) => chip(`${l.name} × ${levels[l.name]}`)).join('') || '<span class="muted small">No resources selected</span>'}</div>
      <p class="hint" style="margin-top:14px">Ranking uses the match score, adjusted for level fit, critical gaps, availability against the required start date, people leadership, and preferred domain, tools and skills.</p>
      <button class="btn-link" data-action="go-bench" style="margin-top:6px">Manage bench roster →</button>`;
  }

  function setMatchMode(mode) {
    state.matchMode = mode;
    document.querySelectorAll('[data-match-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.matchMode === mode)));
    $('#bench-panel').classList.toggle('hidden', mode !== 'bench');
    $('#single-panel').classList.toggle('hidden', mode !== 'single');
    $('#run').textContent = mode === 'bench' ? 'Find best fit from bench →' : 'Match resource to demand →';
    $('#assess-error').textContent = '';
    if (mode === 'bench') renderBenchPanel();
  }

  // Rank a pool of bench resources against one demand's inputs.
  function rankFor(inputs, pool) {
    const jd = UXM.analyzeJD(inputs.jdText, inputs.jdTitle);
    const levelId = !inputs.levelChoice || inputs.levelChoice === 'auto' ? jd.level : inputs.levelChoice;
    const weights = UXM.WEIGHT_PRESETS[inputs.weightMode] ? { ...UXM.WEIGHT_PRESETS[inputs.weightMode].weights } : UXM.autoWeights(jd, levelId);
    return { jd, levelId, ranked: UXM.rankResources(jd, pool, { levelId, weights, startDate: inputs.startDate }) };
  }

  // live: re-rank while the demand is being edited, without collapsing the form or scrolling.
  function runRanking(live = false) {
    const inputs = readInputs();
    const err = $('#assess-error');
    err.textContent = '';
    if (inputs.jdText.trim().length < 40) { if (!live) err.textContent = 'Please upload or paste the job description for the demand.'; return; }
    const roster = loadBench();
    const pool = roster.filter((r) => state.include.has(r.status));
    if (!pool.length) { err.textContent = 'No bench resources match the selected statuses. Add resources or include more statuses.'; return; }

    const prevKey = state.ranking && (state.ranking.inputs.demandId + state.ranking.inputs.jdTitle);
    if (prevKey !== inputs.demandId + inputs.jdTitle) { state.compare.clear(); state.showAllRanked = false; }
    state.ranking = { inputs, ...rankFor(inputs, pool), excluded: roster.length - pool.length };
    renderRanking();
    if (live) return;
    setDemandCollapsed(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  let liveTimer = null;
  function queueLiveRanking() {
    if (state.matchMode !== 'bench' || !state.ranking) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => runRanking(true), 450);
  }

  // After ranking, the demand form folds into a one-line strip so the results sit at the top.
  function setDemandCollapsed(collapsed) {
    $('#demand-form').classList.toggle('hidden', collapsed);
    $('#demand-strip').classList.toggle('hidden', !collapsed);
    if (collapsed) renderDemandStrip();
  }

  function renderDemandStrip() {
    const R = state.ranking;
    if (!R) return;
    const i = R.inputs;
    const start = i.startDate ? daysBetween(today(), i.startDate) : null;
    $('#demand-strip').innerHTML = `
      <div class="strip-main">
        <span class="strip-kicker">Demand</span>
        <b>${esc(i.jdTitle || UXM.levelById(R.levelId).name)}</b>
        <span class="muted small">${esc([i.demandId, i.account, i.location].filter(Boolean).join(' · '))}</span>
        ${start != null ? chip(start < 0 ? `Start date passed ${-start}d ago` : start === 0 ? 'Starts today' : `Starts in ${start}d`, start <= 3 ? 'miss' : '') : ''}
        ${chip(`${UXM.levelById(R.levelId).name} level`)}
        ${chip(`${R.ranked.length} ranked`)}
      </div>
      <div class="result-actions">
        <button class="btn btn-sm" data-action="edit-demand">Edit demand</button>
        <button class="btn btn-sm" data-action="new-demand">New demand</button>
      </div>`;
  }

  function newDemand() {
    writeInputs({ ...readInputs(), demandId: '', account: '', jdTitle: '', location: '', startDate: '', jdText: '', levelChoice: 'auto', weightMode: 'auto' });
    $('#jd-file-status').textContent = '';
    state.ranking = null;
    state.compare.clear();
    renderRanking();
    setDemandCollapsed(false);
    saveDraft();
    showView('assess');
    $('#jd-text').focus();
  }

  // Load a known demand into the form and rank the bench against it.
  function rankDemand(d) {
    setMatchMode('bench');
    writeInputs({ ...readInputs(), ...demandInputs(d) });
    saveDraft();
    showView('assess');
    runRanking();
  }

  const adjChip = (a) => chip(`${a.label} ${a.points > 0 ? '+' : ''}${a.points}`, a.points > 0 ? 'ok' : 'miss');

  function whyBest(x, inputs) {
    const reasons = [];
    if (x.levelDiff === 0) reasons.push('Right level for the demand');
    if (!x.result.criticalGaps.length) reasons.push('No critical skill gaps');
    if (inputs.startDate && (!x.resource.availableFrom || x.resource.availableFrom <= inputs.startDate)) reasons.push('Available by the required start');
    if (x.result.strengths.length) reasons.push(`Strong in ${x.result.strengths.slice(0, 3).join(', ')}`);
    return reasons;
  }

  function renderRanking() {
    const R = state.ranking;
    const el = $('#ranking');
    if (!R) { el.innerHTML = ''; return; }
    const i = R.inputs;
    const best = R.ranked[0], r = best.result, res = best.resource, info = benchInfo(res);
    const runnerUp = R.ranked[1];
    const shown = state.showAllRanked ? R.ranked : R.ranked.slice(0, 5);
    el.innerHTML = `
      <div class="card tone-${r.verdictTone} best-fit">
        <div class="card-head">
          <h2>Best-fit resource</h2>
          <span class="muted small">${R.ranked.length} resources ranked${R.excluded ? ` · ${R.excluded} excluded by status` : ''}</span>
        </div>
        <div class="summary">
          <div>
            <div class="summary-name">${esc(res.name)}</div>
            <div class="small muted">${esc([res.empId, res.location].filter(Boolean).join(' · '))}</div>
            <dl class="kv">
              <dt>Level</dt><dd>${esc(info.level.name)}${info.level.alt ? ` <span class="muted small">· ${esc(info.level.alt)}-ready</span>` : ''}</dd>
              <dt>Experience</dt><dd>${best.profile.years} yrs</dd>
              <dt>Availability</dt><dd>${esc(benchAvail(res))}</dd>
              <dt>Recommendation</dt><dd>${esc(r.fulfilment.action)}</dd>
            </dl>
          </div>
          <div class="ring-wrap">${UXM.charts.scoreRing(r.overall)}<div class="ring-label">Profile match</div>
            <div class="small" style="margin-top:4px">Best-fit score <b>${best.rankScore}</b></div></div>
          <div class="verdict">
            <div><span class="badge">${esc(r.verdict)}</span></div>
            <div><h4 style="margin:4px 0 6px">Why this resource</h4>${chips(whyBest(best, i), 'ok')}</div>
            ${best.adjustments.length ? `<div><h4 style="margin:4px 0 6px">Ranking adjustments</h4>${best.adjustments.map(adjChip).join('')}</div>` : ''}
            ${runnerUp ? `<div class="small muted">Runner-up: <b>${esc(runnerUp.resource.name)}</b> (${runnerUp.rankScore})</div>` : ''}
            <div class="result-actions">
              <button class="btn btn-sm" data-action="view" data-id="${res.id}">View full match</button>
              <button class="btn btn-sm" data-action="pipeline" data-id="${res.id}">Add to pipeline</button>
              <button class="btn btn-sm btn-primary" data-action="share" data-id="${res.id}">Share with account team →</button>
            </div>
          </div>
        </div>
      </div>
      ${compareCard(R)}
      <div class="card">
        <div class="card-head"><div><h2>All ranked resources</h2><span class="muted small">Best-fit score = profile match ± ranking adjustments. Tick up to 3 to compare.</span></div>
          <div class="result-actions">
            <button class="btn btn-sm ${state.compare.size >= 2 ? 'btn-primary' : ''}" data-action="compare" ${state.compare.size >= 2 ? '' : 'disabled'}>Compare selected (${state.compare.size})</button>
          </div></div>
        <div class="rank-list">${shown.map((x) => rankRow(x, R.ranked.indexOf(x))).join('')}</div>
        ${R.ranked.length > shown.length || state.showAllRanked ? `<button class="btn-link" data-action="toggle-all" style="margin-top:12px">${state.showAllRanked ? 'Show top 5 only' : `Show all ${R.ranked.length} resources`}</button>` : ''}
      </div>`;
  }

  // One compact row: the key numbers at a glance, adjustments summarised as a net figure.
  function rankRow(x, n) {
    const inf = benchInfo(x.resource), r = x.result;
    const tone = UXM.FIT_BANDS.find((b) => r.overall >= b.min).tone;
    const net = Math.round(x.adjustments.reduce((a, j) => a + j.points, 0));
    const shownAdj = x.adjustments.slice().sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    const picked = state.compare.has(x.resource.id);
    return `<div class="rank-row ${n === 0 ? 'top' : ''} ${picked ? 'picked' : ''}">
      <label class="rank-pick" title="Compare"><input type="checkbox" data-action="pick" data-id="${x.resource.id}" ${picked ? 'checked' : ''} ${!picked && state.compare.size >= 3 ? 'disabled' : ''} aria-label="Compare ${esc(x.resource.name)}"></label>
      <div class="rank-n">${n + 1}</div>
      <div class="rank-who"><b>${esc(x.resource.name)}</b>
        <div class="small muted">${esc(inf.level.name)} · ${x.profile.years} yrs${x.resource.location ? ' · ' + esc(x.resource.location) : ''}</div>
        <div class="small tone-${r.verdictTone}"><span class="status">${r.criticalGaps.length ? 'Conditional fit' : esc(r.fit.label)}</span> <span class="muted">· ${esc(benchAvail(x.resource))}</span></div></div>
      <div class="rank-match tone-${tone}"><div class="bar-cell"><div class="bar"><span style="width:${r.overall}%"></span></div><b>${Math.round(r.overall)}%</b></div><div class="small muted">profile match</div></div>
      <div class="rank-score"><b>${x.rankScore}</b><div class="small muted">best fit</div></div>
      <div class="rank-adj">${shownAdj.length ? `<span class="net ${net > 0 ? 'ok' : net < 0 ? 'miss' : ''}">${net > 0 ? '+' : ''}${net}</span>${shownAdj.slice(0, 2).map(adjChip).join('')}${shownAdj.length > 2 ? `<span class="chip" title="${esc(shownAdj.slice(2).map((a) => `${a.label} ${a.points > 0 ? '+' : ''}${a.points}`).join('\n'))}">+${shownAdj.length - 2} more</span>` : ''}` : '<span class="muted small">No adjustments</span>'}</div>
      <div class="rank-actions"><button class="btn btn-sm" data-action="view" data-id="${x.resource.id}">View</button>
        <button class="btn btn-sm" data-action="pipeline" data-id="${x.resource.id}" title="Add to pipeline">+ Pipeline</button></div>
    </div>`;
  }

  // Side-by-side comparison of 2–3 ranked resources on the numbers that decide the proposal.
  function compareCard(R) {
    if (!state.compareOpen || state.compare.size < 2) return '';
    const cols = R.ranked.filter((x) => state.compare.has(x.resource.id));
    const best = (vals) => Math.max(...vals);
    const rowsDef = R.ranked[0].result.rows.filter((row) => row.priority !== 'none').sort((a, b) => b.weight - a.weight);
    const line = (label, cells, hiVals) => {
      const top = hiVals ? best(hiVals) : null;
      return `<tr><th scope="row">${label}</th>${cells.map((c, k) => `<td class="${hiVals && hiVals[k] === top && cols.length > 1 ? 'best' : ''}">${c}</td>`).join('')}</tr>`;
    };
    const comp = (x, id) => x.result.rows.find((row) => row.id === id);
    return `<div class="card compare">
      <div class="card-head"><h2>Compare resources</h2><button class="btn btn-sm" data-action="close-compare">Close</button></div>
      <div class="table-scroll"><table class="compare-table">
        <thead><tr><th></th>${cols.map((x) => `<th><b>${esc(x.resource.name)}</b><div class="small muted">#${R.ranked.indexOf(x) + 1} · ${esc(benchInfo(x.resource).level.name)}</div></th>`).join('')}</tr></thead>
        <tbody>
          ${line('Best-fit score', cols.map((x) => `<b>${x.rankScore}</b>`), cols.map((x) => x.rankScore))}
          ${line('Profile match', cols.map((x) => `${Math.round(x.result.overall)}%`), cols.map((x) => x.result.overall))}
          ${line('Recommendation', cols.map((x) => esc(x.result.fulfilment.action)))}
          ${line('Experience', cols.map((x) => `${x.profile.years} yrs`))}
          ${line('Availability', cols.map((x) => esc(benchAvail(x.resource))))}
          ${line('Critical gaps', cols.map((x) => (x.result.criticalGaps.length ? chips(x.result.criticalGaps.map((g) => g.name), 'miss') : '<span class="tone-excellent"><span class="status">None</span></span>')), cols.map((x) => -x.result.criticalGaps.length))}
          ${line('Adjustments', cols.map((x) => x.adjustments.map(adjChip).join('') || '<span class="muted small">—</span>'))}
          <tr class="group"><th colspan="${cols.length + 1}">Skills the demand asks for</th></tr>
          ${rowsDef.map((d) => line(`${esc(d.name)} <span class="muted small">${priorityLabel[d.priority]}</span>`,
            cols.map((x) => { const m = comp(x, d.id).match; const t = UXM.FIT_BANDS.find((b) => m >= b.min).tone; return `<div class="bar-cell tone-${t}"><div class="bar"><span style="width:${m}%"></span></div><b>${m}%</b></div>`; }),
            cols.map((x) => comp(x, d.id).match))).join('')}
          <tr><th></th>${cols.map((x) => `<td><div class="result-actions"><button class="btn btn-sm" data-action="view" data-id="${x.resource.id}">View</button><button class="btn btn-sm" data-action="pipeline" data-id="${x.resource.id}">+ Pipeline</button><button class="btn btn-sm btn-primary" data-action="share" data-id="${x.resource.id}">Share</button></div></td>`).join('')}</tr>
        </tbody>
      </table></div>
    </div>`;
  }

  // Open the full match dashboard for a bench resource against a demand.
  function openBenchMatch(benchId, navigate = true, base = state.ranking ? state.ranking.inputs : readInputs()) {
    const res = loadBench().find((x) => x.id === benchId);
    if (!res) return false;
    const inputs = { ...base, name: res.name, empId: res.empId, resStatus: res.status, availableFrom: res.availableFrom, years: '', profileText: res.profileText };
    // Already proposed for this demand: open that pipeline entry so its adjustments and status carry over.
    const dup = navigate && store.get(STORE_KEY, []).find((x) => x.benchId === benchId && (x.inputs.demandId || x.role) === (inputs.demandId || inputs.jdTitle));
    if (dup) return openSaved(dup.id);
    return runAssessment(null, { inputs, benchId, fileName: res.fileName, navigate });
  }

  function addBenchToPipeline(benchId) {
    if (!openBenchMatch(benchId, false)) return;
    const c = state.current;
    const dup = store.get(STORE_KEY, []).find((x) => x.benchId === benchId && (x.inputs.demandId || x.role) === (c.inputs.demandId || roleName(c)));
    if (dup) { c.id = dup.id; return toast(`${dup.name} is already in the pipeline for this demand`); }
    saveCurrent();
    toast(`${resourceName(c.inputs)} added to the pipeline`);
  }

  function onRankingClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const id = el.dataset.id;
    if (el.dataset.action === 'view') openBenchMatch(id);
    if (el.dataset.action === 'share' && openBenchMatch(id)) openShare();
    if (el.dataset.action === 'pipeline') addBenchToPipeline(id);
    if (el.dataset.action === 'compare') { state.compareOpen = true; renderRanking(); $('.compare').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    if (el.dataset.action === 'close-compare') { state.compareOpen = false; renderRanking(); }
    if (el.dataset.action === 'toggle-all') { state.showAllRanked = !state.showAllRanked; renderRanking(); }
  }

  function onRankingChange(e) {
    const el = e.target;
    if (el.dataset.action !== 'pick') return;
    el.checked ? state.compare.add(el.dataset.id) : state.compare.delete(el.dataset.id);
    if (state.compare.size < 2) state.compareOpen = false;
    renderRanking();
  }

  // ---------- bench view ----------
  function renderBench() {
    const list = loadBench();
    const f = state.benchFilter;
    const count = (st) => list.filter((r) => r.status === st).length;
    const tile = (v, k) => `<div class="tile"><div class="v">${v}</div><div class="k">${k}</div></div>`;
    $('#view-bench').innerHTML = `
      <div class="tiles">
        ${tile(list.length, 'Resources on roster')}
        ${RES_STATUSES.map((st) => tile(count(st), st)).join('')}
      </div>
      <div class="card">
        <div class="card-head"><h2>Bench resources</h2>
          <div class="row" style="align-items:center">
            <button class="btn btn-sm" data-action="add">+ Add resource</button>
            <button class="btn-link" data-action="restore-samples">Add sample resources</button>
          </div></div>
        <label class="dropzone" id="bench-bulk">
          <input type="file" multiple accept=".pdf,.docx,.doc,.rtf,.odt,.txt,.md">
          <span class="dz-icon" aria-hidden="true">⬆</span>
          <span><b>Drop one or more resource profiles</b> or <u>browse</u> — each file becomes a bench resource</span>
          <span class="dz-types">PDF · Word (.docx, .doc) · RTF · ODT · TXT</span>
          <span class="dz-status" id="bench-bulk-status" role="status"></span>
        </label>
        <div class="row" style="margin-bottom:12px">
          <div class="field" style="margin:0;flex:2 1 220px"><label for="bench-q">Search</label><input type="text" id="bench-q" data-bfilter="q" placeholder="Name, employee ID, skill, location…" value="${esc(f.q)}"></div>
          <div class="field" style="margin:0"><label for="bench-level">Level</label><select id="bench-level" data-bfilter="level"><option value="">All levels</option>${UXM.ROLE_LEVELS.map((l) => `<option value="${l.id}" ${f.level === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
          <div class="field" style="margin:0"><label for="bench-status">Status</label><select id="bench-status" data-bfilter="status"><option value="">All statuses</option>${RES_STATUSES.map((st) => `<option ${f.status === st ? 'selected' : ''}>${st}</option>`).join('')}</select></div>
        </div>
        <div id="bench-table"></div>
      </div>`;
    bindBulkDrop($('#bench-bulk'));
    renderBenchTable();
  }

  function renderBenchTable() {
    const f = state.benchFilter;
    const q = f.q.trim().toLowerCase();
    const order = Object.fromEntries(UXM.ROLE_LEVELS.map((l, n) => [l.id, n]));
    const rows = loadBench()
      .map((r) => ({ r, info: benchInfo(r) }))
      .filter(({ r, info }) => (!f.level || info.level.id === f.level) && (!f.status || r.status === f.status)
        && (!q || [r.name, r.empId, r.location, info.level.name, ...info.top, r.profileText].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => order[a.info.level.id] - order[b.info.level.id] || a.r.name.localeCompare(b.r.name));
    $('#bench-table').innerHTML = `<div class="table-scroll"><table class="bench-table">
      <thead><tr><th>Resource</th><th>Level</th><th>Status</th><th class="hide-sm">Available from</th><th class="hide-sm">Location</th><th class="hide-sm">Top skills</th><th></th></tr></thead>
      <tbody>${rows.map(({ r, info }) => `<tr>
        <td><b>${esc(r.name)}</b><div class="small muted">${esc(r.empId || '')}${r.fileName ? ' · 📎' : ''}</div></td>
        <td class="small">${esc(info.level.name)}${info.level.alt ? `<div class="muted">${esc(info.level.alt)}-ready</div>` : ''}<div class="muted">${info.years} yrs</div></td>
        <td><select data-action="bstatus" data-id="${r.id}" style="width:auto" aria-label="Status for ${esc(r.name)}">${RES_STATUSES.map((st) => `<option ${st === r.status ? 'selected' : ''}>${st}</option>`).join('')}</select></td>
        <td class="hide-sm"><input type="date" value="${esc(r.availableFrom || '')}" data-action="bavail" data-id="${r.id}" aria-label="Available from for ${esc(r.name)}" style="width:auto"></td>
        <td class="hide-sm small">${esc(r.location || '')}</td>
        <td class="hide-sm">${chips(info.top, '')}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm" data-action="match" data-id="${r.id}" title="Match against the demand on the Demand match tab">Match</button>
          <button class="btn btn-sm" data-action="edit" data-id="${r.id}">Edit</button>
          <button class="btn btn-sm" data-action="delete" data-id="${r.id}" aria-label="Remove ${esc(r.name)}">✕</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="muted">No resources match these filters.</td></tr>'}</tbody>
    </table></div>`;
  }

  function onBenchClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case 'add': openBenchDialog(null); break;
      case 'edit': openBenchDialog(id); break;
      case 'delete': {
        const r = loadBench().find((x) => x.id === id);
        if (r && confirm(`Remove ${r.name} from the bench roster?`)) {
          saveBench(loadBench().filter((x) => x.id !== id));
          fileStore.del('bench:' + id);
          renderBench();
        }
        break;
      }
      case 'match':
        if (readInputs().jdText.trim().length < 40) { toast('Add the demand JD on the Demand match tab first'); showView('assess'); break; }
        openBenchMatch(id, true, readInputs());
        break;
      case 'restore-samples': {
        const list = loadBench();
        const have = new Set(list.map((r) => r.empId));
        const add = sampleBench().filter((r) => !have.has(r.empId));
        saveBench([...list, ...add]);
        renderBench();
        toast(add.length ? `Added ${add.length} sample resources` : 'All sample resources are already on the roster');
        break;
      }
    }
  }

  function onBenchChange(e) {
    const el = e.target;
    if (el.dataset.bfilter && el.dataset.bfilter !== 'q') { state.benchFilter[el.dataset.bfilter] = el.value; renderBenchTable(); return; }
    if (el.dataset.action === 'bstatus' || el.dataset.action === 'bavail') {
      const list = loadBench();
      const r = list.find((x) => x.id === el.dataset.id);
      if (!r) return;
      r[el.dataset.action === 'bstatus' ? 'status' : 'availableFrom'] = el.value;
      saveBench(list);
      renderBench();
    }
  }

  async function addFilesToBench(files, status) {
    const setMsg = (msg, cls) => { status.textContent = msg; status.className = 'dz-status ' + (cls || ''); };
    const list = loadBench();
    const failed = [];
    let added = 0;
    for (const [n, file] of files.entries()) {
      setMsg(`Reading ${n + 1} of ${files.length}: ${file.name}…`);
      try {
        if (file.size > MAX_UPLOAD) throw new Error('larger than 15 MB');
        const { text } = await UXM.extractText(file);
        if (text.trim().length < 40) throw new Error('no readable text');
        const id = newId('b');
        list.push({
          id, name: guessName(text) || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
          empId: (text.match(/\b(?:emp(?:loyee)?\.?\s*(?:id|no|number)?\s*[:#-]?\s*)([A-Z]{0,3}\d{4,8})\b/i) || [])[1] || '',
          status: 'Bench', availableFrom: isoIn(0), location: '', profileText: text, fileName: file.name, addedAt: new Date().toISOString(),
        });
        await fileStore.put('bench:' + id, file);
        added++;
      } catch (err) {
        failed.push(`${file.name} (${err.message})`);
      }
    }
    saveBench(list);
    renderBench();
    const msg = `✓ Added ${added} resource${added === 1 ? '' : 's'}${failed.length ? ` · could not read: ${failed.join(', ')}` : ''}`;
    const st = $('#bench-bulk-status');
    if (st) { st.textContent = msg; st.className = 'dz-status ' + (failed.length ? 'warn' : 'ok'); }
  }

  function bindBulkDrop(zone) {
    const input = $('input[type=file]', zone);
    const status = $('.dz-status', zone);
    input.addEventListener('change', () => { if (input.files.length) addFilesToBench([...input.files], status); });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag');
      if (e.dataTransfer.files.length) addFilesToBench([...e.dataTransfer.files], status);
    });
  }

  // ---------- add / edit bench resource dialog ----------
  function openBenchDialog(id) {
    const r = id ? loadBench().find((x) => x.id === id) : null;
    state.benchEditId = id;
    state.benchFile = null;
    $('#bench-dialog-title').textContent = r ? `Edit ${r.name}` : 'Add bench resource';
    $('#b-name').value = r ? r.name : '';
    $('#b-emp').value = r ? r.empId : '';
    $('#b-status').value = r ? r.status : 'Bench';
    $('#b-available').value = r ? r.availableFrom || '' : isoIn(0);
    $('#b-location').value = r ? r.location || '' : '';
    $('#b-text').value = r ? r.profileText : '';
    $('#b-file-status').textContent = r && r.fileName ? `📎 ${r.fileName}` : '';
    $('#b-file-status').className = 'dz-status';
    $('#bench-dialog').showModal();
  }

  function initBenchDialog() {
    const dlg = $('#bench-dialog');
    const zone = $('[data-bench-file]', dlg);
    const input = $('#b-file');
    const status = $('#b-file-status');
    const read = async (file) => {
      status.textContent = 'Reading ' + file.name + '…';
      status.className = 'dz-status';
      try {
        const { text, format } = await UXM.extractText(file);
        if (text.trim().length < 20) throw new Error('No readable text found — paste the text instead.');
        $('#b-text').value = text;
        if (!$('#b-name').value.trim()) $('#b-name').value = guessName(text);
        state.benchFile = file;
        status.textContent = `✓ ${file.name} · ${format}`;
        status.className = 'dz-status ok';
      } catch (err) {
        status.textContent = err.message;
        status.className = 'dz-status err';
      }
    };
    input.addEventListener('change', () => { if (input.files[0]) read(input.files[0]); input.value = ''; });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('drag'); if (e.dataTransfer.files[0]) read(e.dataTransfer.files[0]); });

    dlg.addEventListener('close', async () => {
      if (dlg.returnValue !== 'save') return;
      const list = loadBench();
      const fields = {
        name: $('#b-name').value.trim(), empId: $('#b-emp').value.trim(), status: $('#b-status').value,
        availableFrom: $('#b-available').value, location: $('#b-location').value.trim(), profileText: $('#b-text').value,
      };
      let r = state.benchEditId && list.find((x) => x.id === state.benchEditId);
      if (r) Object.assign(r, fields);
      else { r = { id: newId('b'), ...fields, fileName: null, addedAt: new Date().toISOString() }; list.push(r); }
      if (state.benchFile) { r.fileName = state.benchFile.name; await fileStore.put('bench:' + r.id, state.benchFile); }
      saveBench(list);
      renderBench();
      toast(`${r.name} saved to the bench roster`);
    });
  }

  // ---------- framework reference ----------
  function renderFramework() {
    const pct = (v) => (v == null ? '—' : v + '%');
    const presets = Object.entries(UXM.WEIGHT_PRESETS);
    $('#view-framework').innerHTML = `
      <div class="card">
        <h2>UX Profile-to-JD Match Assessment Framework</h2>
        <p class="muted" style="margin-top:6px">Compares a resource's UX profile against a demand's job description across seniority levels: JD analysis → dynamic weight allocation → profile validation → adaptive match score → critical-skill validation → gaps, recommendations and development roadmap.</p>
      </div>
      <div class="grid grid-2">
        <div class="card"><h2 style="margin-bottom:10px">Roles covered</h2>
          <table><thead><tr><th>Role level</th><th>Experience</th><th class="num">Baseline expectation</th></tr></thead>
          <tbody>${UXM.ROLE_LEVELS.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.experience)}</td><td class="num">${l.expectation}</td></tr>`).join('')}</tbody></table></div>
        <div class="card"><h2 style="margin-bottom:10px">Fit assessment &amp; readiness</h2>
          <table><thead><tr><th>Match score</th><th>Recommendation</th><th>Career readiness</th></tr></thead>
          <tbody>${UXM.FIT_BANDS.map((b, i) => `<tr><td>${b.min ? b.min + '–' + (i ? UXM.FIT_BANDS[i - 1].min - 1 : 100) + '%' : 'Below 60%'}</td><td class="tone-${b.tone}"><span class="status">${b.label}</span></td><td>${UXM.READINESS_SCALE[i].label}</td></tr>`).join('')}</tbody></table>
          <p class="small muted" style="margin-top:10px"><b>Critical skill validation:</b> if any competency marked Critical in the JD matches below ${UXM.CRITICAL_THRESHOLD}%, the result becomes “Conditional Fit – Missing Critical … Capability”, regardless of the overall score.</p></div>
      </div>
      <div class="card"><h2 style="margin-bottom:10px">Competency weight models</h2>
        <div class="table-scroll"><table><thead><tr><th>Competency</th>${presets.map(([, p]) => `<th class="num">${esc(p.name.replace(/ — /, ' '))}</th>`).join('')}</tr></thead>
        <tbody>${UXM.COMPETENCIES.map((c) => `<tr><td>${esc(c.name)}</td>${presets.map(([, p]) => `<td class="num">${pct(p.weights[c.id])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <p class="small muted" style="margin-top:10px">“Dynamic — derived from JD” starts from the framework default, then scales each competency by its JD priority (critical ×2.2, important ×1.4, nice-to-have ×0.8, not mentioned ×0.5), mention frequency and the role level's leadership factor, and normalises to 100%.</p></div>
      <div class="grid grid-2">${UXM.COMPETENCIES.map((c, i) => `<div class="card comp-card">
        <h3><span>${i + 1}. ${esc(c.name)}</span><span class="muted">${c.weight}%</span></h3>
        <div style="margin-top:10px">${c.subskills.map((s) => chip(s.name)).join('')}</div></div>`).join('')}</div>`;
  }

  // ---------- home ----------
  // Demands come from the pipeline (each entry carries its JD), plus the sample demands.
  function knownDemands() {
    const map = new Map();
    for (const x of store.get(STORE_KEY, [])) {
      const k = demandKey(x);
      if (!map.has(k)) map.set(k, { key: k, demandId: x.inputs.demandId, account: x.inputs.account, title: x.role, location: x.inputs.location, startDate: x.inputs.startDate, jdText: x.inputs.jdText, entries: [] });
      map.get(k).entries.push(x);
    }
    return [...map.values()];
  }
  const demandInputs = (d) => ({ demandId: d.demandId || '', account: d.account || '', jdTitle: d.title || '', location: d.location || '', startDate: d.startDate || '', jdText: d.jdText, levelChoice: 'auto', weightMode: 'auto' });
  const isFilled = (d) => d.entries.some((x) => x.status === 'Allocated');
  const ACTIVE = ['Shortlisted', 'Shared with account', 'Account interview', 'Selected'];

  function renderHome() {
    const bench = loadBench();
    const pipe = store.get(STORE_KEY, []);
    const t = today();
    const free = bench.filter((r) => r.status !== 'Allocated');
    const availableNow = free.filter((r) => r.status !== 'Partially allocated' && (!r.availableFrom || r.availableFrom <= t));
    const rollingSoon = bench.filter((r) => r.status === 'Rolling off' && r.availableFrom > t && daysBetween(t, r.availableFrom) <= 14);
    const demands = knownDemands();
    const open = demands.filter((d) => !isFilled(d));
    const shared = pipe.filter((x) => ['Shared with account', 'Account interview', 'Selected', 'Allocated'].includes(x.status)).length;
    const won = pipe.filter((x) => ['Selected', 'Allocated'].includes(x.status)).length;
    const waiting = pipe.filter((x) => ['Shared with account', 'Account interview'].includes(x.status));

    // Rank the free bench against every open demand once; reuse it for demand cards and idle resources.
    const rankings = new Map(open.map((d) => [d.key, rankFor(demandInputs(d), free).ranked]));
    const inPlay = new Set(pipe.filter((x) => ACTIVE.includes(x.status)).map((x) => x.benchId).filter(Boolean));
    const bestDemandFor = (res) => {
      let best = null;
      for (const d of open) {
        const x = rankings.get(d.key).find((y) => y.resource.id === res.id);
        if (x && (!best || x.rankScore > best.x.rankScore)) best = { d, x };
      }
      return best;
    };

    const todo = [];
    const lastAt = (x) => (x.history && x.history.length ? x.history[x.history.length - 1].at.slice(0, 10) : t);
    pipe.filter((x) => x.status === 'Shared with account' && daysBetween(lastAt(x), t) >= 5).forEach((x) => todo.push({
      tone: 'conditional', icon: '⏱', weight: 3,
      text: `Follow up with <b>${esc(x.inputs.account || 'the account')}</b> on ${esc(x.name)} — shared ${daysBetween(lastAt(x), t)} days ago with no response`,
      meta: demandLabel(x), btn: ['Open', `data-action="open-entry" data-id="${x.id}"`] }));
    pipe.filter((x) => x.status === 'Account interview').forEach((x) => todo.push({
      tone: 'good', icon: '◉', weight: 2,
      text: `Prepare <b>${esc(x.name)}</b> for the ${esc(x.inputs.account || 'account')} interview`,
      meta: demandLabel(x), btn: ['Interview prep', `data-action="open-entry" data-id="${x.id}"`] }));
    open.filter((d) => !d.entries.some((x) => x.status !== 'Shortlisted' && x.status !== 'Rejected' && x.status !== 'On hold')).forEach((d) => todo.push({
      tone: 'weak', icon: '◎', weight: 4,
      text: `No profile shared yet for <b>${esc(d.title)}</b>${d.account ? ` at ${esc(d.account)}` : ''}`,
      meta: [d.demandId, d.startDate ? `start ${fmtDate(d.startDate)}` : ''].filter(Boolean).join(' · '),
      btn: ['Find best fit', `data-action="rank-demand" data-key="${esc(d.key)}"`] }));
    // Idle or soon-free resources, with the open demand they fit best (only suggested when it's a real fit).
    const idleItem = (r, soon) => {
      const b = bestDemandFor(r);
      const fits = b && b.x.result.overall >= 60;
      todo.push({
        tone: 'moderate', icon: soon ? '↘' : '◌', weight: (fits ? 2.5 : 1) - (soon ? 0.5 : 0),
        text: `<b>${esc(r.name)}</b> ${soon ? `rolls off in ${daysBetween(t, r.availableFrom)} days` : 'is on the bench'} with nothing lined up${fits ? ` — good fit for <b>${esc(b.d.title)}</b> (${Math.round(b.x.result.overall)}% match)` : ' — no open demand fits yet'}`,
        meta: `${benchInfo(r).level.name}${r.location ? ' · ' + r.location : ''}`,
        btn: fits ? ['View match', `data-action="match-demand" data-id="${r.id}" data-key="${esc(b.d.key)}"`] : ['Bench', 'data-action="go" data-view="bench"'] });
    };
    availableNow.filter((r) => !inPlay.has(r.id)).forEach((r) => idleItem(r, false));
    rollingSoon.filter((r) => !inPlay.has(r.id)).forEach((r) => idleItem(r, true));
    todo.sort((a, b) => b.weight - a.weight);

    const tile = (v, k, sub = '') => `<div class="tile"><div class="v">${v}</div><div class="k">${k}</div>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>`;
    const hour = new Date().getHours();
    const stageCount = (d, st) => d.entries.filter((x) => x.status === st).length;
    const levels = UXM.ROLE_LEVELS.map((l) => ({ l, all: free.filter((r) => benchInfo(r).level.id === l.id), now: availableNow.filter((r) => benchInfo(r).level.id === l.id).length })).filter((x) => x.all.length);
    const maxLevel = Math.max(1, ...levels.map((x) => x.all.length));

    $('#view-home').innerHTML = `
      <div class="home-hero">
        <div><h1>${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}</h1>
          <p class="muted">${availableNow.length} resource${availableNow.length === 1 ? ' is' : 's are'} available now, ${open.length} demand${open.length === 1 ? ' is' : 's are'} open and ${todo.length} thing${todo.length === 1 ? ' needs' : 's need'} your attention.</p></div>
        <div class="result-actions">
          <button class="btn" data-action="go" data-view="bench">+ Add bench resources</button>
          <button class="btn btn-primary" data-action="new-demand">New demand →</button>
        </div>
      </div>
      <div class="tiles">
        ${tile(availableNow.length, 'Available now', `of ${bench.length} on the roster`)}
        ${tile(rollingSoon.length, 'Rolling off in 14 days')}
        ${tile(open.length, 'Open demands')}
        ${tile(waiting.length, 'Awaiting account feedback')}
        ${tile(shared ? Math.round((won / shared) * 100) + '%' : '—', 'Selection rate', `${won} of ${shared} shared`)}
      </div>
      <div class="home-grid">
        <div class="card">
          <div class="card-head"><h2>Needs your attention</h2><span class="muted small">Most urgent first</span></div>
          ${todo.length ? `<ul class="todo">${todo.slice(0, 8).map((x) => `<li class="tone-${x.tone}">
              <span class="todo-icon" aria-hidden="true">${x.icon}</span>
              <div><div>${x.text}</div>${x.meta ? `<div class="small muted">${esc(x.meta)}</div>` : ''}</div>
              <button class="btn btn-sm" ${x.btn[1]}>${x.btn[0]}</button></li>`).join('')}</ul>
            ${todo.length > 8 ? `<p class="small muted" style="margin-top:8px">+${todo.length - 8} more</p>` : ''}`
            : '<p class="muted">Nothing urgent. Every open demand has a profile with the account and no one is idle.</p>'}
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-head"><h2>Open demands</h2><button class="btn-link" data-action="go" data-view="pipeline">Pipeline →</button></div>
            ${open.length ? open.map((d) => {
              const top = rankings.get(d.key)[0];
              const days = d.startDate ? daysBetween(t, d.startDate) : null;
              return `<div class="demand-card">
                <div class="dc-head"><div><b>${esc(d.title)}</b><div class="small muted">${esc([d.demandId, d.account, d.location].filter(Boolean).join(' · '))}</div></div>
                  ${days != null ? chip(days < 0 ? `${-days}d overdue` : `starts in ${days}d`, days <= 3 ? 'miss' : '') : ''}</div>
                <div class="stages">${ACTIVE.map((st) => `<span class="stage ${stageCount(d, st) ? 'on' : ''}" title="${st}">${{ 'Shared with account': 'Shared', 'Account interview': 'Interview' }[st] || st} <b>${stageCount(d, st)}</b></span>`).join('')}</div>
                ${top ? `<div class="small" style="margin-top:8px">Best on bench: <b>${esc(top.resource.name)}</b> · ${Math.round(top.result.overall)}% match</div>` : ''}
                <div class="result-actions" style="margin-top:8px"><button class="btn btn-sm" data-action="rank-demand" data-key="${esc(d.key)}">Rank bench</button></div>
              </div>`;
            }).join('') : `<p class="muted small">No open demands in the pipeline. Start with <button class="btn-link" data-action="new-demand">a new demand</button>.</p>`}
          </div>
          <div class="card">
            <div class="card-head"><h2>Bench by level</h2><span class="muted small">Not allocated · <b>■</b> available now</span></div>
            ${levels.map(({ l, all, now }) => `<div class="hbar lvl"><span class="hbar-name">${esc(l.name)}</span>
              <div class="bar" title="${now} available now of ${all.length}"><span class="faint" style="width:${(all.length / maxLevel) * 100}%"></span><span style="width:${(now / maxLevel) * 100}%"></span></div><b class="num">${all.length}</b></div>`).join('') || '<p class="muted small">No resources on the bench.</p>'}
          </div>
        </div>
      </div>`;
  }

  function onHomeClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const d = el.dataset.key && knownDemands().find((x) => x.key === el.dataset.key);
    switch (el.dataset.action) {
      case 'go': showView(el.dataset.view); break;
      case 'new-demand': newDemand(); break;
      case 'open-entry': openSaved(el.dataset.id); break;
      case 'rank-demand': if (d) rankDemand(d); break;
      case 'match-demand': if (d) openBenchMatch(el.dataset.id, true, demandInputs(d)); break;
    }
  }

  // ---------- command bar ----------
  const cmdk = { items: [], shown: [], sel: 0 };

  function commandItems() {
    const items = [
      ...[['home', 'Home'], ['assess', 'Demand match'], ['bench', 'Bench resources'], ['pipeline', 'Resource pipeline'], ['framework', 'How it works']]
        .map(([v, n]) => ({ group: 'Go to', label: n, run: () => showView(v) })),
      ...(state.current ? [{ group: 'Go to', label: `Last match: ${resourceName(state.current.inputs)} → ${roleName(state.current)}`, run: () => showView('results') }] : []),
      { group: 'Action', label: 'New demand', hint: 'Clear the form and paste a JD', run: newDemand },
      { group: 'Action', label: 'Add bench resource', run: () => { showView('bench'); openBenchDialog(null); } },
      { group: 'Action', label: 'Upload profiles to the bench', run: () => { showView('bench'); $('#bench-bulk input').click(); } },
      { group: 'Action', label: 'Switch light / dark theme', run: toggleTheme },
    ];
    const seen = new Set();
    knownDemands().forEach((d) => { seen.add(d.demandId); items.push({ group: 'Demand', label: `Rank bench for ${d.title}`, hint: [d.demandId, d.account].filter(Boolean).join(' · '), run: () => rankDemand(d) }); });
    UXM.SAMPLE_JDS.filter((x) => !seen.has(x.demandId)).forEach((x) => items.push({ group: 'Sample demand', label: `Rank bench for ${x.title}`, hint: `${x.demandId} · ${x.account}`,
      run: () => rankDemand({ demandId: x.demandId, account: x.account, title: x.title, location: x.location, startDate: isoIn(14), jdText: x.text }) }));
    const R = state.ranking;
    loadBench().forEach((r) => {
      const info = benchInfo(r);
      items.push({ group: 'Resource', label: r.name, hint: `${info.level.name} · ${r.status}${R ? ' · match to current demand' : ''}`, keywords: [r.empId, r.location, ...info.top].join(' '),
        run: () => (R ? openBenchMatch(r.id, true, R.inputs) : (showView('bench'), openBenchDialog(r.id))) });
    });
    store.get(STORE_KEY, []).forEach((x) => items.push({ group: 'Pipeline', label: `${x.name} → ${x.role}`, hint: `${x.inputs.demandId || ''} · ${x.status}`, run: () => openSaved(x.id) }));
    return items;
  }

  function openCommandBar() {
    const dlg = $('#cmdk');
    if (dlg.open) return;
    cmdk.items = commandItems();
    $('#cmdk-input').value = '';
    filterCommands();
    dlg.showModal();
    $('#cmdk-input').focus();
  }

  function filterCommands() {
    const words = $('#cmdk-input').value.toLowerCase().split(/\s+/).filter(Boolean);
    cmdk.shown = cmdk.items.filter((it) => {
      const hay = [it.group, it.label, it.hint, it.keywords].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    }).slice(0, 40);
    cmdk.sel = 0;
    renderCommands();
  }

  function renderCommands() {
    let group = '';
    $('#cmdk-list').innerHTML = cmdk.shown.map((it, n) => {
      const head = it.group !== group ? `<li class="cmdk-group" role="presentation">${esc((group = it.group))}</li>` : '';
      return `${head}<li role="option" id="cmdk-${n}" data-n="${n}" aria-selected="${n === cmdk.sel}"><span>${esc(it.label)}</span>${it.hint ? `<span class="muted small">${esc(it.hint)}</span>` : ''}</li>`;
    }).join('') || '<li class="cmdk-empty">No matches</li>';
    $('#cmdk-input').setAttribute('aria-activedescendant', cmdk.shown.length ? 'cmdk-' + cmdk.sel : '');
    const cur = $('#cmdk-' + cmdk.sel);
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  function runCommand(n) {
    const it = cmdk.shown[n];
    if (!it) return;
    $('#cmdk').close();
    it.run();
  }

  function initCommandBar() {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    $('#cmdk-key').textContent = isMac ? '⌘K' : 'Ctrl K';
    $('#cmdk-open').addEventListener('click', openCommandBar);
    $('#cmdk-input').addEventListener('input', filterCommands);
    $('#cmdk-input').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = cmdk.shown.length;
        if (n) { cmdk.sel = (cmdk.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; renderCommands(); }
      }
      if (e.key === 'Enter') { e.preventDefault(); runCommand(cmdk.sel); }
    });
    $('#cmdk-list').addEventListener('click', (e) => { const li = e.target.closest('[data-n]'); if (li) runCommand(+li.dataset.n); });
    $('#cmdk').addEventListener('click', (e) => { if (e.target.id === 'cmdk') $('#cmdk').close(); });
    document.addEventListener('keydown', (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing && !document.querySelector('dialog[open]'))) {
        e.preventDefault();
        openCommandBar();
      }
    });
  }

  // ---------- theme ----------
  function effectiveTheme() {
    return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
  function applyTheme(theme) {
    if (theme) document.documentElement.dataset.theme = theme;
    $('#theme-toggle').textContent = effectiveTheme() === 'dark' ? '☀' : '☾';
  }
  function toggleTheme() {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    store.set(THEME_KEY, next);
    applyTheme(next);
  }

  // ---------- init ----------
  function init() {
    UXM.SAMPLE_JDS.forEach((s) => $('#jd-sample').insertAdjacentHTML('beforeend', `<option value="${s.id}">${esc(s.demandId + ' · ' + s.title)}</option>`));
    UXM.SAMPLE_PROFILES.forEach((s) => $('#profile-sample').insertAdjacentHTML('beforeend', `<option value="${s.id}">${esc(s.name)}</option>`));
    UXM.ROLE_LEVELS.forEach((l) => $('#level-choice').insertAdjacentHTML('beforeend', `<option value="${l.id}">${esc(l.name)}</option>`));
    Object.entries(UXM.WEIGHT_PRESETS).forEach(([k, p]) => $('#weight-mode').insertAdjacentHTML('beforeend', `<option value="${k}">${esc(p.name)}</option>`));

    const draft = store.get(DRAFT_KEY, null);
    if (draft) writeInputs(draft);

    $('#jd-sample').addEventListener('change', (e) => {
      const s = UXM.SAMPLE_JDS.find((x) => x.id === e.target.value);
      if (s) {
        writeInputs({ ...readInputs(), jdTitle: s.title, jdText: s.text, demandId: s.demandId, account: s.account, location: s.location, startDate: isoIn(14) });
        $('#jd-file-status').textContent = '';
        saveDraft();
        if (state.matchMode === 'bench') runRanking();
      }
      e.target.value = '';
    });
    $('#profile-sample').addEventListener('change', (e) => {
      const s = UXM.SAMPLE_PROFILES.find((x) => x.id === e.target.value);
      if (s) {
        writeInputs({ ...readInputs(), name: s.name, empId: s.empId, resStatus: s.status, availableFrom: isoIn(s.status === 'Bench' ? 0 : 10), years: '', profileText: s.text });
        state.profileFile = null;
        $('#profile-file-status').textContent = '';
        saveDraft();
      }
      e.target.value = '';
    });

    document.querySelectorAll('.dropzone').forEach((zone) => {
      const input = $('input[type=file]', zone);
      input.addEventListener('change', () => { if (input.files[0]) loadFile(zone, input.files[0]); input.value = ''; });
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag');
        if (e.dataTransfer.files[0]) loadFile(zone, e.dataTransfer.files[0]);
      });
    });
    // Stop files dropped outside a dropzone from navigating away from the app.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    $('#view-assess').addEventListener('input', saveDraft);
    $('#view-assess').addEventListener('change', saveDraft);
    $('#demand-form').addEventListener('input', queueLiveRanking);
    $('#demand-form').addEventListener('change', (e) => { if (e.target.type !== 'file') queueLiveRanking(); });
    $('#demand-strip').addEventListener('click', (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      if (a.dataset.action === 'edit-demand') { setDemandCollapsed(false); $('#jd-text').focus(); }
      if (a.dataset.action === 'new-demand') newDemand();
    });
    $('#profile-text').addEventListener('input', () => { if (!$('#profile-text').value.trim()) state.profileFile = null; });
    $('#run').addEventListener('click', () => (state.matchMode === 'bench' ? runRanking() : runAssessment()));
    document.querySelectorAll('[data-match-mode]').forEach((b) => b.addEventListener('click', () => setMatchMode(b.dataset.matchMode)));
    $('#bench-panel').addEventListener('change', (e) => {
      if (e.target.dataset.include) { e.target.checked ? state.include.add(e.target.dataset.include) : state.include.delete(e.target.dataset.include); renderBenchPanel(); }
    });
    $('#bench-panel').addEventListener('click', (e) => { if (e.target.closest('[data-action=go-bench]')) showView('bench'); });
    $('#ranking').addEventListener('click', onRankingClick);
    $('#ranking').addEventListener('change', onRankingChange);
    $('#view-home').addEventListener('click', onHomeClick);
    const bench = $('#view-bench');
    bench.addEventListener('click', onBenchClick);
    bench.addEventListener('change', onBenchChange);
    bench.addEventListener('input', (e) => { if (e.target.dataset.bfilter === 'q') { state.benchFilter.q = e.target.value; renderBenchTable(); } });
    initBenchDialog();

    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

    const results = $('#view-results');
    results.addEventListener('click', onResultsClick);
    results.addEventListener('change', onResultsChange);
    results.addEventListener('input', onResultsInput);
    results.addEventListener('toggle', (e) => {
      if (!e.target.classList.contains('guide')) return;
      store.set(GUIDE_KEY, e.target.open);
      $('summary .muted', e.target).textContent = (e.target.open ? 'Hide' : 'Show') + ' guide';
    }, true);
    const pipeline = $('#view-pipeline');
    pipeline.addEventListener('click', onPipelineClick);
    pipeline.addEventListener('change', onPipelineChange);
    bindBoardDrag(pipeline);
    pipeline.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.tile-link')) e.target.click(); });
    initCommandBar();
    applyTheme(store.get(THEME_KEY, null));
    $('#theme-toggle').addEventListener('click', toggleTheme);
    $('#share-dialog').addEventListener('click', (e) => {
      const b = e.target.closest('[data-share]');
      if (b) onShare(b.dataset.share);
      const a = e.target.closest('[data-audience]');
      if (a) setShareAudience(a.dataset.audience);
    });
    $('#share-option').addEventListener('change', () => { if (state.shareAudience === 'resource') fillShareMessage(); });

    seedBench();
    seedPipeline();
    // Sample entries saved before reject reasons existed get the reason they were seeded with.
    const pipe = store.get(STORE_KEY, []);
    const SAMPLE_REASON = { 'DMD-1042': 'Skills gap', 'DMD-1063': 'Level / seniority mismatch' };
    if (pipe.some((x) => x.sample && x.status === 'Rejected' && x.rejectReason == null)) {
      pipe.forEach((x) => { if (x.sample && x.status === 'Rejected' && x.rejectReason == null) x.rejectReason = SAMPLE_REASON[x.inputs.demandId] || ''; });
      store.set(STORE_KEY, pipe);
    }
    renderFramework();
    renderBenchPanel();
    updateCount();
    renderHome();
  }

  init();
})();
