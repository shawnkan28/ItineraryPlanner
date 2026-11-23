import type {
	Attachment,
	Booking,
	Day,
	Decision,
	Idea,
	JournalEntry,
	Place,
	PlanItem,
	PlanSection,
	RouteStop,
	Stay,
	Trip
} from '$lib/server/db/schema';

/** Everything the exporter needs, loaded up front so the templates stay pure. */
export interface TripBundle {
	trip: Trip;
	places: Record<number, Place>;
	/** Stops of the chosen route option, in order (the Base table). */
	bases: RouteStop[];
	days: Day[];
	sections: PlanSection[];
	items: PlanItem[];
	stays: Stay[];
	bookings: Booking[];
	journals: JournalEntry[];
	attachments: Attachment[];
	decisions: Decision[];
	ideas: Idea[];
}

export interface ExportFile {
	path: string;
	content: string;
}

export interface ExportAttachment {
	/** Path inside the vault / zip */
	path: string;
	/** Absolute path of the stored file */
	source: string;
}
