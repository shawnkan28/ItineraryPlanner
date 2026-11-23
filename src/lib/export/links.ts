/** Query parameters that only track the visit and never change the page, on any site. */
const TRACKING_PARAMS = new Set([
	// Klook
	'spm',
	'clickId',
	'click_id',
	'clickid',
	// Trip.com
	'allianceid',
	'ouid',
	'locale_from',
	// Ads / social
	'fbclid',
	'gclid',
	'gbraid',
	'wbraid',
	'msclkid',
	'yclid',
	'mc_eid',
	'mc_cid',
	'_gl',
	'_ga',
	'ref_src'
]);

/** Booking.com session / search-result parameters (only stripped on booking.com). */
const BOOKING_COM_PARAMS = new Set([
	'aid',
	'sid',
	'label',
	'srpvid',
	'srepoch',
	'sr_order',
	'sr_pri_blocks',
	'ucfs',
	'hpos',
	'hapos',
	'all_sr_blocks',
	'highlighted_blocks',
	'matching_block_id',
	'sb_price_type',
	'dest_id',
	'dest_type',
	'dist',
	'type',
	'activeTab',
	'from',
	'from_sustainable_property_sr'
]);

/**
 * Strip tracking and session parameters (Booking.com aid/sid/label/srpvid..., Klook spm/clickId,
 * any utm_*). Parameters that change the page (e.g. curr=SGD, checkin) are kept.
 */
export function cleanUrl(raw: string | null | undefined): string {
	if (!raw) return '';
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return raw.trim();
	}
	for (const key of [...url.searchParams.keys()]) {
		const isBookingCom = /(^|\.)booking\.com$/.test(url.hostname);
		if (
			key.toLowerCase().startsWith('utm_') ||
			TRACKING_PARAMS.has(key) ||
			(isBookingCom && BOOKING_COM_PARAMS.has(key))
		) {
			url.searchParams.delete(key);
		}
	}
	// Booking.com sometimes puts the session in the path: /hotel/jp/x.html;sid=...
	url.pathname = url.pathname.replace(/;[^/]*$/, '');
	url.hash = url.hash === '#' ? '' : url.hash;
	let out = url.toString();
	if (out.endsWith('?')) out = out.slice(0, -1);
	return out;
}

/** Escape pipes for markdown table cells. `[[A|b]]` becomes `[[A\|b]]`; already escaped pipes stay. */
export function escapeTableCell(text: string | null | undefined): string {
	return (text ?? '').replace(/\r?\n/g, ' ').replace(/(?<!\\)\|/g, '\\|');
}

export function wikilink(name: string, label?: string | null): string {
	return label && label !== name ? `[[${name}|${label}]]` : `[[${name}]]`;
}

/** All link targets in a note: `[[Target#heading|label]]` -> `Target`. */
export function wikilinkTargets(markdown: string): string[] {
	const out: string[] = [];
	for (const m of markdown.matchAll(/!?\[\[([^\]]+?)\]\]/g)) {
		if (m[0].startsWith('!')) continue;
		const target = m[1].split(/\\?\|/)[0].split('#')[0].trim();
		if (target) out.push(target);
	}
	return out;
}
