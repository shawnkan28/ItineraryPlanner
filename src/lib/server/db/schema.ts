import { sqliteTable, integer, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();
const audit = {
	createdBy: integer('created_by'),
	updatedBy: integer('updated_by')
};

export type TripStatus = 'planning' | 'booked' | 'ongoing' | 'done' | 'exported';
export type PlaceLevel = 'country' | 'region' | 'city' | 'area' | 'place';
export type StopKind = 'stay' | 'overnight_transport' | 'depart';
export type TransportMode = 'ferry' | 'bus' | 'train' | 'flight';
export type CityPriority = 'must' | 'maybe' | 'skip';
export type IdeaStatus = 'idea' | 'planned' | 'dropped' | 'parked';
export type SectionKind =
	| 'focus'
	| 'maybe'
	| 'optional'
	| 'plan_b'
	| 'booking'
	| 'info'
	| 'getting_there';
export type StayStatus = 'idea' | 'booked' | 'cancelled';
export type BookingStatus = 'to_book' | 'booked' | 'not_needed' | 'cancelled';
export type BookingCategory =
	| 'ferry'
	| 'bus'
	| 'train'
	| 'tour'
	| 'hotel'
	| 'ticket'
	| 'restaurant'
	| 'check';

export interface DecisionOption {
	label: string;
	gain?: string;
	tradeOff?: string;
}
export interface LinkItem {
	label: string;
	url: string;
}
export interface Task {
	text: string;
	done: boolean;
}
export interface ExportedFile {
	path: string;
	hash: string;
}

/** Kept from v1 so accounts / share links can be added later without schema rework. */
export const user = sqliteTable('user', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	role: text('role').notNull().default('owner'),
	createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const setting = sqliteTable('setting', {
	key: text('key').primaryKey(),
	value: text('value')
});

export const trip = sqliteTable('trip', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	startDate: text('start_date').notNull(),
	endDate: text('end_date').notNull(),
	travellers: json<string[]>('travellers').notNull().default(sql`'["me"]'`),
	homeCurrency: text('home_currency').notNull().default('SGD'),
	status: text('status').$type<TripStatus>().notNull().default('planning'),
	notes: text('notes'),
	...audit
});

export const routeOption = sqliteTable('route_option', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	tripId: integer('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	isChosen: integer('is_chosen', { mode: 'boolean' }).notNull().default(false),
	notes: text('notes')
});

export const place = sqliteTable('place', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique(),
	level: text('level').$type<PlaceLevel>().notNull().default('place'),
	parentId: integer('parent_id'),
	aliases: json<string[]>('aliases').notNull().default(sql`'[]'`),
	vaultPath: text('vault_path'),
	notes: text('notes')
});

/**
 * Phase 1: the cities shortlist for a trip. Ideas (Phase 2) are collected per city, and routes
 * (Phase 3) are built from it.
 */
export const tripCity = sqliteTable(
	'trip_city',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		tripId: integer('trip_id')
			.notNull()
			.references(() => trip.id, { onDelete: 'cascade' }),
		placeId: integer('place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'cascade' }),
		priority: text('priority').$type<CityPriority>().notNull().default('maybe'),
		position: integer('position').notNull().default(0),
		/** Nights wanted: "2" is min 2 / max null, "1–2" is min 1 / max 2. */
		nightsMin: integer('nights_min').notNull().default(1),
		nightsMax: integer('nights_max'),
		/** Order on the Days tab (drag the city pills); null = not placed yet, listed last. */
		dayOrder: integer('day_order'),
		/** Why you want to go (or, for Skip, why not). */
		notes: text('notes')
	},
	(table) => [uniqueIndex('trip_city_trip_place').on(table.tripId, table.placeId)]
);

