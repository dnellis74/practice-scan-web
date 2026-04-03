---
name: practice-visibility-scan
description: “Generates free Practice Visibility Scan reports (.docx) for podiatry prospects. Trigger on visibility-scan requests or a practice name. If the user specifies a scan radius (e.g. 5 miles, 10 mi), honor it for LocalFalcon runs. Otherwise use only the practice name—do not ask for address, website, or keywords. Use LocalFalcon MCP, firecrawl, and web search.”
---

# Practice Visibility Scan

## Purpose

Generate a free diagnostic report for a podiatry prospect. The report reveals visibility problems and missed opportunities â€” but does NOT provide solutions. The goal is to drive the prospect to book a strategy call with Jim.

**This is a lead-gen tool, not a deliverable.** Show the pain, not the cure.

## Dependencies

- Uses `docx` (docx-js, already installed in node_modules) for .docx generation.
- Uses LocalFalcon MCP tools for scan data.
- Uses firecrawl MCP for website scraping (preferred over web_fetch).
- Uses web_search for demographic research.

---

## How to Start (CRITICAL — read this first)

**Minimum input:** a **practice name**. The user may also state a **scan radius** in the same message (e.g. "5 mile radius", "10 mi", "scan at 7 miles"). **If they specify a radius, you MUST use that radius** for every LocalFalcon run and for report copy—do not substitute an auto-calculated radius.

**DO NOT ask** for address, website, or keywords when not provided—find them via LocalFalcon and research.

1. Search LocalFalcon for the practice (`listAllLocalFalconLocations` or `searchForLocalFalconBusinessLocation`)
2. The LocalFalcon result gives you: address, coordinates, website URL, rating, reviews, categories, phone
3. Resolve **scan radius** (see below), then check for existing scans that match **radius + keywords + date**; run new scans if missing or wrong radius.
4. Scrape the website via firecrawl
5. Research demographics via web search
6. Build the report

**Default keywords** (when not specified): "podiatrist", "foot doctor", plus up to 2 condition-specific keywords from intake form answers if pasted. Otherwise "podiatrist" and "foot doctor" only.

**Scan radius resolution (in order):**
1. **User-specified** — If the user gave a radius (miles), parse it to a number and use it for all keywords. Examples: "5 miles", "10mi", "radius 3.5", "7-mile scan".
2. **Otherwise** — Calculate from Census geocoder / CITY_RADIUS / population fallback per `scan-automation-v8.js` (11x11 grid, `measurement: "mi"`, `platform: "google"`).

**Never ask for optional details. Just go.**

---

## Data Gathering Workflow

Follow this sequence before writing the report:

### 1. Find the Practice in LocalFalcon

```
listAllLocalFalconLocations(query: "[practice name]")
```

If not found, search Google:
```
searchForLocalFalconBusinessLocation(term: "[practice name]", proximity: "[city, state]")
```

Save to account if needed, then proceed.

### 2. Pull LocalFalcon Scan Data

Decide **`scanRadiusMi`** first (user override or calculated — see "How to Start").

First check for existing scans:
```
listLocalFalconScanReports(placeId: "[place_id]", startDate: "[today]", endDate: "[today]")
```

**Before using any existing scan — verify the coordinates match the practice's actual location.** Check the scan's lat/lng against the practice's address. Scans run by the GAS automation pipeline have occasionally been assigned to the wrong practice's coordinates due to a place_id mismatch bug in the pipeline. If the coordinates are wrong, do not use those scans — treat them as if no scans exist.

**Radius matching:** After `getLocalFalconReport`, compare the report's **radius** field to **`scanRadiusMi`**. If the user requested a specific radius and existing scans used a different radius, **do not reuse** those reports—run new scans at the requested radius.

If scans exist, coordinates are correct, and radius matches (or user did not require a specific radius), retrieve each full report:
```
getLocalFalconReport(reportKey: "[report_key]")
```

If no suitable scans exist, run them for each keyword. The LocalFalcon HTTP API uses **snake_case** fields (`grid_size`, `place_id`, etc.); the MCP tool may mirror that or use camelCase—use the **exact parameter names** your MCP exposes. **Always pass `radius` as a string** (the API expects string values, e.g. `"5"` or `"5.0"`), with `measurement: "mi"`:

```
runLocalFalconScan(
  placeId: "[place_id]",
  keyword: "[keyword]",
  lat: "[lat]",
  lng: "[lng]",
  gridSize: "11",   // or grid_size: "11" — match your MCP schema
  radius: "[scanRadiusMi as string]",
  measurement: "mi",
  platform: "google"
)
```

