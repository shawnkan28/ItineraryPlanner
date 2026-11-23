import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildExport, type ExportOptions } from '$lib/export/markdown';
import type { ExportFile } from '$lib/export/types';
import { loadBundle } from './repo';
import { ATTACHMENT_ROOT, missingNotes, placeStub } from './vault';

export interface ExportChoice extends ExportOptions {
	stubs?: boolean;
}

export function choiceFromParams(p: URLSearchParams | FormData): ExportChoice {
	const on = (k: string, dflt: boolean) => (p.has(k) ? p.get(k) === '1' || p.get(k) === 'on' : dflt);
	return {
		days: on('days', true),
		overview: on('overview', true),
		hub: on('hub', false),
		attachments: on('attachments', true),
		stubs: on('stubs', false)
	};
}

/** Build every file for this export, plus stub notes for missing places if asked. */
export function prepareExport(tripId: number, choice: ExportChoice, vault: string | null) {
	const bundle = loadBundle(tripId);
	const { files, attachments } = buildExport(bundle, { ...choice, attachmentRoot: ATTACHMENT_ROOT });
	const missing = missingNotes(files);
	const stubs: ExportFile[] = [];
	if (choice.stubs) {
		for (const m of missing) {
			if (!m.placeId) continue;
			const stub = placeStub(m.placeId, vault);
			// never touch an existing place note
			if (stub && !(vault && existsSync(join(vault, stub.path)))) stubs.push(stub);
		}
	}
	return { bundle, files: [...files, ...stubs], attachments, missing };
}
