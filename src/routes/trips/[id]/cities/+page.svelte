<script lang="ts">
	import { daysBetween } from '#lib/dates.ts';
	import CitiesBoard from './CitiesBoard.svelte';

	let { data, form } = $props();
	const tripNights = $derived(daysBetween(data.trip.startDate, data.trip.endDate));
</script>

<svelte:head><title>Cities · {data.trip.name}</title></svelte:head>

<main class="stack wide">
	<div class="spread">
		<div>
			<h2>Phase 1 · Cities</h2>
			<p class="muted small">
				Decide where you want to go and roughly how long. Drag a city between columns to change its
				priority. The order comes later, in Route.
			</p>
		</div>
		<a class="next" href="/trips/{data.trip.id}/ideas">Next: things to do →</a>
	</div>
	<CitiesBoard
		tripId={data.trip.id}
		{tripNights}
		cities={data.cities}
		places={data.places}
		ideaCounts={data.ideaCounts}
		errors={form && 'cityErrors' in form ? (form.cityErrors as Record<string, string>) : null}
	/>
</main>

<style>
	.next {
		border: 1px solid var(--focus);
		background: var(--focus);
		color: #fff;
		border-radius: 7px;
		padding: 0.45rem 0.9rem;
		text-decoration: none;
		font-weight: 600;
		white-space: nowrap;
	}
</style>
