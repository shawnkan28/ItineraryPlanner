## Spec

### 1. Goals
- Plan a trip in the same three phases used for the 2027-03 Japan trip, inside one app instead of three long notes.
- Keep a day plan for every day (timeline with times, Focus / Maybe / Optional) and write the journal for that day in the same place. Journal entries are written in the app during the trip (on the phone), not in Obsidian.
- Track every booking (ferries, buses, tours, hotels, tickets) with status, dates and links.
- After the trip, export to the vault:
  - one journal note per day, in the existing day note format
  - the final itinerary overview note, named "Itinerary" (Base, Days, Stays, Bookings, Dropped / parked)
  - Phase 1 and Phase 2 are not exported. They stay in the app only.
- Exported notes must look hand-written: correct wikilinks, callouts, heading levels, file names and folders.

**Not in scope (v1):** maps / routing, native mobile app. The web app must work well on a phone, since the journal is written there.

**Future expansion:** let Brandon view or edit the plan (accounts or a share link). Not built in v1, but keep it possible: see 10. Tech stack.

### 2. How the phases map to the app

| Phase | What it is today | In the app |
| --- | --- | --- |
| Phase 1 | Which cities, how many nights, alternative route options | **Route options:** several draft routes (list of bases + nights). Pick one to promote to Phase 2 |
| Phase 2 | Activities per city, open decisions, transport options, where to stay | **Ideas board** per base: candidate activities, open decisions (question + options + chosen answer), stay candidates |
| Phase 3 | Final plan: bases, days, stays, bookings, dropped / parked | **Final itinerary:** day-by-day plans built from the ideas, plus stays and bookings |
| During / after | Journal notes | **Journal** tab on each day: summary, highlights, log, food, tips |

Moving between phases never deletes data. An activity that is not used in Phase 3 stays on the ideas board with status `dropped` or `parked`, which is what fills the "Dropped / parked" section on export. Phase 1 and Phase 2 themselves are never exported.

### 3. Main concepts
- **Trip:** name ("Japan"), start / end date, travellers (e.g. me + Brandon), home currency (SGD), status (`planning`, `booked`, `ongoing`, `done`, `exported`).
- **Base:** where you sleep for a range of nights (Beppu, 2 nights, 13-14 Mar). Overnight transport (the Sunflower ferry) is also a base.
- **Place:** a link target in the vault (Kannawa, Musoen, Hyotan Onsen). Places follow the vault hierarchy: country → region → city → area → place.
- **Day:** one date of the trip, with a title city ("Day 5: Nagasaki City"), a quick summary and a stay.
- **Plan item:** one line on a day's timeline: time label, title, details, links, section (Focus / Maybe / Optional / Plan B / Booking / Info).
- **Booking:** something that must be booked or checked, linked to a day and optionally a plan item or stay.
- **Stay:** the hotel for a base: name, link, address, area, price, check-in / check-out.
- **Journal entry:** what actually happened on a day.

### 4. Data model (SQLite)

Use Drizzle ORM with migrations. All ids are integers; dates are ISO `YYYY-MM-DD` text; money is stored as integer minor units + currency code.

**trip**
| column | type | notes |
| --- | --- | --- |
| id | int pk | |
| name | text | "Japan", used in file names: `2027-03-12 Japan Trip Day 01` |
| start_date / end_date | text | |
| travellers | text (json) | `["me", "Brandon"]`, used for per-person columns (Fri 19 shopping day) |
| home_currency | text | `SGD` |
| status | text | planning / booked / ongoing / done / exported |
| notes | text | free markdown |

**route_option** (Phase 1)
| column | type | notes |
| --- | --- | --- |
| id, trip_id | int | |
| name | text | "Option A", "Other option", "Skip Imabari" |
| is_chosen | bool | only one per trip |
| notes | text | |

