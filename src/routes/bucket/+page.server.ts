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

export const actions = {
	/** Add a place by hand. A place inside a city remembers that city (as its parent). */
	add: async ({ request }) => {
		const parsed = parseForm(bucketSchema, await request.formData());
		if (!parsed.ok) return fail(400, { errors: parsed.errors });
		const { placeName, kind, cityName, notes } = parsed.data;
		const placeId = resolvePlace(placeName, kind === 'city' ? 'city' : 'place')!;
		if (kind === 'place' && cityName) {
			const cityId = resolvePlace(cityName, 'city')!;
			const p = db.select().from(t.place).where(eq(t.place.id, placeId)).get()!;
			if (!p.parentId && cityId !== placeId) db.update(t.place).set({ parentId: cityId }).where(eq(t.place.id, placeId)).run();
		}
		upsert(placeId, { status: 'saved', notes });
	},
	save: async ({ request }) => {
		const f = await request.formData();
		const placeId = placeIdOf(f);
		if (!placeId) return fail(404);
		upsert(placeId, { status: 'saved' });
	},
	notes: async ({ request }) => {
		const f = await request.formData();
		const placeId = placeIdOf(f);
		if (!placeId) return fail(404);
		upsert(placeId, { notes: String(f.get('notes') ?? '').trim() || null });
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
