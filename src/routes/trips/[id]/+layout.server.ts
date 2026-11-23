import { asc, eq } from 'drizzle-orm';
import { db, t } from '$lib/server/db';
import { allPlaces, bases, getTrip, tripId } from '$lib/server/repo';

export const load = ({ params }) => {
	const id = tripId(params);
	const trip = getTrip(id);
	const days = db
		.select({ id: t.day.id, dayNumber: t.day.dayNumber, date: t.day.date })
		.from(t.day)
		.where(eq(t.day.tripId, id))
		.orderBy(asc(t.day.dayNumber))
		.all();
	const places = allPlaces().map((p) => ({ id: p.id, name: p.name, level: p.level, aliases: p.aliases, inVault: Boolean(p.vaultPath) }));
	return { trip, days, places, bases: bases(id) };
};