**route_stop** (Phase 1 rows, and the final Base table once chosen)
| column | type | notes |
| --- | --- | --- |
| id, route_option_id | int | |
| position | int | order |
| place_id | int | city, e.g. Beppu City |
| label | text | optional override, e.g. "Osaka → Beppu" |
| nights | int | 0 for the fly-home day |
| start_date | text | filled once dates are fixed |
| kind | text | `stay`, `overnight_transport`, `depart` |

**place** (shared across trips)
| column | type | notes |
| --- | --- | --- |
| id | int pk | |
| name | text | must match the vault note name exactly, e.g. `Sunflower Ferry Terminal (Osaka)` |
| level | text | country / region / city / area / place |
| parent_id | int | hierarchy |
| aliases | text (json) | "Musouen", "Yama no Hotel Musouen" |
| vault_path | text | set when imported from the vault, null for new places |
| notes | text | hours, prices, tips |

**idea** (Phase 2)
| column | type | notes |
| --- | --- | --- |
| id, trip_id | int | |
| base_id | int | which base it belongs to |
| place_id | int | optional |
| title | text | |
| details | text | |
| status | text | `idea`, `planned`, `dropped`, `parked` |
| reason | text | "too far out of the way" (shown in Dropped / parked) |

**decision** (Phase 2 open decisions)
| column | type | notes |
| --- | --- | --- |
| id, trip_id | int | |
| question | text | "Is anyone willing to drive?" |
| options | text (json) | each option: label, gain, trade-off |
| answer | text | chosen option, null while open |
| status | text | `open`, `decided`. Open ones feed "Still to decide" |

**day**
| column | type | notes |
| --- | --- | --- |
| id, trip_id | int | |
| day_number | int | 1..N |
| date | text | |
| title_place_id | int | the city in `# Day 5: [[Nagasaki City]]` |
| base_label | text | "Nagasaki (day trip)" for the overview Days table |
| summary | text | one line for the Days table and Quick Summary |
| stay_id | int | null for the overnight ferry / fly-home day |
| stay_note | text | "(check-in)", "Overnight ferry (MOL Sunflower)" |

**plan_section**
| column | type | notes |
| --- | --- | --- |
| id, day_id | int | |
| kind | text | `focus`, `maybe`, `optional`, `plan_b`, `booking`, `info` |
| title | text | optional suffix, e.g. "Plan A, luggage to the port first" |
| collapsed | bool | exported as `-` (collapsed) callout; default true for optional / plan_b |
| position | int | |

**plan_item**
| column | type | notes |
| --- | --- | --- |
| id, section_id | int | |
| position | int | order on the timeline |
| time_label | text | free text: `07:55`, `~13:30`, `08:30-09:30`, `Morning`, empty = `--:--` |
| sort_time | text | optional `HH:MM` used for ordering and the "Key times" strip |
| title | text | can contain place links |
| place_id | int | optional main place |
| person | text | optional, for split days ("Brandon", "me") |
| details | text (json) | list of sub-bullets |
| links | text (json) | list of `{label, url}` |

**stay**
| column | type | notes |
| --- | --- | --- |
| id, trip_id, base_id | int | |
| hotel | text | "Umino Hotel Hajime" |
| place_id | int | hotel place note, if any |
| url | text | cleaned link (no tracking parameters, see 7.4) |
| address | text | |
| location | text | area / nearest station |
| price_minor, currency | int, text | 37705, SGD |
| check_in / check_out | text | date + optional time |
| booked_via | text | Booking.com |
| status | text | `idea`, `booked`, `cancelled` |

**booking**
| column | type | notes |
| --- | --- | --- |
| id, trip_id | int | |
| day_id | int | which day it is for |
| plan_item_id / stay_id | int | optional links |
| category | text | ferry, bus, train, tour, hotel, ticket, restaurant, check |
| title | text | "Ferry Osaka → Beppu" |
| provider | text | MOL Sunflower, Klook, Trip.com |
| url | text | |
| tasks | text (json) | checklist: `[{text, done}]`, e.g. "Check that it stops at Tsunoshima Bridge" |
| status | text | `to_book`, `booked`, `not_needed`, `cancelled` |
| opens_on | text | date bookings open (ferry: 2027-01-11) |
| book_by | text | own deadline |
| confirmation | text | booking reference |
| price_minor, currency | int, text | |
| cancellation | text | free cancellation until ... |
| notes | text | |

