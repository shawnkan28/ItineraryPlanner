import { fail } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, t } from '#lib/server/db/index.ts';
import { resolvePlace, tripId } from '#lib/server/repo.ts';
import { cityNightsSchema, parseForm, tripCitySchema } from '#lib/schemas.ts';

export const load = ({ params }) => {
	const id = tripId(params);
	const cities = db
		.select()
		.from(t.tripCity)
		.where(eq(t.tripCity.tripId, id))
		.orderBy(asc(t.tripCity.position), asc(t.tripCity.id))
		.all();
	const ideaCounts = Object.fromEntries(
		db
			.select({ cityId: t.idea.cityId, n: sql<number>`count(*)` })
			.from(t.idea)
			.where(and(eq(t.idea.tripId, id), sql`${t.idea.status} not in ('dropped', 'parked')`))
			.groupBy(t.idea.cityId)
			.all()
			.filter((r) => r.cityId !== null)
			.map((r) => [r.cityId, r.n])
	) as Record<number, number>;
	return { cities, ideaCounts };
};

const ownCity = (tripId: number, cityId: number) =>
	db
		.select()
		.from(t.tripCity)
		.where(and(eq(t.tripCity.id, cityId), eq(t.tripCity.tripId, tripId)))
		.get();

const num = (f: FormData, k: string) => Number(f.get(k));

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
				nightsMin: parsed.data.nightsMin,
				nightsMax: parsed.data.nightsMax,
				notes: parsed.data.notes,
				position: max + 1
			})
			.run();
	},
	updateCity: async ({ params, request }) => {
		const f = await request.formData();
		const city = ownCity(tripId(params), num(f, 'cityId'));
		if (!city) return fail(404);
		const parsed = parseForm(cityNightsSchema, f);
		if (!parsed.ok) return fail(400, { cityErrors: parsed.errors, cityId: city.id });
		db.update(t.tripCity).set(parsed.data).where(eq(t.tripCity.id, city.id)).run();
	},
	/** Ideas filed under the city become unassigned (they are kept). */
	deleteCity: async ({ params, request }) => {
		const f = await request.formData();
		const city = ownCity(tripId(params), num(f, 'cityId'));
		if (!city) return fail(404);
		db.delete(t.tripCity).where(eq(t.tripCity.id, city.id)).run();
	}
};
