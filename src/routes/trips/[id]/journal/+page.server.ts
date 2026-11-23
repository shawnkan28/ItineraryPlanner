import { asc, eq, inArray } from 'drizzle-orm';
import { todayIso } from '#lib/dates.ts';
import { db, t } from '#lib/server/db/index.ts';
import { tripId } from '#lib/server/repo.ts';

export const load = ({ params }) => {
	const id = tripId(params);
	const days = db.select().from(t.day).where(eq(t.day.tripId, id)).orderBy(asc(t.day.dayNumber)).all();
	const journals = days.length
		? db.select().from(t.journalEntry).where(inArray(t.journalEntry.dayId, days.map((d) => d.id))).all()
		: [];
	return { fullDays: days, journals, today: todayIso() };
};
