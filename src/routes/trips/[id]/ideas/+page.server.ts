import { fail } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, t } from '#lib/server/db/index.ts';
import { resolvePlace, tripId } from '#lib/server/repo.ts';
import { decisionSchema, ideaSchema, parseForm, staySchema } from '#lib/schemas.ts';
import { toMinor } from '#lib/money.ts';

export const load = ({ params }) => {
	const id = tripId(params);
	return {
		ideas: db.select().from(t.idea).where(eq(t.idea.tripId, id)).orderBy(asc(t.idea.position), asc(t.idea.id)).all(),
		decisions: db.select().from(t.decision).where(eq(t.decision.tripId, id)).orderBy(asc(t.decision.id)).all(),
		stays: db.select().from(t.stay).where(eq(t.stay.tripId, id)).orderBy(asc(t.stay.id)).all()
	};
};

const num = (f: FormData, k: string) => Number(f.get(k));
const ownIdea = (trip: number, id: number) =>
	db.select().from(t.idea).where(and(eq(t.idea.id, id), eq(t.idea.tripId, trip))).get();
const ownDecision = (trip: number, id: number) =>
	db.select().from(t.decision).where(and(eq(t.decision.id, id), eq(t.decision.tripId, trip))).get();

export const actions = {
	addIdea: async ({ params, request }) => {
		const id = tripId(params);
		const parsed = parseForm(ideaSchema, await request.formData());
		if (!parsed.ok) return fail(400, parsed);
		const { placeName, ...rest } = parsed.data;
		const max = db
			.select({ n: sql<number>`coalesce(max(position), -1)` })
			.from(t.idea)
			.where(eq(t.idea.tripId, id))
			.get()!.n;
		db.insert(t.idea)
			.values({ ...rest, tripId: id, placeId: resolvePlace(placeName), position: max + 1 })
			.run();
	},
	updateIdea: async ({ params, request }) => {
		const id = tripId(params);
		const f = await request.formData();
		const idea = ownIdea(id, num(f, 'ideaId'));
		if (!idea) return fail(404);
		const parsed = parseForm(ideaSchema, f);
		if (!parsed.ok) return fail(400, parsed);
		const { placeName, ...rest } = parsed.data;
		db.update(t.idea)
			.set({ ...rest, placeId: resolvePlace(placeName) })
			.where(eq(t.idea.id, idea.id))
			.run();
	},
	setStatus: async ({ params, request }) => {
		const id = tripId(params);
		const f = await request.formData();
		const idea = ownIdea(id, num(f, 'ideaId'));
		if (!idea) return fail(404);
		const status = String(f.get('status')) as 'idea' | 'planned' | 'dropped' | 'parked';
		if (!['idea', 'planned', 'dropped', 'parked'].includes(status)) return fail(400);
		const reason = f.has('reason') ? String(f.get('reason')) || null : idea.reason;
		db.update(t.idea).set({ status, reason }).where(eq(t.idea.id, idea.id)).run();
	},
	deleteIdea: async ({ params, request }) => {
		const f = await request.formData();
		const idea = ownIdea(tripId(params), num(f, 'ideaId'));
		if (!idea) return fail(404);
		db.delete(t.idea).where(eq(t.idea.id, idea.id)).run();
	},
	/** Put an idea on a day's timeline (Phase 3) and mark it planned. */
	planIdea: async ({ params, request, locals }) => {
		const id = tripId(params);
		const f = await request.formData();
		const idea = ownIdea(id, num(f, 'ideaId'));
		const day = db
			.select()
			.from(t.day)
			.where(and(eq(t.day.id, num(f, 'dayId')), eq(t.day.tripId, id)))
			.get();
		if (!idea || !day) return fail(400, { error: 'Pick a day' });
		const kind = String(f.get('kind') || 'focus') as 'focus' | 'maybe' | 'optional';
		let section = db
			.select()
			.from(t.planSection)
			.where(and(eq(t.planSection.dayId, day.id), eq(t.planSection.kind, kind)))
			.get();
		if (!section) {
			section = db
				.insert(t.planSection)
				.values({ dayId: day.id, kind, collapsed: kind === 'optional', position: 0 })
				.returning()
				.get();
		}
		const max = db
			.select({ n: sql<number>`coalesce(max(position), -1)` })
			.from(t.planItem)
			.where(eq(t.planItem.sectionId, section.id))
			.get()!.n;
		db.insert(t.planItem)
			.values({
				sectionId: section.id,
				position: max + 1,
				title: idea.title,
				placeId: idea.placeId,
				details: idea.details ? idea.details.split('\n').filter((l) => l.trim()) : [],
				createdBy: locals.userId,
				updatedBy: locals.userId
			})
			.run();
		db.update(t.idea).set({ status: 'planned' }).where(eq(t.idea.id, idea.id)).run();
		return { planned: `${idea.title} → Day ${day.dayNumber}` };
	},

	addDecision: async ({ params, request }) => {
		const parsed = parseForm(decisionSchema, await request.formData());
		if (!parsed.ok) return fail(400, parsed);
		db.insert(t.decision)
			.values({ ...parsed.data, tripId: tripId(params), status: parsed.data.answer ? 'decided' : 'open' })
			.run();
	},
	updateDecision: async ({ params, request }) => {
		const f = await request.formData();
		const d = ownDecision(tripId(params), num(f, 'decisionId'));
		if (!d) return fail(404);
		const parsed = parseForm(decisionSchema, f);
		if (!parsed.ok) return fail(400, parsed);
		db.update(t.decision)
			.set({ ...parsed.data, status: parsed.data.answer ? 'decided' : 'open' })
			.where(eq(t.decision.id, d.id))
			.run();
	},
	deleteDecision: async ({ params, request }) => {
		const f = await request.formData();
		const d = ownDecision(tripId(params), num(f, 'decisionId'));
		if (!d) return fail(404);
		db.delete(t.decision).where(eq(t.decision.id, d.id)).run();
	},

	addStay: async ({ params, request }) => {
		const id = tripId(params);
		const parsed = parseForm(staySchema, await request.formData());
		if (!parsed.ok) return fail(400, parsed);
		const { placeName, price, ...rest } = parsed.data;
		const trip = db.select().from(t.trip).where(eq(t.trip.id, id)).get()!;
		const currency = rest.currency ?? trip.homeCurrency;
		db.insert(t.stay)
			.values({ ...rest, tripId: id, currency, priceMinor: toMinor(price, currency), placeId: placeName ? resolvePlace(placeName) : null })
			.run();
	}
};
