import type { BucketEntry } from '#lib/server/bucket.ts';

/** One line on where a bucket-list entry came from: "saved · skipped on Japan (Mar 2027)". */
export function bucketOrigin(e: BucketEntry): string {
	const parts: string[] = [];
	if (e.saved) parts.push('saved');
	for (const s of e.sources) parts.push(`${s.kind === 'been' ? 'been on' : 'skipped on'} ${s.trip}`);
	return parts.join(' · ');
}

/** A note worth carrying into a trip: your bucket note, else the first note from a trip. */
export const bucketNote = (e: BucketEntry) => e.notes ?? e.sources.find((s) => s.note)?.note ?? '';
