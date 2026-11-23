import { choiceFromParams, prepareExport } from '$lib/server/exporter';
import { getTrip, tripId } from '$lib/server/repo';
import { vaultPath } from '$lib/server/settings';
import { buildZip } from '$lib/server/vault';

export const GET = async ({ params, url }) => {
	const id = tripId(params);
	const trip = getTrip(id);
	const { files, attachments } = prepareExport(id, choiceFromParams(url.searchParams), vaultPath());
	const zip = await buildZip(id, files, attachments);
	const name = `${trip.startDate.slice(0, 7)} ${trip.name} Trip export.zip`;
	return new Response(zip as unknown as BodyInit, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${name.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`
		}
	});
};