If the tool rejects the call, retry using **snake_case** (`grid_size`, `place_id`) per `scan-automation-v8.js` (`/v2/run-scan/` payload). Ensure **`radius`** is not sent as a bare number if the tool requires a string.

**Radius when user did not specify:** Do NOT default to 1.0 mi blindly. Calculate from market size (Census geocoder → CITY_RADIUS → population fallback) so the radius covers surrounding communities in the demographic section. See `scan-automation-v8.js`.

**Platform:** Google Maps only. Do NOT run ChatGPT/AI scans.

**Extract from each scan report:**
- Average Rank Position (ARP)
- Share of Local Voice (SoLV)
- Average Top-3 Rank Position (ATRP)
- Found-in count vs total data points
- Regional performance (which directions are strong/weak)
- Top competitors and their SoLV
- AI analysis problems (major and minor)
- Vulnerable competitors
- Grid image URLs (`image` field) â€" these are auto-embedded in the .docx (see `references/grid_capture.md`)

### 3. Analyze the Website

Fetch the practice website using firecrawl (preferred — returns full rendered content):
```
firecrawl_scrape(url: "[website URL]", formats: ["markdown"])
```

If firecrawl is unavailable, fall back to:
```
web_fetch("[website URL]")
```

**Note:** `web_fetch` often returns only CSS/JS headers for WordPress/Divi sites — if the result is mostly stylesheet data with no readable content, switch to firecrawl immediately.

**Evaluate:**
- Platform (Squarespace, WordPress, Wix, Officite, custom, etc.)
- Mobile responsiveness
- SSL certificate
- Online scheduling method (native, ZocDoc, form-only, none)
- Contact info visibility
- Service/condition pages (count and depth)
- Blog posts (count, recency, original vs syndicated)
- Doctor bios
- Professional design quality
- Platform control (vendor-locked or self-controlled?)

### 4. Research Demographics

Search for median household income in surrounding neighborhoods:
```
web_search("median household income [neighborhood names] [city] [zip codes]")
```

Find 4â€“6 neighborhoods within the practice's scan radius. Compare their median household income to the city average. This becomes the Demographic Opportunity section â€” showing the prospect they're missing high-income, cash-pay patients in surrounding affluent areas.

### 5. Assess the Google Business Profile

Extract from LocalFalcon data and web research:
- Review count and average rating
- GBP description (present? word count?)
- Categories set
- Posts recency (active, stale, none)
- Services/products listed
- Photo quality and variety
- Q&A section populated?
- Hours and holiday hours accuracy

### Handling Practices with No Google Business Profile

Some prospects — especially new or mobile practices — have no verified Google Business Profile at all. This is confirmed when:
- `listAllLocalFalconLocations` returns no match
- `searchForLocalFalconBusinessLocation` returns only unrelated results
- A Google Maps search (via Playwright or web search) redirects to a competitor rather than the practice

**When no GBP exists, handle it as follows:**

**Scoring:**
- Google Business Profile: **0/20** — no profile exists
- Local Search Rankings: **0/20** — cannot rank without a GBP
- No LocalFalcon scans can be run (no place_id)

