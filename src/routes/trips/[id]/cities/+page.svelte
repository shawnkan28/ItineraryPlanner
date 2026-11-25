<script lang="ts">
	import { enhance } from '$app/forms';
	import { keep } from '#lib/forms.ts';
	import { bucketNote, bucketOrigin } from '#lib/bucket-text.ts';
	import { similarPlace } from '#lib/similar.ts';
	import CitiesBoard from './CitiesBoard.svelte';
	import CityIdeas from './CityIdeas.svelte';

	let { data, form } = $props();

	/** City whose ideas pop-up is open; 'none' = ideas without a city. */
	let openCity: number | 'none' | null = $state(null);
	const modalCity = $derived(typeof openCity === 'number' ? (data.cities.find((c) => c.id === openCity) ?? null) : null);
	const unassigned = $derived(data.ideas.filter((i) => i.cityId === null));
	// a removed city closes its pop-up
	$effect(() => {
		if (typeof openCity === 'number' && !modalCity) openCity = null;
	});


	// Open the bucket panel on a fresh trip; after that it stays however you leave it.
	let bucketOpen = $state(false);
	let bucketTrip = -1;
	$effect.pre(() => {
		if (data.trip.id !== bucketTrip) {
			bucketTrip = data.trip.id;
			bucketOpen = data.cities.length === 0;
		}
	});
	// Cities on the shared bucket list that aren't on this trip yet
	// Only what you saved on the Bucket page is offered here.
	const saved = $derived(data.bucket.filter((e) => e.saved));
	const placeName = (id: number) => data.places.find((p) => p.id === id)?.name ?? '';
	const bucketCities = $derived(
		saved.filter((e) => e.isCity && !data.cities.some((c) => c.placeId === e.placeId || similarPlace(placeName(c.placeId), e.name)))
	);
	/** Saved places in the open city ("Osaka" on the bucket list matches the trip's "Osaka City"). */
	const bucketHere = $derived(
		modalCity
			? saved.filter(
					(e) =>
						!e.isCity &&
						(e.cityPlaceId === modalCity.placeId || (e.cityName !== null && similarPlace(e.cityName, placeName(modalCity.placeId))))
				)
			: []
	);

	const open = $derived(data.decisions.filter((d) => d.status === 'open'));
	const decided = $derived(data.decisions.filter((d) => d.status === 'decided'));
</script>

<svelte:head><title>Cities · {data.trip.name}</title></svelte:head>

