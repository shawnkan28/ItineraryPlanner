/**
 * The bucket list is shared by all trips. It is mostly derived, so it never goes stale:
 * - skipped: cities and ideas marked Skip on any trip
 * - been: places from trips that are over (route cities, ideas put on a day, plan items)
 * - saved: places added by hand (bucket_item, status 'saved')
 * A bucket_item with status 'hidden' waves a place away from the list.
 */
import { sqlite } from '#lib/server/db/index.ts';
import type { PlaceLevel } from '#lib/server/db/schema.ts';

export type BucketSource = {
	tripId: number;
	trip: string;
	/** What happened on that trip: skipped there, or visited. */
	kind: 'skipped' | 'been';
	/** The city it was filed under on that trip (for ideas / plan items). */
	city: string | null;
	note: string | null;
};

export type BucketEntry = {
	placeId: number;
	name: string;
	level: PlaceLevel;
	/** A city-like place (goes on the Cities board) rather than a thing to do in a city. */
	isCity: boolean;
	/** For places: the city they belong to, when known. */
	cityPlaceId: number | null;
	cityName: string | null;
	saved: boolean;
	hidden: boolean;
	notes: string | null;
	sources: BucketSource[];
};

const CITY_LEVELS = new Set<PlaceLevel>(['country', 'region', 'city', 'area']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const tripLabel = (name: string, start: string) => `${name} (${MONTHS[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)})`;

type Row = {
	tripId: number;
	tripName: string;
	start: string;
	placeId: number;
	cityPlaceId: number | null;
	note: string | null;
	isCity: 0 | 1;
};

/** A trip counts as "been" once it has ended (or is marked done / exported). */
const PAST = `(t.end_date < date('now') or t.status in ('done', 'exported'))`;

const QUERIES: { kind: BucketSource['kind']; sql: string }[] = [
	// cities skipped on the shortlist
	{
		kind: 'skipped',
		sql: `select t.id tripId, t.name tripName, t.start_date start, c.place_id placeId, null cityPlaceId,
				c.notes note, 1 isCity
			from trip_city c join trip t on t.id = c.trip_id where c.priority = 'skip'`
	},
	// ideas skipped (or dropped the old way)
	{
		kind: 'skipped',
		sql: `select t.id tripId, t.name tripName, t.start_date start, i.place_id placeId, c.place_id cityPlaceId,
				coalesce(i.reason, i.details) note, 0 isCity
			from idea i join trip t on t.id = i.trip_id left join trip_city c on c.id = i.city_id
			where i.place_id is not null and (i.priority = 'skip' or i.status = 'dropped')`
	},
	// cities stayed in on the chosen route of a past trip
	{
		kind: 'been',
		sql: `select distinct t.id tripId, t.name tripName, t.start_date start, s.place_id placeId, null cityPlaceId,
				null note, 1 isCity
			from route_stop s join route_option o on o.id = s.route_option_id join trip t on t.id = o.trip_id
			where o.is_chosen = 1 and s.kind = 'stay' and s.place_id is not null and ${PAST}`
	},
	// ideas that made it onto a day of a past trip
	{
		kind: 'been',
		sql: `select t.id tripId, t.name tripName, t.start_date start, i.place_id placeId, c.place_id cityPlaceId,
				i.details note, 0 isCity
			from idea i join trip t on t.id = i.trip_id left join trip_city c on c.id = i.city_id
			where i.place_id is not null and i.status = 'planned' and ${PAST}`
	},
	// places on the day plans of a past trip
	{
		kind: 'been',
		sql: `select distinct t.id tripId, t.name tripName, t.start_date start, p.place_id placeId, null cityPlaceId,
				null note, 0 isCity
			from plan_item p join plan_section ps on ps.id = p.section_id join day d on d.id = ps.day_id
			join trip t on t.id = d.trip_id
			where p.place_id is not null and ${PAST}`
	}
];

/**
 * Everything on the bucket list. `exceptTrip` leaves out what comes only from that trip
 * (its own skipped cities are already on its board).
 */
export function bucketEntries(opts: { exceptTrip?: number; includeHidden?: boolean } = {}): BucketEntry[] {
	const places = new Map(
		(
			sqlite.prepare(`select id, name, level, parent_id parentId from place`).all() as {
				id: number;
				name: string;
				level: PlaceLevel;
				parentId: number | null;
			}[]
		).map((p) => [p.id, p])
	);
	const items = new Map(
		(
			sqlite.prepare(`select place_id placeId, status, notes from bucket_item`).all() as {
				placeId: number;
				status: 'saved' | 'hidden';
				notes: string | null;
			}[]
		).map((b) => [b.placeId, b])
	);
	const entries = new Map<number, BucketEntry>();
	const entry = (placeId: number) => {
		let e = entries.get(placeId);
		if (!e) {
			const p = places.get(placeId)!;
			const item = items.get(placeId);
			const parent = p.parentId ? places.get(p.parentId) : undefined;
			e = {
				placeId,
				name: p.name,
				level: p.level,
				isCity: CITY_LEVELS.has(p.level),
				cityPlaceId: parent && CITY_LEVELS.has(parent.level) ? parent.id : null,
				cityName: parent && CITY_LEVELS.has(parent.level) ? parent.name : null,
				saved: item?.status === 'saved',
				hidden: item?.status === 'hidden',
				notes: item?.notes ?? null,
				sources: []
			};
			entries.set(placeId, e);
		}
		return e;
	};

	for (const q of QUERIES) {
		for (const r of sqlite.prepare(q.sql).all() as Row[]) {
			if (r.tripId === opts.exceptTrip || !places.has(r.placeId)) continue;
			const e = entry(r.placeId);
			if (r.isCity) e.isCity = true;
			if (r.cityPlaceId && !e.cityPlaceId) {
				e.cityPlaceId = r.cityPlaceId;
				e.cityName = places.get(r.cityPlaceId)?.name ?? null;
			}
			const label = tripLabel(r.tripName, r.start);
			if (!e.sources.some((s) => s.tripId === r.tripId && s.kind === q.kind))
				e.sources.push({
					tripId: r.tripId,
					trip: label,
					kind: q.kind,
					city: r.cityPlaceId ? (places.get(r.cityPlaceId)?.name ?? null) : null,
					note: r.note
				});
		}
	}
	for (const [placeId, item] of items) if (item.status === 'saved' && places.has(placeId)) entry(placeId);

	return [...entries.values()]
		.filter((e) => opts.includeHidden || !e.hidden)
		.sort((a, b) => Number(b.saved) - Number(a.saved) || a.name.localeCompare(b.name));
}
