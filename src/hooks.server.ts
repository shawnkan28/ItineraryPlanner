import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { authEnabled, readSession, SESSION_COOKIE } from '#lib/server/auth.ts';

const PUBLIC = ['/login', '/ics/'];

export const handle: Handle = async ({ event, resolve }) => {
	if (!authEnabled()) {
		event.locals.userId = 1;
		return resolve(event);
	}
	event.locals.userId = readSession(event.cookies.get(SESSION_COOKIE));
	const path = event.url.pathname;
	if (!event.locals.userId && !PUBLIC.some((p) => path.startsWith(p))) {
		if (path.startsWith('/api/')) return new Response('Unauthorized', { status: 401 });
		redirect(303, `/login?next=${encodeURIComponent(path + event.url.search)}`);
	}
	return resolve(event);
};
