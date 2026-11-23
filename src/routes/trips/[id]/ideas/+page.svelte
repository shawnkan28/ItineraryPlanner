<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { keep } from '#lib/forms.ts';
	import { formatMoney } from '#lib/money.ts';
	import { niceDate } from '#lib/dates.ts';
	import PlaceInput from '#lib/components/PlaceInput.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import type { Idea } from '#lib/server/db/schema.ts';

	let { data, form } = $props();
	const placeName = (id: number | null) => data.places.find((p) => p.id === id)?.name ?? '';
	const flipDurationMs = 150;

	type Column = { baseId: number | null; title: string; sub: string; items: Idea[] };

	function buildColumns(): Column[] {
		const cols: Column[] = data.bases.map((b) => ({
			baseId: b.id,
			title: b.label || placeName(b.placeId) || 'Base',
			sub: `${b.nights} ${b.nights === 1 ? 'night' : 'nights'}${b.startDate ? ` · ${niceDate(b.startDate)}` : ''}`,
			items: data.ideas.filter((i) => i.baseId === b.id)
		}));
		const known = new Set(data.bases.map((b) => b.id));
		cols.push({
			baseId: null,
			title: 'Unassigned',
			sub: 'Not tied to a base',
			items: data.ideas.filter((i) => i.baseId === null || !known.has(i.baseId))
		});
		return cols;
	}

	let columns = $derived(buildColumns());
	let showHidden = $state(true);

	function consider(col: number, e: CustomEvent<DndEvent<Idea>>) {
		columns[col].items = e.detail.items;
	}
	async function finalize(col: number, e: CustomEvent<DndEvent<Idea>>) {
		columns[col].items = e.detail.items;
		await fetch('/api/reorder', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				kind: 'ideas',
				tripId: data.trip.id,
				columns: columns.map((c) => ({ baseId: c.baseId, ids: c.items.map((i) => i.id) }))
			})
		});
		await invalidateAll();
	}

	const staysFor = (baseId: number | null) => data.stays.filter((s) => s.baseId === baseId);
	const open = $derived(data.decisions.filter((d) => d.status === 'open'));
	const decided = $derived(data.decisions.filter((d) => d.status === 'decided'));
</script>

<svelte:head><title>Ideas · {data.trip.name}</title></svelte:head>

<main class="stack">
	<div class="spread">
		<div>
			<h2>Phase 2 · Ideas</h2>
			<p class="muted small">
				Candidate activities per base. Drag to reorder or move between bases. Dropped and parked ideas
				fill the “Dropped / parked” section of the exported overview.
			</p>
		</div>
		<label class="inline small"><input type="checkbox" bind:checked={showHidden} /> Show dropped / parked</label>
	</div>
	{#if data.bases.length === 0}
		<p class="card small">No route chosen yet. <a href="/trips/{data.trip.id}/route">Choose a route</a> to get one column per base.</p>
	{/if}
	{#if form && 'planned' in form}<p class="badge green">{form.planned}</p>{/if}
	{#if form && 'error' in form}<p class="error">{form.error}</p>{/if}

	<div class="layout">
		<div class="board">
			{#each columns as col, ci (col.baseId ?? 'none')}
				<section class="column">
					<header>
						<h3>{col.title}</h3>
						<span class="muted small">{col.sub}</span>
					</header>

					<div
						class="zone"
						use:dndzone={{ items: col.items, flipDurationMs, type: 'idea', dropTargetStyle: {} }}
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

								<details>
									<summary class="small muted">Actions</summary>
									<div class="stack actions">
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
											<input type="hidden" name="baseId" value={idea.baseId ?? ''} />
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
								</details>
							</article>
						{/each}
					</div>

					<form method="POST" action="?/addIdea" use:enhance class="add">
						<input type="hidden" name="baseId" value={col.baseId ?? ''} />
						<input name="title" placeholder="+ Add idea" required />
						<PlaceInput name="placeName" places={data.places} placeholder="Place (optional)" />
						<button class="sm">Add</button>
					</form>

					{#if col.baseId !== null}
						<div class="stays">
							<h4 class="small muted">Stay candidates</h4>
							{#each staysFor(col.baseId) as s (s.id)}
								<div class="small stay">
									<StatusBadge status={s.status} />
									<a href="/trips/{data.trip.id}/stays#stay-{s.id}">{s.hotel}</a>
									{#if s.priceMinor !== null}<span class="muted">{formatMoney(s.priceMinor, s.currency)}</span>{/if}
								</div>
							{/each}
							<form method="POST" action="?/addStay" use:enhance class="add">
								<input type="hidden" name="baseId" value={col.baseId} />
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
