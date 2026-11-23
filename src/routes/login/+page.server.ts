import { fail, redirect } from '@sveltejs/kit';
import { authEnabled, checkPassword, createSession, SESSION_COOKIE } from '$lib/server/auth';

export const load = ({ locals }) => {
	if (!authEnabled() || locals.userId) redirect(303, '/');
};

export const actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		if (!checkPassword(password)) return fail(400, { error: 'Wrong password' });
		const session = createSession(1);
		cookies.set(SESSION_COOKIE, session.value, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: session.maxAge
		});
		const next = url.searchParams.get('next');
		redirect(303, next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
	}
};
