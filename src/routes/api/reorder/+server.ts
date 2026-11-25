import { error, json } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, t } from '#lib/server/db/index.ts';
import { cascadeCityPriority, dateStops } from '#lib/server/repo.ts';

const body = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('ideas'),
		tripId: z.number().int(),
		/** Ideas of one city, in Must / Maybe / Skip columns (moving to another city is a dropdown). */
		columns: z.array(z.object({ priority: z.enum(['must', 'maybe', 'skip']), ids: z.array(z.number().int()) }))
	}),
	z.object({
		kind: z.literal('stops'),
		tripId: z.number().int(),
		/** Each card is an existing stop (`id`) or a place dropped in from the palette (`placeId`). */
		columns: z.array(
			z.object({
				optionId: z.number().int(),
				items: z.array(
					z.union([
						z.object({ id: z.number().int() }),
						z.object({ placeId: z.number().int(), nights: z.number().int().min(0).max(60).optional() })
					])
				)
			})
		)
	}),
	z.object({
		kind: z.literal('cityDays'),
		tripId: z.number().int(),
		cityId: z.number().int(),
		/** The city's unscheduled pool (dayId null) and its day groups. */
		columns: z.array(z.object({ dayId: z.number().int().nullable(), ids: z.array(z.number().int()) }))
	}),
	z.object({
		kind: z.literal('cityOrder'),
		tripId: z.number().int(),
		/** City ids in the order shown on the Days tab. */
		ids: z.array(z.number().int())
	}),
	z.object({
		kind: z.literal('cities'),
		tripId: z.number().int(),
		columns: z.array(z.object({ priority: z.enum(['must', 'maybe', 'skip']), ids: z.array(z.number().int()) }))
	}),
	z.object({
		kind: z.literal('items'),
		dayId: z.number().int(),
		sections: z.array(z.object({ sectionId: z.number().int(), ids: z.array(z.number().int()) }))
	})
]);

