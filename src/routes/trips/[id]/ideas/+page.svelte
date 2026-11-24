<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { keep } from '#lib/forms.ts';
	import { formatMoney } from '#lib/money.ts';
	import { daysBetween, niceDate } from '#lib/dates.ts';
	import PlaceInput from '#lib/components/PlaceInput.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import type { Idea } from '#lib/server/db/schema.ts';

	let { data, form } = $props();
	const placeName = (id: number | null) => data.places.find((p) => p.id === id)?.name ?? '';
	const flipDurationMs = 150;

	type City = (typeof data.cities)[number];
	type Column = { cityId: number | null; city: City | null; title: string; sub: string; items: Idea[] };
	const PRIORITY_LABEL = { must: 'Must', maybe: 'Maybe', skip: 'Skipped' } as const;
	const RANK = { must: 0, maybe: 1, skip: 2 } as const;

	// Nights wanted per city, against the trip length.
	const tripNights = $derived(daysBetween(data.trip.startDate, data.trip.endDate));
	const sumMin = (list: City[]) => list.reduce((n, c) => n + c.nightsMin, 0);
	const sumMax = (list: City[]) => list.reduce((n, c) => n + (c.nightsMax ?? c.nightsMin), 0);
	const range = (list: City[]) => (sumMin(list) === sumMax(list) ? `${sumMin(list)}` : `${sumMin(list)}–${sumMax(list)}`);
	const must = $derived(data.cities.filter((c) => c.priority === 'must'));
	const maybe = $derived(data.cities.filter((c) => c.priority === 'maybe'));
	const pct = (n: number) => Math.max(0, Math.min(100, (n / Math.max(tripNights, 1)) * 100));

	/** One column per shortlisted city (Must, then Maybe; skipped ones only while they still hold ideas). */
	function buildColumns(): Column[] {
		const cities = data.cities
			.filter((c) => c.priority !== 'skip' || data.ideas.some((i) => i.cityId === c.id))
			.sort((a, b) => RANK[a.priority] - RANK[b.priority]);
		const cols: Column[] = cities.map((c) => ({
			cityId: c.id,
			city: c,
			title: placeName(c.placeId) || 'City',
			sub: PRIORITY_LABEL[c.priority],
			items: data.ideas.filter((i) => i.cityId === c.id)
		}));
		const known = new Set(cities.map((c) => c.id));
		cols.push({
			cityId: null,
			city: null,
			title: 'Unassigned',
			sub: 'Not tied to a city',
			items: data.ideas.filter((i) => i.cityId === null || !known.has(i.cityId))
		});
		return cols;
	}

	let columns = $derived(buildColumns());
	let showHidden = $state(true);
	/** Idea whose actions panel is open (dragging is paused meanwhile so inputs stay usable). */
	let openIdea: number | null = $state(null);

	function consider(col: number, e: CustomEvent<DndEvent<Idea>>) {
		columns = columns.map((c, i) => (i === col ? { ...c, items: e.detail.items } : c));
	}
	async function finalize(col: number, e: CustomEvent<DndEvent<Idea>>) {
		columns = columns.map((c, i) => (i === col ? { ...c, items: e.detail.items } : c));
		await fetch('/api/reorder', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				kind: 'ideas',
				tripId: data.trip.id,
				columns: columns.map((c) => ({ cityId: c.cityId, ids: c.items.map((i) => i.id) }))
			})
		});
		await invalidateAll();
	}

	/** Stay candidates need a base, so they appear once the chosen route stays in this city. */
	const baseFor = (city: City | null) =>
		city ? data.bases.find((b) => b.kind === 'stay' && b.placeId === city.placeId) : undefined;
	const staysFor = (baseId: number) => data.stays.filter((s) => s.baseId === baseId);
	const open = $derived(data.decisions.filter((d) => d.status === 'open'));
	const decided = $derived(data.decisions.filter((d) => d.status === 'decided'));
</script>

<svelte:head><title>Ideas · {data.trip.name}</title></svelte:head>

