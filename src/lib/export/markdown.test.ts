import { describe, expect, it } from 'vitest';
import { cleanUrl, escapeTableCell, wikilinkTargets } from './links';
import { buildExport, dayNotePath, linkTitle, overviewPath, renderDayNote, renderOverview } from './markdown';
import type { TripBundle } from './types';

/**
 * Small fixture modelled on the 2027-03 Japan trip. When the real notes are available, copy them to
 * src/lib/export/fixtures/ and add a comparison test (see README).
 */
function fixture(): TripBundle {
	const place = (id: number, name: string, level: 'city' | 'area' | 'place' = 'place', aliases: string[] = []) => ({
		id,
		name,
		level,
		parentId: null,
		aliases,
		vaultPath: null,
		notes: null
	});
	const places = {
		1: place(1, 'Beppu City', 'city'),
		2: place(2, 'Kannawa', 'area'),
		3: place(3, 'Musoen', 'place', ['Musouen', 'Yama no Hotel Musouen']),
		4: place(4, 'Sunflower Ferry Terminal (Osaka)'),
		5: place(5, 'Osaka City', 'city')
	};
	return {
		trip: {
			id: 1,
			name: 'Japan',
			startDate: '2027-03-12',
			endDate: '2027-03-14',
			travellers: ['me', 'Brandon'],
			homeCurrency: 'SGD',
			status: 'planning',
			notes: null,
			createdBy: 1,
			updatedBy: 1
		},
		places,
		bases: [
			{ id: 10, routeOptionId: 1, position: 0, placeId: 5, label: null, nights: 1, startDate: '2027-03-12', kind: 'overnight_transport', transportMode: 'ferry', operator: 'MOL Sunflower' },
			{ id: 11, routeOptionId: 1, position: 1, placeId: 1, label: null, nights: 2, startDate: '2027-03-13', kind: 'stay', transportMode: null, operator: null }
		],
		days: [
			{ id: 1, tripId: 1, dayNumber: 1, date: '2027-03-12', titlePlaceId: 5, baseLabel: 'Ferry', summary: 'Osaka, then the night ferry', stayId: null, stayNote: 'Overnight ferry (MOL Sunflower)', createdBy: 1, updatedBy: 1 },
			{ id: 2, tripId: 1, dayNumber: 2, date: '2027-03-13', titlePlaceId: 1, baseLabel: '[[Beppu City|Beppu]]', summary: 'Hells of [[Kannawa]]', stayId: 1, stayNote: '(check-in)', createdBy: 1, updatedBy: 1 },
			{ id: 3, tripId: 1, dayNumber: 3, date: '2027-03-14', titlePlaceId: 1, baseLabel: 'Beppu', summary: 'Onsen day', stayId: 1, stayNote: null, createdBy: 1, updatedBy: 1 }
		],
		sections: [
			{ id: 1, dayId: 2, kind: 'focus', title: null, collapsed: false, position: 0 },
			{ id: 2, dayId: 2, kind: 'optional', title: null, collapsed: true, position: 1 },
			{ id: 3, dayId: 2, kind: 'booking', title: 'Ferry arrives 06:55', collapsed: false, position: 2 },
			{ id: 4, dayId: 2, kind: 'plan_b', title: 'Rain', collapsed: true, position: 3 }
		],
		items: [
			{ id: 1, sectionId: 1, position: 0, timeLabel: '07:55', sortTime: '07:55', title: 'Bus to Kannawa', placeId: 2, person: null, details: ['Bus 5 from the port'], links: [], createdBy: 1, updatedBy: 1 },
			{ id: 2, sectionId: 1, position: 1, timeLabel: null, sortTime: null, title: 'Lunch near the hells', placeId: null, person: null, details: [], links: [{ label: 'Menu', url: 'https://example.com/menu?utm_source=x&lang=en' }], createdBy: 1, updatedBy: 1 },
			{ id: 3, sectionId: 2, position: 0, timeLabel: '15:00', sortTime: null, title: 'Yama no Hotel Musouen day bath', placeId: 3, person: null, details: [], links: [], createdBy: 1, updatedBy: 1 },
			{ id: 4, sectionId: 3, position: 0, timeLabel: null, sortTime: null, title: 'Leave luggage at the hotel', placeId: null, person: null, details: [], links: [], createdBy: 1, updatedBy: 1 },
			{ id: 5, sectionId: 4, position: 0, timeLabel: '10:00', sortTime: null, title: 'Museum', placeId: null, person: 'Brandon', details: [], links: [], createdBy: 1, updatedBy: 1 }
		],
		stays: [
			{ id: 1, tripId: 1, baseId: 11, hotel: 'Umino Hotel Hajime', placeId: null, url: 'https://www.booking.com/hotel/jp/umino.html?aid=123&sid=abc&label=x&srpvid=9&curr=SGD', address: '1-2 Beppu', location: 'Kitahama / Beppu Station', priceMinor: 37705, currency: 'SGD', checkIn: '2027-03-13 15:00', checkOut: '2027-03-15', bookedVia: 'Booking.com', status: 'booked' }
		],
		bookings: [
			{ id: 1, tripId: 1, dayId: 1, planItemId: null, stayId: null, category: 'ferry', title: 'Ferry Osaka → Beppu', provider: 'MOL Sunflower', url: 'https://www.ferry-sunflower.co.jp/?utm_campaign=a', tasks: [{ text: 'Book cabin', done: true }, { text: 'Print ticket', done: false }], status: 'booked', opensOn: '2027-01-11', bookBy: null, confirmation: 'ABC123', priceMinor: null, currency: null, cancellation: null, notes: null },
			{ id: 2, tripId: 1, dayId: null, planItemId: null, stayId: null, category: 'check', title: 'Check the last ferry back', provider: null, url: null, tasks: [], status: 'to_book', opensOn: null, bookBy: null, confirmation: null, priceMinor: null, currency: null, cancellation: null, notes: null }
		],
		journals: [
			{ dayId: 2, quickSummary: null, highlights: 'Steam everywhere', lowlight: 'Crowds at Umi Jigoku', logMorning: 'Arrived on the ferry.', logAfternoon: 'Line one\nLine two', logEvening: '', breakfast: 'Ferry buffet', lunch: '', dinner: 'Toriten', tips: '- Buy the bus pass\n- Bring a towel', banner: null, updatedAt: null }
		],
		attachments: [],
		decisions: [
			{ id: 1, tripId: 1, question: 'Is anyone willing to drive?', options: [{ label: 'Rent a car' }, { label: 'Buses only' }], answer: null, notes: null, status: 'open' }
		],
		ideas: [
			{ id: 1, tripId: 1, baseId: 11, cityId: null, cityDayId: null, priority: 'maybe', priorityBeforeCitySkip: null, placeId: 4, position: 0, title: 'Ferry terminal museum', details: null, status: 'dropped', reason: 'too far out of the way' },
			{ id: 2, tripId: 1, baseId: 11, cityId: null, cityDayId: null, priority: 'maybe', priorityBeforeCitySkip: null, placeId: null, position: 1, title: 'Yufuin', details: null, status: 'parked', reason: null }
		]
	};
}

