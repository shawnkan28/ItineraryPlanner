import { fail } from '@sveltejs/kit';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db, t } from '#lib/server/db/index.ts';
import { allPlaces, findPlace } from '#lib/server/repo.ts';
import { parseForm, placeSchema } from '#lib/schemas.ts';

export const load = () => {
	const usage = db
		.select({
			id: t.place.id,
			n: sql<number>`(select count(*) from plan_item where place_id = ${t.place.id})
				+ (select count(*) from day where title_place_id = ${t.place.id})
				+ (select count(*) from route_stop where place_id = ${t.place.id})
				+ (select count(*) from idea where place_id = ${t.place.id})
				+ (select count(*) from stay where place_id = ${t.place.id})`
		})
		.from(t.place)
		.all();
	return { allPlaces: allPlaces(), usage: Object.fromEntries(usage.map((u) => [u.id, u.n])) };
};

function parentId(name: string | null) {
	return name ? (findPlace(name)?.id ?? null) : null;
}

export const actions = {
	add: async ({ request }) => {
		const parsed = parseForm(placeSchema, await request.formData());
		if (!parsed.ok) return fail(400, { ...parsed, formId: 'new' });
		const { parentName, ...rest } = parsed.data;
		if (db.select().from(t.place).where(eq(t.place.name, rest.name)).get())
			return fail(400, { formId: 'new', errors: { name: 'A place with this name exists' } });
		db.insert(t.place).values({ ...rest, parentId: parentId(parentName) }).run();
	},
	update: async ({ request }) => {
		const f = await request.formData();
		const id = Number(f.get('placeId'));
		const parsed = parseForm(placeSchema, f);
		if (!parsed.ok) return fail(400, { ...parsed, formId: String(id) });
		const { parentName, ...rest } = parsed.data;
		const clash = db.select().from(t.place).where(and(eq(t.place.name, rest.name), ne(t.place.id, id))).get();
		if (clash) return fail(400, { formId: String(id), errors: { name: 'A place with this name exists' } });
		const parent = parentId(parentName);
		db.update(t.place)
			.set({ ...rest, parentId: parent === id ? null : parent })
			.where(eq(t.place.id, id))
			.run();
	},
	delete: async ({ request }) => {
		const f = await request.formData();
		const id = Number(f.get('placeId'));
		db.update(t.place).set({ parentId: null }).where(eq(t.place.parentId, id)).run();
		db.delete(t.place).where(eq(t.place.id, id)).run();
	}
};
