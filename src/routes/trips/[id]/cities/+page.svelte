<script lang="ts">
	import { enhance } from '$app/forms';
	import { daysBetween } from '#lib/dates.ts';
	import { keep } from '#lib/forms.ts';
	import CitiesBoard from './CitiesBoard.svelte';
	import CityIdeas from './CityIdeas.svelte';

	let { data, form } = $props();
	type City = (typeof data.cities)[number];

	/** City whose ideas pop-up is open; 'none' = ideas without a city. */
	let openCity: number | 'none' | null = $state(null);
	const modalCity = $derived(typeof openCity === 'number' ? (data.cities.find((c) => c.id === openCity) ?? null) : null);
	const unassigned = $derived(data.ideas.filter((i) => i.cityId === null));
	// a removed city closes its pop-up
	$effect(() => {
		if (typeof openCity === 'number' && !modalCity) openCity = null;
	});

	// Nights wanted per city, against the trip length.
	const tripNights = $derived(daysBetween(data.trip.startDate, data.trip.endDate));
	const sumMin = (list: City[]) => list.reduce((n, c) => n + c.nightsMin, 0);
	const sumMax = (list: City[]) => list.reduce((n, c) => n + (c.nightsMax ?? c.nightsMin), 0);
	const range = (list: City[]) => (sumMin(list) === sumMax(list) ? `${sumMin(list)}` : `${sumMin(list)}–${sumMax(list)}`);
	const must = $derived(data.cities.filter((c) => c.priority === 'must'));
	const maybe = $derived(data.cities.filter((c) => c.priority === 'maybe'));
	const pct = (n: number) => Math.max(0, Math.min(100, (n / Math.max(tripNights, 1)) * 100));

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
		<a class="next" href="/trips/{data.trip.id}/route">Next: build route →</a>
	</div>
	{#if form && 'planned' in form}<p class="badge green">{form.planned}</p>{/if}
	{#if form && 'error' in form && form.error}<p class="error">{form.error}</p>{/if}

	{#if must.length || maybe.length}
		<div class="card nights-summary small">
			<div>
				<strong>Nights wanted:</strong> Must {range(must)}{#if maybe.length} · Maybe {range(maybe)}{/if} · trip has {tripNights}
			</div>
			<div class="meter" title="Must (green) and Maybe (amber) nights against the trip length">
				<div class="fill must" style="width:{pct(sumMin(must))}%"></div>
				<div class="fill maybe" style="width:{Math.min(pct(sumMin(maybe)), 100 - pct(sumMin(must)))}%"></div>
			</div>
			{#if sumMin(must) > tripNights}
				<div class="bad">Must cities alone need {sumMin(must) - tripNights} more nights than the trip has.</div>
			{:else}
				<div class="muted">Set nights inside each city once you know what you want to do there.</div>
			{/if}
		</div>
	{/if}

	<CitiesBoard
		tripId={data.trip.id}
		cities={data.cities}
		ideas={data.ideas}
		places={data.places}
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
		days={data.days}
		error={form && 'error' in form ? (form.error as string) : null}
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
	.nights-summary {
		display: grid;
		gap: 0.35rem;
	}
	.meter {
		display: flex;
		height: 6px;
		max-width: 420px;
		border-radius: 3px;
		background: var(--border);
		overflow: hidden;
	}
	.fill.must {
		background: var(--focus);
	}
	.fill.maybe {
		background: var(--maybe);
		opacity: 0.6;
	}
	.bad {
		color: var(--accent);
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