**journal_entry** (one per day)
| column | type | notes |
| --- | --- | --- |
| day_id | int pk | |
| quick_summary | text | overrides `day.summary` in the note if set |
| highlights / lowlight | text | |
| log_morning / log_afternoon / log_evening | text | markdown |
| breakfast / lunch / dinner | text | |
| tips | text | |
| banner | text | image file name, optional |

**attachment**
| column | type | notes |
| --- | --- | --- |
| id, day_id | int | |
| file_path | text | stored under `data/attachments/` |
| caption | text | e.g. the Google Maps route screenshot on Day 3 |

**export_run**
| column | type | notes |
| --- | --- | --- |
| id, trip_id | int | |
| run_at | text | |
| target | text | vault path or zip |
| files | text (json) | path + hash of every file written, used to detect later edits in the vault |

### 5. Screens
1. **Trips list:** cards with dates, status, number of open bookings.
2. **Trip → Phase 1 (Route):** side-by-side route options (list of bases + nights + dates), night total check against the trip length, "Choose this route".
3. **Trip → Phase 2 (Ideas):** one column per base with idea cards (drag to reorder, mark dropped / parked with a reason), open decisions panel, stay candidates.
4. **Trip → Phase 3 (Itinerary):**
   - Overview: Base table, Days table, Still to decide (open decisions), Dropped / parked
   - Day editor: timeline with time label, title, details, links; sections Focus / Maybe / Optional / Plan B / Booking / Info; drag items between sections; place autocomplete from the places library
   - "Key times" preview at the top of the day (timed Focus items), like the Excel day sheets
5. **Bookings:** table of every booking with filters (status, category, day), "opens soon" and "book by" badges, checklist per booking, quick toggle to booked + confirmation number.
6. **Stays:** one card per base with hotel details and price; trip total per currency.
7. **Journal:** per day, side by side with the plan: summary, highlights, log, food, tips, photos.
8. **Places:** library of places (imported from the vault + created in the app), with hierarchy and aliases.
9. **Export:** pick what to export, preview every file, show which files already exist in the vault and whether they were changed there since the last export, then write.

### 6. Booking tracking rules
- A booking is "due" when `opens_on` or `book_by` is within the next 14 days and status is `to_book`.
- The trip dashboard shows: due bookings, bookings still `to_book`, total booked cost by currency.
- Bookings can exist without a plan item (e.g. "Check the last ferry back").
- A stay with status `booked` counts as a booking in totals but is shown on the Stays screen.
- Optional later: an `.ics` feed of `opens_on` / `book_by` dates for the phone calendar.

### 7. Export to Obsidian

#### 7.1 Where files go
Settings: `vault_path` (for example a Docker volume mounted at the PKM folder). If not set, export a zip with the same folder structure.

| Note | Path |
| --- | --- |
| Day notes | `Travel/05-journals/{YYYY-MM} {Trip} Trip/{YYYY-MM-DD} {Trip} Trip Day {NN}.md` |
| Final overview | `Travel/06-travel_notes/{YYYY-MM} Trip - Itinerary.md` |
| Attachments | `_attachments/Travel/05-journals/{YYYY-MM} {Trip} Trip/{note name}/` |

`NN` is zero-padded (`Day 01`); the heading uses the plain number (`# Day 1`).

#### 7.2 Formatting rules (match the current notes)
- **Callouts:**

  | Section | Callout |
  | --- | --- |
  | Focus | `> [!success] Focus` (+ `: title` if set) |
  | Maybe | `> [!warning] Maybe` |
  | Optional | `> [!note\|purple]- Optional` (collapsed) |
  | Plan B | `> [!note\|purple]- Plan B: title` |
  | Booking / info for the day | `> [!important\|red] title` |
  | Getting there | `> [!note\|blue] Getting there` |
  | Stay (overview) | `> [!note\|blue] Stay` |
  | Still to decide (overview) | `> [!question]+ Still to decide` |
  | Quick summary | `> [!example] Quick Summary` |

