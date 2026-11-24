import type { RouteStop, StopKind, TransportMode } from './server/db/schema.ts';

type Stop = Pick<RouteStop, 'placeId' | 'label' | 'kind' | 'transportMode' | 'operator'>;
type NameOf = (placeId: number | null) => string | null | undefined;

/** Per-kind wording for the stop form. Kind is picked first; the rest of the form follows it. */
export const STOP_KINDS: Record<StopKind, { label: string; icon: string; place: string; placeHint: string; nights: number }> = {
	stay: { label: 'Stay', icon: '', place: 'City', placeHint: 'Where you sleep', nights: 1 },
	overnight_transport: {
		label: 'Overnight transport',
		icon: '⛴',
		place: 'Departs from',
		placeHint: "Becomes that day's city",
		nights: 1
	},
	depart: { label: 'Fly home / depart', icon: '✈', place: 'Flies home from', placeHint: 'Last day of the trip', nights: 0 }
};

export const TRANSPORT_MODES: TransportMode[] = ['ferry', 'bus', 'train', 'flight'];
export const MODE_ICON: Record<TransportMode, string> = { ferry: '⛴', bus: '🚌', train: '🚆', flight: '✈' };

/** "Beppu City" -> "Beppu" for labels. */
export const shortName = (name: string) => name.replace(/ City$/, '');

/**
 * Display title of a stop. An explicit label always wins. Overnight transport without a label is
 * named after where it goes: "Osaka → Beppu" (from this stop's city to the next stop's city).
 */
export function stopTitle(stop: Stop, next: Stop | null | undefined, nameOf: NameOf): string {
	if (stop.label) return stop.label;
	const here = nameOf(stop.placeId);
	if (stop.kind === 'overnight_transport') {
		const there = next ? nameOf(next.placeId) : null;
		if (here && there) return `${shortName(here)} → ${shortName(there)}`;
		if (here) return `${shortName(here)} →`;
		return 'Overnight transport';
	}
	return here ?? '';
}

/** True when the title is generated rather than typed (so the export should not link it). */
export const isAutoTitle = (stop: Stop) => !stop.label && stop.kind === 'overnight_transport';

/** Stay note for the day spent on overnight transport: "Overnight ferry (MOL Sunflower)". */
export function overnightStayNote(stop: Stop): string | null {
	if (stop.kind !== 'overnight_transport') return null;
	const what = `Overnight ${stop.transportMode ?? 'transport'}`;
	return stop.operator ? `${what} (${stop.operator})` : what;
}
