import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import JSZip from 'jszip';
import { desc, eq } from 'drizzle-orm';
import { wikilinkTargets } from '$lib/export/links';
import type { ExportAttachment, ExportFile } from '$lib/export/types';
import { db, t } from './db';
import type { ExportedFile, PlaceLevel } from './db/schema';

export const ATTACHMENT_ROOT = resolve('data/attachments');

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

// ---------------------------------------------------------------------------------------------
// Frontmatter (just enough YAML for place notes)
// ---------------------------------------------------------------------------------------------

export function parseFrontmatter(md: string): Record<string, string | string[]> {
	const m = md.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!m) return {};
	const out: Record<string, string | string[]> = {};
	let key: string | null = null;
	for (const raw of m[1].split(/\r?\n/)) {
		const item = raw.match(/^\s+-\s+(.*)$/);
		if (item && key) {
			const arr = Array.isArray(out[key]) ? (out[key] as string[]) : [];
			arr.push(unquote(item[1]));
			out[key] = arr;
			continue;
		}
		const kv = raw.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (!kv) continue;
		key = kv[1];
		const v = kv[2].trim();
		if (v.startsWith('[') && v.endsWith(']') && !v.startsWith('[[')) {
			out[key] = v
				.slice(1, -1)
				.split(',')
				.map((s) => unquote(s.trim()))
				.filter(Boolean);
		} else out[key] = v ? unquote(v) : [];
	}
	return out;
}

const unquote = (s: string) => s.replace(/^["']|["']$/g, '').trim();
const linkName = (s: string) => s.replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null;

// ---------------------------------------------------------------------------------------------
// Places import (8): read-only scan of Travel/00-country .. Travel/04-place
// ---------------------------------------------------------------------------------------------

const LEVEL_BY_PREFIX: Record<string, PlaceLevel> = {
	'00': 'country',
	'01': 'region',
	'02': 'city',
	'03': 'area',
	'04': 'place'
};
const PARENT_KEYS: { key: string; level: PlaceLevel }[] = [
	{ key: 'area', level: 'area' },
	{ key: 'city', level: 'city' },
	{ key: 'region', level: 'region' },
	{ key: 'country', level: 'country' }
];
const RANK: Record<PlaceLevel, number> = { country: 0, region: 1, city: 2, area: 3, place: 4 };

function placeFolders(vault: string) {
	const travel = join(vault, 'Travel');
	if (!existsSync(travel)) return [];
	return readdirSync(travel)
		.filter((name) => /^0[0-4]-/.test(name) && statSync(join(travel, name)).isDirectory())
		.map((name) => ({ name, path: join(travel, name), level: LEVEL_BY_PREFIX[name.slice(0, 2)] }));
}

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(p));
		else if (entry.name.endsWith('.md')) out.push(p);
	}
	return out;
}

export function importPlaces(vault: string) {
	const found: {
		name: string;
		level: PlaceLevel;
		aliases: string[];
		vaultPath: string;
		parents: { name: string; level: PlaceLevel }[];
	}[] = [];
	for (const folder of placeFolders(vault)) {
		for (const file of walk(folder.path)) {
			const name = file.split(/[\\/]/).pop()!.replace(/\.md$/, '');
			const fm = parseFrontmatter(readFileSync(file, 'utf8'));
			const aliases = Array.isArray(fm.aliases) ? fm.aliases : fm.aliases ? [fm.aliases] : [];
			const parents = PARENT_KEYS.filter((p) => RANK[p.level] < RANK[folder.level])
				.map((p) => ({ name: first(fm[p.key]), level: p.level }))
				.filter((p): p is { name: string; level: PlaceLevel } => Boolean(p.name))
				.map((p) => ({ ...p, name: linkName(p.name) }));
			found.push({
				name,
				level: folder.level,
				aliases,
				vaultPath: file.slice(vault.length + 1).replace(/\\/g, '/'),
				parents
			});
		}
	}

	let created = 0;
	let updated = 0;
	db.transaction((tx) => {
		for (const p of found) {
			const existing = tx.select().from(t.place).where(eq(t.place.name, p.name)).get();
			if (existing) {
				tx.update(t.place)
					.set({ level: p.level, aliases: p.aliases, vaultPath: p.vaultPath })
					.where(eq(t.place.id, existing.id))
					.run();
				updated++;
			} else {
				tx.insert(t.place).values({ name: p.name, level: p.level, aliases: p.aliases, vaultPath: p.vaultPath }).run();
				created++;
			}
		}
		// parents: the most specific parent named in frontmatter
		const byName = new Map(tx.select().from(t.place).all().map((p) => [p.name, p]));
		for (const p of found) {
			const parent = p.parents.map((x) => byName.get(x.name)).find(Boolean);
			const self = byName.get(p.name);
			if (self && parent) tx.update(t.place).set({ parentId: parent.id }).where(eq(t.place.id, self.id)).run();
		}
	});
	return { scanned: found.length, created, updated };
}

