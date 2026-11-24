import { z } from 'zod';

/** Empty form fields become null. */
const opt = z
	.string()
	.optional()
	.transform((v) => (v === undefined || v.trim() === '' ? null : v.trim()));
const req = z.string().trim().min(1, 'Required');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const optDate = z
	.string()
	.optional()
	.transform((v) => (v ? v : null))
	.pipe(isoDate.nullable());
const optInt = z
	.string()
	.optional()
	.transform((v) => (v === undefined || v === '' ? null : Number(v)))
	.pipe(z.number().int().nullable());
const bool = z
	.string()
	.optional()
	.transform((v) => v === 'on' || v === 'true' || v === '1');
const currency = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z]{3}$/, '3-letter code')
	.or(z.literal('').transform(() => null))
	.optional()
	.transform((v) => v ?? null);

export const tripSchema = z
	.object({
		name: req,
		startDate: isoDate,
		endDate: isoDate,
		travellers: z
			.string()
			.optional()
			.transform((v) =>
				(v ?? 'me')
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
			),
		homeCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('SGD'),
		status: z.enum(['planning', 'booked', 'ongoing', 'done', 'exported']).default('planning'),
		notes: opt
	})
	.refine((v) => v.endDate >= v.startDate, { message: 'End must be after start', path: ['endDate'] });

export const placeSchema = z.object({
	name: req,
	level: z.enum(['country', 'region', 'city', 'area', 'place']).default('place'),
	parentName: opt,
	aliases: z
		.string()
		.optional()
		.transform((v) =>
			(v ?? '')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
		),
	notes: opt
});

export const routeStopSchema = z.object({
	placeName: opt,
	label: opt,
	nights: z.coerce.number().int().min(0).default(1),
	kind: z.enum(['stay', 'overnight_transport', 'depart']).default('stay'),
	transportMode: z
		.enum(['ferry', 'bus', 'train', 'flight', ''])
		.optional()
		.transform((v) => v || null),
	operator: opt
});

/** Nights wanted for a shortlisted city: a minimum and an optional maximum ("1–2"). */
export const cityNightsSchema = z
	.object({
		nightsMin: z.coerce.number().int().min(0).max(60).default(1),
		nightsMax: z
			.string()
			.optional()
			.transform((v) => (v === undefined || v === '' ? null : Number(v)))
			.pipe(z.number().int().min(0).max(60).nullable()),
		notes: opt
	})
	.transform((v) => ({ ...v, nightsMax: v.nightsMax !== null && v.nightsMax > v.nightsMin ? v.nightsMax : null }));

export const tripCitySchema = z
	.object({
		placeName: req,
		priority: z.enum(['must', 'maybe', 'skip']).default('maybe')
	})
	.and(cityNightsSchema);

export const ideaSchema = z.object({
	cityId: optInt,
	placeName: opt,
	title: req,
	details: opt,
	status: z.enum(['idea', 'planned', 'dropped', 'parked']).default('idea'),
	reason: opt
});

export const decisionSchema = z.object({
	question: req,
	options: z
		.string()
		.optional()
		.transform((v) =>
			(v ?? '')
				.split('\n')
				.map((line) => line.trim())
				.filter(Boolean)
				.map((line) => {
					const [label, gain, tradeOff] = line.split('|').map((s) => s.trim());
					return { label, gain: gain || undefined, tradeOff: tradeOff || undefined };
				})
		),
	answer: opt,
	notes: opt
});

export const staySchema = z.object({
	baseId: optInt,
	hotel: req,
	placeName: opt,
	url: opt,
	address: opt,
	location: opt,
	price: opt,
	currency,
	checkIn: opt,
	checkOut: opt,
	bookedVia: opt,
	status: z.enum(['idea', 'booked', 'cancelled']).default('idea')
});

export const daySchema = z.object({
	titlePlaceName: opt,
	baseLabel: opt,
	summary: opt,
	stayId: optInt,
	stayNote: opt
});

export const sectionSchema = z.object({
	kind: z.enum(['focus', 'maybe', 'optional', 'plan_b', 'booking', 'info', 'getting_there']),
	title: opt,
	collapsed: bool
});

/** details: one sub-bullet per line. links: one per line, "label | url" or a bare url. */
export const planItemSchema = z.object({
	timeLabel: opt,
	sortTime: z
		.string()
		.optional()
		.transform((v) => (v ? v : null))
		.pipe(z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM').nullable()),
	title: req,
	placeName: opt,
	person: opt,
	details: z
		.string()
		.optional()
		.transform((v) =>
			(v ?? '')
				.split('\n')
				.map((s) => s.replace(/^\s*[-*]\s+/, '').trimEnd())
				.filter((s) => s.trim())
		),
	links: z
		.string()
		.optional()
		.transform((v) =>
			(v ?? '')
				.split('\n')
				.map((s) => s.trim())
				.filter(Boolean)
				.map((line) => {
					const i = line.lastIndexOf('|');
					if (i === -1) return { label: line, url: line };
					return { label: line.slice(0, i).trim(), url: line.slice(i + 1).trim() };
				})
		)
});

export const bookingSchema = z.object({
	dayId: optInt,
	stayId: optInt,
	planItemId: optInt,
	category: z
		.enum(['ferry', 'bus', 'train', 'tour', 'hotel', 'ticket', 'restaurant', 'check'])
		.default('check'),
	title: req,
	provider: opt,
	url: opt,
	tasks: z
		.string()
		.optional()
		.transform((v) =>
			(v ?? '')
				.split('\n')
				.map((s) => s.trim())
				.filter(Boolean)
				.map((line) => {
					const m = line.match(/^\[( |x|X)\]\s*(.*)$/);
					return m ? { text: m[2], done: m[1] !== ' ' } : { text: line, done: false };
				})
		),
	status: z.enum(['to_book', 'booked', 'not_needed', 'cancelled']).default('to_book'),
	opensOn: optDate,
	bookBy: optDate,
	confirmation: opt,
	price: opt,
	currency,
	cancellation: opt,
	notes: opt
});

export const journalSchema = z.object({
	quickSummary: z.string().nullish(),
	highlights: z.string().nullish(),
	lowlight: z.string().nullish(),
	logMorning: z.string().nullish(),
	logAfternoon: z.string().nullish(),
	logEvening: z.string().nullish(),
	breakfast: z.string().nullish(),
	lunch: z.string().nullish(),
	dinner: z.string().nullish(),
	tips: z.string().nullish(),
	banner: z.string().nullish()
});
export type JournalInput = z.infer<typeof journalSchema>;

export function parseForm<S extends z.ZodType>(schema: S, form: FormData) {
	const obj: Record<string, string> = {};
	for (const [k, v] of form.entries()) if (typeof v === 'string') obj[k] = v;
	const result = schema.safeParse(obj);
	if (result.success) return { ok: true as const, data: result.data as z.output<S> };
	const errors: Record<string, string> = {};
	for (const issue of result.error.issues) errors[issue.path.join('.') || 'form'] ??= issue.message;
	return { ok: false as const, errors, values: obj };
}
