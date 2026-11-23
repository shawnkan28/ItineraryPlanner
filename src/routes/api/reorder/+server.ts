import { error, json } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, t } from '$lib/server/db';

const body = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('ideas'),
		tripId: z.number().int(),
		columns: z.array(z.object({ baseId: z.number().int().nullable(), ids: z.array(z.number().int()) }))
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
		db.transaction((tx) => {
			for (const col of b.columns)
				col.ids.forEach((id, position) =>
					tx.update(t.idea).set({ position, baseId: col.baseId }).where(eq(t.idea.id, id)).run()
				);
		});
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
