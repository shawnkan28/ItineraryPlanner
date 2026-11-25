import { fail } from '@sveltejs/kit';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db, t } from '#lib/server/db/index.ts';
import { syncCityNights, tripId } from '#lib/server/repo.ts';

/** Phase 2: per city, group its ideas into days. */
export const load = ({ params }) => {
	const id = tripId(params);
	const cities = db
		.select()
		.from(t.tripCity)
		.where(and(eq(t.tripCity.tripId, id), ne(t.tripCity.priority, 'skip')))
		.orderBy(asc(t.tripCity.position), asc(t.tripCity.id))
		.all()
		// your order from the Days tab first; cities not placed yet follow, Must before Maybe
		.sort(
			(a, b) =>
				(a.dayOrder ?? Infinity) - (b.dayOrder ?? Infinity) ||
				Number(a.priority === 'maybe') - Number(b.priority === 'maybe')
		);
	const cityIds = cities.map((c) => c.id);
	const days = cityIds.length
		? db
				.select()
				.from(t.cityDay)
				.where(inArray(t.cityDay.tripCityId, cityIds))
				.orderBy(asc(t.cityDay.position), asc(t.cityDay.id))
				.all()
		: [];
	const ideas = db
		.select()
		.from(t.idea)
		.where(and(eq(t.idea.tripId, id), ne(t.idea.priority, 'skip')))
		.orderBy(asc(t.idea.position), asc(t.idea.id))
		.all();
	return { cities, days, ideas };
};

const num = (f: FormData, k: string) => Number(f.get(k));
const ownCity = (trip: number, cityId: number) =>
	db.select().from(t.tripCity).where(and(eq(t.tripCity.id, cityId), eq(t.tripCity.tripId, trip))).get();
function ownDay(trip: number, dayId: number) {
	const day = db.select().from(t.cityDay).where(eq(t.cityDay.id, dayId)).get();
	return day && ownCity(trip, day.tripCityId) ? day : null;
}

export const actions = {
	addDay: async ({ params, request }) => {
		const f = await request.formData();
		const city = ownCity(tripId(params), num(f, 'cityId'));
		if (!city) return fail(404);
		const max = db
			.select({ n: sql<number>`coalesce(max(position), -1)` })
			.from(t.cityDay)
			.where(eq(t.cityDay.tripCityId, city.id))
			.get()!.n;
		db.insert(t.cityDay).values({ tripCityId: city.id, position: max + 1 }).run();
		syncCityNights(city.id);
	},
	renameDay: async ({ params, request }) => {
		const f = await request.formData();
		const day = ownDay(tripId(params), num(f, 'dayId'));
		if (!day) return fail(404);
		db.update(t.cityDay)
			.set({ label: String(f.get('label') ?? '').trim() || null })
			.where(eq(t.cityDay.id, day.id))
			.run();
	},
	/** Its ideas go back to the city's unscheduled pool. */
	deleteDay: async ({ params, request }) => {
		const f = await request.formData();
		const day = ownDay(tripId(params), num(f, 'dayId'));
		if (!day) return fail(404);
		db.delete(t.cityDay).where(eq(t.cityDay.id, day.id)).run();
		syncCityNights(day.tripCityId);
	}
};