**Scan section in the report:**
- Show all keywords with "Google Maps Visibility: Not Found | Share of Local Voice: 0%"
- Write original narrative per keyword explaining what patients see (or don't see) when they search
- Use `[INSERT GRID IMAGE: keyword]` placeholder text — note in your handoff to Jim that grids cannot be generated without a GBP

**Bottom Line and Critical Observations:**
- Lead with the GBP absence as the single most urgent finding
- Frame it as a foundation problem, not a ranking problem — no amount of other marketing works until this is resolved

**Do not** attempt to run scans against a competitor's place_id as a workaround. The report should honestly reflect that the practice is invisible.

---

## Scoring System

Read `references/scoring.md` for the complete rubric with per-item breakdowns. The system uses 6 categories totaling 100 points:

| Category | Max Points |
|----------|-----------|
| Website Fundamentals | 20 |
| Google Business Profile | 20 |
| Local Search Rankings | 20 |
| Online Reviews | 20 |
| Content & SEO | 10 |
| Patient Engagement | 10 |
| **Total** | **100** |

Score each item per the rubric. Be honest â€” prospects respect accuracy more than flattery. This is peer-to-peer, not a sales pitch.

**Important:** The scoring drives the Score Summary table and the overall score box, but the individual per-item scoring tables are NOT included in the report. The scoring rubric is used internally to arrive at the category totals. Only the category-level scores appear in the final document.

---

## Report Structure

Read `references/report_template.md` for the full content and formatting spec. The report follows this fixed order:

```
Page 1:     Logo (PG-Claude.png, centered) + Title ("PRACTICE VISIBILITY SCAN") + Score Box + 2-column Strengths/Problems table
Pages 1â€“2:  "Where Patients Find You on Google" â€” legend + one block per keyword with stats, analysis, and grid image placeholder
Page 2:     Bottom Line box
Page 3:     DETAILED FINDINGS header + Practice Info table + Score Summary table (category-level only)
Page 3:     The Demographic Opportunity section (income table + analysis paragraphs)
Page 4:     SUMMARY â€” General Observations box (light blue bg) + Critical Observations box (red border, light red bg)
Page 4:     Closing CTA (larger text)
```

**What is NOT in the report:**
- No individual category detail breakdowns (no per-item scoring tables, no observation boxes per category)
- No "Priority Opportunities" or "Recommended Next Steps" sections
- No "Action Items" column â€” only Strengths and Problems

The report is intentionally lean. It shows the pain clearly and concisely, then points to a call. The detailed breakdowns are reserved for the paid X-Ray report.

---

## Brand & Styling

Read `references/brand.md` for exact colors, fonts, and formatting rules. Key principles:

- **Logo:** Use `PG-Claude.png` (transparent RGBA PNG, dark text). Do NOT use `Podiatry_Growth_Logo_Mark_Color_Retina.png` â€” that file is a JPEG with a black background despite the `.png` extension.
- **Color palette:** Blue 900 (`0B2545`) for headlines, Blue 500 (`1B6B93`) for accents, Blue 100 (`D6E8F0`) for Bottom Line box background
- **Score colors are critical:** Score cells and boxes MUST be color-coded by performance level. Green for strong, blue for good, orange for fair, red for poor. Never use neutral/white backgrounds for score cells.
- **Overall score box:** Color the background and border to match the score level â€” green for 80+, blue for 65â€“79, orange for 50â€“64, red for below 50. The score should feel like an honest assessment, not a design element.
- **General Observations box:** Blue Light (`E3F2FD`) background with Gray 200 borders.
- **Critical Observations box:** Red Light (`FFEBEE`) background with Red (`C62828`) border at 3pt.
- **CTA section:** Larger text â€” headline at Arial 32 Bold Blue 900, contact/schedule lines at Arial 26 Blue 500.
- **Font:** Arial throughout
- **Page size:** US Letter (12240 Ã— 15840 DXA), 1-inch margins all sides
- **Content width:** 9360 DXA

---

## Language Rules (non-negotiable)

| Never use | Always use |
|-----------|-----------|
| leads | patient inquiries |
| lead generation | patient acquisition |
| SEO (alone) | local search visibility |
| rankings (alone) | local search rankings |
| conversion rate | (avoid â€” too technical for most DPMs) |
| SoLV (without context) | Share of Local Voice (SoLV) â€” always explain on first use |
| bounce rate | (avoid) |
| CTR | click-through rate |
| SERP | Google search results |

**Tone:** Direct, peer-to-peer. Jim is a podiatrist talking to a podiatrist. No marketing jargon. No fluff. Numbers first, then plain-English interpretation. Write so a busy DPM can skim in 5 minutes and understand what's wrong.

**Critical rule:** Show problems, not solutions. The report should make the prospect think "I need help with this" â€” not "I can fix this myself." Tease the issues without providing a step-by-step playbook.

---

## Output

Single file: `[PracticeName]_Visibility_Report.docx` — saved locally and auto-uploaded to Google Drive.

Grid images are automatically downloaded from LocalFalcon and embedded in the .docx (see `references/grid_capture.md`).

### Google Drive Upload

Reports auto-upload to the **Podiatry Growth** folder in Jim’s Google Drive via a Google Apps Script web app.

**GAS Endpoint:** `https://script.google.com/macros/s/AKfycbwOPETk5H8Gjq1frK_iSTPuW9cDyJkq8l6FWeSyMfbbN7gIskRQs6j8ebZ43YcWJ9fD/exec`

**How it works:**
1. Report script generates the .docx locally
2. Base64-encodes the file and POSTs to the GAS endpoint
3. GAS saves the file to the "Podiatry Growth" Drive folder
4. Returns a Google Drive link

**GAS redirect behavior:** GAS returns a 302 redirect. The response JSON is at the redirect URL (follow as GET, not POST). See `references/gas-drive-upload.js` for the GAS source code.

After generating, present the file to Jim with a brief summary of the key findings, overall score, the Google Drive link, and any notes about items that need manual attention.

---

## Closing CTA

Every report ends with (using larger text sizes):

```
Questions about this report? Let's talk.          (Arial 32, Bold, Blue 900)

jim@podiatrygrowth.com  |  podiatrygrowth.com     (Arial 26, Blue 500)
Schedule a call: calendar.app.google/HCrdfvsfC1StjFNT6   (Arial 26, Blue 500 link)