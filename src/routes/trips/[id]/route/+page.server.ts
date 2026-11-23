import { fail } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, t } from '#lib/server/db/index.ts';
import { chooseRoute, dateStops, resolvePlace, stopsOf, tripId } from '#lib/server/repo.ts';
import { parseForm, routeStopSchema } from '#lib/schemas.ts';

export const load = ({ params }) => {
	const id = tripId(params);
	const options = db
		.select()
		.from(t.routeOption)
		.where(eq(t.routeOption.tripId, id))
		.orderBy(asc(t.routeOption.id))
		.all()
		.map((o) => ({ ...o, stops: stopsOf(o.id) }));
	return { options };
};

/** Make sure an option id belongs to this trip. */
function ownOption(tripId: number, optionId: number) {
	return db
		.select()
		.from(t.routeOption)
		.where(and(eq(t.routeOption.id, optionId), eq(t.routeOption.tripId, tripId)))
		.get();
}

function stopWithOption(tripId: number, stopId: number) {
	const stop = db.select().from(t.routeStop).where(eq(t.routeStop.id, stopId)).get();
	return stop && ownOption(tripId, stop.routeOptionId) ? stop : null;
}

const num = (f: FormData, k: string) => Number(f.get(k));

export const actions = {
	addOption: async ({ params, request }) => {
		const id = tripId(params);
		const f = await request.formData();
		const copyFrom = num(f, 'copyFrom');
		const count = db
			.select({ n: sql<number>`count(*)` })
			.from(t.routeOption)
			.where(eq(t.routeOption.tripId, id))
			.get()!.n;
		const name = String(f.get('name') || `Option ${String.fromCharCode(65 + count)}`);
		const opt = db.insert(t.routeOption).values({ tripId: id, name }).returning().get();
		if (copyFrom && ownOption(id, copyFrom)) {
			for (const s of stopsOf(copyFrom)) {
				db.insert(t.routeStop)
					.values({
						routeOptionId: opt.id,
						position: s.position,
						placeId: s.placeId,
						label: s.label,
						nights: s.nights,
						kind: s.kind
					})
					.run();
			}
		}
	},
	updateOption: async ({ params, request }) => {
		const f = await request.formData();
		const opt = ownOption(tripId(params), num(f, 'optionId'));
		if (!opt) return fail(404);
		db.update(t.routeOption)
			.set({
				name: String(f.get('name') || opt.name),
				notes: f.has('notes') ? String(f.get('notes')) || null : opt.notes
			})
			.where(eq(t.routeOption.id, opt.id))
			.run();
	},
	deleteOption: async ({ params, request }) => {
		const f = await request.formData();
		const opt = ownOption(tripId(params), num(f, 'optionId'));
		if (!opt) return fail(404);
		if (opt.isChosen)
			return fail(400, { error: 'The chosen route cannot be deleted. Choose another one first.' });
		db.delete(t.routeOption).where(eq(t.routeOption.id, opt.id)).run();
	},
	choose: async ({ params, request }) => {
		const id = tripId(params);
		const f = await request.formData();
		const opt = ownOption(id, num(f, 'optionId'));
		if (!opt) return fail(404);
		chooseRoute(id, opt.id);
		return { chosen: opt.name };
	},
	addStop: async ({ params, request }) => {
		const id = tripId(params);
		const f = await request.formData();
		const opt = ownOption(id, num(f, 'optionId'));
		if (!opt) return fail(404);
		const parsed = parseForm(routeStopSchema, f);
		if (!parsed.ok) return fail(400, parsed);
		const max = db
			.select({ n: sql<number>`coalesce(max(position), -1)` })
			.from(t.routeStop)
			.where(eq(t.routeStop.routeOptionId, opt.id))
			.get()!.n;
		db.insert(t.routeStop)
			.values({
				routeOptionId: opt.id,
				position: max + 1,
				placeId: resolvePlace(parsed.data.placeName, 'city'),
				label: parsed.data.label,
				nights: parsed.data.nights,
				kind: parsed.data.kind
			})
			.run();
		if (opt.isChosen) dateStops(id, opt.id);
	},
	updateStop: async ({ params, request }) => {
		const id = tripId(params);
		const f = await request.formData();
		const stop = stopWithOption(id, num(f, 'stopId'));
		if (!stop) return fail(404);
		const parsed = parseForm(routeStopSchema, f);
		if (!parsed.ok) return fail(400, parsed);
		db.update(t.routeStop)
			.set({
				placeId: resolvePlace(parsed.data.placeName, 'city'),
				label: parsed.data.label,
				nights: parsed.data.nights,
				kind: parsed.data.kind
			})
			.where(eq(t.routeStop.id, stop.id))
			.run();
		dateStops(id, stop.routeOptionId);
	},
	moveStop: async ({ params, request }) => {
		const id = tripId(params);
		const f = await request.formData();
		const stop = stopWithOption(id, num(f, 'stopId'));
		if (!stop) return fail(404);
		const stops = stopsOf(stop.routeOptionId);
		const i = stops.findIndex((s) => s.id === stop.id);
		const j = f.get('dir') === 'up' ? i - 1 : i + 1;
		if (j < 0 || j >= stops.length) return;
		[stops[i], stops[j]] = [stops[j], stops[i]];
		stops.forEach((s, pos) =>
			db.update(t.routeStop).set({ position: pos }).where(eq(t.routeStop.id, s.id)).run()
		);
		dateStops(id, stop.routeOptionId);
	},
	deleteStop: async ({ params, request }) => {
		const id = tripId(params);
		const f = await request.formData();
		const stop = stopWithOption(id, num(f, 'stopId'));
		if (!stop) return fail(404);
		db.delete(t.routeStop).where(eq(t.routeStop.id, stop.id)).run();
		dateStops(id, stop.routeOptionId);
	}
};