export const routeStop = sqliteTable('route_stop', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	routeOptionId: integer('route_option_id')
		.notNull()
		.references(() => routeOption.id, { onDelete: 'cascade' }),
	position: integer('position').notNull().default(0),
	placeId: integer('place_id').references(() => place.id, { onDelete: 'set null' }),
	label: text('label'),
	nights: integer('nights').notNull().default(1),
	startDate: text('start_date'),
	kind: text('kind').$type<StopKind>().notNull().default('stay'),
	/** Overnight transport only: what you sleep on and who runs it ("ferry", "MOL Sunflower"). */
	transportMode: text('transport_mode').$type<TransportMode>(),
	operator: text('operator')
});

/**
 * Phase 2: a day spent in a shortlisted city, before any dates exist. Ideas are dragged into
 * these; the number of days becomes the city's nights.
 */
export const cityDay = sqliteTable('city_day', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	tripCityId: integer('trip_city_id')
		.notNull()
		.references(() => tripCity.id, { onDelete: 'cascade' }),
	position: integer('position').notNull().default(0),
	label: text('label')
});

export const idea = sqliteTable('idea', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	tripId: integer('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	/** Legacy: ideas used to be filed under a route stop. Ideas are now filed by city (cityId). */
	baseId: integer('base_id').references(() => routeStop.id, { onDelete: 'set null' }),
	/** The shortlisted city this idea belongs to; null = unassigned. */
	cityId: integer('city_id').references(() => tripCity.id, { onDelete: 'set null' }),
	/** The day group within its city (Days tab); null = not scheduled yet. */
	cityDayId: integer('city_day_id').references(() => cityDay.id, { onDelete: 'set null' }),
	placeId: integer('place_id').references(() => place.id, { onDelete: 'set null' }),
	position: integer('position').notNull().default(0),
	title: text('title').notNull(),
	details: text('details'),
	status: text('status').$type<IdeaStatus>().notNull().default('idea'),
	/** Must / Maybe / Skip within its city. Skip counts as dropped in the export. */
	priority: text('priority').$type<CityPriority>().notNull().default('maybe'),
	/** Priority before its city was skipped; restored when the city comes back. */
	priorityBeforeCitySkip: text('priority_before_city_skip').$type<CityPriority>(),
	reason: text('reason')
});

export const decision = sqliteTable('decision', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	tripId: integer('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	question: text('question').notNull(),
	options: json<DecisionOption[]>('options').notNull().default(sql`'[]'`),
	answer: text('answer'),
	notes: text('notes'),
	status: text('status').$type<'open' | 'decided'>().notNull().default('open')
});

export const stay = sqliteTable('stay', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	tripId: integer('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	baseId: integer('base_id').references(() => routeStop.id, { onDelete: 'set null' }),
	hotel: text('hotel').notNull(),
	placeId: integer('place_id').references(() => place.id, { onDelete: 'set null' }),
	url: text('url'),
	address: text('address'),
	location: text('location'),
	priceMinor: integer('price_minor'),
	currency: text('currency'),
	checkIn: text('check_in'),
	checkOut: text('check_out'),
	bookedVia: text('booked_via'),
	status: text('status').$type<StayStatus>().notNull().default('idea')
});

export const day = sqliteTable('day', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	tripId: integer('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	dayNumber: integer('day_number').notNull(),
	date: text('date').notNull(),
	titlePlaceId: integer('title_place_id').references(() => place.id, { onDelete: 'set null' }),
	baseLabel: text('base_label'),
	summary: text('summary'),
	stayId: integer('stay_id').references(() => stay.id, { onDelete: 'set null' }),
	stayNote: text('stay_note'),
	...audit
});

export const planSection = sqliteTable('plan_section', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	dayId: integer('day_id')
		.notNull()
		.references(() => day.id, { onDelete: 'cascade' }),
	kind: text('kind').$type<SectionKind>().notNull(),
	title: text('title'),
	collapsed: integer('collapsed', { mode: 'boolean' }).notNull().default(false),
	position: integer('position').notNull().default(0)
});

