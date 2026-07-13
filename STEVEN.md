# Steven — Frontend & Demo Driver

**Role:** Frontend, UI/UX, demo presentation, sponsor UI surfaces.

Steven owns everything the user sees: the landing page, agent theater, map, creative panel, simulation, and all sponsor-facing UI. Steven drives the 2-minute pitch.

---

## Phase 0: Setup (0:00-0:15)

- [ ] Scaffold Next.js: `npx create-next-app@latest bilads --typescript --tailwind --app`
- [ ] Install deps: `leaflet react-leaflet leaflet.heat perspective-transform openai`
- [ ] Commit `types.ts` from repo root — this is the shared contract
- [ ] Add Google Fonts to `app/layout.tsx`: Space Grotesk (display) + JetBrains Mono (mono)
- [ ] Extend Tailwind theme with palette tokens: `bg: #0B0B0B`, `fg: #F5F1E8`, `accent: #F5D400`, `surface: #2A2A2A`

---

## Phase 1: Landing Page (0:15-1:00)

- [ ] `app/page.tsx`: `BILADS` wordmark at hero size, tagline "Billboards, decided." underneath
- [ ] Upload form component:
  - Image drop zone (accepts product image, previews it)
  - Text inputs: name, description, target audience
  - Weekly budget ($) input
  - Campaign duration (weeks, default 4)
  - Awareness <-> Targeted slider (0-1, default 0.5)
- [ ] "Deploy agent team" CTA button in accent yellow
- [ ] Three sample product cards row below the form — reads from `data/samples.ts` (Volt, Fog City Coffee, Ledgerly)
  - One click prefills entire form + previews product image
  - Scrolls to CTA after prefill
- [ ] Build `<AgentCard name status findings />` component — used 3x on results screen; build against mocks now

---

## Phase 2: Agent Theater (1:00-2:00)

- [ ] `app/results/page.tsx` shell — on mount, POST to `/api/research` with form state
- [ ] Sequential card activation:
  - Card 1 (Researcher) goes "active" immediately, typewriter-reveals 4 findings (~120ms/char)
  - Card 2 (Media Buyer) activates after Card 1 finishes, typewriter-reveals its 4 findings
  - Card 3 (Creative Director) stays "waiting" until a board is opened
- [ ] Silent handoffs: Card 1 dims to "complete" state, Card 2 lights up. No cross-agent chatter.

### Sponsor: BAND Collaboration View

- [ ] Add a "View agent discussion" toggle/panel that shows the BAND-style conversation between agents
- [ ] Display agent messages in a chat-like UI:
  - Research Agent posts location findings
  - Media Planner explains channel reasoning
  - Creative Director states concept rationale
  - Risk Agent flags any rejected variants with reasons
  - Human approval step at the end
- [ ] Each message shows the agent name, role icon, and timestamp
- [ ] This is the visible proof that agents expose reasoning and require human approval (not just a loading spinner)

---

## Phase 3: Results Page — Map + Info Cards (1:00-2:00)

- [ ] Fullscreen `react-leaflet` map centered on SF with OSM tiles
- [ ] `leaflet.heat` layer (off by default, toggleable)
- [ ] Pin component for top-3 boards from `mediaBuyer.top3` — each pin shows rank number in yellow badge
- [ ] Sticky top bar: budget input + awareness slider + duration input, all bound to state
  - Changing any value re-filters `mediaBuyer.rankings` client-side (recompute `valueScore` with new `w` per PRD §5)
  - Re-drops pins with smooth transition — **this is the demo slider moment**
- [ ] Click pin -> floating info card over the map:
  - Rank badge, name, weekly cost, `demoMatch %`, Media Buyer `reason`
  - "Design ads" button
- [ ] Empty state: if no boards in budget, full-screen message: "Your $X budget doesn't cover any boards. Raise to $Y to unlock 3 options." with nudge slider

### Sponsor: Location Scoring Panel (from SPONSORS.md)

- [ ] When a pin is clicked, show a collapsible "Location Score" breakdown inside the info card:
  - Audience fit (25%), Traffic (20%), Viewing quality (15%), Context (15%), Competitor opportunity (10%), Cost efficiency (10%), Data confidence (5%)
  - Each factor shows: score, evidence snippet, confidence level
- [ ] Scores derived from existing board data (demoMatch, dailyImpressions, weeklyCostUsd, audienceTags, demographics)

---

## Phase 4: Creative Panel (2:00-3:00)