/** Stub note for a place created in the app, with the same frontmatter as existing place notes. */
export function placeStub(placeId: number, vault: string | null): ExportFile | null {
	const places = db.select().from(t.place).all();
	const byId = new Map(places.map((p) => [p.id, p]));
	const p = byId.get(placeId);
	if (!p) return null;
	const chain: Record<string, string> = {};
	let cur = p.parentId ? byId.get(p.parentId) : undefined;
	while (cur) {
		chain[cur.level] = cur.name;
		cur = cur.parentId ? byId.get(cur.parentId) : undefined;
	}
	const folder =
		(vault && placeFolders(vault).find((f) => f.level === p.level)?.name) ||
		{ country: '00-country', region: '01-region', city: '02-city', area: '03-area', place: '04-place' }[p.level];
	const lines = ['---', 'tags:', '  - travel/place'];
	if (p.aliases.length) lines.push('aliases:', ...p.aliases.map((a) => `  - ${a}`));
	for (const level of ['area', 'city', 'region'] as const)
		if (RANK[level] < RANK[p.level]) lines.push(chain[level] ? `${level}: "[[${chain[level]}]]"` : `${level}:`);
	if (p.level !== 'country') lines.push(`country: "[[${chain.country ?? 'Japan'}]]"`);
	lines.push('travel_status: interest', '---', `# ${p.name}`, '');
	if (p.notes) lines.push(p.notes, '');
	return { path: `Travel/${folder}/${p.name}.md`, content: lines.join('\n') };
}

/** Wikilink targets in the export that don't match a place known to be in the vault. */
export function missingNotes(files: ExportFile[]) {
	const generated = new Set(files.map((f) => f.path.split('/').pop()!.replace(/\.md$/, '')));
	const places = db.select().from(t.place).all();
	const inVault = new Set(places.filter((p) => p.vaultPath).map((p) => p.name));
	const byName = new Map(places.map((p) => [p.name, p]));
	const missing = new Map<string, { name: string; placeId: number | null; usedIn: Set<string> }>();
	for (const f of files) {
		for (const target of wikilinkTargets(f.content)) {
			if (generated.has(target) || inVault.has(target)) continue;
			if (/^\d{4}-\d{2} .+ Trip$/.test(target)) continue; // trip hub, optional
			const m = missing.get(target) ?? { name: target, placeId: byName.get(target)?.id ?? null, usedIn: new Set() };
			m.usedIn.add(f.path.split('/').pop()!.replace(/\.md$/, ''));
			missing.set(target, m);
		}
	}
	return [...missing.values()].map((m) => ({ ...m, usedIn: [...m.usedIn] }));
}

// ---------------------------------------------------------------------------------------------
// Export planning and writing (7.5)
// ---------------------------------------------------------------------------------------------

export type FileStatus = 'new' | 'identical' | 'update' | 'conflict';

export interface PlannedFile extends ExportFile {
	status: FileStatus;
	vaultContent?: string;
}

export function lastExport(tripId: number, target?: string) {
	const runs = db
		.select()
		.from(t.exportRun)
		.where(eq(t.exportRun.tripId, tripId))
		.orderBy(desc(t.exportRun.id))
		.all();
	return target ? runs.find((r) => r.target === target) : runs[0];
}

