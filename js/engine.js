/*
 * Scoring engine: JD analysis → dynamic weights → profile evidence →
 * weighted match, critical-skill validation, gaps, recommendations, roadmap.
 */
(function (root) {
  const UXM = root.UXM;
  const PRIORITY = { none: 0, nice: 1, important: 2, critical: 3 };
  const PRIORITY_NAMES = ['none', 'nice', 'important', 'critical'];

  const NICE_RE = /nice[- ]to[- ]have|\bbonus\b|preferred|\ba plus\b|desirable|advantageous|\bideally\b|familiarity|exposure to|good to have/;
  const CRIT_RE = /\bmust\b|\brequired\b|essential|mandatory|\bstrong\b|\bexpert|proven|\bdeep\b|extensive|\bsolid\b|demonstrated|\bminimum\b|track record|\badvanced\b|significant/;
  const HEADER_RE = /^(requirements?|qualifications?|minimum qualifications|basic qualifications|must[- ]haves?|nice[- ]to[- ]haves?|preferred( qualifications| skills)?|bonus( points)?|what you.?ll need|what we.?re looking for|about you|who you are|responsibilities|key responsibilities|what you.?ll do|the role|desired( skills)?|essential( skills)?|skills|experience)\b/;
  const OWNERSHIP_RE = /\b(led|lead|owned|own|drove|drive|established|spearheaded|built|created|designed|launched|defined|ran|conducted|facilitated|managed|scaled|introduced|championed|architected|delivered|initiated|mentored|shaped)\b/g;
  const OUTCOME_RE = /\d+(\.\d+)?\s?%|\b\d+x\b|\$\s?\d|\b(increased|reduced|improved|grew|saved|boosted|cut|decreased|lifted|raised)\b/g;
  const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';

  // ---------- text helpers ----------
  const kwCache = new Map();
  function kwRegex(kw) {
    if (kwCache.has(kw)) return kwCache.get(kw);
    const exact = kw.startsWith('=');
    const body = (exact ? kw.slice(1) : kw).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const re = new RegExp('(?:^|[^a-z0-9])' + body + (exact ? '(?![a-z0-9])' : ''));
    kwCache.set(kw, re);
    return re;
  }
  const matchesAny = (text, kws) => kws.some((k) => kwRegex(k).test(text));
  const norm = (t) => (t || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[ \t]+/g, ' ');
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round1 = (v) => Math.round(v * 10) / 10;
  const countRe = (text, re) => (text.match(re) || []).length;

  // Split into sentences, keeping original casing for evidence quotes.
  function sentences(raw) {
    return (raw || '')
      .split(/\n+|(?<=[.;!?])\s+|\s+[•●▪◦]\s*/)
      .map((s) => s.replace(/^[\s•●▪◦\-*–]+/, '').trim())
      .filter((s) => s.length > 2)
      .map((s) => ({ raw: s, text: ' ' + norm(s) + ' ' }));
  }

  const levelById = (id) => UXM.ROLE_LEVELS.find((l) => l.id === id) || UXM.ROLE_LEVELS[1];
  const levelIndex = (id) => UXM.ROLE_LEVELS.findIndex((l) => l.id === id);
  const bandFor = (score, bands) => bands.find((b) => score >= b.min) || bands[bands.length - 1];

  function levelForYears(years) {
    const ladder = ['principal', 'lead', 'senior', 'ux', 'junior'];
    return ladder.find((id) => years >= levelById(id).minYears) || 'junior';
  }

  // ---------- years of experience ----------
  function parseRequiredYears(text) {
    const re = /(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*\+?\s*)?(?:years?|yrs?)\b/g;
    let m, best = null;
    while ((m = re.exec(text))) {
      const n = +m[1];
      if (n <= 25 && (best === null || n > best)) best = n;
    }
    return best;
  }

  function parseProfileYears(text) {
    const explicit = [];
    const re = /(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+[a-z/&-]+){0,4}?\s+(?:experience|exp\b)/g;
    let m;
    while ((m = re.exec(text))) if (+m[1] <= 45) explicit.push(+m[1]);
    if (explicit.length) return { years: Math.max(...explicit), source: 'stated' };

    const now = new Date();
    const nowY = now.getFullYear() + now.getMonth() / 12;
    const rangeRe = new RegExp(
      '(?:(' + MONTHS + ')[a-z]*\\.?\\s+)?((?:19|20)\\d{2})\\s*(?:-|–|—|to)\\s*(?:(?:(' + MONTHS + ')[a-z]*\\.?\\s+)?((?:19|20)\\d{2})|(present|current|now|today|date))',
      'g'
    );
    const monthIdx = (s) => (s ? MONTHS.split('|').indexOf(s.slice(0, 3)) : 0);
    const spans = [];
    while ((m = rangeRe.exec(text))) {
      const start = +m[2] + monthIdx(m[1]) / 12;
      const end = m[5] ? nowY : +m[4] + (m[3] ? monthIdx(m[3]) / 12 : 1);
      if (end > start && start > 1970) spans.push([start, Math.min(end, nowY)]);
    }
    if (!spans.length) return { years: 0, source: 'none' };
    spans.sort((a, b) => a[0] - b[0]);
    let total = 0, [cs, ce] = spans[0];
    for (const [s, e] of spans.slice(1)) {
      if (s <= ce) ce = Math.max(ce, e);
      else { total += ce - cs; cs = s; ce = e; }
    }
    total += ce - cs;
    return { years: round1(total), source: 'dates' };
  }

  // ---------- Step 1: JD analysis ----------
  function analyzeJD(jdText, jdTitle) {
    const title = norm(jdTitle);
    const full = norm((jdTitle || '') + '\n' + (jdText || ''));
    const lines = [];
    let section = null;
    for (const rawLine of (jdText || '').split(/\n+/)) {
      const ln = norm(rawLine).replace(/^[\s•●▪◦\-*–\d.)]+/, '').trim();
      if (!ln) continue;
      const isHeader = ln.length < 70 && (ln.endsWith(':') || HEADER_RE.test(ln)) && ln.split(' ').length <= 8;
      if (isHeader) {
        section = NICE_RE.test(ln) ? 'nice'
          : /requirement|qualification|must|essential|need|looking for|about you|who you are|minimum/.test(ln) ? 'critical'
          : 'important';
      }
      for (const part of ln.split(/(?<=[.;!?])\s+/)) {
        const own = NICE_RE.test(part) ? 'nice' : CRIT_RE.test(part) ? 'critical' : null;
        lines.push({ text: ' ' + part + ' ', priority: own || section || 'important' });
      }
    }
    if (jdTitle) lines.push({ text: ' ' + title + ' ', priority: 'critical' });

    // Role level: title → opening text → required years.
    let level = null, levelSource = 'title';
    for (const src of [title, full.slice(0, 250)]) {
      const hit = UXM.TITLE_PATTERNS.find((p) => p.re.test(src));
      if (hit) { level = hit.level; break; }
      levelSource = 'description';
    }
    const requiredYears = parseRequiredYears(full);
    if (!level) {
      level = requiredYears != null ? levelForYears(requiredYears) : 'ux';
      levelSource = requiredYears != null ? 'years' : 'default';
    }

    const competencies = {};
    for (const c of UXM.COMPETENCIES) {
      let rank = 0, hits = 0;
      const subskills = [];
      for (const s of c.subskills) {
        let sRank = 0;
        for (const ln of lines) {
          if (matchesAny(ln.text, s.kw)) { hits++; sRank = Math.max(sRank, PRIORITY[ln.priority]); }
        }
        if (sRank) { subskills.push(s.name); rank = Math.max(rank, sRank); }
      }
      competencies[c.id] = { priority: PRIORITY_NAMES[rank], hits, subskills };
    }

    const scan = (list) => list.map((x) => {
      let rank = 0;
      for (const ln of lines) if (matchesAny(ln.text, x.kw)) rank = Math.max(rank, PRIORITY[ln.priority]);
      return rank ? { ...x, priority: PRIORITY_NAMES[rank] } : null;
    }).filter(Boolean);

    const extras = scan(UXM.EXTRA_SKILLS);
    const tools = scan(UXM.TOOLS).map((t) => t.name);
    const industries = scan(UXM.INDUSTRIES).map((t) => t.name);
    const leadershipExpectations = [
      ...competencies.leadership.subskills,
      ...extras.filter((e) => ['team', 'exec', 'roadmap'].includes(e.id)).map((e) => e.name),
    ];

    const jd = {
      title: jdTitle || '', level, levelSource, requiredYears, competencies, extras, tools, industries,
      aiRequired: extras.some((e) => e.id === 'ai'), leadershipExpectations,
    };
    jd.autoWeights = autoWeights(jd, level);
    return jd;
  }

  // ---------- Step 2: dynamic weight allocation ----------
  function autoWeights(jd, levelId) {
    const mult = { critical: 2.2, important: 1.4, nice: 0.8, none: 0.5 };
    const lf = levelById(levelId).leadershipFactor;
    const raw = {};
    for (const c of UXM.COMPETENCIES) {
      const info = jd.competencies[c.id];
      let w = c.weight * mult[info.priority] * (1 + 0.06 * Math.min(info.hits, 6));
      if (c.id === 'leadership') w *= lf;
      if (c.id === 'stakeholder') w *= 0.6 + 0.4 * lf;
      raw[c.id] = w;
    }
    return normalizeWeights(raw);
  }

  function normalizeWeights(raw) {
    const sum = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
    const out = {};
    for (const id in raw) out[id] = Math.round((raw[id] / sum) * 1000) / 10;
    return out;
  }

  // ---------- Step 3: profile evidence ----------
  function analyzeProfile(profileText, yearsOverride) {
    const sents = sentences(profileText);
    const full = norm(profileText);
    const parsedYears = parseProfileYears(full);
    const years = yearsOverride != null && yearsOverride !== '' && !isNaN(+yearsOverride)
      ? { years: +yearsOverride, source: 'entered' } : parsedYears;

    const competencies = {};
    for (const c of UXM.COMPETENCIES) {
      const found = {};
      const matched = new Set();
      for (const s of c.subskills) {
        const n = sents.filter((x) => matchesAny(x.text, s.kw));
        if (n.length) { found[s.name] = n.length; n.forEach((x) => matched.add(x)); }
      }
      let ownership = 0, outcomes = 0;
      for (const x of matched) { ownership += countRe(x.text, OWNERSHIP_RE); outcomes += countRe(x.text, OUTCOME_RE); }
      const examples = [...matched]
        .sort((a, b) => countRe(b.text, OUTCOME_RE) + countRe(b.text, OWNERSHIP_RE) - countRe(a.text, OUTCOME_RE) - countRe(a.text, OWNERSHIP_RE))
        .slice(0, 2)
        .map((x) => (x.raw.length > 180 ? x.raw.slice(0, 177) + '…' : x.raw));
      competencies[c.id] = { found, sentences: matched.size, ownership, outcomes, examples };
    }

    const has = (list) => list.filter((x) => sents.some((s) => matchesAny(s.text, x.kw)));
    const extras = has(UXM.EXTRA_SKILLS).map((e) => e.id);
    const tools = has(UXM.TOOLS).map((t) => t.name);
    const industries = has(UXM.INDUSTRIES).map((t) => t.name);

    const leadKw = UXM.COMPETENCIES.find((c) => c.id === 'leadership').subskills.flatMap((s) => s.kw);
    const signals = {
      portfolio: /portfolio|behance|dribbble|case stud/.test(full),
      caseStudies: countRe(full, /case stud(y|ies)/g),
      leadershipExamples: sents.filter((s) => matchesAny(s.text, leadKw) && countRe(s.text, OWNERSHIP_RE)).length,
      designSystemOwnership: sents.some((s) => /design system|component librar/.test(s.text) && /\b(owned|own|led|built|created|established|maintain\w*|scaled|architected|launched)\b/.test(s.text)),
      researchMethods: Object.keys(competencies.research.found).length + Object.keys(competencies.usability.found).length,
      quantifiedOutcomes: countRe(full, OUTCOME_RE),
    };

    return { years: years.years, yearsSource: years.source, competencies, extras, tools, industries, signals, wordCount: full.split(/\s+/).filter(Boolean).length };
  }

  // ---------- scoring core ----------
  function evidenceScore(c, raw, jdSubs, years) {
    const found = Object.keys(raw.found);
    if (!found.length) return 0;
    const breadth = found.length / c.subskills.length;
    const coverage = jdSubs.length ? jdSubs.filter((s) => raw.found[s]).length / jdSubs.length : breadth;
    const depth = Math.min(1, raw.sentences * 0.1 + raw.ownership * 0.08 + raw.outcomes * 0.12);
    const expBoost = Math.min(15, years * 1.25);
    return clamp(Math.round(100 * (0.4 * coverage + 0.25 * breadth + 0.35 * depth) + expBoost), 0, 100);
  }

  function expectationFor(levelId, priority) {
    const adj = { critical: 10, important: 0, nice: -10, none: -15 };
    return clamp(levelById(levelId).expectation + adj[priority], 30, 95);
  }

  function scoreCore(jd, profile, levelId, weights, overrides, priorities) {
    overrides = overrides || {};
    priorities = priorities || {};
    let total = 0, wsum = 0;
    const rows = UXM.COMPETENCIES.map((c) => {
      const info = jd.competencies[c.id];
      const priority = priorities[c.id] || info.priority;
      const auto = evidenceScore(c, profile.competencies[c.id], info.subskills, profile.years);
      const evidence = overrides[c.id] != null ? overrides[c.id] : auto;
      const expectation = expectationFor(levelId, priority);
      const match = Math.round(Math.min(100, (evidence / expectation) * 100));
      const weight = weights[c.id] || 0;
      // Competencies the JD doesn't mention count at half strength, so specialists aren't sunk by them.
      const effective = priority === 'none' ? 50 + match / 2 : match;
      total += (effective * weight) / 100;
      wsum += weight;
      return {
        id: c.id, name: c.name, short: c.short, priority, weight, evidence, autoEvidence: auto,
        overridden: overrides[c.id] != null, expectation, match, contribution: round1((effective * weight) / 100),
        status: bandFor(match, UXM.STATUS_BANDS), raw: profile.competencies[c.id], jdSubskills: info.subskills,
      };
    });
    return { rows, overall: wsum ? round1((total / wsum) * 100) : 0 };
  }

  // Synthetic JD for a weight preset, so the same profile can be scored against archetypes.
  function presetJD(presetId) {
    const p = UXM.WEIGHT_PRESETS[presetId];
    const competencies = {};
    for (const c of UXM.COMPETENCIES) {
      const w = p.weights[c.id] || 0;
      competencies[c.id] = { priority: w >= 15 ? 'critical' : w >= 8 ? 'important' : 'nice', hits: 0, subskills: [] };
    }
    return { competencies };
  }

  function suggestLevel(profile) {
    const lead = Object.keys(profile.competencies.leadership.found).length;
    let id = levelForYears(profile.years);
    if (id === 'principal' && lead < 3) id = 'lead';
    if (id === 'lead' && lead < 2) id = 'senior';
    const managerReady = profile.years >= 10 && profile.extras.includes('team');
    if (profile.years >= 15 && managerReady && lead >= 3) id = 'director';
    return { id, name: levelById(id).name, alt: managerReady ? 'UX Manager' : null };
  }

  function nextLevel(id) {
    return { junior: 'ux', ux: 'senior', senior: 'lead', lead: 'principal', principal: 'director', manager: 'director', director: 'director' }[id];
  }

  // ---------- full evaluation ----------
  function evaluate(jd, profile, opts) {
    opts = opts || {};
    const levelId = opts.levelId || jd.level;
    const level = levelById(levelId);
    const weights = opts.weights || autoWeights(jd, levelId);
    const core = scoreCore(jd, profile, levelId, weights, opts.overrides, opts.priorities);
    const { rows, overall } = core;

    const fit = bandFor(overall, UXM.FIT_BANDS);
    const readinessScale = bandFor(overall, UXM.READINESS_SCALE).label;
    const criticalGaps = rows.filter((r) => r.priority === 'critical' && r.match < UXM.CRITICAL_THRESHOLD);

    const flags = [];
    if (jd.requiredYears != null && profile.years + 0.5 < jd.requiredYears) {
      flags.push(`Experience below JD requirement (${profile.years} vs ${jd.requiredYears}+ years)`);
    }
    if (profile.years > level.maxYears + 4) {
      flags.push(`Senior for this demand (${profile.years} years vs ${level.experience} for ${level.name}) — check grade and rate fit with the account`);
    }
    if (level.needsPeopleLeadership && !profile.extras.includes('team')) {
      flags.push(`${level.name} requires people leadership — no team management evidence found`);
    }
    const missingCriticalExtras = jd.extras.filter((e) => e.priority === 'critical' && !profile.extras.includes(e.id));
    missingCriticalExtras.forEach((e) => flags.push(`Critical JD requirement not evidenced: ${e.name}`));

    let verdict = fit.label, verdictTone = fit.tone;
    if (criticalGaps.length) {
      verdict = `Conditional Fit – Missing Critical ${criticalGaps.map((r) => r.short).join(' & ')} Capability`;
      verdictTone = 'conditional';
    }

    const readiness = criticalGaps.length ? 'Medium' : overall >= 80 ? 'High' : overall >= 65 ? 'Medium' : 'Low';

    // Gap analysis
    const jdExtraIds = new Set(jd.extras.map((e) => e.id));
    const missingSkills = jd.extras.filter((e) => e.type === 'skill' && !profile.extras.includes(e.id));
    const experienceGaps = jd.extras.filter((e) => e.type === 'experience' && !profile.extras.includes(e.id));
    const growthIds = levelIndex(levelId) >= levelIndex('lead') ? ['roadmap', 'metrics', 'team', 'exec', 'ai'] : ['metrics', 'experiment', 'ai'];
    const growthAreas = UXM.EXTRA_SKILLS.filter((e) => growthIds.includes(e.id) && !jdExtraIds.has(e.id) && !profile.extras.includes(e.id));
    const missingSubskills = rows
      .map((r) => ({ competency: r.name, items: r.jdSubskills.filter((s) => !r.raw.found[s]) }))
      .filter((g) => g.items.length);
    const yearsGap = jd.requiredYears != null ? Math.max(0, round1(jd.requiredYears - profile.years)) : 0;

    // Recommendations
    const weak = rows.filter((r) => r.match < 80).sort((a, b) => b.weight * (100 - b.match) - a.weight * (100 - a.match));
    const immediate = [];
    const push = (list, s) => { if (s && !list.includes(s)) list.push(s); };
    criticalGaps.forEach((r) => push(immediate, UXM.ACTIONS[r.id]));
    weak.forEach((r) => immediate.length < 4 && push(immediate, UXM.ACTIONS[r.id]));
    [...missingSkills, ...experienceGaps].forEach((e) => immediate.length < 6 && push(immediate, UXM.ACTIONS[e.id]));

    const upskilling = [];
    weak.forEach((r) => push(upskilling, UXM.UPSKILL[r.id]));
    [...missingSkills, ...experienceGaps, ...growthAreas].forEach((e) => push(upskilling, e.upskill));

    // Role level fit across all levels, and across weight archetypes
    const levelFit = UXM.ROLE_LEVELS.map((l) => ({
      id: l.id, name: l.name, score: scoreCore(jd, profile, l.id, autoWeights(jd, l.id), opts.overrides, opts.priorities).overall,
    }));
    const archetypes = ['research', 'product', 'lead', 'manager'].map((pid) => {
      const p = UXM.WEIGHT_PRESETS[pid];
      const pj = presetJD(pid);
      return { id: pid, name: p.name.replace(/^Example [A-C] — /, ''), score: scoreCore(pj, profile, p.level, p.weights, opts.overrides).overall };
    });
    const suggested = suggestLevel(profile);

    // Career roadmap
    const target = levelIndex(levelId) > levelIndex(suggested.id) ? levelId : nextLevel(suggested.id);
    const used = new Set();
    const take = (arr, n) => arr.filter((x) => x && !used.has(x)).slice(0, n).map((x) => (used.add(x), x));
    const roadmap = [
      { period: '0–3 months', title: criticalGaps.length || missingCriticalExtras.length ? 'Close critical gaps' : 'Quick wins', items: take([...criticalGaps.map((r) => UXM.ACTIONS[r.id]), ...missingCriticalExtras.map((e) => UXM.ACTIONS[e.id]), ...immediate], 3) },
      { period: '3–6 months', title: 'Strengthen core competencies', items: take([...weak.map((r) => UXM.ACTIONS[r.id]), ...missingSkills.map((e) => UXM.ACTIONS[e.id]), ...experienceGaps.map((e) => UXM.ACTIONS[e.id])], 3) },
      { period: '6–12 months', title: `Grow toward ${levelById(target).name}`, items: take([...UXM.LEVEL_GROWTH[target], ...growthAreas.map((e) => UXM.ACTIONS[e.id])], 3) },
    ].filter((p) => p.items.length);

    // Recruiter decision
    // Fulfilment decision for the resource manager.
    let fulfilment;
    if (criticalGaps.length && overall >= 70) fulfilment = { action: 'Propose with ramp-up plan', detail: `Strong overall fit; share a ramp-up plan for ${criticalGaps.map((r) => r.name).join(', ')} with the account.` };
    else if (overall >= 80 && !flags.length) fulfilment = { action: 'Propose to account', detail: 'Profile evidence meets the demand’s expectations across weighted competencies.' };
    else if (overall >= 70) fulfilment = { action: 'Propose — validate gaps', detail: 'Good alignment; flag the noted gaps to the account team up front.' };
    else if (overall >= 60) fulfilment = { action: 'Consider with upskilling', detail: `Partial fit — consider for a ${suggested.name}-level demand or propose with an upskilling plan.` };
    else fulfilment = { action: 'Not suitable for this demand', detail: 'Significant gaps against the demand’s weighted priorities — look for a better-matched demand.' };

    const interviewFocus = [...criticalGaps, ...weak.filter((r) => !criticalGaps.includes(r))].slice(0, 4).map((r) => r.name);

    return {
      level, levelId, weights, rows, overall, fit, verdict, verdictTone, readiness, readinessScale, criticalGaps, flags,
      gaps: { missingSkills, experienceGaps, growthAreas, missingSubskills, yearsGap },
      recommendations: { immediate, upskilling: upskilling.slice(0, 7) },
      levelFit, archetypes, suggested, roadmap, fulfilment, interviewFocus,
      strengths: rows.filter((r) => r.match >= 80).sort((a, b) => b.match - a.match).map((r) => r.name),
      tools: { required: jd.tools, matched: jd.tools.filter((t) => profile.tools.includes(t)), candidate: profile.tools },
      domain: { required: jd.industries, matched: jd.industries.filter((t) => profile.industries.includes(t)), candidate: profile.industries },
    };
  }

  // ---------- bench ranking ----------
  // Seniority ladder for level-distance checks (manager sits alongside principal).
  const LEVEL_RANK = { junior: 0, ux: 1, senior: 2, lead: 3, principal: 4, manager: 4, director: 5 };

  // Score every resource against one demand and order them by a best-fit score:
  // the overall match, adjusted for level distance, critical gaps, availability,
  // people leadership, and bonuses for preferred domain, tools and skills.
  // resources: [{ id, profileText, years?, status, availableFrom? (YYYY-MM-DD) }]
  function rankResources(jd, resources, opts) {
    opts = opts || {};
    const levelId = opts.levelId || jd.level;
    const weights = opts.weights || autoWeights(jd, levelId);
    const demandRank = LEVEL_RANK[levelId];

    return resources.map((res) => {
      const profile = analyzeProfile(res.profileText, res.years);
      const result = evaluate(jd, profile, { levelId, weights });
      const s = result.suggested;
      const resRank = s.alt ? Math.max(LEVEL_RANK[s.id], LEVEL_RANK.manager) : LEVEL_RANK[s.id];
      const diff = resRank - demandRank;
      const adjustments = [];

      // Over-levelled resources cost the practice margin (grade/rate mismatch), even by one level.
      if (diff > 0) adjustments.push({ label: `Over-levelled by ${diff} level${diff === 1 ? '' : 's'}`, points: -3 - 5 * (diff - 1) });
      if (diff < -1) adjustments.push({ label: `Under-levelled by ${-diff} levels`, points: -4 * (-diff - 1) });
      if (result.criticalGaps.length) {
        adjustments.push({ label: `Critical gap: ${result.criticalGaps.map((r) => r.short).join(', ')}`, points: -Math.min(16, 8 * result.criticalGaps.length) });
      }
      if (opts.startDate && res.availableFrom && res.availableFrom > opts.startDate) {
        const days = Math.round((new Date(res.availableFrom) - new Date(opts.startDate)) / 86400000);
        adjustments.push({ label: `Starts ${days} day${days === 1 ? '' : 's'} late`, points: -Math.round(Math.min(10, 3 + days / 7)) });
      }
      if (res.status === 'Partially allocated') adjustments.push({ label: 'Partially allocated', points: -3 });
      if (result.level.needsPeopleLeadership && !profile.extras.includes('team')) {
        adjustments.push({ label: 'No people-management evidence', points: -10 });
      }
      const missingCritical = jd.extras.filter((e) => e.priority === 'critical' && e.id !== 'team' && !profile.extras.includes(e.id));
      if (missingCritical.length) adjustments.push({ label: `Missing: ${missingCritical.map((e) => e.name).join(', ')}`, points: -Math.min(8, 4 * missingCritical.length) });

      // Bonuses for what the demand prefers beyond the core competencies.
      if (result.domain.matched.length) adjustments.push({ label: `Domain: ${result.domain.matched.join(', ')}`, points: 4 });
      if (result.tools.matched.length) {
        adjustments.push({ label: `Tools ${result.tools.matched.length}/${result.tools.required.length}`, points: Math.round((3 * result.tools.matched.length) / result.tools.required.length) || 1 });
      }
      const bonusExtras = jd.extras.filter((e) => e.priority !== 'critical' && profile.extras.includes(e.id));
      if (bonusExtras.length) adjustments.push({ label: `Also has: ${bonusExtras.map((e) => e.name).join(', ')}`, points: Math.min(4, 2 * bonusExtras.length) });

      const raw = result.overall + adjustments.reduce((a, x) => a + x.points, 0);
      return { resource: res, profile, result, levelDiff: diff, adjustments, raw, rankScore: round1(clamp(raw, 0, 100)) };
    }).sort((a, b) => b.raw - a.raw || b.result.overall - a.result.overall);
  }

  Object.assign(UXM, { analyzeJD, analyzeProfile, evaluate, autoWeights, normalizeWeights, levelById, suggestLevel, rankResources, PRIORITY_NAMES, _internal: { parseProfileYears, parseRequiredYears, kwRegex } });
})(typeof window !== 'undefined' ? window : globalThis);
