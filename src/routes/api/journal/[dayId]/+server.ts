import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, t } from '#lib/server/db/index.ts';
import { journalSchema } from '#lib/schemas.ts';

export const GET = ({ params }) => {
	const entry = db.select().from(t.journalEntry).where(eq(t.journalEntry.dayId, Number(params.dayId))).get();
	return json(entry ?? null);
};

/**
 * Save a journal entry. Sent by the journal editor (debounced while typing, and again from the
 * offline draft queue when the phone is back online). `baseUpdatedAt` lets us warn when the server
 * copy changed since the draft was started, so a stale draft never silently overwrites newer text.
 */
export const PUT = async ({ params, request }) => {
	const dayId = Number(params.dayId);
	const day = db.select().from(t.day).where(eq(t.day.id, dayId)).get();
	if (!day) error(404, 'Day not found');
	const body = await request.json();
	const parsed = journalSchema.safeParse(body.entry);
	if (!parsed.success) error(400, 'Bad journal entry');

	const current = db.select().from(t.journalEntry).where(eq(t.journalEntry.dayId, dayId)).get();
	if (
		current?.updatedAt &&
		body.baseUpdatedAt !== undefined &&
		body.baseUpdatedAt !== current.updatedAt &&
		!body.force
	) {
		return json({ conflict: true, server: current }, { status: 409 });
	}

	const updatedAt = new Date().toISOString();
	const values = { ...parsed.data, dayId, updatedAt };
	db.insert(t.journalEntry)
		.values(values)
		.onConflictDoUpdate({ target: t.journalEntry.dayId, set: values })
		.run();
	return json({ ok: true, updatedAt });
};
