import { createHmac, timingSafeEqual } from 'node:crypto';
import { APP_PASSWORD, SESSION_SECRET } from '$app/env/private';

export const SESSION_COOKIE = 'ip_session';
const MAX_AGE = 60 * 60 * 24 * 60; // 60 days: the phone stays logged in for the whole trip

export const authEnabled = () => Boolean(APP_PASSWORD);

function secret() {
	return SESSION_SECRET || APP_PASSWORD || 'dev-secret';
}

function sign(payload: string) {
	return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSession(userId: number) {
	const payload = `${userId}.${Date.now() + MAX_AGE * 1000}`;
	return { value: `${payload}.${sign(payload)}`, maxAge: MAX_AGE };
}

export function readSession(cookie: string | undefined): number | null {
	if (!cookie) return null;
	const parts = cookie.split('.');
	if (parts.length !== 3) return null;
	const [uid, exp, sig] = parts;
	const expected = Buffer.from(sign(`${uid}.${exp}`));
	const given = Buffer.from(sig);
	if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
	if (Number(exp) < Date.now()) return null;
	return Number(uid);
}

export function checkPassword(password: string) {
	const expected = Buffer.from(APP_PASSWORD ?? '');
	const given = Buffer.from(password);
	return expected.length === given.length && timingSafeEqual(expected, given);
}
