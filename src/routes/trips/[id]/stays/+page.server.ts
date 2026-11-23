import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { toMinor } from '#lib/money.ts';
import { db, t } from '#lib/server/db/index.ts';
import { getTrip, resolvePlace, tripId } from '#lib/server/repo.ts';
import { parseForm, staySchema } from '#lib/schemas.ts';

export const load = ({ params }) => ({
	stays: db.select().from(t.stay).where(eq(t.stay.tripId, tripId(params))).orderBy(asc(t.stay.checkIn), asc(t.stay.id)).all()
});

function values(trip: number, data: ReturnType<typeof staySchema.parse>) {
	const { placeName, price, ...rest } = data;
	const currency = rest.currency ?? getTrip(trip).homeCurrency;
	return { ...rest, currency, priceMinor: toMinor(price, currency), placeId: resolvePlace(placeName) };
}

export const actions = {
	add: async ({ params, request }) => {
		const id = tripId(params);
		const parsed = parseForm(staySchema, await request.formData());
		if (!parsed.ok) return fail(400, { ...parsed, formId: 'new' });
		db.insert(t.stay).values({ ...values(id, parsed.data), tripId: id }).run();
	},
	update: async ({ params, request }) => {
		const id = tripId(params);
		const f = await request.formData();
		const stay = db
			.select()
			.from(t.stay)
			.where(and(eq(t.stay.id, Number(f.get('stayId'))), eq(t.stay.tripId, id)))
			.get();
		if (!stay) return fail(404);
		const parsed = parseForm(staySchema, f);
		if (!parsed.ok) return fail(400, { ...parsed, formId: String(stay.id) });
		db.update(t.stay).set(values(id, parsed.data)).where(eq(t.stay.id, stay.id)).run();
	},
	delete: async ({ params, request }) => {
		const id = tripId(params);
		const f = await request.formData();
		db.delete(t.stay)
			.where(and(eq(t.stay.id, Number(f.get('stayId'))), eq(t.stay.tripId, id)))
			.run();
	},
	/** Use this hotel for every day of its base. */
	assignDays: async ({ params, request }) => {
		const id = tripId(params);
		const f = await request.formData();
		const stay = db
			.select()
			.from(t.stay)
			.where(and(eq(t.stay.id, Number(f.get('stayId'))), eq(t.stay.tripId, id)))
			.get();
		if (!stay?.checkIn || !stay.checkOut) return fail(400, { error: 'Set check-in and check-out dates first' });
		const from = stay.checkIn.slice(0, 10);
		const to = stay.checkOut.slice(0, 10);
		const days = db.select().from(t.day).where(eq(t.day.tripId, id)).all();
		for (const d of days) {
			if (d.date >= from && d.date < to) {
				db.update(t.day)
					.set({ stayId: stay.id, stayNote: d.date === from ? (d.stayNote ?? '(check-in)') : d.stayNote })
					.where(eq(t.day.id, d.id))
					.run();
			}
		}
		return { assigned: stay.hotel };
	}
};
