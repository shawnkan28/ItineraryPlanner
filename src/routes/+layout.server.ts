import { authEnabled } from '#lib/server/auth.ts';

export const load = ({ locals }) => ({
	authEnabled: authEnabled(),
	loggedIn: Boolean(locals.userId)
});
