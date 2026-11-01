# UX Talent Intelligence — Profile-to-JD Match Assessment

A browser app for **practice resource managers**, built on the *UX Profile-to-JD Match Assessment Framework*. Upload an account's demand (JD) and a resource's profile, see how well they match, then share a ready-made profile pack with the account team to fill the demand and keep practice utilisation up. No install or build step.

## Workflow
0. **Home:** the day's to-do list. It shows profiles to chase (shared 5+ days ago with no response), interviews to prepare for, open demands with nothing shared yet, and idle or soon-free resources with the open demand they fit best. Below that are open demands with their stage counts and best bench candidate, and the bench by level.
1. **New match:** upload or paste the demand JD (demand ID, account, location, required start) and the resource profile (employee ID, current status, available-from date).
2. **Match details (one person → one demand):** not a tab. It opens when you click View on a ranked resource, Open on a pipeline card, or a Home to-do item, and has a "← Back to …" link to where you came from. It starts with the **Decision path**: six checks (skills match, critical skills, level, experience, availability, domain & tools), each green, amber or red, leading to the recommendation (*Propose to account* / *Propose with ramp-up plan* / *Propose — validate gaps* / *Consider with upskilling* / *Not suitable*). Click a check to jump to its evidence. Below are a plain-language summary and next step, an optional "How to read this page" guide, the competency breakdown with résumé evidence, demand weights you can adjust, gaps, recommendations and a development roadmap.
3. **Share with account team:** download an account-facing **PDF profile report** and the **original résumé file**, and open a pre-filled **email draft** (or copy the message). The report leaves out internal-only details such as assessor adjustments, weighting and interview prep.
3b. **Send feedback to the resource:** on a match, choose *Send feedback to resource* (or switch the Share dialog to *The resource*). It creates a constructive **feedback report (PDF)** and email draft with what already matches (with quotes from their profile), the skill areas to work on with a suggested action and learning topic, quick fixes to how the profile is written (missing JD keywords they may have done, measurable results, ownership verbs, portfolio, tools, domain), a development plan and interview topics. It leaves out the fit verdict, ranking and other candidates, and an option drops the account name. The pipeline entry records the date feedback was sent without changing its stage. When the resource sends an updated profile, update it on the Bench (Edit). Reopening their match then uses the new profile and shows how the score moved (e.g. 88% → 96%), with *Save to pipeline* to keep it.
4. **Resource pipeline:** track each proposal through *Shortlisted → Shared with account → Account interview → Selected → Allocated* (or *Rejected* / *On hold*). Filter by demand or status. Headline counts show open demands, shares and selection rate. On first open, the pipeline is filled with sample entries: the top bench matches for each sample demand, at different stages. "Add sample data" puts them back.
4b. **Filters and Summary:** filter the pipeline by demand, account, resource and status. The tiles, board and table all follow the filters, and each active filter shows as a removable chip. The **Summary** view groups proposals by demand, resource or account. It shows proposed, rejected, rejection rate (rejected ÷ decided) and the top reject reason, followed by the other stages. Click any number to open those proposals in the table. Below it, *Why proposals were rejected* counts the reasons. Moving a proposal to *Rejected* (board or table) asks why (skills gap, level mismatch, availability, domain, location, cost, interview performance, client chose another candidate, demand cancelled, other) with an optional note from the account. The reason shows on the card and in the table.

## Faster ways to work
- **Command bar (⌘K / Ctrl K, or `/`):** jump to any tab, rank the bench for any demand, open a resource or pipeline entry, add resources or switch theme. Type to filter, then use ↑ ↓ and Enter.
- **Live ranking:** choosing or uploading a JD ranks the bench straight away. The demand form then folds into a one-line strip so the results sit at the top. While you edit the demand, the ranking updates as you type.
- **Compare:** tick 2–3 ranked resources to see them side by side: best-fit score, match, availability, critical gaps, adjustments and each skill the demand asks for, with the best value in each row highlighted.
- **Pipeline board:** drag cards between stages, or press → to move one to the next stage. Cards show days in stage and flag shares that need chasing. Moving someone to *Allocated* also marks them Allocated on the bench. A Table view is still available.
- **Light / dark theme** toggle in the header (it follows the system setting until you choose one).

