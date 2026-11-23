import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, t } from '$lib/server/db';
import { resolvePlace, tripId } from '$lib/server/repo';
import { ATTACHMENT_ROOT } from '$lib/server/vault';
import { daySchema, parseForm, planItemSchema, sectionSchema } from '$lib/schemas';
import { SECTION_ORDER } from '$lib/export/markdown';

function getDay(params: { id: string; dayId: string }) {
	const trip = tripId(params);
	const day = db
		.select()
		.from(t.day)
		.where(and(eq(t.day.id, Number(params.dayId)), eq(t.day.tripId, trip)))
		.get();
	if (!day) error(404, 'Day not found');
	return day;
}

export const load = ({ params }) => {
	const day = getDay(params);
	const sections = db
		.select()
		.from(t.planSection)
		.where(eq(t.planSection.dayId, day.id))
		.orderBy(asc(t.planSection.position), asc(t.planSection.id))
		.all()
		.sort((a, b) => SECTION_ORDER.indexOf(a.kind) - SECTION_ORDER.indexOf(b.kind) || a.position - b.position);
	const items = sections.length
		? db
				.select()
				.from(t.planItem)
				.where(inArray(t.planItem.sectionId, sections.map((s) => s.id)))
				.orderBy(asc(t.planItem.position), asc(t.planItem.id))
				.all()
		: [];
	return {
		day,
		sections: sections.map((s) => ({ ...s, items: items.filter((i) => i.sectionId === s.id) })),
		stays: db.select().from(t.stay).where(eq(t.stay.tripId, day.tripId)).all(),
		bookings: db.select().from(t.booking).where(eq(t.booking.dayId, day.id)).all(),
		journal: db.select().from(t.journalEntry).where(eq(t.journalEntry.dayId, day.id)).get() ?? null,
		attachments: db.select().from(t.attachment).where(eq(t.attachment.dayId, day.id)).all()
	};
};

const num = (f: FormData, k: string) => Number(f.get(k));

function ownSection(dayId: number, sectionId: number) {
	return db
		.select()
		.from(t.planSection)
		.where(and(eq(t.planSection.id, sectionId), eq(t.planSection.dayId, dayId)))
		.get();
}

function ownItem(dayId: number, itemId: number) {
	const item = db.select().from(t.planItem).where(eq(t.planItem.id, itemId)).get();
	return item && ownSection(dayId, item.sectionId) ? item : null;
}

