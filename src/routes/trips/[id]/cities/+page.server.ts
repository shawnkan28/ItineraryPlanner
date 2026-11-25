import { fail } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db, t } from '#lib/server/db/index.ts';
import { resolvePlace, tripId } from '#lib/server/repo.ts';
import { bucketEntries } from '#lib/server/bucket.ts';
import { similarPlace } from '#lib/similar.ts';
import { cityNotesSchema, decisionSchema, ideaSchema, parseForm, tripCitySchema } from '#lib/schemas.ts';

export const load = ({ params }) => {
	const id = tripId(params);
	const cities = db
		.select()
		.from(t.tripCity)
		.where(eq(t.tripCity.tripId, id))
		.orderBy(asc(t.tripCity.position), asc(t.tripCity.id))
		.all();
	const ideas = db
		.select()
		.from(t.idea)
		.where(eq(t.idea.tripId, id))
		.orderBy(asc(t.idea.position), asc(t.idea.id))
		.all();
	const decisions = db.select().from(t.decision).where(eq(t.decision.tripId, id)).orderBy(asc(t.decision.id)).all();
	// the shared bucket list, minus what only comes from this trip
	// days planned per city on the Days tab
	const dayCounts = Object.fromEntries(
		db
			.select({ cityId: t.cityDay.tripCityId, n: sql<number>`count(*)` })
			.from(t.cityDay)
			.innerJoin(t.tripCity, eq(t.tripCity.id, t.cityDay.tripCityId))
			.where(eq(t.tripCity.tripId, id))
			.groupBy(t.cityDay.tripCityId)
			.all()
			.map((r) => [r.cityId, r.n])
	) as Record<number, number>;
	return { cities, ideas, decisions, dayCounts, bucket: bucketEntries({ exceptTrip: id }) };
};

const ownCity = (tripId: number, cityId: number) =>
	db
		.select()
		.from(t.tripCity)
		.where(and(eq(t.tripCity.id, cityId), eq(t.tripCity.tripId, tripId)))
		.get();

const num = (f: FormData, k: string) => Number(f.get(k));
const ownIdea = (trip: number, id: number) =>
	db.select().from(t.idea).where(and(eq(t.idea.id, id), eq(t.idea.tripId, trip))).get();
const ownDecision = (trip: number, id: number) =>
	db.select().from(t.decision).where(and(eq(t.decision.id, id), eq(t.decision.tripId, trip))).get();
/** An idea in the same city (or both unassigned) that is the same place; a city can't have it twice. */
function sameCityClash(trip: number, cityId: number | null, name: string, exceptId: number | null = null) {
	return db
		.select({ id: t.idea.id, title: t.idea.title, place: t.place.name })
		.from(t.idea)
		.leftJoin(t.place, eq(t.place.id, t.idea.placeId))
		.where(and(eq(t.idea.tripId, trip), cityId === null ? isNull(t.idea.cityId) : eq(t.idea.cityId, cityId)))
		.all()
		.find((i) => i.id !== exceptId && similarPlace(name, i.place ?? i.title));
}
const clashError = (c: { title: string; place: string | null }) =>
	`${c.place ?? c.title} is already in this city`;

/** Only file an idea under a city of this trip. */
const cityOrNull = (trip: number, cityId: number | null) => (cityId !== null && ownCity(trip, cityId) ? cityId : null);