/** Persist drag-and-drop order (and moves between columns / sections). */
export const POST = async ({ request, locals }) => {
	const parsed = body.safeParse(await request.json());
	if (!parsed.success) error(400, 'Bad request');
	const b = parsed.data;

	if (b.kind === 'ideas') {
		const ids = b.columns.flatMap((c) => c.ids);
		const own = ids.length
			? db.select({ id: t.idea.id, tripId: t.idea.tripId }).from(t.idea).where(inArray(t.idea.id, ids)).all()
			: [];
		if (own.some((i) => i.tripId !== b.tripId) || own.length !== ids.length) error(403, 'Not your ideas');
		const was = new Map(
			(ids.length ? db.select({ id: t.idea.id, priority: t.idea.priority }).from(t.idea).where(inArray(t.idea.id, ids)).all() : []).map(
				(i) => [i.id, i.priority]
			)
		);
		db.transaction((tx) => {
			// a priority you set by hand wins over the one remembered from a city skip
			for (const col of b.columns)
				col.ids.forEach((id) => {
					if (was.get(id) !== col.priority)
						tx.update(t.idea).set({ priorityBeforeCitySkip: null }).where(eq(t.idea.id, id)).run();
				});
			for (const col of b.columns)
				col.ids.forEach((id, position) =>
					tx
						.update(t.idea)
						// a skipped idea leaves its day (Days tab)
						.set(col.priority === 'skip' ? { position, priority: col.priority, cityDayId: null } : { position, priority: col.priority })
						.where(eq(t.idea.id, id))
						.run()
				);
		});
		return json({ ok: true });
	}

	if (b.kind === 'cityDays') {
		const city = db.select().from(t.tripCity).where(eq(t.tripCity.id, b.cityId)).get();
		if (!city || city.tripId !== b.tripId) error(403, 'Not your city');
		const ids = b.columns.flatMap((c) => c.ids);
		const ideas = ids.length ? db.select().from(t.idea).where(inArray(t.idea.id, ids)).all() : [];
		if (ideas.length !== ids.length || ideas.some((i) => i.cityId !== city.id)) error(403, 'Not this city');
		const dayIds = b.columns.flatMap((c) => (c.dayId === null ? [] : [c.dayId]));
		const days = dayIds.length ? db.select().from(t.cityDay).where(inArray(t.cityDay.id, dayIds)).all() : [];
		if (days.length !== new Set(dayIds).size || days.some((d) => d.tripCityId !== city.id)) error(403, 'Not this city');
		db.transaction((tx) => {
			for (const col of b.columns)
				col.ids.forEach((id, position) =>
					tx.update(t.idea).set({ position, cityDayId: col.dayId }).where(eq(t.idea.id, id)).run()
				);
		});
		return json({ ok: true });
	}

	if (b.kind === 'cityOrder') {
		const own = b.ids.length
			? db.select({ id: t.tripCity.id, tripId: t.tripCity.tripId }).from(t.tripCity).where(inArray(t.tripCity.id, b.ids)).all()
			: [];
		if (own.length !== new Set(b.ids).size || own.some((c) => c.tripId !== b.tripId)) error(403, 'Not your cities');
		db.transaction((tx) => {
			b.ids.forEach((id, i) => tx.update(t.tripCity).set({ dayOrder: i }).where(eq(t.tripCity.id, id)).run());
		});
		return json({ ok: true });
	}

	if (b.kind === 'cities') {
		const ids = b.columns.flatMap((c) => c.ids);
		const own = ids.length
			? db.select({ id: t.tripCity.id, tripId: t.tripCity.tripId }).from(t.tripCity).where(inArray(t.tripCity.id, ids)).all()
			: [];
		if (own.length !== ids.length || own.some((c) => c.tripId !== b.tripId)) error(403, 'Not your cities');
		const before = new Map(
			(ids.length ? db.select().from(t.tripCity).where(inArray(t.tripCity.id, ids)).all() : []).map((c) => [c.id, c.priority])
		);
		db.transaction((tx) => {
			for (const col of b.columns)
				col.ids.forEach((id, position) => {
					tx.update(t.tripCity).set({ position, priority: col.priority }).where(eq(t.tripCity.id, id)).run();
					cascadeCityPriority(id, before.get(id)!, col.priority);
				});
		});
		return json({ ok: true });
	}

	if (b.kind === 'stops') {
		const optionIds = b.columns.map((c) => c.optionId);
		const options = optionIds.length
			? db.select().from(t.routeOption).where(inArray(t.routeOption.id, optionIds)).all()
			: [];
		if (options.length !== optionIds.length || options.some((o) => o.tripId !== b.tripId))
			error(403, 'Not your route');
		const stopIds = b.columns.flatMap((c) => c.items.flatMap((i) => ('id' in i ? [i.id] : [])));
		const stops = stopIds.length
			? db.select().from(t.routeStop).where(inArray(t.routeStop.id, stopIds)).all()
			: [];
		const ownOptionIds = new Set(
			db.select({ id: t.routeOption.id }).from(t.routeOption).where(eq(t.routeOption.tripId, b.tripId)).all().map((o) => o.id)
		);
		if (stops.length !== stopIds.length || stops.some((s) => !ownOptionIds.has(s.routeOptionId)))
			error(403, 'Not your stops');
		const placeIds = b.columns.flatMap((c) => c.items.flatMap((i) => ('placeId' in i ? [i.placeId] : [])));
		if (placeIds.length) {
			const found = db.select({ id: t.place.id }).from(t.place).where(inArray(t.place.id, placeIds)).all();
			if (new Set(found.map((p) => p.id)).size !== new Set(placeIds).size) error(400, 'Unknown place');
		}
		db.transaction((tx) => {
			for (const col of b.columns)
				col.items.forEach((item, position) => {
					if ('id' in item)
						tx.update(t.routeStop).set({ position, routeOptionId: col.optionId }).where(eq(t.routeStop.id, item.id)).run();
					else
						tx.insert(t.routeStop)
							.values({ routeOptionId: col.optionId, placeId: item.placeId, position, nights: item.nights ?? 1 })
							.run();
				});
		});
		for (const id of optionIds) dateStops(b.tripId, id);
		return json({ ok: true });
	}

	const sectionIds = b.sections.map((s) => s.sectionId);
	const sections = db.select().from(t.planSection).where(inArray(t.planSection.id, sectionIds)).all();
	if (sections.length !== sectionIds.length || sections.some((s) => s.dayId !== b.dayId))
		error(403, 'Not this day');
	const ids = b.sections.flatMap((s) => s.ids);
	if (ids.length) {
		// every item must already belong to a section of this day
		const daySections = db
			.select({ id: t.planSection.id })
			.from(t.planSection)
			.where(eq(t.planSection.dayId, b.dayId))
			.all()
			.map((s) => s.id);
		const items = db.select().from(t.planItem).where(inArray(t.planItem.id, ids)).all();
		if (items.length !== ids.length || items.some((i) => !daySections.includes(i.sectionId)))
			error(403, 'Not this day');
	}
	db.transaction((tx) => {
		for (const s of b.sections)
			s.ids.forEach((id, position) =>
				tx
					.update(t.planItem)
					.set({ position, sectionId: s.sectionId, updatedBy: locals.userId })
					.where(eq(t.planItem.id, id))
					.run()
			);
	});
	return json({ ok: true });
};
