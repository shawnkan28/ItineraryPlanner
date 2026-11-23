# Itinerary planner

Plan a trip in three phases (route → ideas → final itinerary), track bookings and stays, write the
journal on the phone during the trip, and export hand-written-looking notes to the Obsidian vault.
See [specs.md](specs.md) for the full spec.

SvelteKit 3 + Svelte 5, SQLite (`better-sqlite3` + Drizzle), `adapter-node`.

The spec says SvelteKit 2, but every Kit 2 release has open security advisories (fixed only in Kit 3),
so the app runs on Kit 3. Things that differ from older Kit projects:

- SvelteKit config lives in `vite.config.ts` (`sveltekit({ adapter })`); there is no `svelte.config.js`.
- `src/lib` is imported as `#lib/...` with the file extension (`#lib/server/db/index.ts`), via the `imports` field in `package.json`.
- Environment variables are declared in [src/env.ts](src/env.ts) and imported from `$app/env/private`.
- `package.json` has an `overrides` entry pinning a patched `esbuild` inside `drizzle-kit`'s deprecated `@esbuild-kit` loader (dev-only). Remove it once drizzle-kit 1.0 is stable.

## Run locally

```sh
npm install
npm run dev          # http://localhost:5173
```

No password is asked when `APP_PASSWORD` is unset (fine on your own machine). The database is
created at `data/itinerary_planner.db` and migrations run on startup.

| Env var | Purpose |
| --- | --- |
| `APP_PASSWORD` | Single-user password. Set it before exposing the app. |
| `SESSION_SECRET` | Signs the login cookie (60-day session). |
| `DATABASE_PATH` | SQLite file, default `data/itinerary_planner.db`. |
| `VAULT_PATH` | Vault root (folder with `Travel/`). Can also be set on the Settings page. |
| `ORIGIN` | Public URL in production, e.g. `https://trip.example.com` (needed by adapter-node for form posts). |
| `BODY_SIZE_LIMIT` | Upload limit for photos, e.g. `25M` (set in the Docker image). |

## Docker (home server)

```sh
cp .env.example .env   # set APP_PASSWORD, SESSION_SECRET, ORIGIN, VAULT_HOST_PATH
docker compose up -d --build
```

`./data` holds the database and attachments; the vault is mounted at `/vault`. For use abroad,
put it behind Tailscale or a reverse proxy with HTTPS.

## Screens

- **Trips**: cards with dates, status and open bookings.
- **Dashboard**: due bookings (opens on / book by within 14 days), still to book, booked cost per currency, open decisions.
- **1 · Route**: route options side by side, nights check against the trip length, *Choose this route* (dates the stops and fills each day's city and base).
- **2 · Ideas**: one column per base, drag to reorder or move, drop / park with a reason, *Add to day*, open decisions with options, hotel candidates.
- **3 · Itinerary**: Base table, Days table (inline edit), Still to decide, Dropped / parked.
- **Day editor**: Focus / Maybe / Optional / Plan B / Booking / Info / Getting there sections, drag items between sections, `[[` place autocomplete, Key times strip. The journal sits next to the plan (on a phone use the Plan / Journal toggle).
- **Bookings**: filters, badges, checklists, quick *Mark booked* + confirmation number.
- **Stays**: hotels per base, booked total, *Use for its days*.
- **Journal**: every day with progress; "Write today" during the trip.
- **Export**: preview each file, see which ones were edited in the vault since the last export (with a diff), choose skip / "(app)" copy / overwrite, then write to the vault or download a zip.
- **Places**: library imported from `Travel/00-country` … `Travel/04-place`, plus places created in the app.
- **Settings**: vault path, places import, database backup, `.ics` feed of booking dates.

## Journal offline drafts

Every keystroke goes to `localStorage` first and is synced to the server in the background. Without
a connection the draft stays on the phone and is re-sent when the browser is back online or the
page is opened again. If the same day was changed on another device in the meantime, the editor
asks which version to keep instead of overwriting.

## Export rules

The templates live in [src/lib/export/markdown.ts](src/lib/export/markdown.ts) and are plain functions
covered by [markdown.test.ts](src/lib/export/markdown.test.ts) (`npm test`). The current fixture is
modelled on the 2027-03 trip; to compare against the real notes, copy them to
`src/lib/export/fixtures/` and add a test that renders the same data and compares it with the file.

- Re-export compares each vault file with the hash recorded at the last export. Unchanged → overwritten;
  edited → you choose. Files are never deleted, and attachments are never overwritten.
- Tracking parameters are stripped from links (`utm_*`, Klook `spm` / `clickId`, Booking.com `aid`, `sid`, `label`, `srpvid`, ...); page parameters like `curr=SGD` stay.
- Sections with no items are not exported.

## Schema changes

Edit [src/lib/server/db/schema.ts](src/lib/server/db/schema.ts), then `npm run db:generate` and commit
the new file in `drizzle/`. It is applied automatically on the next start.

## Not built yet (from the spec)

- Importing an existing trip's notes back into the database (8, "later").
- Excel / Google Sheets export, one-sheet day plans, printable PDF day cards (9).
- Accounts or share links for a second traveller: the `user` table and `created_by` / `updated_by` columns are in place.
