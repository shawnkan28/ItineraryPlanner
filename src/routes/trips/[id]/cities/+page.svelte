<script lang="ts">
	import CitiesBoard from './CitiesBoard.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Cities · {data.trip.name}</title></svelte:head>

<main class="stack wide">
	<div class="spread">
		<div>
			<h2>Phase 1 · Cities</h2>
			<p class="muted small">
				Decide where you want to go. Drag a city between columns to change its priority. How long to
				stay comes after you know what you want to do there, and the order comes last, in Route.
			</p>
		</div>
		<a class="next" href="/trips/{data.trip.id}/ideas">Next: things to do →</a>
	</div>
	<CitiesBoard
		tripId={data.trip.id}
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
