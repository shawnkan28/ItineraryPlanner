import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { addDays, daysBetween } from '$lib/dates';
import type { TripBundle } from '$lib/export/types';
import { db, t } from './db';
import type { PlaceLevel } from './db/schema';

export function getTrip(id: number) {
	const trip = db.select().from(t.trip).where(eq(t.trip.id, id)).get();
	if (!trip) error(404, 'Trip not found');
	return trip;
}

export function tripId(params: { id: string }) {
	const id = Number(params.id);
	if (!Number.isInteger(id)) error(404, 'Trip not found');
	return id;
}

// ---------------------------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------------------------

export function allPlaces() {
	return db.select().from(t.place).orderBy(asc(t.place.name)).all();
}

/** Look up a place by name or alias (case-insensitive). */
export function findPlace(name: string) {
	const exact = db
		.select()
		.from(t.place)
		.where(sql`lower(${t.place.name}) = lower(${name})`)
		.get();
	if (exact) return exact;
	return db
		.select()
		.from(t.place)
		.where(
			sql`exists (select 1 from json_each(${t.place.aliases}) where lower(json_each.value) = lower(${name}))`
		)
		.get();
}

/** Resolve a typed place name to an id, creating a new (not-in-vault) place if needed. */
export function resolvePlace(
	name: string | null | undefined,
	level: PlaceLevel = 'place'
): number | null {
	const clean = name?.replace(/^\[\[|\]\]$/g, '').trim();
	if (!clean) return null;
	const found = findPlace(clean);
	if (found) return found.id;
	return db.insert(t.place).values({ name: clean, level }).returning({ id: t.place.id }).get().id;
}

// ---------------------------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------------------------

/** Make sure there is exactly one day per date between start and end. Never deletes days with content. */
export function syncDays(tripId: number) {
	const trip = getTrip(tripId);
	const total = daysBetween(trip.startDate, trip.endDate) + 1;
	const existing = db.select().from(t.day).where(eq(t.day.tripId, tripId)).all();
	const byDate = new Map(existing.map((d) => [d.date, d]));

	db.transaction((tx) => {
		for (let i = 0; i < total; i++) {
			const date = addDays(trip.startDate, i);
			const d = byDate.get(date);
			if (d) {
				if (d.dayNumber !== i + 1)
					tx.update(t.day).set({ dayNumber: i + 1 }).where(eq(t.day.id, d.id)).run();
				byDate.delete(date);
			} else {
				tx.insert(t.day)
					.values({ tripId, dayNumber: i + 1, date, createdBy: 1, updatedBy: 1 })
					.run();
			}
		}
		// Days now outside the trip: delete only if empty, else push them to the end so nothing is lost.
		let extra = total;
		for (const d of byDate.values()) {
			const hasSections = tx
				.select({ n: sql<number>`count(*)` })
				.from(t.planSection)
				.where(eq(t.planSection.dayId, d.id))
				.get()!.n;
			const hasJournal = tx
				.select()
				.from(t.journalEntry)
				.where(eq(t.journalEntry.dayId, d.id))
				.get();
			if (!hasSections && !hasJournal && !d.summary) tx.delete(t.day).where(eq(t.day.id, d.id)).run();
			else tx.update(t.day).set({ dayNumber: ++extra }).where(eq(t.day.id, d.id)).run();
		}
	});
}

// ---------------------------------------------------------------------------------------------
// Route (Phase 1)
// ---------------------------------------------------------------------------------------------

export function chosenRoute(tripId: number) {
	return db
		.select()
		.from(t.routeOption)
		.where(and(eq(t.routeOption.tripId, tripId), eq(t.routeOption.isChosen, true)))
		.get();
}

export function stopsOf(routeOptionId: number) {
	return db
		.select()
		.from(t.routeStop)
		.where(eq(t.routeStop.routeOptionId, routeOptionId))
		.orderBy(asc(t.routeStop.position), asc(t.routeStop.id))
		.all();
}

/** Bases = stops of the chosen route. */
export function bases(tripId: number) {
	const chosen = chosenRoute(tripId);
	return chosen ? stopsOf(chosen.id) : [];
}

/** Fill start dates of a route's stops from the trip start, in order. */
export function dateStops(tripId: number, routeOptionId: number) {
	const trip = getTrip(tripId);
	let date = trip.startDate;
	for (const s of stopsOf(routeOptionId)) {
		db.update(t.routeStop).set({ startDate: date }).where(eq(t.routeStop.id, s.id)).run();
		date = addDays(date, s.nights);
	}
}

/**
 * Promote a route option to the final plan: mark it chosen, date its stops and fill each day's
 * title city / base label where they are still empty. Never overwrites what's already set.
 */
export function chooseRoute(tripId: number, routeOptionId: number) {
	db.transaction((tx) => {
		tx.update(t.routeOption).set({ isChosen: false }).where(eq(t.routeOption.tripId, tripId)).run();
		tx.update(t.routeOption).set({ isChosen: true }).where(eq(t.routeOption.id, routeOptionId)).run();
	});
	dateStops(tripId, routeOptionId);
	syncDays(tripId);
	const stops = stopsOf(routeOptionId);
	const days = db.select().from(t.day).where(eq(t.day.tripId, tripId)).all();
	const places = new Map(allPlaces().map((p) => [p.id, p]));
	for (const d of days) {
		const stop = stops.find(
			(s) => s.startDate && s.startDate <= d.date && d.date < addDays(s.startDate, Math.max(s.nights, 1))
		);
		if (!stop) continue;
		const label = stop.label ?? (stop.placeId ? places.get(stop.placeId)?.name.replace(/ City$/, '') : null);
		db.update(t.day)
			.set({
				titlePlaceId: d.titlePlaceId ?? stop.placeId,
				baseLabel: d.baseLabel ?? label ?? null
			})
			.where(eq(t.day.id, d.id))
			.run();
	}
}

// ---------------------------------------------------------------------------------------------
// Bundle (for export and overview)
// ---------------------------------------------------------------------------------------------

export function loadBundle(tripId: number): TripBundle {
	const trip = getTrip(tripId);
	const days = db
		.select()
		.from(t.day)
		.where(eq(t.day.tripId, tripId))
		.orderBy(asc(t.day.dayNumber))
		.all();
	const dayIds = days.map((d) => d.id);
	const sections = dayIds.length
		? db.select().from(t.planSection).where(inArray(t.planSection.dayId, dayIds)).all()
		: [];
	const sectionIds = sections.map((s) => s.id);
	const items = sectionIds.length
		? db.select().from(t.planItem).where(inArray(t.planItem.sectionId, sectionIds)).all()
		: [];
	const places = Object.fromEntries(allPlaces().map((p) => [p.id, p]));
	return {
		trip,
		places,
		bases: bases(tripId),
		days,
		sections,
		items,
		stays: db.select().from(t.stay).where(eq(t.stay.tripId, tripId)).all(),
		bookings: db.select().from(t.booking).where(eq(t.booking.tripId, tripId)).all(),
		journals: dayIds.length
			? db.select().from(t.journalEntry).where(inArray(t.journalEntry.dayId, dayIds)).all()
			: [],
		attachments: dayIds.length
			? db.select().from(t.attachment).where(inArray(t.attachment.dayId, dayIds)).all()
			: [],
		decisions: db.select().from(t.decision).where(eq(t.decision.tripId, tripId)).all(),
		ideas: db
			.select()
			.from(t.idea)
			.where(eq(t.idea.tripId, tripId))
			.orderBy(asc(t.idea.position))
			.all()
	};
}