describe('links', () => {
	it('strips tracking params but keeps page params', () => {
		expect(
			cleanUrl('https://www.booking.com/hotel/jp/umino.html?aid=123&sid=abc&label=x&srpvid=9&curr=SGD')
		).toBe('https://www.booking.com/hotel/jp/umino.html?curr=SGD');
		expect(cleanUrl('https://www.klook.com/activity/1-x/?spm=a.b&clickId=z')).toBe(
			'https://www.klook.com/activity/1-x/'
		);
		expect(cleanUrl('https://example.com/?utm_source=a&utm_medium=b&q=1')).toBe(
			'https://example.com/?q=1'
		);
		// `type` is only treated as tracking on booking.com
		expect(cleanUrl('https://example.com/?type=tour')).toBe('https://example.com/?type=tour');
	});

	it('escapes pipes in table cells only once', () => {
		expect(escapeTableCell('[[Beppu City|Beppu]]')).toBe('[[Beppu City\\|Beppu]]');
		expect(escapeTableCell('[[Beppu City\\|Beppu]]')).toBe('[[Beppu City\\|Beppu]]');
	});

	it('finds wikilink targets', () => {
		expect(wikilinkTargets('[[A]] [[B|b]] [[C#x|c]] ![[img.png]] [[D\\|d]]')).toEqual(['A', 'B', 'C', 'D']);
	});
});

