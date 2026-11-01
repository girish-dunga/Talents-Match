/* Demo demands (JDs) and resource profiles. Account names are fictional. */
(function (root) {
  const UXM = root.UXM;

  UXM.SAMPLE_JDS = [
    {
      id: 'lead', title: 'Lead UX Designer', demandId: 'DMD-1042', account: 'Contoso Bank', location: 'London / Hybrid',
      text: `About the role
We are hiring a Lead UX Designer to shape the experience of our digital banking platform used by 3 million customers.

What you'll do
- Lead end-to-end design for complex financial workflows, from discovery to delivery.
- Mentor and coach a team of 4 designers and raise the quality bar.
- Own and evolve our design system, including component libraries, design tokens and governance.
- Partner with product and engineering leaders to define the UX strategy and product vision.
- Facilitate cross-functional workshops and present design direction to senior leadership.
- Translate research insights into user flows, wireframes and high-fidelity prototypes.

Requirements
- 8+ years of experience in UX / product design.
- Proven experience leading design system initiatives.
- Strong interaction design skills: user flows, task flows and interaction patterns.
- Solid user research and usability testing experience.
- Strong stakeholder management and communication skills.
- Expert in Figma.

Nice to have
- Experience in banking or fintech.
- Experience defining UX metrics and running A/B experiments.
- Familiarity with AI-powered product experiences.`,
    },
    {
      id: 'research', title: 'Senior UX Researcher / Research-led Designer', demandId: 'DMD-1057', account: 'Fabrikam Health', location: 'Remote',
      text: `We're looking for a research-led Senior UX Designer to drive discovery for our healthcare patient portal.

Responsibilities
- Plan and conduct user interviews, contextual inquiry and diary studies with patients and clinicians.
- Run surveys and quantitative research using analytics.
- Synthesise findings using affinity mapping and translate them into personas, journey maps and problem statements.
- Apply Jobs-to-be-Done to frame opportunities.
- Run moderated and unmoderated usability testing and heuristic evaluations.
- Document findings and share research readouts with stakeholders.

Must have
- 5+ years of experience in UX research or research-heavy design roles.
- Deep expertise in qualitative and quantitative research methods.
- Strong accessibility knowledge (WCAG 2.2).

Preferred
- Healthcare experience.
- Service design and service blueprint experience.
- Experience with Dovetail and Maze.`,
    },
    {
      id: 'product', title: 'Product Designer (UI-focused)', demandId: 'DMD-1063', account: 'Northwind Retail', location: 'Bengaluru',
      text: `Join our e-commerce team as a Product Designer focused on beautiful, high-converting interfaces.

What you'll do
- Design responsive UI for web and mobile checkout experiences.
- Craft high-fidelity, interactive prototypes in Figma and ProtoPie.
- Define user flows and interaction patterns, including micro-interactions.
- Contribute UI components and design tokens to our design system.
- Ensure accessibility and strong visual hierarchy and typography.

Requirements
- 3-5 years of experience in product or UI design.
- A strong portfolio demonstrating visual design and interaction design craft.
- Expert in Figma; pixel-perfect attention to detail.

Nice to have
- Basic HTML/CSS knowledge.
- Experience running A/B tests.`,
    },
    {
      id: 'manager', title: 'UX Manager', demandId: 'DMD-1071', account: 'Tailspin Insurance', location: 'Pune / Hybrid',
      text: `We are looking for a UX Manager to build and lead our insurance design team.

Responsibilities
- Hire, manage and grow a team of 6 designers and researchers; run performance reviews and career development.
- Define the design vision and strategic roadmap aligned to business goals and OKRs.
- Establish design governance, standards and a scalable design system.
- Present UX strategy and outcomes to the executive leadership team.
- Drive cross-functional alignment with product, engineering and claims operations.
- Champion user research and measurable UX metrics across the organisation.

Requirements
- 10+ years of UX experience, including 3+ years of people management.
- Proven track record of building and leading design teams.
- Strong strategic thinking and business acumen.
- Excellent communication and stakeholder management.

Nice to have
- Insurance or financial services domain experience.
- Experience with AI and machine learning products.`,
    },
  ];

  UXM.SAMPLE_PROFILES = [
    {
      id: 'senior', name: 'Alex Morgan', empId: 'E10234', status: 'Rolling off',
      text: `Senior UX Designer with 9 years of experience designing digital banking and fintech products.

Experience
Senior UX Designer, NorthBank Digital (2019 – Present)
- Led the redesign of the mobile banking onboarding flow; improved completion rate by 32%.
- Owned and scaled the bank's design system: built a Figma component library with design tokens, documentation and a contribution model adopted by 8 product teams.
- Conducted 40+ user interviews and contextual inquiry sessions; created personas and journey maps for the lending experience.
- Ran moderated and unmoderated usability testing with Maze; documented findings and prioritised fixes with product managers.
- Mapped user flows and task flows for complex payment workflows; produced wireframes and high-fidelity interactive prototypes.
- Facilitated cross-functional design workshops and design sprints with engineering and compliance stakeholders.
- Mentored two junior designers.

UX Designer, ShopWave (2016 – 2019)
- Designed responsive UI for an e-commerce checkout; reduced drop-off by 18%.
- Performed heuristic evaluations and competitive analysis.
- Ran card sorting to restructure navigation and information architecture.
- Ensured WCAG 2.1 AA accessibility across core flows.

Skills
Figma, FigJam, ProtoPie, Maze, Miro, Jira, Confluence, user research, interaction design, visual design, prototyping, design systems.

Portfolio with 5 case studies available.`,
    },
    {
      id: 'junior', name: 'Sam Rivera', empId: 'E11871', status: 'Bench',
      text: `Junior UX/UI designer, 1.5 years of experience.

Experience
UX/UI Designer, Brightlabs Agency (2025 – Present)
- Designed wireframes and high-fidelity UI screens in Figma for client websites.
- Created clickable prototypes and helped run usability testing sessions.
- Built UI components following the agency style guide.

Education
Google UX Design Certificate — personas, user flows, low-fidelity sketching, usability studies.

Skills: Figma, Adobe XD, Illustrator, visual design, typography, responsive design.
Portfolio: 3 case studies.`,
    },
  ];

  // Seed bench roster across all levels. availableIn = days from today.
  const P = (id) => UXM.SAMPLE_PROFILES.find((x) => x.id === id).text;
  UXM.SAMPLE_BENCH = [
    {
      name: 'Noah Williams', empId: 'E12450', status: 'Bench', availableIn: 0, location: 'Bengaluru',
      text: `Noah Williams
Junior UX Researcher with 1 year of experience.
- Supported user interviews and usability testing sessions; wrote up findings and research readouts.
- Created personas and journey maps for a travel booking app.
- Ran surveys and competitive analysis; built low-fidelity wireframes in Figma.
Skills: Figma, FigJam, Miro, Maze, Google Forms.`,
    },
    { name: 'Sam Rivera', empId: 'E11871', status: 'Bench', availableIn: 0, location: 'Pune', text: P('junior') },
    {
      name: 'Priya Nair', empId: 'E10977', status: 'Bench', availableIn: 0, location: 'Bengaluru',
      text: `Priya Nair
Product Designer with 4 years of experience in e-commerce and retail.
- Designed responsive UI for web and mobile checkout; increased conversion by 12%.
- Built high-fidelity, interactive prototypes in Figma and ProtoPie, including micro-interactions.
- Defined user flows and interaction patterns for the product listing and cart experience.
- Contributed UI components and design tokens to the design system; ensured accessibility (WCAG 2.1) and strong visual hierarchy and typography.
- Ran A/B tests with the growth team.
Skills: Figma, ProtoPie, Adobe Illustrator, HTML/CSS. Portfolio with 4 case studies.`,
    },
    {
      name: 'Daniel Okafor', empId: 'E11302', status: 'Rolling off', availableIn: 7, location: 'London / Hybrid',
      text: `Daniel Okafor
UX Designer with 3 years of experience in SaaS / B2B products.
- Conducted user interviews and contextual inquiry with enterprise admins.
- Ran card sorting and tree testing to restructure navigation and information architecture.
- Mapped user flows and task flows; produced wireframes and mid-fidelity prototypes.
- Ran moderated usability testing and heuristic evaluations; documented findings.
Skills: Figma, Optimal Workshop, Miro, Jira.`,
    },
    {
      name: 'Mei Chen', empId: 'E10215', status: 'Bench', availableIn: 0, location: 'Remote',
      text: `Mei Chen
Senior UX Designer (research-led) with 6 years of experience in healthcare and patient-facing products.
- Planned and conducted 60+ user interviews, contextual inquiry and diary studies with patients and clinicians.
- Ran surveys and quantitative research using analytics; synthesised findings with affinity mapping.
- Created personas, journey maps and problem statements; applied Jobs-to-be-Done to frame opportunities.
- Ran moderated and unmoderated usability testing in Maze, heuristic evaluations and accessibility reviews (WCAG 2.2, screen reader testing).
- Shared research readouts with stakeholders and maintained a research repository in Dovetail.
- Mapped a service blueprint for the clinic booking journey.
Skills: Dovetail, Maze, Figma, Miro, Qualtrics.`,
    },
    {
      name: 'Lucas Fernandes', empId: 'E10588', status: 'Partially allocated', availableIn: 14, location: 'Lisbon / Remote',
      text: `Lucas Fernandes
Senior UX Designer with 7 years of experience in retail and travel.
- Led interaction design for a booking platform: user flows, task flows, wireframes and interaction patterns.
- Built high-fidelity interactive prototypes and validated concepts with users.
- Facilitated design sprints and cross-functional workshops with product and engineering.
- Designed responsive UI and contributed to the component library.
Skills: Figma, Sketch, ProtoPie, Miro.`,
    },
    { name: 'Alex Morgan', empId: 'E10234', status: 'Rolling off', availableIn: 10, location: 'London / Hybrid', text: P('senior') },
    {
      name: 'Aisha Rahman', empId: 'E10041', status: 'Bench', availableIn: 0, location: 'London / Hybrid',
      text: `Aisha Rahman
Lead UX Designer with 11 years of experience in banking and fintech.
- Led a team of 5 designers; mentored and coached designers through career development.
- Owned and scaled the design system: component libraries, design tokens, governance and contribution model adopted by 12 product teams.
- Defined the UX strategy and product vision for digital onboarding with product and engineering leaders; tied design outcomes to business KPIs.
- Led end-to-end design of complex payment workflows: user flows, task flows, interaction patterns and high-fidelity prototypes.
- Conducted user research and usability testing; reduced onboarding drop-off by 28%.
- Facilitated cross-functional workshops and presented design direction to senior leadership.
- Defined UX metrics and ran A/B experiments.
Skills: Figma, Storybook, Maze, Miro, Jira, Confluence. Portfolio with 6 case studies.`,
    },
    {
      name: 'Tom Becker', empId: 'E10102', status: 'Rolling off', availableIn: 21, location: 'Berlin / Remote',
      text: `Tom Becker
Lead Product Designer with 9 years of experience in SaaS / B2B.
- Led a team of 3 designers and mentored juniors.
- Drove product strategy and the design roadmap with product managers; aligned work to OKRs.
- Designed user flows, wireframes and interactive prototypes for analytics dashboards.
- Ran usability testing and stakeholder workshops.
Skills: Figma, FigJam, Amplitude, Jira.`,
    },
    {
      name: 'Sofia Rossi', empId: 'E10008', status: 'Bench', availableIn: 0, location: 'Milan / Remote',
      text: `Sofia Rossi
Principal UX Designer with 14 years of experience.
- Shaped cross-product experience strategy and design vision for an AI-powered insurance claims platform.
- Defined human-centred AI design principles for conversational AI and machine learning features.
- Mentored lead designers; established design governance and quality standards across 4 product lines.
- Partnered with executives on product strategy; presented roadmaps to the C-suite.
- Led research programmes: user interviews, journey mapping, service design and service blueprints.
- Defined UX metrics (HEART, task success) and experimentation frameworks.
Skills: Figma, Miro, Dovetail, Amplitude.`,
    },
    {
      name: 'Rahul Mehta', empId: 'E10011', status: 'Bench', availableIn: 0, location: 'Pune / Hybrid',
      text: `Rahul Mehta
UX Manager with 13 years of experience in insurance and financial services.
- Hired, managed and grew a team of 8 designers and researchers; ran performance reviews and career development.
- Defined the design vision and strategic roadmap aligned to business goals and OKRs.
- Established design governance, standards and a scalable design system.
- Presented UX strategy and outcomes to the executive leadership team.
- Drove cross-functional alignment with product, engineering and claims operations.
- Championed user research and measurable UX metrics; improved claim completion by 22%.
- Sponsored machine learning features for fraud detection.
Skills: Figma, Jira, Confluence, Miro.`,
    },
    {
      name: 'Grace Kim', empId: 'E10003', status: 'Allocated', availableIn: 60, location: 'Singapore',
      text: `Grace Kim
Director of UX with 17 years of experience.
- Built and led a design organisation of 25 across research, product design and content design; hired 6 design managers.
- Defined design org structure, operations and UX maturity programme.
- Partnered with the C-suite on company strategy and product vision; owned the experience roadmap.
- Established design system governance and standards across the enterprise.
Skills: design leadership, strategy, Figma, Miro.`,
    },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
