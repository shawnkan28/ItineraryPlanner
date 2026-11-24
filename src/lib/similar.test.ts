import { describe, expect, it } from 'vitest';
import { similarPlace } from './similar.ts';

describe('similarPlace', () => {
	it.each([
		['Kuromon Market', 'kuromon market'],
		['Kuromon Market', 'Kuromon'],
		['Dotonbori', 'Dōtonbori'],
		['Dotonbori', 'Dotombori'],
		['Glover Garden', 'Glover Gardens'],
		['Umeda Sky Building', 'Umeda Sky-Building'],
		['Hells of Beppu', 'Hells of beppu'],
		['Nara Park', 'Nara']
	])('%s ~ %s', (a, b) => expect(similarPlace(a, b)).toBe(true));

	it.each([
		['Osaka Castle', 'Osaka Aquarium'],
		['Osaka Castle', 'Osaka Station'],
		['Umeda', 'Umeki'],
		['Kyoto Tower', 'Tokyo Tower'],
		['', 'Nara']
	])('%s ≁ %s', (a, b) => expect(similarPlace(a, b)).toBe(false));
});