describe('linkTitle', () => {
	const b = fixture();
	it('links the place name in the title', () => {
		expect(linkTitle(b, 'Bus to Kannawa', 2)).toBe('Bus to [[Kannawa]]');
	});
	it('uses an alias as the label', () => {
		expect(linkTitle(b, 'Yama no Hotel Musouen day bath', 3)).toBe(
			'[[Musoen|Yama no Hotel Musouen]] day bath'
		);
	});
	it('appends the link if the place is not mentioned', () => {
		expect(linkTitle(b, 'Day bath', 3)).toBe('Day bath ([[Musoen]])');
	});
	it('leaves titles with links alone', () => {
		expect(linkTitle(b, 'Walk around [[Kannawa]]', 3)).toBe('Walk around [[Kannawa]]');
	});
});

describe('day note', () => {
	const b = fixture();

	it('uses the right path', () => {
		expect(dayNotePath(b, b.days[0])).toBe(
			'Travel/05-journals/2027-03 Japan Trip/2027-03-12 Japan Trip Day 01.md'
		);
	});

	it('renders day 2 like a hand-written note', () => {
		expect(renderDayNote(b, b.days[1])).toBe(`---
tags:
  - travel/journal
date: 2027-03-13
banner:
Trip: "[[2027-03 Japan Trip]]"
---

# Day 2: [[Beppu City]]
← [[2027-03-12 Japan Trip Day 01|Day 1]] · [[2027-03 Trip - Itinerary|Overview]] · [[2027-03-14 Japan Trip Day 03|Day 3]] →

---

> [!example] Quick Summary
> Hells of [[Kannawa]]

---

## Key Highlights & Logistics
* **Location:** [[Beppu City]]
* **Highlights:** Steam everywhere
* **Lowlight / Tip:** Crowds at Umi Jigoku

---
## Plan
**Stay:** Umino Hotel Hajime (check-in). Details in [[2027-03 Trip - Itinerary#Stays|Stays]]

> [!important|red] Ferry arrives 06:55
> - Leave luggage at the hotel
> - Booking and checks: [[2027-03 Trip - Itinerary#Bookings|Bookings checklist]]

> [!success] Focus
> - **07:55** · Bus to [[Kannawa]]
>     - Bus 5 from the port
> - **--:--** · Lunch near the hells
>     - [Menu](https://example.com/menu?lang=en)

> [!note|purple]- Optional
> - [[Musoen|Yama no Hotel Musouen]] day bath

> [!note|purple]- Plan B: Rain
> - **10:00** · Brandon: Museum

---
## The Log

### Morning: Arrived on the ferry.

### Afternoon:
Line one
Line two

### Evening:

---

## Food & Spots Logged
* **Breakfast:** Ferry buffet
* **Lunch:**
* **Dinner:** Toriten

---

## Notes for Future Visits / Tips
* Buy the bus pass
* Bring a towel
`);
	});

	it('has no back link on day 1 and no forward link on the last day', () => {
		const first = renderDayNote(b, b.days[0]);
		const last = renderDayNote(b, b.days[2]);
		expect(first).toContain('\n[[2027-03 Trip - Itinerary|Overview]] · [[2027-03-13 Japan Trip Day 02|Day 2]] →\n');
		expect(last).toContain('\n← [[2027-03-13 Japan Trip Day 02|Day 2]] · [[2027-03 Trip - Itinerary|Overview]]\n');
		expect(first).toContain('**Stay:** Overnight ferry (MOL Sunflower).');
	});

	it('skips sections without items', () => {
		const b2 = fixture();
		b2.items = b2.items.filter((i) => i.sectionId !== 2);
		expect(renderDayNote(b2, b2.days[1])).not.toContain('Optional');
	});

	it('uses \\n line endings and no BOM', () => {
		const note = renderDayNote(b, b.days[1]);
		expect(note.includes('\r')).toBe(false);
		expect(note.charCodeAt(0)).not.toBe(0xfeff);
	});
});