/**
 * - not in the vault -> new
 * - same content -> identical
 * - vault file unchanged since our last export -> update (safe overwrite)
 * - vault file edited (or never exported by us) -> conflict, ask the user
 */
export function planVaultExport(tripId: number, vault: string, files: ExportFile[]): PlannedFile[] {
	const prev = new Map((lastExport(tripId, vault)?.files ?? []).map((f) => [f.path, f.hash]));
	return files.map((f) => {
		const abs = join(vault, f.path);
		if (!existsSync(abs)) return { ...f, status: 'new' };
		const current = readFileSync(abs, 'utf8');
		if (current === f.content) return { ...f, status: 'identical' };
		if (prev.get(f.path) === sha256(current)) return { ...f, status: 'update' };
		return { ...f, status: 'conflict', vaultContent: current };
	});
}

export type Resolution = 'overwrite' | 'skip' | 'copy';

export function writeVaultExport(
	tripId: number,
	vault: string,
	planned: PlannedFile[],
	resolutions: Record<string, Resolution>,
	attachments: ExportAttachment[]
) {
	const written: ExportedFile[] = [];
	const log: { path: string; action: string }[] = [];
	for (const f of planned) {
		let path = f.path;
		if (f.status === 'conflict') {
			const r = resolutions[f.path] ?? 'skip';
			if (r === 'skip') {
				log.push({ path, action: 'skipped' });
				continue;
			}
			if (r === 'copy') path = f.path.replace(/\.md$/, ' (app).md');
		}
		if (f.status !== 'identical') {
			mkdirSync(dirname(join(vault, path)), { recursive: true });
			writeFileSync(join(vault, path), f.content, { encoding: 'utf8' });
		}
		log.push({ path, action: f.status === 'identical' ? 'unchanged' : f.status === 'new' ? 'created' : 'written' });
		// Only record files written at their real path. After a "(app)" copy the vault note still has
		// the user's edits, so it must keep showing up as a conflict next time.
		if (path === f.path) written.push({ path, hash: sha256(f.content) });
	}
	for (const a of attachments) {
		const dest = join(vault, a.path);
		if (existsSync(dest) || !existsSync(a.source)) continue; // never overwrite images
		mkdirSync(dirname(dest), { recursive: true });
		copyFileSync(a.source, dest);
		log.push({ path: a.path, action: 'created' });
	}
	db.insert(t.exportRun)
		.values({ tripId, runAt: new Date().toISOString(), target: vault, files: written })
		.run();
	return log;
}

export async function buildZip(tripId: number, files: ExportFile[], attachments: ExportAttachment[]) {
	const zip = new JSZip();
	for (const f of files) zip.file(f.path, f.content);
	for (const a of attachments) if (existsSync(a.source)) zip.file(a.path, readFileSync(a.source));
	db.insert(t.exportRun)
		.values({
			tripId,
			runAt: new Date().toISOString(),
			target: 'zip',
			files: files.map((f) => ({ path: f.path, hash: sha256(f.content) }))
		})
		.run();
	return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// ---------------------------------------------------------------------------------------------
// Line diff (LCS) for the conflict view
// ---------------------------------------------------------------------------------------------

export type DiffLine = { op: ' ' | '+' | '-'; text: string };

export function lineDiff(before: string, after: string): DiffLine[] {
	const a = before.split('\n');
	const b = after.split('\n');
	if (a.length * b.length > 4_000_000) {
		return [...a.map((text) => ({ op: '-' as const, text })), ...b.map((text) => ({ op: '+' as const, text }))];
	}
	const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
	for (let i = a.length - 1; i >= 0; i--)
		for (let j = b.length - 1; j >= 0; j--)
			dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			out.push({ op: ' ', text: a[i] });
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: '-', text: a[i++] });
		else out.push({ op: '+', text: b[j++] });
	}
	while (i < a.length) out.push({ op: '-', text: a[i++] });
	while (j < b.length) out.push({ op: '+', text: b[j++] });
	return out;
}
