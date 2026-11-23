import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { isDue } from '$lib/bookings';
import { todayIso } from '$lib/dates';
import { sumByCurrency } from '$lib/money';
import { db, t } from '$lib/server/db';
import { syncDays, tripId } from '$lib/server/repo';
import { parseForm, tripSchema } from '$lib/schemas';

export const load = ({ params }) => {
	const id = tripId(params);
	const today = todayIso();
	const bookings = db.select().from(t.booking).where(eq(t.booking.tripId, id)).all();
	const stays = db.select().from(t.stay).where(eq(t.stay.tripId, id)).all();
	const bookedStays = stays.filter((s) => s.status === 'booked');
	const bookedStayIds = new Set(bookedStays.map((s) => s.id));
	// A booked stay counts as a booking in totals; don't count a hotel booking linked to it twice.
	const bookedRows = [
		...bookings.filter((b) => b.status === 'booked' && !(b.stayId && bookedStayIds.has(b.stayId))),
		...bookedStays
	];
	const openDecisions = db
		.select()
		.from(t.decision)
		.where(and(eq(t.decision.tripId, id), eq(t.decision.status, 'open')))
		.all();
	return {
		today,
		due: bookings.filter((b) => isDue(b, today)),
		toBook: bookings.filter((b) => b.status === 'to_book'),
		bookedCount: bookings.filter((b) => b.status === 'booked').length + bookedStays.length,
		totals: sumByCurrency(bookedRows),
		openDecisions
	};
};

export const actions = {
	update: async ({ request, params, locals }) => {
		const id = tripId(params);
		const parsed = parseForm(tripSchema, await request.formData());
		if (!parsed.ok) return fail(400, parsed);
		db.update(t.trip).set({ ...parsed.data, updatedBy: locals.userId }).where(eq(t.trip.id, id)).run();
		syncDays(id);
		return { saved: true };
	},
	delete: async ({ params, request }) => {
		const form = await request.formData();
		if (form.get('confirm') !== 'delete') return fail(400, { deleteError: 'Type "delete" to confirm' });
		db.delete(t.trip).where(eq(t.trip.id, tripId(params))).run();
		redirect(303, '/');
	}
};
