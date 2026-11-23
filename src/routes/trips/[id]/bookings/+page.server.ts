import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { todayIso } from '#lib/dates.ts';
import { toMinor } from '#lib/money.ts';
import { db, t } from '#lib/server/db/index.ts';
import { getTrip, tripId } from '#lib/server/repo.ts';
import { bookingSchema, parseForm } from '#lib/schemas.ts';

export const load = ({ params }) => {
	const id = tripId(params);
	return {
		today: todayIso(),
		bookings: db.select().from(t.booking).where(eq(t.booking.tripId, id)).orderBy(asc(t.booking.id)).all(),
		stays: db.select({ id: t.stay.id, hotel: t.stay.hotel }).from(t.stay).where(eq(t.stay.tripId, id)).all()
	};
};

const own = (trip: number, id: number) =>
	db.select().from(t.booking).where(and(eq(t.booking.id, id), eq(t.booking.tripId, trip))).get();

function values(tripId: number, data: ReturnType<typeof bookingSchema.parse>) {
	const { price, ...rest } = data;
	const currency = rest.currency ?? (price ? getTrip(tripId).homeCurrency : null);
	return { ...rest, currency, priceMinor: currency ? toMinor(price, currency) : null };
}

export const actions = {
	add: async ({ params, request }) => {
		const id = tripId(params);
		const parsed = parseForm(bookingSchema, await request.formData());
		if (!parsed.ok) return fail(400, { ...parsed, formId: 'new' });
		db.insert(t.booking).values({ ...values(id, parsed.data), tripId: id }).run();
		return { added: true };
	},
	update: async ({ params, request }) => {
		const id = tripId(params);
		const f = await request.formData();
		const b = own(id, Number(f.get('bookingId')));
		if (!b) return fail(404);
		const parsed = parseForm(bookingSchema, f);
		if (!parsed.ok) return fail(400, { ...parsed, formId: String(b.id) });
		db.update(t.booking).set(values(id, parsed.data)).where(eq(t.booking.id, b.id)).run();
		return { updated: b.id };
	},
	/** Quick toggle from the table: mark booked and store the confirmation number. */
	markBooked: async ({ params, request }) => {
		const f = await request.formData();
		const b = own(tripId(params), Number(f.get('bookingId')));
		if (!b) return fail(404);
		const status = String(f.get('status') || 'booked') as 'booked' | 'to_book';
		db.update(t.booking)
			.set({ status, confirmation: String(f.get('confirmation') ?? '') || b.confirmation })
			.where(eq(t.booking.id, b.id))
			.run();
	},
	toggleTask: async ({ params, request }) => {
		const f = await request.formData();
		const b = own(tripId(params), Number(f.get('bookingId')));
		if (!b) return fail(404);
		const i = Number(f.get('task'));
		const tasks = b.tasks.map((task, j) => (j === i ? { ...task, done: !task.done } : task));
		db.update(t.booking).set({ tasks }).where(eq(t.booking.id, b.id)).run();
	},
	delete: async ({ params, request }) => {
		const f = await request.formData();
		const b = own(tripId(params), Number(f.get('bookingId')));
		if (!b) return fail(404);
		db.delete(t.booking).where(eq(t.booking.id, b.id)).run();
	}
};
