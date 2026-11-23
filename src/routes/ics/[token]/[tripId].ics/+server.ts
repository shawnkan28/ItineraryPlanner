import { error } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, t } from '$lib/server/db';
import { getTrip } from '$lib/server/repo';
import { icsToken } from '$lib/server/settings';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const icsDate = (iso: string) => iso.replace(/-/g, '');
const nextDay = (iso: string) => {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10).replace(/-/g, '');
};

/** All-day events for opens_on / book_by of bookings still `to_book`. */
export const GET = ({ params, url }) => {
	const a = Buffer.from(params.token);
	const b = Buffer.from(icsToken());
	if (a.length !== b.length || !timingSafeEqual(a, b)) error(404, 'Not found');
	const trip = getTrip(Number(params.tripId));
	const bookings = db
		.select()
		.from(t.booking)
		.where(and(eq(t.booking.tripId, trip.id), eq(t.booking.status, 'to_book')))
		.all();
	const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//itinerary-planner//EN',
		'CALSCALE:GREGORIAN',
		`X-WR-CALNAME:${esc(`${trip.name} bookings`)}`
	];
	for (const k of bookings) {
		for (const [kind, date] of [
			['opens', k.opensOn],
			['book by', k.bookBy]
		] as const) {
			if (!date) continue;
			lines.push(
				'BEGIN:VEVENT',
				`UID:booking-${k.id}-${kind.replace(' ', '')}@${url.hostname}`,
				`DTSTAMP:${stamp}`,
				`DTSTART;VALUE=DATE:${icsDate(date)}`,
				`DTEND;VALUE=DATE:${nextDay(date)}`,
				`SUMMARY:${esc(`${kind === 'opens' ? 'Booking opens' : 'Book by'}: ${k.title}`)}`,
				...(k.url ? [`URL:${k.url}`] : []),
				`DESCRIPTION:${esc([k.provider, k.notes].filter(Boolean).join('\n'))}`,
				'END:VEVENT'
			);
		}
	}
	lines.push('END:VCALENDAR');
	return new Response(lines.join('\r\n') + '\r\n', {
		headers: { 'content-type': 'text/calendar; charset=utf-8' }
	});
};
