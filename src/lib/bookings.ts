import { addDays } from './dates';

type B = { status: string; opensOn: string | null; bookBy: string | null };

/** Due = `to_book` and opens_on or book_by within the next 14 days (or already passed). */
export function isDue(b: B, today: string): boolean {
	if (b.status !== 'to_book') return false;
	const limit = addDays(today, 14);
	return [b.opensOn, b.bookBy].some((d) => d !== null && d <= limit);
}

export function bookingBadges(b: B, today: string) {
	const out: { text: string; color: string }[] = [];
	if (b.status !== 'to_book') return out;
	const limit = addDays(today, 14);
	if (b.opensOn) {
		if (b.opensOn > today && b.opensOn <= limit) out.push({ text: `opens ${b.opensOn.slice(5)}`, color: 'amber' });
		else if (b.opensOn <= today) out.push({ text: 'open now', color: 'green' });
	}
	if (b.bookBy) {
		if (b.bookBy < today) out.push({ text: 'overdue', color: 'red' });
		else if (b.bookBy <= limit) out.push({ text: `book by ${b.bookBy.slice(5)}`, color: 'red' });
	}
	return out;
}

export const CATEGORIES = ['ferry', 'bus', 'train', 'tour', 'hotel', 'ticket', 'restaurant', 'check'] as const;
export const BOOKING_STATUSES = ['to_book', 'booked', 'not_needed', 'cancelled'] as const;
