<script lang="ts">
	/**
	 * Phase 1: which cities you want to visit, before deciding what to do there or how to connect them.
	 * Three columns (Must / Maybe / Skip); drag a card to change its priority.
	 */
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import PlaceInput from '#lib/components/PlaceInput.svelte';
	import type { CityPriority, TripCity } from '#lib/server/db/schema.ts';

	type P = { id: number; name: string; level: string; aliases: string[] };
	let {
		tripId,
		tripNights,
		cities,
		places,
		ideaCounts = {},
		errors = null
	}: {
		tripId: number;
		tripNights: number;
		cities: TripCity[];
		places: P[];
		ideaCounts?: Record<number, number>;
		errors?: Record<string, string> | null;
	} = $props();

	const PRIORITIES: { key: CityPriority; label: string; hint: string }[] = [
		{ key: 'must', label: 'Must', hint: 'The reason for the trip' },
		{ key: 'maybe', label: 'Maybe', hint: 'If the route allows' },
		{ key: 'skip', label: 'Skip', hint: 'Considered, not going' }
	];
	const placeName = (id: number) => places.find((p) => p.id === id)?.name ?? '?';
	const nightsText = (c: Pick<TripCity, 'nightsMin' | 'nightsMax'>) =>
		c.nightsMax ? `${c.nightsMin}–${c.nightsMax} nights` : `${c.nightsMin} ${c.nightsMin === 1 ? 'night' : 'nights'}`;

	let columns = $derived(
		PRIORITIES.map((p) => ({ priority: p.key, items: cities.filter((c) => c.priority === p.key) }))
	);
	let editing: number | null = $state(null);
	const flipDurationMs = 150;

	function consider(ci: number, e: CustomEvent<DndEvent<TripCity>>) {
		columns = columns.map((c, i) => (i === ci ? { ...c, items: e.detail.items } : c));
	}
	let timer: ReturnType<typeof setTimeout> | undefined;
	function finalize(ci: number, e: CustomEvent<DndEvent<TripCity>>) {
		columns = columns.map((c, i) => (i === ci ? { ...c, items: e.detail.items } : c));
		clearTimeout(timer);
		timer = setTimeout(async () => {
			await fetch('/api/reorder', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					kind: 'cities',
					tripId,
					columns: columns.map((c) => ({ priority: c.priority, ids: c.items.map((x) => x.id) }))
				})
			});
			await invalidateAll();
		}, 0);
	}

	const sum = (list: TripCity[], key: 'min' | 'max') =>
		list.reduce((n, c) => n + (key === 'min' ? c.nightsMin : (c.nightsMax ?? c.nightsMin)), 0);
	const range = (list: TripCity[]) => {
		const a = sum(list, 'min');
		const b = sum(list, 'max');
		return a === b ? `${a}` : `${a}–${b}`;
	};
	const must = $derived(cities.filter((c) => c.priority === 'must'));
	const maybe = $derived(cities.filter((c) => c.priority === 'maybe'));
	const mustMin = $derived(sum(must, 'min'));
</script>

