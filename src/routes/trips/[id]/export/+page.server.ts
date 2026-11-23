import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { db, t } from '#lib/server/db/index.ts';
import { choiceFromParams, prepareExport } from '#lib/server/exporter.ts';
import { tripId } from '#lib/server/repo.ts';
import { vaultPath } from '#lib/server/settings.ts';
import {
	lastExport,
	lineDiff,
	planVaultExport,
	writeVaultExport,
	type PlannedFile,
	type Resolution
} from '#lib/server/vault.ts';

export const load = ({ params, url }) => {
	const id = tripId(params);
	const choice = choiceFromParams(url.searchParams);
	const vault = vaultPath();
	const vaultOk = Boolean(vault && existsSync(vault));
	const { files, attachments, missing } = prepareExport(id, choice, vault);
	const planned: PlannedFile[] = vaultOk
		? planVaultExport(id, vault!, files)
		: files.map((f) => ({ ...f, status: 'new' as const }));
	return {
		choice,
		vault,
		vaultOk,
		files: planned.map((f) => ({
			path: f.path,
			content: f.content,
			status: f.status,
			diff: f.status === 'conflict' ? lineDiff(f.vaultContent ?? '', f.content) : null
		})),
		attachments: attachments.map((a) => a.path),
		missing,
		last: lastExport(id) ?? null
	};
};

export const actions = {
	write: async ({ params, request }) => {
		const id = tripId(params);
		const vault = vaultPath();
		if (!vault || !existsSync(vault)) return fail(400, { error: 'Vault path is not set or not found. Set it in Settings, or download a zip.' });
		const f = await request.formData();
		const choice = choiceFromParams(f);
		const { files, attachments } = prepareExport(id, choice, vault);
		const planned = planVaultExport(id, vault, files);
		const resolutions: Record<string, Resolution> = {};
		for (const p of planned) {
			const r = f.get(`resolve:${p.path}`);
			if (r === 'overwrite' || r === 'skip' || r === 'copy') resolutions[p.path] = r;
		}
		const log = writeVaultExport(id, vault, planned, resolutions, attachments);
		db.update(t.trip).set({ status: 'exported' }).where(eq(t.trip.id, id)).run();
		return { log };
	}
};