- **Timeline lines:** `> - **{time_label}** · {title}`, sub-bullets `>     - {detail}` (4 spaces). Empty time → `--:--`. Optional items have no time: `> - {title}`.
- **Headings:** `#` for the day title, `##` for sections (Plan, The Log, ...), `###` for Morning / Afternoon / Evening.
- **Wikilinks:** places export as `[[Place Name]]` or `[[Place Name|label]]`. Inside markdown tables the pipe must be escaped: `[[Place Name\|label]]`. Outside tables never escape it.
- **Links:** markdown links `[label](url)`.
- **Line endings:** `\n`, UTF-8, no BOM.

#### 7.3 Day note template
```markdown
---
tags:
  - travel/journal
date: {date}
banner: {banner}
Trip: "[[{YYYY-MM} {Trip} Trip]]"
---

# Day {n}: [[{title place}]]
← [[{prev note}|Day {n-1}]] · [[{overview note}|Overview]] · [[{next note}|Day {n+1}]] →

---

> [!example] Quick Summary
> {quick summary}

---

## Key Highlights & Logistics
* **Location:** [[{title place}]]
* **Highlights:** {highlights}
* **Lowlight / Tip:** {lowlight}

---
## Plan
**Stay:** {hotel}{stay_note}. Details in [[{overview note}#Stays|Stays]]

{sections, in order: booking/info, focus, maybe, optional, plan B}

{attachments as ![[file]]}

---
## The Log

### Morning: {log_morning}

### Afternoon: {log_afternoon}

### Evening: {log_evening}

---

## Food & Spots Logged
* **Breakfast:** {breakfast}
* **Lunch:** {lunch}
* **Dinner:** {dinner}

---

## Notes for Future Visits / Tips
* {tips}
```
- Day 1 has no "←" link and the last day has no "→" link.
- Booking callouts end with `> - Booking and checks: [[{overview note}#Bookings|Bookings checklist]]`; the checkboxes themselves live only in the overview.

#### 7.4 Final overview template
```markdown
---
tags:
  - travel/notes
  - travel/itinerary
dates: {DD/Mon} - {DD/Mon YYYY}
backlinks:
  - "[[{day 1 note}]]"
---
# Itinerary
Overview of the final plan. Each day's plan is in its day note.

> [!question]+ Still to decide
> - **{question}:** {notes}

| Base | Nights | Dates |
| --- | --- | --- |
| [[{city}]] | {nights} | {DD/Mon - DD/Mon} |

---
### Days
| Day | Date | Base | Plan |
| --- | --- | --- | --- |
| [[{day note}\|Day {n}]] | {Ddd DD} | {base_label} | {summary} |

---
### Stays
#### [[{city}]] ({DD/Mon - DD/Mon})
> [!note|blue] Stay
> - Hotel: {hotel}
> - Link: [{booked_via}]({url})
> - Address: {address}
> - Location (area / nearest station): {location}
> - Price: {price} {currency}
> - Check-in {date}, check-out {date}
> - [x] Booked ({booked_via})

---
### Bookings
> [!important|red] Bookings and checks
> **[[{day note}|Day {n}]] · {title}** ([{provider}]({url}))
> - [ ] {task}
>

---
### Dropped / parked
- Dropped: [[{place}]] ({reason})
- Parked (no day yet): [[{place}]] ({reason})
```
- Omit "Still to decide" if there are no open decisions.
- Booking tasks export as `[x]` when done.
- **Clean links on export:** strip tracking and session parameters from booking URLs (Booking.com `aid`, `sid`, `label`, `srpvid`, ...; Klook `spm`, `clickId`; any `utm_*`). Keep parameters that change the page (e.g. `curr=SGD`).

#### 7.5 Re-export and safety
- First export: write all files.
- Later exports: for each file compare the vault file hash with the hash from the last `export_run`.
  - Unchanged in the vault → overwrite.
  - Changed in the vault → show a diff and ask: overwrite, skip, or write as `{name} (app).md`.
