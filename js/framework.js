/*
 * UX Profile-to-JD Match Assessment Framework — reference data.
 *
 * Keyword syntax: plain keywords match as a word prefix ("persona" matches
 * "personas"); a leading "=" requires a whole-word match ("=ia" won't match "iam").
 */
(function (root) {
  const UXM = (root.UXM = root.UXM || {});

  UXM.ROLE_LEVELS = [
    { id: 'junior', name: 'Junior UX Designer', experience: '0-2 Years', minYears: 0, maxYears: 2, expectation: 45, leadershipFactor: 0.25 },
    { id: 'ux', name: 'UX Designer', experience: '2-5 Years', minYears: 2, maxYears: 5, expectation: 55, leadershipFactor: 0.5 },
    { id: 'senior', name: 'Senior UX Designer', experience: '5-8 Years', minYears: 5, maxYears: 8, expectation: 65, leadershipFactor: 0.9 },
    { id: 'lead', name: 'Lead UX Designer', experience: '8-12 Years', minYears: 8, maxYears: 12, expectation: 72, leadershipFactor: 1.4 },
    { id: 'principal', name: 'Principal UX Designer', experience: '12+ Years', minYears: 12, maxYears: 40, expectation: 78, leadershipFactor: 1.6 },
    { id: 'manager', name: 'UX Manager', experience: '10+ Years + Leadership', minYears: 10, maxYears: 40, expectation: 72, leadershipFactor: 2.0, needsPeopleLeadership: true },
    { id: 'director', name: 'Director of UX', experience: '15+ Years + Org Leadership', minYears: 15, maxYears: 40, expectation: 75, leadershipFactor: 2.4, needsPeopleLeadership: true },
  ];

  // Detection order matters: most specific titles first.
  UXM.TITLE_PATTERNS = [
    { level: 'director', re: /\b(director|vp|vice president)\b/ },
    { level: 'manager', re: /\b(manager|head of|management)\b/ },
    { level: 'principal', re: /\b(principal|staff)\b/ },
    { level: 'lead', re: /\blead\b/ },
    { level: 'senior', re: /\b(senior|sr\.?)\b/ },
    { level: 'junior', re: /\b(junior|jr\.?|associate|entry[- ]level|graduate|intern)\b/ },
  ];

  UXM.COMPETENCIES = [
    {
      id: 'research', name: 'User Research', short: 'Research', weight: 15,
      subskills: [
        { name: 'User Interviews', kw: ['user interview', 'interviewing users', 'in-depth interview', 'customer interview', 'interviews with users'] },
        { name: 'Contextual Inquiry', kw: ['contextual inquir', 'field stud', 'field research', 'ethnograph', 'diary stud', 'shadowing'] },
        { name: 'Surveys', kw: ['survey', 'questionnaire'] },
        { name: 'Persona Creation', kw: ['persona'] },
        { name: 'Journey Mapping', kw: ['journey map', 'customer journey', 'user journey', 'experience map'] },
        { name: 'Competitive Analysis', kw: ['competitive analys', 'competitor analys', 'competitive audit', 'competitive research', 'benchmarking'] },
        { name: 'Usability Research', kw: ['user research', 'ux research', 'usability research', 'generative research', 'discovery research', 'evaluative research'] },
        { name: 'Quantitative Research', kw: ['quantitative', 'analytics', 'statistic', 'data analys', 'a/b test', 'ab test'] },
      ],
    },
    {
      id: 'problem', name: 'Problem Definition', short: 'Problem Def.', weight: 10,
      subskills: [
        { name: 'Problem Statements', kw: ['problem statement', 'problem framing', 'problem definition', 'frame the problem', 'framing problems', 'how might we', '=hmw'] },
        { name: 'Affinity Mapping', kw: ['affinity', 'research synthesis', 'synthesi'] },
        { name: 'Root Cause Analysis', kw: ['root cause', '5 whys', 'five whys'] },
        { name: 'Opportunity Mapping', kw: ['opportunity map', 'opportunity solution tree', 'opportunity area', 'identify opportunities', 'opportunity sizing'] },
        { name: 'JTBD', kw: ['=jtbd', 'jobs to be done', 'jobs-to-be-done'] },
        { name: 'Design Thinking Workshops', kw: ['design thinking', 'design sprint', 'ideation'] },
      ],
    },
    {
      id: 'ia', name: 'Information Architecture', short: 'IA', weight: 10,
      subskills: [
        { name: 'Sitemap Creation', kw: ['sitemap', 'site map'] },
        { name: 'Navigation Design', kw: ['navigation'] },
        { name: 'Card Sorting', kw: ['card sort'] },
        { name: 'Content Structures', kw: ['information architecture', '=ia', 'content structur', 'content model', 'content strateg', 'content hierarch'] },
        { name: 'Taxonomies', kw: ['taxonom', 'ontolog', 'tree test', 'metadata'] },
      ],
    },
    {
      id: 'interaction', name: 'Interaction Design', short: 'Interaction', weight: 15,
      subskills: [
        { name: 'User Flows', kw: ['user flow', 'end-to-end flow', 'end to end flow'] },
        { name: 'Task Flows', kw: ['task flow', 'task analys'] },
        { name: 'Process Design', kw: ['process design', 'process flow', 'workflow', 'service blueprint'] },
        { name: 'Wireframes', kw: ['wirefram'] },
        { name: 'Interaction Patterns', kw: ['interaction design', 'interaction pattern', 'micro-interaction', 'microinteraction', '=ixd'] },
        { name: 'UX Strategy', kw: ['ux strateg', 'experience strateg', 'design strateg', 'product strateg'] },
      ],
    },
    {
      id: 'visual', name: 'Visual & UI Design', short: 'UI Design', weight: 10,
      subskills: [
        { name: 'Visual Hierarchy', kw: ['visual hierarch', 'visual design', 'typograph', 'layout', 'color theory', 'colour'] },
        { name: 'Design Systems', kw: ['design system'] },
        { name: 'Accessibility', kw: ['accessib', '=wcag', '=a11y', 'inclusive design'] },
        { name: 'Responsive Design', kw: ['responsive', 'mobile-first', 'mobile first', 'adaptive design', 'multi-device', 'cross-platform'] },
        { name: 'UI Components', kw: ['=ui', 'user interface', 'ui component', 'interface design'] },
        { name: 'Tokens', kw: ['design token', '=tokens'] },
      ],
    },
    {
      id: 'prototyping', name: 'Prototyping', short: 'Prototyping', weight: 10,
      subskills: [
        { name: 'Low Fidelity', kw: ['low fidelity', 'low-fidelity', 'low-fi', 'lo-fi', 'paper prototyp', 'sketching'] },
        { name: 'Mid Fidelity', kw: ['mid fidelity', 'mid-fidelity', 'mid-fi'] },
        { name: 'High Fidelity', kw: ['high fidelity', 'high-fidelity', 'hi-fi', 'high-fi', 'pixel-perfect', 'pixel perfect'] },
        { name: 'Interactive Prototypes', kw: ['interactive prototyp', 'clickable prototyp', 'prototyp', 'protopie', '=framer'] },
        { name: 'Validation Concepts', kw: ['concept validation', 'concept test', 'validate concept', 'validated concept', 'validate idea', 'validating idea', 'hypothes'] },
      ],
    },
    {
      id: 'usability', name: 'Usability Testing', short: 'Usability', weight: 10,
      subskills: [
        { name: 'Moderated Testing', kw: ['moderated', 'usability test', 'usability session', 'think-aloud', 'think aloud', 'user testing'] },
        { name: 'Unmoderated Testing', kw: ['unmoderated', 'remote testing', 'remote usability', 'usertesting', '=maze', 'lookback'] },
        { name: 'Heuristic Evaluation', kw: ['heuristic', 'expert review', 'ux audit'] },
        { name: 'Accessibility Reviews', kw: ['accessibility audit', 'accessibility review', 'accessibility testing', 'wcag audit', 'screen reader', 'assistive tech'] },
        { name: 'Findings Documentation', kw: ['findings', 'research report', 'insights report', 'readout', 'research repositor', 'documented insight'] },
      ],
    },
    {
      id: 'designsystems', name: 'Design Systems & Governance', short: 'Design Systems', weight: 5,
      subskills: [
        { name: 'Component Libraries', kw: ['component librar', 'pattern librar', 'ui kit', 'storybook', 'design system'] },
        { name: 'Tokens', kw: ['design token', '=tokens'] },
        { name: 'Governance', kw: ['governance', 'contribution model', 'contribution process'] },
        { name: 'Standards', kw: ['standards', 'guidelines', 'style guide', 'documentation'] },
        { name: 'Reusability', kw: ['reusab', 'reusable', 'scalable', 'consistency'] },
      ],
    },
    {
      id: 'stakeholder', name: 'Stakeholder Management', short: 'Stakeholders', weight: 5,
      subskills: [
        { name: 'Collaboration', kw: ['collaborat', 'partnered with', 'partner with', 'partnering with', 'worked closely with', 'work closely with'] },
        { name: 'Communication', kw: ['communicat', 'presented', 'presenting', 'presentation', 'storytell', 'articulat'] },
        { name: 'Workshops', kw: ['workshop', 'facilitat'] },
        { name: 'Cross-functional Alignment', kw: ['cross-functional', 'cross functional', 'stakeholder', 'alignment', 'align '] },
      ],
    },
    {
      id: 'leadership', name: 'Leadership & Strategy', short: 'Leadership', weight: 10,
      subskills: [
        { name: 'Mentoring', kw: ['mentor', 'coach'] },
        { name: 'Strategic Thinking', kw: ['strateg'] },
        { name: 'Team Leadership', kw: ['led a team', 'lead a team', 'leading a team', 'team lead', 'managed a team', 'manage a team', 'managing a team', 'team of', 'direct report', 'people manage', 'line manage', 'hiring', 'built the team', 'build the team', 'grew the team', 'grow the team', 'led designers', 'lead designers', 'leading designers', 'hired', 'design organisation', 'design organization', 'design managers', 'led a design'] },
        { name: 'Business Alignment', kw: ['business goal', 'business objective', 'business outcome', 'business strateg', 'business value', '=kpi', '=kpis', '=okr', '=okrs', 'revenue', '=roi'] },
        { name: 'Product Vision', kw: ['product vision', 'design vision', 'north star', 'vision', 'roadmap'] },
      ],
    },
  ];

  // Weight presets from the framework document (Step 2 examples). Missing
  // competencies get 0; "Team Leadership & Mentoring" in Example C folds into Leadership.
  UXM.WEIGHT_PRESETS = {
    framework: { name: 'Framework default', weights: { research: 15, problem: 10, ia: 10, interaction: 15, visual: 10, prototyping: 10, usability: 10, designsystems: 5, stakeholder: 5, leadership: 10 } },
    research: { name: 'Example A — UX Research-focused', level: 'lead', weights: { research: 30, problem: 15, ia: 10, interaction: 10, visual: 15, prototyping: 5, usability: 10, designsystems: 2.5, stakeholder: 2.5, leadership: 2.5 } },
    product: { name: 'Example B — Product Designer / UI-heavy', level: 'senior', weights: { research: 10, problem: 10, ia: 10, interaction: 20, visual: 25, prototyping: 15, usability: 5, designsystems: 3, stakeholder: 2, leadership: 2.5 } },
    lead: { name: 'Example C — Lead UX Designer', level: 'lead', weights: { research: 15, problem: 10, ia: 10, interaction: 15, visual: 10, prototyping: 5, usability: 5, designsystems: 10, stakeholder: 10, leadership: 20 } },
    manager: { name: 'UX Manager', level: 'manager', weights: { research: 10, problem: 10, ia: 5, interaction: 10, visual: 5, prototyping: 5, usability: 5, designsystems: 10, stakeholder: 15, leadership: 25 } },
  };

  // Skills outside the 10 weighted competencies, used for gap analysis.
  // type "skill" → Missing Skills, "experience" → Experience Gaps.
  UXM.EXTRA_SKILLS = [
    { id: 'service', name: 'Service Design', type: 'skill', kw: ['service design', 'service blueprint'], upskill: 'Service Design' },
    { id: 'experiment', name: 'Experimentation Frameworks', type: 'skill', kw: ['experimentation', 'a/b test', 'ab test', 'multivariate', 'split test'], upskill: 'Data-driven UX' },
    { id: 'metrics', name: 'UX Metrics', type: 'skill', kw: ['ux metric', 'heart framework', '=sus', '=nps', 'task success', 'success metric', 'measure impact', 'measurable', '=kpi', '=kpis'], upskill: 'Data-driven UX' },
    { id: 'roadmap', name: 'Strategic Roadmap Planning', type: 'skill', kw: ['roadmap'], upskill: 'Design Leadership' },
    { id: 'behavioural', name: 'Behavioural Design', type: 'skill', kw: ['behavioral design', 'behavioural design', 'behavioral science', 'behavioural science', 'behavioral economics', 'behavioural economics', 'nudge'], upskill: 'Behavioural Design' },
    { id: 'datadriven', name: 'Data-driven UX', type: 'skill', kw: ['data-driven', 'data driven', 'data-informed', 'google analytics', 'amplitude', 'mixpanel', 'hotjar', 'fullstory'], upskill: 'Data-driven UX' },
    { id: 'content', name: 'Content Design / UX Writing', type: 'skill', kw: ['ux writing', 'content design', 'microcopy'], upskill: 'UX Writing & Content Design' },
    { id: 'team', name: 'Team Management', type: 'experience', kw: ['team management', 'managed a team', 'manage a team', 'managing a team', 'direct report', 'people management', 'people manager', 'line manage', 'hiring', 'performance review', 'grow the team', 'grew the team', 'build the team', 'built the team', 'hired', 'design managers', 'managed designers', 'built and led'], upskill: 'Design Leadership' },
    { id: 'exec', name: 'Executive Presentations', type: 'experience', kw: ['executive', 'c-suite', 'c-level', 'senior leadership', 'leadership team', 'board', '=vp', '=cxo'], upskill: 'Executive Storytelling' },
    { id: 'ai', name: 'AI Product Strategy', type: 'experience', kw: ['=ai', 'artificial intelligence', 'machine learning', '=ml', 'genai', 'generative ai', '=llm', '=llms', 'conversational ai', 'ai-powered', 'ai-driven', 'human-centred ai', 'human-centered ai', 'copilot', 'chatbot'], upskill: 'AI for UX' },
  ];

  UXM.TOOLS = [
    { name: 'Figma', kw: ['figma'] }, { name: 'FigJam', kw: ['figjam'] }, { name: 'Sketch', kw: ['=sketch'] },
    { name: 'Adobe XD', kw: ['adobe xd', '=xd'] }, { name: 'Adobe CC', kw: ['photoshop', 'illustrator', 'adobe creative', 'after effects'] },
    { name: 'Axure', kw: ['axure'] }, { name: 'InVision', kw: ['invision'] }, { name: 'ProtoPie', kw: ['protopie'] },
    { name: 'Framer', kw: ['=framer'] }, { name: 'Miro', kw: ['=miro'] }, { name: 'Mural', kw: ['=mural'] },
    { name: 'Maze', kw: ['=maze'] }, { name: 'UserTesting', kw: ['usertesting', 'user testing.com'] }, { name: 'Dovetail', kw: ['dovetail'] },
    { name: 'Optimal Workshop', kw: ['optimal workshop', 'optimalsort', 'treejack'] }, { name: 'Lookback', kw: ['lookback'] },
    { name: 'Hotjar', kw: ['hotjar'] }, { name: 'Google Analytics', kw: ['google analytics'] }, { name: 'Amplitude', kw: ['amplitude'] },
    { name: 'Mixpanel', kw: ['mixpanel'] }, { name: 'Jira', kw: ['=jira'] }, { name: 'Confluence', kw: ['confluence'] },
    { name: 'Storybook', kw: ['storybook'] }, { name: 'Zeplin', kw: ['zeplin'] }, { name: 'Webflow', kw: ['webflow'] },
    { name: 'HTML/CSS', kw: ['=html', '=css'] }, { name: 'JavaScript/React', kw: ['javascript', '=react'] },
  ];

  UXM.INDUSTRIES = [
    { name: 'Healthcare', kw: ['healthcare', 'health care', 'clinical', 'patient', 'medical', 'pharma', 'hospital', 'healthtech'] },
    { name: 'Banking & FinTech', kw: ['banking', '=bank', 'fintech', 'financial services', 'payments', 'wealth', 'trading', 'lending'] },
    { name: 'Insurance', kw: ['insurance', 'insurtech', 'claims', 'underwriting', 'policyholder'] },
    { name: 'E-commerce & Retail', kw: ['e-commerce', 'ecommerce', 'retail', 'marketplace', 'checkout', 'shopping'] },
    { name: 'SaaS / B2B', kw: ['=saas', '=b2b', 'enterprise software', 'enterprise product', 'enterprise platform'] },
    { name: 'Government & Public Sector', kw: ['government', 'public sector', 'gov.uk', 'civic'] },
    { name: 'Telecom', kw: ['telecom', 'telco', 'mobile network'] },
    { name: 'Education', kw: ['edtech', 'education', 'e-learning', 'elearning', 'learning platform'] },
    { name: 'Travel & Hospitality', kw: ['travel', 'airline', 'hospitality', 'hotel', 'booking'] },
    { name: 'Automotive', kw: ['automotive', 'in-vehicle', 'infotainment'] },
  ];

  UXM.FIT_BANDS = [
    { min: 90, label: 'Excellent Fit', tone: 'excellent' },
    { min: 80, label: 'Strong Fit', tone: 'strong' },
    { min: 70, label: 'Good Fit with Minor Gaps', tone: 'good' },
    { min: 60, label: 'Moderate Fit', tone: 'moderate' },
    { min: 0, label: 'Not Recommended', tone: 'weak' },
  ];

  UXM.READINESS_SCALE = [
    { min: 90, label: 'Highly Qualified' },
    { min: 80, label: 'Strong Fit' },
    { min: 70, label: 'Moderate Fit' },
    { min: 60, label: 'Partial Fit' },
    { min: 0, label: 'Significant Gaps' },
  ];

  UXM.STATUS_BANDS = [
    { min: 95, label: 'Excellent', tone: 'excellent' },
    { min: 80, label: 'Strong', tone: 'strong' },
    { min: 70, label: 'Moderate', tone: 'moderate' },
    { min: 0, label: 'Improvement Needed', tone: 'weak' },
  ];

  UXM.CRITICAL_THRESHOLD = 60;

  UXM.ACTIONS = {
    research: 'Conduct 5 end-to-end research projects (interviews → synthesis → insights) and publish them as case studies.',
    problem: 'Facilitate problem-framing sessions using JTBD and affinity mapping, and publish clear problem statements.',
    ia: 'Run a card sort and tree test to restructure navigation for a real product area.',
    interaction: 'Map end-to-end user and task flows for a complex workflow and present the design rationale.',
    visual: 'Redesign a key screen set as accessible (WCAG 2.2 AA), responsive UI and document hierarchy decisions.',
    prototyping: 'Build a multi-fidelity prototype series (lo-fi → hi-fi) and validate concepts with real users.',
    usability: 'Run moderated and unmoderated usability tests plus a heuristic evaluation; document findings and fixes.',
    designsystems: 'Contribute components and tokens to a design system and propose a governance/contribution model.',
    stakeholder: 'Lead cross-functional design workshops and drive alignment across PM, engineering and business.',
    leadership: 'Mentor a designer and create a strategic product experience roadmap tied to business KPIs.',
    metrics: 'Build measurable UX KPIs (task success, SUS, HEART) for a shipped feature.',
    roadmap: 'Create a strategic product experience roadmap and present it to stakeholders.',
    experiment: 'Design and run an A/B experiment with a clear hypothesis and success metric.',
    service: 'Map a service blueprint covering front-stage and back-stage touchpoints.',
    team: 'Take on line management or formally lead a small design pod.',
    exec: 'Present design strategy and outcomes to senior leadership.',
    ai: 'Ship or prototype an AI-powered feature and document human-centred AI design decisions.',
  };

  UXM.UPSKILL = {
    research: 'Advanced UX Research Methods', problem: 'Design Thinking & JTBD', ia: 'Information Architecture',
    interaction: 'Interaction Design Patterns', visual: 'Accessible & Responsive UI Design', prototyping: 'Advanced Prototyping',
    usability: 'Usability Testing & Evaluation', designsystems: 'Design Systems & Governance', stakeholder: 'Facilitation & Stakeholder Management',
    leadership: 'Design Leadership',
  };

  // What the next career step typically demands — drives the roadmap's growth phase.
  UXM.LEVEL_GROWTH = {
    junior: ['Own a feature end-to-end from research to hand-off', 'Build a portfolio with 3 complete case studies', 'Learn to run usability tests independently'],
    ux: ['Lead discovery on an ambiguous problem', 'Contribute to the design system', 'Present design rationale to stakeholders'],
    senior: ['Drive UX strategy for a product area', 'Mentor junior designers', 'Own design system components and standards'],
    lead: ['Set design vision across multiple teams', 'Establish design governance and quality bars', 'Tie UX outcomes to business KPIs'],
    principal: ['Shape cross-product experience strategy', 'Influence executive product decisions', 'Raise organisation-wide UX maturity'],
    manager: ['Hire and grow a design team', 'Run performance and career conversations', 'Own team roadmap and resourcing'],
    director: ['Define design org structure and operations', 'Partner with executives on company strategy', 'Build UX maturity at organisation scale'],
  };
})(typeof window !== 'undefined' ? window : globalThis);
