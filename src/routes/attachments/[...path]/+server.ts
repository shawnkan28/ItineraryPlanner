import { error } from '@sveltejs/kit';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { ATTACHMENT_ROOT } from '$lib/server/vault';

const TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	pdf: 'application/pdf'
};

export const GET = ({ params }) => {
	const file = resolve(ATTACHMENT_ROOT, params.path);
	if (!file.startsWith(ATTACHMENT_ROOT + sep) || !existsSync(file)) error(404, 'Not found');
	const ext = file.split('.').pop()?.toLowerCase() ?? '';
	return new Response(readFileSync(file), {
		headers: {
			'content-type': TYPES[ext] ?? 'application/octet-stream',
			'cache-control': 'private, max-age=86400'
		}
	});
};