/** "07:55", "~13:30", "08:30-09:30" -> "07:55" / "13:30" / "08:30" for ordering and Key times. */
function guessSortTime(label: string | null) {
	const m = label?.match(/(\d{1,2}):(\d{2})/);
	return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

export const actions = {
	updateDay: async ({ params, request, locals }) => {
		const day = getDay(params);
		const parsed = parseForm(daySchema, await request.formData());
		if (!parsed.ok) return fail(400, parsed);
		const { titlePlaceName, ...rest } = parsed.data;
		db.update(t.day)
			.set({ ...rest, titlePlaceId: resolvePlace(titlePlaceName, 'city'), updatedBy: locals.userId })
			.where(eq(t.day.id, day.id))
			.run();
		return { savedDay: true };
	},

	addSection: async ({ params, request }) => {
		const day = getDay(params);
		const parsed = parseForm(sectionSchema, await request.formData());
		if (!parsed.ok) return fail(400, parsed);
		const max = db
			.select({ n: sql<number>`coalesce(max(position), -1)` })
			.from(t.planSection)
			.where(eq(t.planSection.dayId, day.id))
			.get()!.n;
		const collapsed = parsed.data.kind === 'optional' || parsed.data.kind === 'plan_b';
		db.insert(t.planSection)
			.values({ dayId: day.id, kind: parsed.data.kind, title: parsed.data.title, collapsed, position: max + 1 })
			.run();
	},
	updateSection: async ({ params, request }) => {
		const day = getDay(params);
		const f = await request.formData();
		const s = ownSection(day.id, num(f, 'sectionId'));
		if (!s) return fail(404);
		const parsed = parseForm(sectionSchema, f);
		if (!parsed.ok) return fail(400, parsed);
		db.update(t.planSection).set(parsed.data).where(eq(t.planSection.id, s.id)).run();
	},
	moveSection: async ({ params, request }) => {
		const day = getDay(params);
		const f = await request.formData();
		const s = ownSection(day.id, num(f, 'sectionId'));
		if (!s) return fail(404);
		const same = db
			.select()
			.from(t.planSection)
			.where(and(eq(t.planSection.dayId, day.id), eq(t.planSection.kind, s.kind)))
			.orderBy(asc(t.planSection.position))
			.all();
		const i = same.findIndex((x) => x.id === s.id);
		const j = f.get('dir') === 'up' ? i - 1 : i + 1;
		if (j < 0 || j >= same.length) return;
		const other = same[j];
		db.update(t.planSection).set({ position: other.position }).where(eq(t.planSection.id, s.id)).run();
		db.update(t.planSection).set({ position: s.position }).where(eq(t.planSection.id, other.id)).run();
	},
	deleteSection: async ({ params, request }) => {
		const day = getDay(params);
		const f = await request.formData();
		const s = ownSection(day.id, num(f, 'sectionId'));
		if (!s) return fail(404);
		db.delete(t.planSection).where(eq(t.planSection.id, s.id)).run();
	},

	addItem: async ({ params, request, locals }) => {
		const day = getDay(params);
		const f = await request.formData();
		const s = ownSection(day.id, num(f, 'sectionId'));
		if (!s) return fail(404);
		const parsed = parseForm(planItemSchema, f);
		if (!parsed.ok) return fail(400, { itemErrors: parsed.errors, sectionId: s.id });
		const { placeName, ...rest } = parsed.data;
		const max = db
			.select({ n: sql<number>`coalesce(max(position), -1)` })
			.from(t.planItem)
			.where(eq(t.planItem.sectionId, s.id))
			.get()!.n;
		db.insert(t.planItem)
			.values({
				...rest,
				sortTime: rest.sortTime ?? guessSortTime(rest.timeLabel),
				sectionId: s.id,
				placeId: resolvePlace(placeName),
				position: max + 1,
				createdBy: locals.userId,
				updatedBy: locals.userId
			})
			.run();
	},
	updateItem: async ({ params, request, locals }) => {
		const day = getDay(params);
		const f = await request.formData();
		const item = ownItem(day.id, num(f, 'itemId'));
		if (!item) return fail(404);
		const parsed = parseForm(planItemSchema, f);
		if (!parsed.ok) return fail(400, { itemErrors: parsed.errors, itemId: item.id });
		const { placeName, ...rest } = parsed.data;
		db.update(t.planItem)
			.set({
				...rest,
				sortTime: rest.sortTime ?? guessSortTime(rest.timeLabel),
				placeId: resolvePlace(placeName),
				updatedBy: locals.userId
			})
			.where(eq(t.planItem.id, item.id))
			.run();
	},
	deleteItem: async ({ params, request }) => {
		const day = getDay(params);
		const f = await request.formData();
		const item = ownItem(day.id, num(f, 'itemId'));
		if (!item) return fail(404);
		db.delete(t.planItem).where(eq(t.planItem.id, item.id)).run();
	},
	/** Sort a section by time (items without a time keep their relative order at the end). */
	sortSection: async ({ params, request }) => {
		const day = getDay(params);
		const f = await request.formData();
		const s = ownSection(day.id, num(f, 'sectionId'));
		if (!s) return fail(404);
		const items = db
			.select()
			.from(t.planItem)
			.where(eq(t.planItem.sectionId, s.id))
			.orderBy(asc(t.planItem.position))
			.all();
		const sorted = [...items].sort((a, b) => (a.sortTime ?? '99:99').localeCompare(b.sortTime ?? '99:99'));
		sorted.forEach((it, position) => db.update(t.planItem).set({ position }).where(eq(t.planItem.id, it.id)).run());
	},

	upload: async ({ params, request }) => {
		const day = getDay(params);
		const f = await request.formData();
		const file = f.get('file');
		if (!(file instanceof File) || file.size === 0) return fail(400, { uploadError: 'Pick a file' });
		if (file.size > 20 * 1024 * 1024) return fail(400, { uploadError: 'Max 20 MB' });
		const safe = file.name.replace(/[^\w.\- ()]+/g, '_').slice(-120);
		const rel = `${day.tripId}/${day.id}/${Date.now()}-${safe}`;
		mkdirSync(join(ATTACHMENT_ROOT, `${day.tripId}/${day.id}`), { recursive: true });
		writeFileSync(join(ATTACHMENT_ROOT, rel), Buffer.from(await file.arrayBuffer()));
		db.insert(t.attachment)
			.values({ dayId: day.id, filePath: rel, caption: String(f.get('caption') ?? '') || null })
			.run();
	},
	deleteAttachment: async ({ params, request }) => {
		const day = getDay(params);
		const f = await request.formData();
		const a = db
			.select()
			.from(t.attachment)
			.where(and(eq(t.attachment.id, num(f, 'attachmentId')), eq(t.attachment.dayId, day.id)))
			.get();
		if (!a) return fail(404);
		try {
			unlinkSync(join(ATTACHMENT_ROOT, a.filePath));
		} catch {
			/* already gone */
		}
		db.delete(t.attachment).where(eq(t.attachment.id, a.id)).run();
	}
};
