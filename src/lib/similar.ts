/**
 * Loose matching for place names, to warn about ideas that are probably the same place
 * ("Kuromon Market" vs "kuromon", "Dotonbori" vs "Dōtonbori", "Glover Garden" vs "Glover Gardens").
 */

/** Words that describe a kind of place; "Kuromon" and "Kuromon Market" are the same place. */
const GENERIC = new Set([
	'the', 'city', 'station', 'park', 'garden', 'gardens', 'temple', 'shrine', 'market', 'museum',
	'castle', 'tower', 'street', 'onsen', 'beach', 'mall', 'jinja', 'ji', 'dera', 'eki'
]);

/** Lowercase words, accents and punctuation stripped. */
export function placeWords(name: string): string[] {
	return name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.split(' ')
		.filter((w) => w && w !== 'the');
}

function editDistance(a: string, b: string): number {
	if (a === b) return 0;
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		for (let j = 1; j <= b.length; j++)
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		prev = cur;
	}
	return prev[b.length];
}

/** True when two place names very likely mean the same place. */
export function similarPlace(a: string, b: string): boolean {
	const x = placeWords(a);
	const y = placeWords(b);
	if (!x.length || !y.length) return false;
	const jx = x.join('');
	const jy = y.join('');
	if (jx === jy) return true; // spacing / punctuation / case only
	// same distinctive words, differing only by generic ones ("Kuromon" vs "Kuromon Market")
	// but not "Osaka Castle" vs "Osaka Station", where both name a different kind of place
	const core = (w: string[]) => w.filter((v) => !GENERIC.has(v)).join(' ');
	const kinds = (w: string[]) => w.filter((v) => GENERIC.has(v));
	const cx = core(x);
	const cy = core(y);
	if (cx && cx === cy) {
		const kx = kinds(x);
		const ky = kinds(y);
		if (kx.every((k) => ky.includes(k)) || ky.every((k) => kx.includes(k))) return true;
	}
	// small typos, scaled to length ("Dotonbori" vs "Dotombori")
	const long = Math.max(jx.length, jy.length);
	const allowed = long >= 10 ? 2 : long >= 6 ? 1 : 0;
	return allowed > 0 && editDistance(jx, jy) <= allowed;
}
