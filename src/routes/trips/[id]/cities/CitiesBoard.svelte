<script lang="ts">
	/**
	 * Phase 1: which cities you want to visit. What to do there and how long to stay come next (Ideas).
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
		cities,
		places,
		ideaCounts = {},
		errors = null
	}: {
		tripId: number;
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

</script>

<section class="stack">
	<form method="POST" action="?/addCity" use:enhance class="add card">
		<label class="city">City <PlaceInput name="placeName" {places} placeholder="Nagasaki City" levels={['city', 'area', 'region']} /></label>
		<label>
			Priority
			<select name="priority">
				{#each PRIORITIES as p (p.key)}<option value={p.key} selected={p.key === 'must'}>{p.label}</option>{/each}
			</select>
		</label>
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
							<strong>{placeName(c.placeId)}</strong>
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
	.add {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: minmax(180px, 2fr) minmax(110px, 1fr) minmax(160px, 3fr) auto;
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
	.notes {
		margin: 0.3rem 0 0;
		white-space: pre-wrap;
		color: var(--muted);
	}
	.edit {
		margin-top: 0.5rem;
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