describe('overview', () => {
	const b = fixture();
	const note = renderOverview(b);

	it('uses the right path', () => {
		expect(overviewPath(b)).toBe('Travel/06-travel_notes/2027-03 Trip - Itinerary.md');
	});

	it('renders frontmatter and still to decide', () => {
		expect(note.startsWith(`---
tags:
  - travel/notes
  - travel/itinerary
dates: 12/Mar - 14/Mar 2027
backlinks:
  - "[[2027-03-12 Japan Trip Day 01]]"
---
# Itinerary
Overview of the final plan. Each day's plan is in its day note.

> [!question]+ Still to decide
> - **Is anyone willing to drive?:** Rent a car / Buses only
`)).toBe(true);
	});

	it('renders base and day tables with escaped pipes', () => {
		expect(note).toContain(`| Base | Nights | Dates |
| --- | --- | --- |
| Osaka → Beppu | 1 | 12/Mar |
| [[Beppu City]] | 2 | 13/Mar - 14/Mar |`);
		expect(note).toContain('| [[2027-03-13 Japan Trip Day 02\\|Day 2]] | Sat 13 | [[Beppu City\\|Beppu]] | Hells of [[Kannawa]] |');
	});

	it('renders stays with cleaned links', () => {
		expect(note).toContain(`#### [[Beppu City]] (13/Mar - 14/Mar)
> [!note|blue] Stay
> - Hotel: Umino Hotel Hajime
> - Link: [Booking.com](https://www.booking.com/hotel/jp/umino.html?curr=SGD)
> - Address: 1-2 Beppu
> - Location (area / nearest station): Kitahama / Beppu Station
> - Price: 377.05 SGD
> - Check-in 2027-03-13 15:00, check-out 2027-03-15
> - [x] Booked (Booking.com)`);
	});

	it('renders the bookings checklist', () => {
		expect(note).toContain(`> [!important|red] Bookings and checks
> **[[2027-03-12 Japan Trip Day 01|Day 1]] · Ferry Osaka → Beppu** ([MOL Sunflower](https://www.ferry-sunflower.co.jp/))
> - [x] Book cabin
> - [ ] Print ticket
> - Confirmation: ABC123
>
> **Check the last ferry back**
> - [ ] Book
`);
	});

	it('renders dropped / parked', () => {
		expect(note).toContain(`### Dropped / parked
- Dropped: [[Sunflower Ferry Terminal (Osaka)]] (too far out of the way)
- Parked (no day yet): Yufuin
`);
	});

	it('uses a typed label for overnight transport over the generated one', () => {
		const b2 = fixture();
		b2.bases[0].label = 'Sunflower ferry';
		expect(renderOverview(b2)).toContain('| Sunflower ferry | 1 | 12/Mar |');
	});

	it('omits still to decide with no open decisions', () => {
		const b2 = fixture();
		b2.decisions[0].status = 'decided';
		expect(renderOverview(b2)).not.toContain('Still to decide');
	});
});

describe('buildExport', () => {
	it('writes one note per day plus the overview', () => {
		const { files } = buildExport(fixture());
		expect(files.map((f) => f.path)).toEqual([
			'Travel/05-journals/2027-03 Japan Trip/2027-03-12 Japan Trip Day 01.md',
			'Travel/05-journals/2027-03 Japan Trip/2027-03-13 Japan Trip Day 02.md',
			'Travel/05-journals/2027-03 Japan Trip/2027-03-14 Japan Trip Day 03.md',
			'Travel/06-travel_notes/2027-03 Trip - Itinerary.md'
		]);
	});
});

describe('route stop titles', async () => {
	const { stopTitle, overnightStayNote } = await import('../route.ts');
	const names: Record<number, string> = { 1: 'Osaka City', 2: 'Beppu City' };
	const nameOf = (id: number | null) => (id ? names[id] : null);
	const ferry = { placeId: 1, label: null, kind: 'overnight_transport' as const, transportMode: 'ferry' as const, operator: 'MOL Sunflower' };
	const beppu = { placeId: 2, label: null, kind: 'stay' as const, transportMode: null, operator: null };

	it('names overnight transport after where it goes', () => {
		expect(stopTitle(ferry, beppu, nameOf)).toBe('Osaka → Beppu');
		expect(stopTitle(ferry, null, nameOf)).toBe('Osaka →');
		expect(stopTitle({ ...ferry, placeId: null }, beppu, nameOf)).toBe('Overnight transport');
	});
	it('keeps the city for normal stays', () => {
		expect(stopTitle(beppu, null, nameOf)).toBe('Beppu City');
	});
	it('builds the stay note', () => {
		expect(overnightStayNote(ferry)).toBe('Overnight ferry (MOL Sunflower)');
		expect(overnightStayNote({ ...ferry, operator: null, transportMode: 'bus' })).toBe('Overnight bus');
		expect(overnightStayNote(beppu)).toBeNull();
	});
});