- Never delete files in the vault.
- Optional: the trip hub note `{YYYY-MM} {Trip} Trip.md` (currently missing for 2027-03, so `Trip: "[[2027-03 Japan Trip]]"` links are unresolved).

### 8. Vault import (places and existing trips)
- **Places (v1):** read-only scan of `Travel/00-country` to `Travel/04-place`. Take the note name, `aliases`, and the parent from the `area` / `city` / `region` / `country` frontmatter. Used for autocomplete so exported wikilinks resolve. Never writes to those folders.
- **New places:** places created in the app are listed on the Export screen as "missing notes". Optionally create stub place notes with the same frontmatter as existing ones (`tags: travel/place`, `area`, `city`, `region`, `country: "[[Japan]]"`, `travel_status: interest`).
- **Existing trip (later):** parse a Phase 3 overview + day notes back into the database (timeline lines, callouts, Stays, Bookings), so the 2027-03 trip can be managed in the app.

### 9. Extra exports (later)
- Excel / Google Sheets workbook: Days, Itinerary, Stays, Bookings, Notes tabs.
- One-sheet "easy to read" day plan per day (header, key times, tonight, Focus / Maybe / Optional bands), like the Day 1-3 sheets.
- Printable day card (PDF).

### 10. Tech stack
- **Frontend + server:** SvelteKit 2 with Svelte 5 (runes), TypeScript, `adapter-node`.
- **Database:** SQLite file at `data/itinerary_planner.db` via `better-sqlite3` + Drizzle ORM (`drizzle-kit` migrations). WAL mode on.
- **Forms / API:** SvelteKit form actions for edits; `+server.ts` endpoints for export, zip download and the `.ics` feed.
- **Validation:** Zod schemas shared by forms and actions.
- **Markdown export:** plain template functions (no runtime template engine), with unit tests that compare output against fixture notes copied from the 2027-03 trip.
- **Drag and drop:** for ordering plan items and ideas (e.g. `svelte-dnd-action`).
- **Deploy:** Docker image + `docker-compose.yml`, volumes for `data/` and the vault path. Runs on the home server like the other Svelte projects.
- **Access during the trip:** the journal is written on the phone in Japan, so the app must be reachable away from home (e.g. Tailscale / VPN, or a reverse proxy with a password). Save journal drafts in the browser (localStorage) so nothing is lost on a bad connection, and sync when back online.
- **Login:** single user in v1 with one password. For the future "Brandon can view or edit" feature, keep a `user` table and a `created_by` / `updated_by` column on trips, days and plan items from the start, so accounts or share links can be added without reworking the schema.
- **Backups:** the SQLite file can be copied while running using the SQLite backup API; add a "Download backup" button.

### 11. Milestones
1. **Skeleton:** SvelteKit + Drizzle + SQLite, trips CRUD, Docker setup.
2. **Phase 3 first:** days, sections, plan items, stays. This is the part used most.
3. **Bookings:** bookings table, checklist, due badges, dashboard.
4. **Export v1:** day notes + overview to zip, with fixture tests against the 2027-03 notes.
5. **Vault integration:** places import, export straight to the vault, re-export safety.
6. **Phases 1 and 2:** route options, ideas board, decisions, promote to Phase 3.
7. **Journal:** journal tab per day, attachments, phone layout, offline drafts, remote access. Must be ready before the trip it's first used on.
8. **Extras:** import existing trip, Excel export, `.ics` feed.

### 12. Decisions
| Question | Decision |
| --- | --- |
| Should Brandon be able to view or edit the plan? | Not in v1. Keep it open for future expansion (schema is ready, see 10) |
| Export Phase 1 and Phase 2 notes too? | No. Only the final overview + day notes are exported |
| Name of the overview note | "Itinerary": `{YYYY-MM} Trip - Itinerary.md`, heading `# Itinerary` |
| Where are journal entries written during the trip? | In the app (on the phone) for now |
