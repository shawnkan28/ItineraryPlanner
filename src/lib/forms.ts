import type { SubmitFunction } from '@sveltejs/kit';

/** use:enhance={keep}: re-run load after the action but keep what's in the form fields. */
export const keep: SubmitFunction = () => {
	return async ({ update }) => update({ reset: false });
};