- [ ] On "Design ads" click, slide-in panel (or full-page) over the map
- [ ] POST to `/api/generate` with `{billboardId, brief, audienceProfile, consistentBrand, variant: 0}`
- [ ] Two concept cards side-by-side:
  - Real billboard photo with generated ad perspective-warped onto the board using `perspective-transform` (compute `matrix3d` from `adCorners`, apply as CSS transform)
  - Headline + subline overlaid in display font
  - Language badge (EN/ES) top-right
- [ ] Per-card "Regenerate" button -> same endpoint with `variant++` (local counter)
- [ ] "Consistent brand" toggle at panel top — re-fires generate for both concepts when flipped
- [ ] "Back to map" button
- [ ] **Mission board shows English + Spanish** — call this out on stage

### Sponsor: GMI Cloud Attribution

- [ ] Small "Powered by GMI Cloud" badge on generated creatives
- [ ] Show generation metadata: model used, generation time, resolution

---

## Phase 5: Simulation (3:00-3:30)

- [ ] "Simulate campaign" button in creative panel
- [ ] Day-by-day animated time-series chart (SVG or recharts area chart):
  - Draws daily impressions + target-demo reach, ~80ms/day (whole animation ~2.2s for 28 days)
- [ ] Count-up animations below chart: total impressions, total spend, blended CPM, est. CPA
- [ ] Assumptions listed in mono footer text

### Sponsor: Three-Scenario View (from SPONSORS.md)

- [ ] Show three scenario rows: Conservative / Base / Optimistic
  - Each with estimated reach, responses, and conversions
  - Highlight the "Base" scenario as the primary recommendation
- [ ] Always expose assumptions — never claim precise predictions

---

## Phase 6: Sponsor UI Surfaces

### Kylon Workspace Panel

- [ ] Add a "Kylon Workspace" sidebar or tab showing:
  - Company context loaded (brand guidelines, personas, approved claims)
  - Current assignments for the AI marketing team (research, media planning, creative, packaging)
  - Assignment status: pending / in-progress / complete
- [ ] This shows Kylon as the persistent AI workforce manager

### InsForge Integration UI

- [ ] User login/auth UI (InsForge-powered)
- [ ] Campaign history page: list of past campaigns with status, date, top boards
- [ ] "Reopen campaign" action — loads a saved campaign back into the workflow
- [ ] Campaign status indicator: shows real-time agent activity state
- [ ] "Powered by InsForge" in the footer/settings

### Nimble Data Attribution

- [ ] In the Research Agent's findings, show "Source: Nimble" badges on location intelligence data
- [ ] Expandable "Market Intelligence" section in agent findings showing:
  - Nearby businesses, retail density, transit signals
  - Competitor activity, local events
  - Data freshness indicator

---

## Phase 7: Rehearsal (3:30-4:00)

- [ ] Wire up cached AI outputs so the live pipeline is bypassed when `?cached=1` or a "demo mode" flag is set
- [ ] Two full dry-runs of the 2-min flow:
  1. Sample click (Volt) -> agent theater -> BAND discussion view -> slider drag (watch pins reorder) -> open Mission -> English + Spanish reveal -> simulate -> live regenerate
  2. Second run with Fog City Coffee for variety
- [ ] Confirm fallback: kill wifi, hit regenerate, ensure cached variant swaps in silently
- [ ] Practice the pitch script (PRD §2):
  - Open with the problem, not the tagline
  - Show the slider reorder moment
  - Call out the Mission bilingual moment
  - Live regenerate as the closer
  - "Billboards, decided." — land it at the end

---

## Demo Script Cheat Sheet

| Moment | What to do | What to say |
|---|---|---|
| Open | Click Volt sample | "Buying a billboard today is broken..." |
| Agent theater | Let it run, point at BAND discussion | "Our agents research, plan, and debate..." |
| Slider drag | Move awareness -> targeted | "Watch the rankings reorder — zero API calls" |
| Mission board | Click pin, open creative | "Same board, two concepts — one in Spanish" |
| Simulation | Click simulate | "Day-by-day projected reach..." |
| Regenerate | Click regenerate on one card | "Everything was cached — watch this one run live" |
| Close | Pause | "Billboards, decided." |

---

## Q&A Role

Steven answers: product vision, UX decisions, why map-first, why the slider matters, category framing ("AI agent product that happens to do billboards"), competitive positioning vs Caasie.
