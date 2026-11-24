import { redirect } from '@sveltejs/kit';

/** Ideas now live inside each city on the Cities tab; keep old links working. */
export const load = ({ params }) => redirect(308, `/trips/${params.id}/cities`);
