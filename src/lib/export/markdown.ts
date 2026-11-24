import { addDays, ddMon, ddMonRange, ddMonYyyy, dddDd, yearMonth } from '#lib/dates.ts';
import { formatMoney } from '#lib/money.ts';
import { isAutoTitle, stopTitle } from '#lib/route.ts';
import type { Day, PlanItem, PlanSection, RouteStop, SectionKind } from '#lib/server/db/schema.ts';
import { cleanUrl, escapeTableCell, wikilink } from './links';
import type { ExportAttachment, ExportFile, TripBundle } from './types';

// ---------------------------------------------------------------------------------------------
// Names and paths (7.1)
// ---------------------------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0');

export function tripNoteName(b: TripBundle) {
	return `${yearMonth(b.trip.startDate)} ${b.trip.name} Trip`;
}
export function dayNoteName(b: TripBundle, day: Pick<Day, 'date' | 'dayNumber'>) {
	return `${day.date} ${b.trip.name} Trip Day ${pad2(day.dayNumber)}`;
}
export function overviewNoteName(b: TripBundle) {
	return `${yearMonth(b.trip.startDate)} Trip - Itinerary`;
}
export function journalFolder(b: TripBundle) {
	return `Travel/05-journals/${tripNoteName(b)}`;
}
export function dayNotePath(b: TripBundle, day: Day) {
	return `${journalFolder(b)}/${dayNoteName(b, day)}.md`;
}
export function overviewPath(b: TripBundle) {
	return `Travel/06-travel_notes/${overviewNoteName(b)}.md`;
}
export function tripHubPath(b: TripBundle) {
	return `${journalFolder(b)}/${tripNoteName(b)}.md`;
}
export function attachmentFolder(b: TripBundle, day: Day) {
	return `_attachments/${journalFolder(b)}/${dayNoteName(b, day)}`;
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

/** Join lines, trim trailing spaces, collapse 3+ blank lines, end with a single \n. */
export function finish(lines: string[]): string {
	return (
		lines
			.join('\n')
			.split('\n')
			// keep "* " for an empty bullet, otherwise drop trailing spaces
			.map((l) => (/^[*-][ \t]*$/.test(l) ? `${l[0]} ` : l.replace(/[ \t]+$/, '')))
			.join('\n')
			.replace(/\n{3,}/g, '\n\n')
			.replace(/\s+$/, '') + '\n'
	);
}

function placeName(b: TripBundle, id: number | null | undefined) {
	return id ? (b.places[id]?.name ?? null) : null;
}

function placeLink(b: TripBundle, id: number | null | undefined, fallback = '') {
	const name = placeName(b, id);
	return name ? wikilink(name) : fallback;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Plan item titles may already contain [[links]]. If not and a main place is set, link the first
 * mention of the place (or one of its aliases, as `[[Name|alias]]`); otherwise append the link.
 */
export function linkTitle(b: TripBundle, title: string, placeId: number | null): string {
	const p = placeId ? b.places[placeId] : null;
	if (!p || title.includes('[[')) return title;
	const candidates = [p.name, ...(p.aliases ?? [])].sort((x, y) => y.length - x.length);
	for (const candidate of candidates) {
		const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRe(candidate)})(?=$|[^\\p{L}\\p{N}])`, 'u');
		const m = title.match(re);
		if (m && m.index !== undefined) {
			const start = m.index + m[1].length;
			const found = m[2];
			return title.slice(0, start) + wikilink(p.name, found) + title.slice(start + found.length);
		}
	}
	return `${title} (${wikilink(p.name)})`;
}

/** The "Base" text for a route stop: label override, else a link to the city. */
function baseText(b: TripBundle, stop: RouteStop) {
	if (stop.label) return stop.label;
	if (isAutoTitle(stop)) {
		// "Osaka → Beppu", named after where the overnight transport goes
		const next = b.bases[b.bases.findIndex((s) => s.id === stop.id) + 1];
		return stopTitle(stop, next, (id) => placeName(b, id));
	}
	return placeLink(b, stop.placeId, '(unnamed base)');
}

/** Date range covered by a stop's nights: "13/Mar - 14/Mar" for 2 nights from the 13th. */
export function stopRange(stop: RouteStop): string {
	if (!stop.startDate) return '';
	const last = addDays(stop.startDate, Math.max(stop.nights, 1) - 1);
	return ddMonRange(stop.startDate, last);
}

function multiline(text: string | null | undefined) {
	return (text ?? '').replace(/\r\n/g, '\n').trim();
}

// ---------------------------------------------------------------------------------------------
// Sections (callouts)
// ---------------------------------------------------------------------------------------------

export const SECTION_ORDER: SectionKind[] = [
	'booking',
	'info',
	'getting_there',
	'focus',
	'maybe',
	'optional',
	'plan_b'
];

export const SECTION_LABEL: Record<SectionKind, string> = {
	focus: 'Focus',
	maybe: 'Maybe',
	optional: 'Optional',
	plan_b: 'Plan B',
	booking: 'Booking',
	info: 'Info',
	getting_there: 'Getting there'
};

function calloutHeader(section: PlanSection): string {
	const fold = section.collapsed ? '-' : '';
	const title = section.title?.trim();
	const withTitle = (label: string) => (title ? `${label}: ${title}` : label);
	switch (section.kind) {
		case 'focus':
			return `> [!success]${fold} ${withTitle('Focus')}`;
		case 'maybe':
			return `> [!warning]${fold} ${withTitle('Maybe')}`;
		case 'optional':
			return `> [!note|purple]${fold} ${withTitle('Optional')}`;
		case 'plan_b':
			return `> [!note|purple]${fold} ${withTitle('Plan B')}`;
		case 'getting_there':
			return `> [!note|blue]${fold} ${withTitle('Getting there')}`;
		case 'booking':
		case 'info':
			return `> [!important|red]${fold} ${title || SECTION_LABEL[section.kind]}`;
	}
}

/** Kinds whose items are a timeline: an empty time renders as `--:--`. */
const TIMELINE_KINDS: SectionKind[] = ['focus', 'maybe', 'plan_b'];

export function renderItem(b: TripBundle, section: PlanSection, item: PlanItem): string[] {
	let title = linkTitle(b, item.title, item.placeId);
	if (item.person) title = `${item.person}: ${title}`;
	const time = item.timeLabel?.trim();
	let head: string;
	if (section.kind === 'optional') head = `> - ${title}`;
	else if (time) head = `> - **${time}** · ${title}`;
	else if (TIMELINE_KINDS.includes(section.kind)) head = `> - **--:--** · ${title}`;
	else head = `> - ${title}`;

	const lines = [head];
	for (const d of item.details ?? []) lines.push(`>     - ${d}`);
	for (const l of item.links ?? []) {
		const url = cleanUrl(l.url);
		lines.push(`>     - ${l.label && l.label !== l.url ? `[${l.label}](${url})` : url}`);
	}
	return lines;
}

function sortedSections(b: TripBundle, day: Day) {
	return b.sections
		.filter((s) => s.dayId === day.id)
		.sort(
			(x, y) =>
				SECTION_ORDER.indexOf(x.kind) - SECTION_ORDER.indexOf(y.kind) || x.position - y.position
		);
}

export function itemsOf(b: TripBundle, section: PlanSection) {
	return b.items.filter((i) => i.sectionId === section.id).sort((x, y) => x.position - y.position);
}

export function renderSection(b: TripBundle, section: PlanSection): string[] {
	const lines = [calloutHeader(section)];
	for (const item of itemsOf(b, section)) lines.push(...renderItem(b, section, item));
	if (section.kind === 'booking') {
		lines.push(`> - Booking and checks: [[${overviewNoteName(b)}#Bookings|Bookings checklist]]`);
	}
	return lines;
}

// ---------------------------------------------------------------------------------------------
// Day note (7.3)
// ---------------------------------------------------------------------------------------------

function logBlock(label: string, text: string | null | undefined): string[] {
	const t = multiline(text);
	if (!t.includes('\n')) return [`### ${label}: ${t}`];
	return [`### ${label}:`, t];
}

function tipLines(text: string | null | undefined): string[] {
	const t = multiline(text);
	if (!t) return ['* '];
	return t
		.split('\n')
		.filter((l) => l.trim())
		.map((l) => `* ${l.replace(/^\s*[-*]\s+/, '')}`);
}

export function renderDayNote(b: TripBundle, day: Day): string {
	const days = [...b.days].sort((x, y) => x.dayNumber - y.dayNumber);
	const idx = days.findIndex((d) => d.id === day.id);
	const prev = idx > 0 ? days[idx - 1] : null;
	const next = idx >= 0 && idx < days.length - 1 ? days[idx + 1] : null;
	const overview = overviewNoteName(b);
	const journal = b.journals.find((j) => j.dayId === day.id);
	const place = placeLink(b, day.titlePlaceId, day.baseLabel ?? '');
	const stay = day.stayId ? b.stays.find((s) => s.id === day.stayId) : null;

	const nav: string[] = [];
	if (prev) nav.push(`← [[${dayNoteName(b, prev)}|Day ${prev.dayNumber}]]`);
	nav.push(`[[${overview}|Overview]]`);
	if (next) nav.push(`[[${dayNoteName(b, next)}|Day ${next.dayNumber}]] →`);

	const hotel = stay ? placeLink(b, stay.placeId, stay.hotel) : '';
	const stayText = [hotel, day.stayNote ?? ''].filter(Boolean).join(' ') || '-';

	// Empty callouts are clutter in Obsidian; a booking section still carries the checklist link.
	const sectionBlocks = sortedSections(b, day)
		.filter((s) => s.kind === 'booking' || itemsOf(b, s).length > 0)
		.map((s) => renderSection(b, s).join('\n'));
	const attachments = b.attachments
		.filter((a) => a.dayId === day.id)
		.map((a) => {
			const file = a.filePath.split(/[\\/]/).pop();
			return a.caption ? `![[${file}]]\n*${a.caption}*` : `![[${file}]]`;
		});

	const summary = multiline(journal?.quickSummary) || multiline(day.summary);

	return finish([
		'---',
		'tags:',
		'  - travel/journal',
		`date: ${day.date}`,
		`banner: ${journal?.banner ?? ''}`,
		`Trip: "[[${tripNoteName(b)}]]"`,
		'---',
		'',
		`# Day ${day.dayNumber}: ${place}`,
		nav.join(' · '),
		'',
		'---',
		'',
		'> [!example] Quick Summary',
		...summary.split('\n').map((l) => `> ${l}`),
		'',
		'---',
		'',
		'## Key Highlights & Logistics',
		`* **Location:** ${place}`,
		`* **Highlights:** ${multiline(journal?.highlights)}`,
		`* **Lowlight / Tip:** ${multiline(journal?.lowlight)}`,
		'',
		'---',
		'## Plan',
		`**Stay:** ${stayText}. Details in [[${overview}#Stays|Stays]]`,
		'',
		sectionBlocks.join('\n\n'),
		'',
		attachments.join('\n\n'),
		'',
		'---',
		'## The Log',
		'',
		...logBlock('Morning', journal?.logMorning),
		'',
		...logBlock('Afternoon', journal?.logAfternoon),
		'',
		...logBlock('Evening', journal?.logEvening),
		'',
		'---',
		'',
		'## Food & Spots Logged',
		`* **Breakfast:** ${multiline(journal?.breakfast)}`,
		`* **Lunch:** ${multiline(journal?.lunch)}`,
		`* **Dinner:** ${multiline(journal?.dinner)}`,
		'',
		'---',
		'',
		'## Notes for Future Visits / Tips',
		...tipLines(journal?.tips)
	]);
}

// ---------------------------------------------------------------------------------------------
// Final overview (7.4)
// ---------------------------------------------------------------------------------------------

function decisionNotes(d: TripBundle['decisions'][number]) {
	if (d.notes) return d.notes.replace(/\n+/g, ' ');
	return d.options.map((o) => o.label).join(' / ');
}

function stayPrice(s: TripBundle['stays'][number]) {
	return s.priceMinor !== null && s.currency ? formatMoney(s.priceMinor, s.currency) : '';
}

export function renderOverview(b: TripBundle): string {
	const days = [...b.days].sort((x, y) => x.dayNumber - y.dayNumber);
	const first = days[0];
	const open = b.decisions.filter((d) => d.status === 'open');
	const lines: string[] = [
		'---',
		'tags:',
		'  - travel/notes',
		'  - travel/itinerary',
		`dates: ${ddMon(b.trip.startDate)} - ${ddMonYyyy(b.trip.endDate)}`,
		'backlinks:',
		...(first ? [`  - "[[${dayNoteName(b, first)}]]"`] : []),
		'---',
		'# Itinerary',
		"Overview of the final plan. Each day's plan is in its day note.",
		''
	];

	if (open.length) {
		lines.push('> [!question]+ Still to decide');
		for (const d of open) lines.push(`> - **${d.question}:** ${decisionNotes(d)}`);
		lines.push('');
	}

	// Base table
	lines.push('| Base | Nights | Dates |', '| --- | --- | --- |');
	for (const s of b.bases) {
		lines.push(`| ${escapeTableCell(baseText(b, s))} | ${s.nights} | ${stopRange(s)} |`);
	}
	lines.push('', '---', '### Days', '| Day | Date | Base | Plan |', '| --- | --- | --- | --- |');
	for (const d of days) {
		lines.push(
			`| ${escapeTableCell(`[[${dayNoteName(b, d)}|Day ${d.dayNumber}]]`)} | ${dddDd(d.date)} | ${escapeTableCell(d.baseLabel)} | ${escapeTableCell(d.summary)} |`
		);
	}

	// Stays, grouped by base in route order
	lines.push('', '---', '### Stays');
	const stays = b.stays.filter((s) => s.status !== 'cancelled' && s.status !== 'idea');
	const baseOrder = new Map(b.bases.map((s, i) => [s.id, i]));
	stays.sort(
		(x, y) =>
			(baseOrder.get(x.baseId ?? -1) ?? 999) - (baseOrder.get(y.baseId ?? -1) ?? 999) ||
			(x.checkIn ?? '').localeCompare(y.checkIn ?? '')
	);
	for (const s of stays) {
		const base = b.bases.find((x) => x.id === s.baseId);
		const heading = base
			? `${baseText(b, base)}${base.startDate ? ` (${stopRange(base)})` : ''}`
			: s.hotel;
		lines.push(`#### ${heading}`, '> [!note|blue] Stay');
		lines.push(`> - Hotel: ${placeLink(b, s.placeId, s.hotel)}`);
		if (s.url) lines.push(`> - Link: [${s.bookedVia || 'Link'}](${cleanUrl(s.url)})`);
		if (s.address) lines.push(`> - Address: ${s.address}`);
		if (s.location) lines.push(`> - Location (area / nearest station): ${s.location}`);
		const price = stayPrice(s);
		if (price) lines.push(`> - Price: ${price}`);
		if (s.checkIn || s.checkOut)
			lines.push(`> - Check-in ${s.checkIn ?? '?'}, check-out ${s.checkOut ?? '?'}`);
		lines.push(
			s.status === 'booked'
				? `> - [x] Booked${s.bookedVia ? ` (${s.bookedVia})` : ''}`
				: '> - [ ] Booked'
		);
		lines.push('');
	}

	// Bookings
	const bookings = b.bookings
		.filter((k) => k.status !== 'not_needed' && k.status !== 'cancelled')
		.sort((x, y) => {
			const dx = days.find((d) => d.id === x.dayId)?.dayNumber ?? 999;
			const dy = days.find((d) => d.id === y.dayId)?.dayNumber ?? 999;
			return dx - dy || x.id - y.id;
		});
	lines.push('---', '### Bookings', '> [!important|red] Bookings and checks');
	for (const k of bookings) {
		const d = days.find((x) => x.id === k.dayId);
		const head = d ? `[[${dayNoteName(b, d)}|Day ${d.dayNumber}]] · ${k.title}` : k.title;
		const provider = k.provider
			? k.url
				? ` ([${k.provider}](${cleanUrl(k.url)}))`
				: ` (${k.provider})`
			: k.url
				? ` ([link](${cleanUrl(k.url)}))`
				: '';
		lines.push(`> **${head}**${provider}`);
		const tasks = k.tasks?.length ? k.tasks : [{ text: 'Book', done: k.status === 'booked' }];
		for (const task of tasks) lines.push(`> - [${task.done ? 'x' : ' '}] ${task.text}`);
		if (k.status === 'booked' && k.confirmation) lines.push(`> - Confirmation: ${k.confirmation}`);
		lines.push('>');
	}
	if (lines[lines.length - 1] === '>') lines.pop();

	// Dropped / parked
	const dropped = b.ideas.filter((i) => i.status === 'dropped' || i.status === 'parked');
	if (dropped.length) {
		lines.push('', '---', '### Dropped / parked');
		for (const i of dropped) {
			const what = i.placeId ? placeLink(b, i.placeId, i.title) : i.title;
			const label = i.status === 'dropped' ? 'Dropped' : 'Parked (no day yet)';
			lines.push(`- ${label}: ${what}${i.reason ? ` (${i.reason})` : ''}`);
		}
	}

	return finish(lines);
}

/** Optional hub note so `Trip: "[[2027-03 Japan Trip]]"` links resolve. */
export function renderTripHub(b: TripBundle): string {
	const days = [...b.days].sort((x, y) => x.dayNumber - y.dayNumber);
	return finish([
		'---',
		'tags:',
		'  - travel/trip',
		`dates: ${ddMon(b.trip.startDate)} - ${ddMonYyyy(b.trip.endDate)}`,
		'---',
		`# ${tripNoteName(b)}`,
		`Itinerary: [[${overviewNoteName(b)}|Overview]]`,
		'',
		...days.map((d) => `- [[${dayNoteName(b, d)}|Day ${d.dayNumber}]] · ${d.summary ?? ''}`)
	]);
}

// ---------------------------------------------------------------------------------------------
// Whole export
// ---------------------------------------------------------------------------------------------

export interface ExportOptions {
	days?: boolean;
	overview?: boolean;
	hub?: boolean;
	attachments?: boolean;
	/** absolute folder holding attachment files (data/attachments) */
	attachmentRoot?: string;
}

export function buildExport(
	b: TripBundle,
	opts: ExportOptions = {}
): { files: ExportFile[]; attachments: ExportAttachment[] } {
	const { days = true, overview = true, hub = false, attachments = true } = opts;
	const files: ExportFile[] = [];
	const atts: ExportAttachment[] = [];
	const sorted = [...b.days].sort((x, y) => x.dayNumber - y.dayNumber);
	if (days) for (const d of sorted) files.push({ path: dayNotePath(b, d), content: renderDayNote(b, d) });
	if (overview) files.push({ path: overviewPath(b), content: renderOverview(b) });
	if (hub) files.push({ path: tripHubPath(b), content: renderTripHub(b) });
	if (attachments && opts.attachmentRoot) {
		for (const a of b.attachments) {
			const d = sorted.find((x) => x.id === a.dayId);
			if (!d) continue;
			const file = a.filePath.split(/[\\/]/).pop()!;
			atts.push({
				path: `${attachmentFolder(b, d)}/${file}`,
				source: `${opts.attachmentRoot}/${a.filePath}`
			});
		}
	}
	return { files, attachments: atts };
}