export const planItem = sqliteTable('plan_item', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	sectionId: integer('section_id')
		.notNull()
		.references(() => planSection.id, { onDelete: 'cascade' }),
	position: integer('position').notNull().default(0),
	timeLabel: text('time_label'),
	sortTime: text('sort_time'),
	title: text('title').notNull(),
	placeId: integer('place_id').references(() => place.id, { onDelete: 'set null' }),
	person: text('person'),
	details: json<string[]>('details').notNull().default(sql`'[]'`),
	links: json<LinkItem[]>('links').notNull().default(sql`'[]'`),
	...audit
});

export const booking = sqliteTable('booking', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	tripId: integer('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	dayId: integer('day_id').references(() => day.id, { onDelete: 'set null' }),
	planItemId: integer('plan_item_id').references(() => planItem.id, { onDelete: 'set null' }),
	stayId: integer('stay_id').references(() => stay.id, { onDelete: 'set null' }),
	category: text('category').$type<BookingCategory>().notNull().default('check'),
	title: text('title').notNull(),
	provider: text('provider'),
	url: text('url'),
	tasks: json<Task[]>('tasks').notNull().default(sql`'[]'`),
	status: text('status').$type<BookingStatus>().notNull().default('to_book'),
	opensOn: text('opens_on'),
	bookBy: text('book_by'),
	confirmation: text('confirmation'),
	priceMinor: integer('price_minor'),
	currency: text('currency'),
	cancellation: text('cancellation'),
	notes: text('notes')
});

export const journalEntry = sqliteTable('journal_entry', {
	dayId: integer('day_id')
		.primaryKey()
		.references(() => day.id, { onDelete: 'cascade' }),
	quickSummary: text('quick_summary'),
	highlights: text('highlights'),
	lowlight: text('lowlight'),
	logMorning: text('log_morning'),
	logAfternoon: text('log_afternoon'),
	logEvening: text('log_evening'),
	breakfast: text('breakfast'),
	lunch: text('lunch'),
	dinner: text('dinner'),
	tips: text('tips'),
	banner: text('banner'),
	updatedAt: text('updated_at')
});

export const attachment = sqliteTable('attachment', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	dayId: integer('day_id')
		.notNull()
		.references(() => day.id, { onDelete: 'cascade' }),
	filePath: text('file_path').notNull(),
	caption: text('caption')
});

export const exportRun = sqliteTable('export_run', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	tripId: integer('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	runAt: text('run_at').notNull(),
	target: text('target').notNull(),
	files: json<ExportedFile[]>('files').notNull().default(sql`'[]'`)
});


/**
 * Bucket list, shared by all trips. Skipped cities/ideas and places from past trips show up on it
 * automatically; rows here are places saved by hand ('saved') or waved away ('hidden').
 */
export type BucketStatus = 'saved' | 'hidden';
export const bucketItem = sqliteTable('bucket_item', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	placeId: integer('place_id')
		.notNull()
		.unique()
		.references(() => place.id, { onDelete: 'cascade' }),
	status: text('status').$type<BucketStatus>().notNull().default('saved'),
	notes: text('notes'),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

export type Trip = typeof trip.$inferSelect;
export type RouteOption = typeof routeOption.$inferSelect;
export type RouteStop = typeof routeStop.$inferSelect;
export type TripCity = typeof tripCity.$inferSelect;
export type Place = typeof place.$inferSelect;
export type Idea = typeof idea.$inferSelect;
export type Decision = typeof decision.$inferSelect;
export type Stay = typeof stay.$inferSelect;
export type Day = typeof day.$inferSelect;
export type PlanSection = typeof planSection.$inferSelect;
export type PlanItem = typeof planItem.$inferSelect;
export type Booking = typeof booking.$inferSelect;
export type JournalEntry = typeof journalEntry.$inferSelect;
export type Attachment = typeof attachment.$inferSelect;
export type BucketItem = typeof bucketItem.$inferSelect;
export type CityDay = typeof cityDay.$inferSelect;
