const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Parse ISO YYYY-MM-DD as a UTC date so time zones never shift the day. */
export function parseIso(iso: string): Date {
	const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
	const d = parseIso(iso);
	d.setUTCDate(d.getUTCDate() + n);
	return toIso(d);
}

export function daysBetween(a: string, b: string): number {
	return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000);
}

export function todayIso(): string {
	const now = new Date();
	return toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "13/Mar" */
export function ddMon(iso: string): string {
	const d = parseIso(iso);
	return `${pad(d.getUTCDate())}/${MONTHS[d.getUTCMonth()]}`;
}

/** "13/Mar 2027" */
export function ddMonYyyy(iso: string): string {
	return `${ddMon(iso)} ${parseIso(iso).getUTCFullYear()}`;
}

/** "Fri 12" */
export function dddDd(iso: string): string {
	const d = parseIso(iso);
	return `${WEEKDAYS[d.getUTCDay()]} ${pad(d.getUTCDate())}`;
}

/** "Fri 12 Mar" for the UI */
export function niceDate(iso: string | null | undefined): string {
	if (!iso) return '';
	const d = parseIso(iso);
	return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "13/Mar - 14/Mar", or a single date when both ends are equal */
export function ddMonRange(start: string, end: string): string {
	return start === end ? ddMon(start) : `${ddMon(start)} - ${ddMon(end)}`;
}

/** "2027-03" */
export function yearMonth(iso: string): string {
	return iso.slice(0, 7);
}