<section class="stack">
	<div class="summary card">
		<div>
			<strong>Must:</strong> {range(must)} of {tripNights} nights
			<div class="meter" title="Must cities against the trip length">
				<div class="fill must" style="width:{Math.min(100, (mustMin / Math.max(tripNights, 1)) * 100)}%"></div>
				<div
					class="fill maybe"
					style="width:{Math.max(0, Math.min(100 - (mustMin / Math.max(tripNights, 1)) * 100, (sum(maybe, 'min') / Math.max(tripNights, 1)) * 100))}%"
				></div>
			</div>
		</div>
		<div class="small muted">
			{#if mustMin > tripNights}
				<span class="bad">Must cities alone need {mustMin - tripNights} more nights than the trip has.</span>
			{:else}
				{tripNights - mustMin} nights left for Maybe cities ({range(maybe)} wanted) and travel.
			{/if}
		</div>
	</div>

	<form method="POST" action="?/addCity" use:enhance class="add card">
		<label class="city">City <PlaceInput name="placeName" {places} placeholder="Nagasaki City" levels={['city', 'area', 'region']} /></label>
		<label>
			Priority
			<select name="priority">
				{#each PRIORITIES as p (p.key)}<option value={p.key} selected={p.key === 'must'}>{p.label}</option>{/each}
			</select>
		</label>
		<label>Nights <input type="number" name="nightsMin" min="0" max="60" value="1" /></label>
		<label>to (optional) <input type="number" name="nightsMax" min="0" max="60" placeholder="–" /></label>
		<label class="why">Why <input name="notes" placeholder="Onsen, the Hells" /></label>
		<button class="primary">Add city</button>
		{#if errors && !('cityId' in (errors ?? {}))}
			<p class="error full">{Object.values(errors).join(', ')}</p>
		{/if}
	</form>

	<div class="board">
		{#each columns as col, ci (col.priority)}
			{@const meta = PRIORITIES[ci]}
			<section class="column prio-{col.priority}">
				<header>
					<h3>{meta.label} <span class="muted small">· {col.items.length}</span></h3>
					<span class="muted small">{meta.hint}</span>
				</header>
				<div
					class="zone"
					use:dndzone={{ items: col.items, flipDurationMs, type: 'city', dropTargetStyle: {}, dragDisabled: editing !== null }}
					onconsider={(e) => consider(ci, e)}
					onfinalize={(e) => finalize(ci, e)}
				>
					{#each col.items as c (c.id)}
						<article class="card city-card" animate:flip={{ duration: flipDurationMs }}>
							<div class="spread top">
								<strong class="grow">{placeName(c.placeId)}</strong>
								<span class="badge">{nightsText(c)}</span>
							</div>
							{#if c.notes}<p class="small notes">{c.notes}</p>{/if}
							{#if editing === c.id}
								<form
									method="POST"
									action="?/updateCity"
									use:enhance={() => async ({ update, result }) => {
										await update({ reset: false });
										if (result.type === 'success') editing = null;
									}}
									class="stack edit"
								>
									<input type="hidden" name="cityId" value={c.id} />
									<div class="pair">
										<label>Nights <input type="number" name="nightsMin" min="0" max="60" value={c.nightsMin} /></label>
										<label>to (optional) <input type="number" name="nightsMax" min="0" max="60" value={c.nightsMax ?? ''} /></label>
									</div>
									<label>
										{c.priority === 'skip' ? 'Why not' : 'Why'}
										<textarea name="notes" rows="2" value={c.notes ?? ''}></textarea>
									</label>
									<div class="row">
										<button class="primary sm">Save</button>
										<button type="button" class="sm" onclick={() => (editing = null)}>Cancel</button>
										<button class="sm danger ghost" formaction="?/deleteCity">Remove</button>
									</div>
								</form>
							{/if}
							<footer class="foot">
								{#if c.priority !== 'skip'}
									<a class="small" href="/trips/{tripId}/ideas#city-{c.id}">
										{ideaCounts[c.id] ? `${ideaCounts[c.id]} ${ideaCounts[c.id] === 1 ? 'idea' : 'ideas'}` : 'Add ideas'} →
									</a>
								{/if}
								<button type="button" class="sm" class:open={editing === c.id} onclick={() => (editing = editing === c.id ? null : c.id)}>
									{editing === c.id ? 'Close' : 'Edit'}
								</button>
							</footer>
						</article>
					{/each}
				</div>
				{#if col.items.length === 0}<p class="hint small muted">Drag cities here</p>{/if}
			</section>
		{/each}
	</div>
</section>

<style>
	.summary {
		display: grid;
		gap: 0.35rem;
	}
	.meter {
		display: flex;
		height: 6px;
		border-radius: 3px;
		background: var(--border);
		overflow: hidden;
		margin-top: 0.35rem;
		max-width: 420px;
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
	.add {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: minmax(160px, 2fr) minmax(100px, 1fr) 80px 90px minmax(140px, 2fr) auto;
		align-items: end;
	}
	.add .full {
		grid-column: 1 / -1;
		margin: 0;
	}
	@media (max-width: 900px) {
		.add {
			grid-template-columns: 1fr 1fr;
		}
		.add .city,
		.add .why {
			grid-column: 1 / -1;
		}
	}
	.board {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		align-items: start;
	}
	@media (max-width: 760px) {
		.board {
			grid-template-columns: 1fr;
		}
	}
	.column {
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-top-width: 3px;
		border-radius: var(--radius);
		padding: 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.prio-must {
		border-top-color: var(--focus);
	}
	.prio-maybe {
		border-top-color: var(--maybe);
	}
	.prio-skip {
		border-top-color: var(--muted);
	}
	.prio-skip .city-card {
		opacity: 0.65;
	}
	header {
		display: grid;
	}
	h3 {
		margin: 0;
	}
	.zone {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-height: 3rem;
	}
	.city-card {
		padding: 0.55rem 0.65rem;
		cursor: grab;
	}
	.top {
		flex-wrap: nowrap;
	}
	.notes {
		margin: 0.3rem 0 0;
		white-space: pre-wrap;
		color: var(--muted);
	}
	.edit {
		margin-top: 0.5rem;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.4rem;
	}
	.foot button {
		margin-left: auto;
	}
	.foot button.open {
		background: var(--surface-2);
	}
	.hint {
		margin: -2.6rem 0 0;
		padding: 0.75rem 0;
		text-align: center;
		pointer-events: none;
	}
</style>
