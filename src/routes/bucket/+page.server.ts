import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, t } from '#lib/server/db/index.ts';
import { bucketEntries } from '#lib/server/bucket.ts';
import { allPlaces, resolvePlace } from '#lib/server/repo.ts';
import { bucketSchema, parseForm } from '#lib/schemas.ts';

export const load = () => ({
	entries: bucketEntries({ includeHidden: true }),
	places: allPlaces().map((p) => ({ id: p.id, name: p.name, level: p.level, aliases: p.aliases }))
});

const placeIdOf = (f: FormData) => {
	const id = Number(f.get('placeId'));
	return Number.isInteger(id) && db.select().from(t.place).where(eq(t.place.id, id)).get() ? id : null;
};

/** Insert or update the bucket row for a place. */
function upsert(placeId: number, values: { status?: 'saved' | 'hidden'; notes?: string | null }) {
	const row = db.select().from(t.bucketItem).where(eq(t.bucketItem.placeId, placeId)).get();
	if (row) db.update(t.bucketItem).set(values).where(eq(t.bucketItem.id, row.id)).run();
	else db.insert(t.bucketItem).values({ placeId, status: 'saved', ...values }).run();
}

const CITY_LEVELS = ['country', 'region', 'city', 'area'];

/**
 * Pin a place to its city (place.parent_id) so it pops up in that city's ideas on any trip.
 * `cityName` null clears it. Places only; a city has no parent city.
 */
function setCity(placeId: number, cityName: string | null) {
	const cityId = cityName ? resolvePlace(cityName, 'city') : null;
	if (cityId === placeId) return;
	db.update(t.place).set({ parentId: cityId }).where(eq(t.place.id, placeId)).run();
}

export const actions = {
	/** Add a place by hand. A place inside a city remembers that city (as its parent). */
	add: async ({ request }) => {
		const parsed = parseForm(bucketSchema, await request.formData());
		if (!parsed.ok) return fail(400, { errors: parsed.errors });
		const { placeName, kind, cityName, notes } = parsed.data;
		const placeId = resolvePlace(placeName, kind === 'city' ? 'city' : 'place')!;
		if (kind === 'place' && cityName) setCity(placeId, cityName);
		upsert(placeId, { status: 'saved', notes });
	},
	/**
	 * Save something that came from a trip. A place skipped inside a city keeps that city,
	 * so it shows up there next time.
	 */
	save: async ({ request }) => {
		const f = await request.formData();
		const placeId = placeIdOf(f);
		if (!placeId) return fail(404);
		const e = bucketEntries({ includeHidden: true }).find((x) => x.placeId === placeId);
		const p = db.select().from(t.place).where(eq(t.place.id, placeId)).get()!;
		if (e && !e.isCity && e.cityName && !p.parentId) setCity(placeId, e.cityName);
		upsert(placeId, { status: 'saved', notes: e?.notes ?? e?.sources.find((s) => s.note)?.note ?? null });
	},
	/** Edit an entry (kind, city, note). Editing saves it. */
	update: async ({ request }) => {
		const f = await request.formData();
		const placeId = placeIdOf(f);
		if (!placeId) return fail(404);
		const p = db.select().from(t.place).where(eq(t.place.id, placeId)).get()!;
		const kind = f.get('kind') === 'city' ? 'city' : 'place';
		const isCity = CITY_LEVELS.includes(p.level);
		if (kind === 'city' && !isCity) db.update(t.place).set({ level: 'city', parentId: null }).where(eq(t.place.id, placeId)).run();
		if (kind === 'place') {
			if (isCity) db.update(t.place).set({ level: 'place' }).where(eq(t.place.id, placeId)).run();
			setCity(placeId, String(f.get('cityName') ?? '').trim() || null);
		}
		upsert(placeId, { status: 'saved', notes: String(f.get('notes') ?? '').trim() || null });
	},
	hide: async ({ request }) => {
		const f = await request.formData();
		const placeId = placeIdOf(f);
		if (!placeId) return fail(404);
		upsert(placeId, { status: 'hidden' });
	},
	/** Unsave / unhide: back to whatever the trips say about it. */
	reset: async ({ request }) => {
		const f = await request.formData();
		const placeId = placeIdOf(f);
		if (!placeId) return fail(404);
		db.delete(t.bucketItem).where(eq(t.bucketItem.placeId, placeId)).run();
	}
};