export const actions = {
	addCity: async ({ params, request }) => {
		const id = tripId(params);
		const parsed = parseForm(tripCitySchema, await request.formData());
		if (!parsed.ok) return fail(400, { cityErrors: parsed.errors });
		const placeId = resolvePlace(parsed.data.placeName, 'city')!;
		const exists = db
			.select()
			.from(t.tripCity)
			.where(and(eq(t.tripCity.tripId, id), eq(t.tripCity.placeId, placeId)))
			.get();
		if (exists) return fail(400, { cityErrors: { placeName: `${parsed.data.placeName} is already on the list` } });
		const max = db
			.select({ n: sql<number>`coalesce(max(position), -1)` })
			.from(t.tripCity)
			.where(eq(t.tripCity.tripId, id))
			.get()!.n;
		db.insert(t.tripCity)
			.values({
				tripId: id,
				placeId,
				priority: parsed.data.priority,
				notes: parsed.data.notes,
				position: max + 1
			})
			.run();
	},
	updateCity: async ({ params, request }) => {
		const f = await request.formData();
		const city = ownCity(tripId(params), num(f, 'cityId'));
		if (!city) return fail(404);
		const parsed = parseForm(cityNotesSchema, f);
		if (!parsed.ok) return fail(400, { cityErrors: parsed.errors, cityId: city.id });
		db.update(t.tripCity).set(parsed.data).where(eq(t.tripCity.id, city.id)).run();
	},
	/** Ideas filed under the city become unassigned (they are kept). */
	deleteCity: async ({ params, request }) => {
		const f = await request.formData();
		const city = ownCity(tripId(params), num(f, 'cityId'));
		if (!city) return fail(404);
		db.delete(t.tripCity).where(eq(t.tripCity.id, city.id)).run();
	},

	// --- Ideas (inside each city) ------------------------------------------------------------
	addIdea: async ({ params, request }) => {
		const id = tripId(params);
		const parsed = parseForm(ideaSchema, await request.formData());
		if (!parsed.ok) return fail(400, { error: Object.values(parsed.errors).join(', ') });
		const { placeName, ...rest } = parsed.data;
		const cityId = cityOrNull(id, parsed.data.cityId);
		const clash = sameCityClash(id, cityId, placeName);
		if (clash) return fail(400, { error: clashError(clash) });
		const max = db
			.select({ n: sql<number>`coalesce(max(position), -1)` })
			.from(t.idea)
			.where(eq(t.idea.tripId, id))
			.get()!.n;
		db.insert(t.idea)
			.values({ ...rest, title: placeName, tripId: id, cityId, placeId: resolvePlace(placeName), position: max + 1 })
			.run();
	},
	updateIdea: async ({ params, request }) => {
		const id = tripId(params);
		const f = await request.formData();
		const idea = ownIdea(id, num(f, 'ideaId'));
		if (!idea) return fail(404);
		const parsed = parseForm(ideaSchema, f);
		if (!parsed.ok) return fail(400, { error: Object.values(parsed.errors).join(', ') });
		const { placeName, ...rest } = parsed.data;
		const cityId = cityOrNull(id, parsed.data.cityId);
		const clash = sameCityClash(id, cityId, placeName, idea.id);
		if (clash) return fail(400, { error: clashError(clash) });
		// moving to another city, or skipping it, takes it off its day (Days tab)
		const keepDay = cityId === idea.cityId && rest.priority !== 'skip';
		// a priority set by hand (or a move to another city) wins over one remembered from a city skip
		const forget = rest.priority !== idea.priority || cityId !== idea.cityId;
		db.update(t.idea)
			.set({ ...rest, title: placeName, cityId, placeId: resolvePlace(placeName), ...(keepDay ? {} : { cityDayId: null }), ...(forget ? { priorityBeforeCitySkip: null } : {}) })
			.where(eq(t.idea.id, idea.id))
			.run();
	},
	deleteIdea: async ({ params, request }) => {
		const f = await request.formData();
		const idea = ownIdea(tripId(params), num(f, 'ideaId'));
		if (!idea) return fail(404);
		db.delete(t.idea).where(eq(t.idea.id, idea.id)).run();
	},

	// --- Decisions ---------------------------------------------------------------------------
	addDecision: async ({ params, request }) => {
		const parsed = parseForm(decisionSchema, await request.formData());
		if (!parsed.ok) return fail(400, { error: Object.values(parsed.errors).join(', ') });
		db.insert(t.decision)
			.values({ ...parsed.data, tripId: tripId(params), status: parsed.data.answer ? 'decided' : 'open' })
			.run();
	},
	updateDecision: async ({ params, request }) => {
		const f = await request.formData();
		const d = ownDecision(tripId(params), num(f, 'decisionId'));
		if (!d) return fail(404);
		const parsed = parseForm(decisionSchema, f);
		if (!parsed.ok) return fail(400, { error: Object.values(parsed.errors).join(', ') });
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
	}
};