<main class="stack wide">
	<div class="spread">
		<div>
			<h2>Phase 1 · Cities &amp; ideas</h2>
			<p class="muted small">
				Decide where you want to go, then open a city to collect what you want to do there and how
				many nights it needs. Drag a city between columns to change its priority.
			</p>
		</div>
		<a class="next" href="/trips/{data.trip.id}/city-days">Next: plan days →</a>
	</div>
	{#if form && 'error' in form && form.error}<p class="error">{form.error}</p>{/if}

	{#if bucketCities.length}
		<details class="card bucket" bind:open={bucketOpen}>
			<summary>
				<strong>From your bucket list</strong>
				<span class="muted small">· {bucketCities.length} saved {bucketCities.length === 1 ? 'city' : 'cities'} not on this trip yet</span>
			</summary>
			<div class="bucket-list">
				{#each bucketCities as e (e.placeId)}
					<form method="POST" action="?/addCity" use:enhance class="bucket-city">
						<input type="hidden" name="placeName" value={e.name} />
						<input type="hidden" name="priority" value="maybe" />
						<input type="hidden" name="notes" value={bucketNote(e)} />
						<div class="grow">
							<strong>{e.name}</strong>
							<div class="muted small">{bucketOrigin(e)}</div>
						</div>
						<button class="sm" title="Add {e.name} to this trip as a Maybe city">+ Add</button>
					</form>
				{/each}
			</div>
			<a class="small" href="/bucket">Open bucket list →</a>
		</details>
	{/if}

	<CitiesBoard
		tripId={data.trip.id}
		cities={data.cities}
		ideas={data.ideas}
		places={data.places}
		dayCounts={data.dayCounts}
		onopen={(id) => (openCity = id)}
		errors={form && 'cityErrors' in form ? (form.cityErrors as Record<string, string>) : null}
	/>

	{#if unassigned.length}
		<p class="small">
			<button type="button" class="sm" onclick={() => (openCity = 'none')}>
				{unassigned.length} {unassigned.length === 1 ? 'idea' : 'ideas'} without a city
			</button>
		</p>
	{/if}

	<section class="card stack decisions">
		<h3>Open decisions</h3>
		{#each open as d (d.id)}
			{@render decisionCard(d)}
		{:else}
			<p class="muted small">Nothing open.</p>
		{/each}
		<details>
			<summary class="small"><strong>+ New decision</strong></summary>
			<form method="POST" action="?/addDecision" use:enhance class="stack" style="margin-top:.5rem">
				<input name="question" placeholder="Is anyone willing to drive?" required />
				<textarea name="options" rows="3" placeholder={'One option per line:\nlabel | gain | trade-off'}></textarea>
				<textarea name="notes" rows="2" placeholder="Notes (shown in Still to decide)"></textarea>
				<button class="sm primary">Add decision</button>
			</form>
		</details>
		{#if decided.length}
			<h3>Decided</h3>
			{#each decided as d (d.id)}
				{@render decisionCard(d)}
			{/each}
		{/if}
	</section>
</main>

{#if openCity !== null && (openCity === 'none' || modalCity)}
	<CityIdeas
		tripId={data.trip.id}
		city={modalCity}
		cities={data.cities}
		ideas={data.ideas}
		places={data.places}
		error={form && 'error' in form ? (form.error as string) : null}
		bucket={bucketHere}
		onclose={() => (openCity = null)}
	/>
{/if}

{#snippet decisionCard(d: (typeof data.decisions)[number])}
	<details class="decision">
		<summary>
			<strong>{d.question}</strong>
			{#if d.answer}<div class="small"><span class="badge green">→ {d.answer}</span></div>{/if}
		</summary>
		{#if d.options.length}
			<table class="small opts">
				<thead><tr><th>Option</th><th>Gain</th><th>Trade-off</th></tr></thead>
				<tbody>
					{#each d.options as o (o.label)}
						<tr><td>{o.label}</td><td>{o.gain ?? ''}</td><td>{o.tradeOff ?? ''}</td></tr>
					{/each}
				</tbody>
			</table>
		{/if}
		<form method="POST" action="?/updateDecision" use:enhance={keep} class="stack" style="margin-top:.5rem">
			<input type="hidden" name="decisionId" value={d.id} />
			<input name="question" value={d.question} required aria-label="Question" />
			<textarea
				name="options"
				rows="3"
				value={d.options.map((o) => [o.label, o.gain ?? '', o.tradeOff ?? ''].join(' | ').replace(/( \| )+$/, '')).join('\n')}
			></textarea>
			<textarea name="notes" rows="2" placeholder="Notes" value={d.notes ?? ''}></textarea>
			<select name="answer" value={d.answer ?? ''} aria-label="Answer">
				<option value="">— still open —</option>
				{#each d.options as o (o.label)}<option value={o.label}>{o.label}</option>{/each}
			</select>
			<div class="row">
				<button class="sm primary">Save</button>
				<button class="sm danger ghost" formaction="?/deleteDecision">Delete</button>
			</div>
		</form>
	</details>
{/snippet}

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
	.bucket summary {
		cursor: pointer;
	}
	.bucket-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.5rem;
		margin: 0.6rem 0;
	}
	.bucket-city {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.6rem;
		border: 1px dashed var(--border);
		border-radius: 8px;
	}
	.decisions {
		max-width: 720px;
	}
	.decisions h3 {
		margin: 0;
	}
	.decision summary {
		cursor: pointer;
	}
	.opts {
		width: 100%;
		margin-top: 0.4rem;
		border-collapse: collapse;
	}
	.opts th,
	.opts td {
		text-align: left;
		padding: 0.2rem 0.4rem;
		border-bottom: 1px solid var(--border);
	}
</style>