## Best fit from the bench
- **Bench resources tab:** the practice roster at every level (Junior → Director). Level is worked out automatically from the profile, alongside status (Bench / Rolling off / Partially allocated / Allocated), available-from date, location and top skills. You can search and filter, change status and dates inline, add or edit resources in a form, or drop several profiles at once (each file becomes a resource and its original file is kept for sharing). Twelve fictional sample resources are pre-loaded; "Add sample resources" restores them.
- **Demand match → "Best fit from bench":** enter the demand and every resource with an included status is scored against it. The top one is shown as the **best-fit resource**, with why it was chosen and the runner-up, followed by the full ranked list. Each row has View (match details) and + Pipeline; tick 2–3 rows to compare them. Switch to "Single profile" to match one uploaded profile instead.
- **Best-fit score** = profile match ± visible ranking adjustments:
  - over-levelled: −3 for one level, −5 for each extra level (cost and grade mismatch)
  - under-levelled by more than one level: −4 for each extra level
  - critical gaps: −8 each, up to −16
  - starts after the required date: −3 to −10
  - partially allocated: −3
  - no people-management evidence for a manager or director demand: −10
  - critical JD skills missing: −4 each, up to −8
  - matching domain: +4
  - JD tools covered: up to +3
  - preferred extra skills: +2 each, up to +4

## Run
Open `index.html` in any modern browser (Chrome, Edge, Safari, Firefox). Load a sample JD and profile from the dropdowns to try it.

## How it works
1. **JD analysis** (`js/engine.js → analyzeJD`) — detects role level (title → text → required years), required years, and each competency's priority (Critical / Important / Nice-to-have / Not mentioned) from wording ("must", "proven", "preferred", "nice to have") and section headers. Also extracts leadership expectations, industry, AI requirements and tools.
2. **Dynamic weights** — framework base weights × priority multiplier × mention frequency × the role level's leadership factor, normalised to 100%. You can also pick the document's Example A/B/C presets, or edit priorities and weights by hand.
3. **Profile validation** (`analyzeProfile`) — finds sub-skill evidence per competency, ownership verbs, quantified outcomes, years (stated or from date ranges), portfolio, tools, domain, leadership examples and design-system ownership.
4. **Scoring** — `Match % = min(100, Evidence ÷ JD expectation)`, where the expectation rises with role level and priority; `Overall = Σ Match × Weight`.
4b. Competencies the JD doesn't mention count at half strength in the overall (50 + match ÷ 2), so specialists aren't penalised for skills the demand doesn't need.
5. **Fit and critical-skill validation** — fit bands from the framework. Any Critical competency below 60% turns the result into *Conditional Fit – Missing Critical … Capability*.
6. **Outputs** — competency breakdown with evidence quotes and assessor overrides, gap analysis, recommendations, a 0–12-month development roadmap, fit across role levels and archetypes, and a fulfilment recommendation.

## Features
- File upload for both the résumé and the JD: drag and drop, or browse. Supports PDF, Word `.docx` and `.doc` (97–2003), RTF, OpenDocument `.odt` and plain text. The format is detected from the file contents, so a wrong extension still works. Everything is read in the browser and nothing is uploaded to a server. PDF reading loads pdf.js from cdnjs, so it needs an internet connection; the other formats work offline. Scanned or image-only PDFs have no text to read and need OCR first.
- After a profile upload, the resource's name (and employee ID if present) is filled in from the file and years of experience are reset to auto-detect. After a JD upload, the role title (and demand or requisition ID if present) is filled in.
- The pipeline is stored in the browser's localStorage and original résumé files in IndexedDB. Both stay on this computer and browser only. Use Export JSON to keep a record elsewhere.
- Email drafts open in your mail app. Browsers can't attach files to a draft, so attach the downloaded report and résumé before sending.

## Files
`js/framework.js` (competencies, keywords, bands, presets) · `js/engine.js` (scoring) · `js/app.js` (UI) · `js/charts.js` · `js/fileparse.js` · `js/samples.js` · `css/styles.css`

To tune scoring, edit keywords and weights in `framework.js`, or the multipliers in `engine.js` (`autoWeights`, `evidenceScore`, `expectationFor`).
