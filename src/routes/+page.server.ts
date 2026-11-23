import { fail, redirect } from '@sveltejs/kit';
import { asc, sql } from 'drizzle-orm';
import { db, t } from '#lib/server/db/index.ts';
import { syncDays } from '#lib/server/repo.ts';
import { parseForm, tripSchema } from '#lib/schemas.ts';

export const load = () => {
	const trips = db
		.select({
			trip: t.trip,
			openBookings: sql<number>`(select count(*) from booking b where b.trip_id = ${t.trip.id} and b.status = 'to_book')`,
			days: sql<number>`(select count(*) from day d where d.trip_id = ${t.trip.id})`
		})
		.from(t.trip)
		.orderBy(asc(t.trip.startDate))
		.all();
	return { trips };
};

export const actions = {
	create: async ({ request, locals }) => {
		const parsed = parseForm(tripSchema, await request.formData());
		if (!parsed.ok) return fail(400, parsed);
		const trip = db
			.insert(t.trip)
			.values({ ...parsed.data, createdBy: locals.userId, updatedBy: locals.userId })
			.returning()
			.get();
		// Every trip starts with one route option (Phase 1) and a day per date.
		db.insert(t.routeOption).values({ tripId: trip.id, name: 'Option A' }).run();
		syncDays(trip.id);
		redirect(303, `/trips/${trip.id}`);
	}
};
