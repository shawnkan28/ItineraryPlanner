import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db, t } from '$lib/server/db';
import { loadBundle, resolvePlace, tripId } from '$lib/server/repo';
import { daySchema, parseForm } from '$lib/schemas';

export const load = ({ params }) => {
	const b = loadBundle(tripId(params));
	const itemCount = Object.fromEntries(
		b.days.map((d) => {
			const sids = new Set(b.sections.filter((s) => s.dayId === d.id).map((s) => s.id));
			return [d.id, b.items.filter((i) => sids.has(i.sectionId)).length];
		})
	);
	const journaled = new Set(
		b.journals.filter((j) => j.logMorning || j.logAfternoon || j.logEvening || j.highlights).map((j) => j.dayId)
	);
	return {
		fullDays: b.days,
		stays: b.stays,
		decisions: b.decisions.filter((d) => d.status === 'open'),
		dropped: b.ideas.filter((i) => i.status === 'dropped' || i.status === 'parked'),
		itemCount,
		journaled: [...journaled]
	};
};

export const actions = {
	updateDay: async ({ params, request, locals }) => {
		const id = tripId(params);
		const f = await request.formData();
		const day = db
			.select()
			.from(t.day)
			.where(and(eq(t.day.id, Number(f.get('dayId'))), eq(t.day.tripId, id)))
			.get();
		if (!day) return fail(404);
		const parsed = parseForm(daySchema, f);
		if (!parsed.ok) return fail(400, parsed);
		const { titlePlaceName, ...rest } = parsed.data;
		db.update(t.day)
			.set({
				baseLabel: rest.baseLabel,
				summary: rest.summary,
				titlePlaceId: resolvePlace(titlePlaceName, 'city'),
				updatedBy: locals.userId
			})
			.where(eq(t.day.id, day.id))
			.run();
	}
};