<main class="stack">
	<div class="spread">
		<div>
			<h2>Phase 2 · Ideas</h2>
			<p class="muted small">
				Things to do and places to visit in each city. Drag to reorder or move between cities. Dropped
				and parked ideas fill the “Dropped / parked” section of the exported overview.
			</p>
		</div>
		<div class="row">
			<label class="inline small"><input type="checkbox" bind:checked={showHidden} /> Show dropped / parked</label>
			<a class="next" href="/trips/{data.trip.id}/route">Next: build route →</a>
		</div>
	</div>
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
				<div class="muted">Set nights per city once you know what you want to do there. Route uses the minimum as a starting point.</div>
			{/if}
		</div>
	{/if}
	{#if data.cities.length === 0}
		<p class="card small">No cities yet. <a href="/trips/{data.trip.id}/cities">Shortlist cities</a> to get one column per city.</p>
	{/if}
	{#if form && 'planned' in form}<p class="badge green">{form.planned}</p>{/if}
	{#if form && 'error' in form}<p class="error">{form.error}</p>{/if}

	<div class="layout">
		<div class="board">
			{#each columns as col, ci (col.cityId ?? 'none')}
				{@const base = baseFor(col.city)}
				<section class="column prio-{col.city?.priority ?? 'none'}" id={col.cityId ? `city-${col.cityId}` : undefined}>
					<header>
						<h3>{col.title}</h3>
						<span class="muted small">{col.sub}</span>
						{#if col.city?.notes}<span class="small why">{col.city.notes}</span>{/if}
						{#if col.city}
							<form method="POST" action="?/setCityNights" use:enhance={keep} class="nights small">
								<input type="hidden" name="cityId" value={col.city.id} />
								<label>
									Nights
									<input type="number" name="nightsMin" min="0" max="60" value={col.city.nightsMin} onchange={(e) => e.currentTarget.form?.requestSubmit()} />
								</label>
								<label>
									to
									<input type="number" name="nightsMax" min="0" max="60" placeholder="–" value={col.city.nightsMax ?? ''} onchange={(e) => e.currentTarget.form?.requestSubmit()} />
								</label>
							</form>
						{/if}
					</header>

					<div
						class="zone"
						use:dndzone={{ items: col.items, flipDurationMs, type: 'idea', dropTargetStyle: {}, dragDisabled: openIdea !== null }}
						onconsider={(e) => consider(ci, e)}
						onfinalize={(e) => finalize(ci, e)}
					>
						{#each col.items as idea (idea.id)}
							<article
								class="idea card"
								class:hidden={idea.status === 'dropped' || idea.status === 'parked'}
								class:collapse={!showHidden && (idea.status === 'dropped' || idea.status === 'parked')}
								animate:flip={{ duration: flipDurationMs }}
							>
								<div class="spread">
									<strong class="grow">{idea.title}</strong>
									<StatusBadge status={idea.status} />
								</div>
								{#if idea.placeId}<div class="small muted">[[{placeName(idea.placeId)}]]</div>{/if}
								{#if idea.details}<p class="small details">{idea.details}</p>{/if}
								{#if idea.reason}<p class="small muted">Reason: {idea.reason}</p>{/if}

								{#if openIdea === idea.id}
									<div class="stack actions" id="idea-actions-{idea.id}">
										{#if data.days.length}
											<form method="POST" action="?/planIdea" use:enhance class="row">
												<input type="hidden" name="ideaId" value={idea.id} />
												<select name="dayId" class="grow" aria-label="Day">
													{#each data.days as d (d.id)}<option value={d.id}>Day {d.dayNumber} · {niceDate(d.date)}</option>{/each}
												</select>
												<select name="kind" aria-label="Section" style="width:auto">
													<option value="focus">Focus</option>
													<option value="maybe">Maybe</option>
													<option value="optional">Optional</option>
												</select>
												<button class="sm primary">Add to day</button>
											</form>
										{/if}
										<form method="POST" action="?/setStatus" use:enhance class="row">
											<input type="hidden" name="ideaId" value={idea.id} />
											<input name="reason" class="grow" placeholder="Reason" value={idea.reason ?? ''} />
											<button class="sm" name="status" value="dropped">Drop</button>
											<button class="sm" name="status" value="parked">Park</button>
											{#if idea.status !== 'idea'}<button class="sm" name="status" value="idea">Restore</button>{/if}
										</form>
										<form method="POST" action="?/updateIdea" use:enhance={keep} class="stack">
											<input type="hidden" name="ideaId" value={idea.id} />
											<input type="hidden" name="cityId" value={idea.cityId ?? ''} />
											<input type="hidden" name="status" value={idea.status} />
											<input type="hidden" name="reason" value={idea.reason ?? ''} />
											<input name="title" value={idea.title} required aria-label="Title" />
											<PlaceInput name="placeName" value={placeName(idea.placeId)} places={data.places} />
											<textarea name="details" rows="2" placeholder="Details" value={idea.details ?? ''}></textarea>
											<div class="row">
												<button class="sm primary">Save</button>
												<button class="sm danger ghost" formaction="?/deleteIdea">Delete</button>
											</div>
										</form>
									</div>
								{/if}
								<footer class="idea-foot">
									<button
										type="button"
										class="sm"
										class:open={openIdea === idea.id}
										aria-expanded={openIdea === idea.id}
										aria-controls="idea-actions-{idea.id}"
										onclick={() => (openIdea = openIdea === idea.id ? null : idea.id)}
									>
										Actions <span class="chev" aria-hidden="true">▴</span>
									</button>
								</footer>
							</article>
						{/each}
					</div>

					<form method="POST" action="?/addIdea" use:enhance class="add">
						<input type="hidden" name="cityId" value={col.cityId ?? ''} />
						<input name="title" placeholder="+ Thing to do or see" required />
						<PlaceInput name="placeName" places={data.places} placeholder="Place (optional)" />
						<button class="sm">Add</button>
					</form>

					{#if base}
						<div class="stays">
							<h4 class="small muted">Stay candidates</h4>
							{#each staysFor(base.id) as s (s.id)}
								<div class="small stay">
									<StatusBadge status={s.status} />
									<a href="/trips/{data.trip.id}/stays#stay-{s.id}">{s.hotel}</a>
									{#if s.priceMinor !== null}<span class="muted">{formatMoney(s.priceMinor, s.currency)}</span>{/if}
								</div>
							{/each}
							<form method="POST" action="?/addStay" use:enhance class="add">
								<input type="hidden" name="baseId" value={base.id} />
								<input name="hotel" placeholder="+ Hotel candidate" required />
								<input name="price" placeholder="Price ({data.trip.homeCurrency})" inputmode="decimal" />
								<input name="url" placeholder="Link" type="url" />
								<button class="sm">Add</button>
							</form>
						</div>
					{/if}
				</section>
			{/each}
		</div>

		<aside class="card stack decisions">
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
		</aside>
	</div>
</main>

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
	.layout {
		display: grid;
		gap: 1rem;
		grid-template-columns: 1fr 320px;
		align-items: start;
	}
	@media (max-width: 900px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
	.board {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(260px, 300px);
		gap: 0.75rem;
		overflow-x: auto;
		padding-bottom: 0.5rem;
	}
	@media (max-width: 640px) {
		.board {
			grid-auto-flow: row;
			grid-auto-columns: auto;
		}
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
	.nights {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.3rem;
	}
	.nights label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		color: var(--muted);
	}
	.nights input {
		width: 3.6rem;
		flex: 0 0 3.6rem;
		min-width: 0;
		padding: 0.2rem 0.35rem;
	}
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
	.why {
		color: var(--muted);
		font-style: italic;
	}
	.column.prio-must {
		border-top: 3px solid var(--focus);
	}
	.column.prio-maybe {
		border-top: 3px solid var(--maybe);
	}
	.column {
		background: var(--surface-2);
		border-radius: var(--radius);
		padding: 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.column header {
		display: grid;
	}
	.column h3 {
		margin: 0;
	}
	.zone {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 3rem;
	}
	.idea {
		padding: 0.6rem;
		cursor: grab;
	}
	.idea.hidden {
		opacity: 0.55;
	}
	.idea.collapse {
		display: none;
	}
	.details {
		white-space: pre-wrap;
		margin: 0.25rem 0;
	}
	.actions {
		margin-top: 0.5rem;
	}
	.idea-foot {
		display: flex;
		justify-content: flex-end;
		margin-top: 0.5rem;
		padding-top: 0.4rem;
		border-top: 1px solid var(--border);
	}
	.idea-foot button.open {
		background: var(--surface-2);
	}
	.chev {
		font-size: 0.7rem;
		transition: transform 0.15s;
	}
	.idea-foot button.open .chev {
		transform: rotate(180deg);
	}
	.add {
		display: grid;
		gap: 0.35rem;
	}
	.stays {
		border-top: 1px solid var(--border);
		padding-top: 0.5rem;
		display: grid;
		gap: 0.35rem;
	}
	.stays h4 {
		margin: 0;
	}
	.stay {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.decision {
		border-bottom: 1px solid var(--border);
		padding-bottom: 0.5rem;
	}
	.opts th,
	.opts td {
		padding: 0.25rem 0.4rem;
	}
	.decisions h3 {
		margin-top: 0.5rem;
	}
</style>
