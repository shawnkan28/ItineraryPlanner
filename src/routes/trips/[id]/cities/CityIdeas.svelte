<script lang="ts">
	/**
	 * Pop-up for one city: what to do there (Must / Maybe / Skip), why go, and how many nights.
	 * A plain overlay rather than <dialog>: dragged items are appended to <body> and must render on top.
	 */
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { keep } from '#lib/forms.ts';
	import PlaceInput from '#lib/components/PlaceInput.svelte';
	import { similarPlace } from '#lib/similar.ts';
	import { bucketNote, bucketOrigin } from '#lib/bucket-text.ts';
	import type { BucketEntry } from '#lib/server/bucket.ts';
	import type { CityPriority, Idea, TripCity } from '#lib/server/db/schema.ts';

	type P = { id: number; name: string; level: string; aliases: string[] };
	let {
		tripId,
		city,
		cities,
		ideas,
		places,
		error = null,
		bucket = [],
		onclose
	}: {
		tripId: number;
		city: TripCity | null;
		cities: TripCity[];
		ideas: Idea[];
		places: P[];
		/** Server-side refusal (e.g. the place is already in this city). */
		error?: string | null;
		/** Places in this city from the shared bucket list (other trips, saved by hand). */
		bucket?: BucketEntry[];
		onclose: () => void;
	} = $props();

	const PRIORITIES: { key: CityPriority; label: string; hint: string }[] = [
		{ key: 'must', label: 'Must', hint: 'Worth the trip' },
		{ key: 'maybe', label: 'Maybe', hint: 'If there is time' },
		{ key: 'skip', label: 'Skip', hint: 'Not doing it' }
	];
	const placeName = (id: number | null) => places.find((p) => p.id === id)?.name ?? '';
	/** Ideas are a place plus notes; older ideas without a place fall back to their title. */
	const ideaName = (i: Idea) => placeName(i.placeId) || i.title;

	// Warn while typing when the place looks like an idea already on the trip (any city).
	let editing: number | null = $state(null);
	let addPlace = $state('');
	let editPlace = $state('');
	const cityLabel = (cityId: number | null) => {
		if (cityId === null) return 'no city';
		if (cityId === city?.id) return 'this city';
		const c = cities.find((x) => x.id === cityId);
		return c ? placeName(c.placeId) : 'another city';
	};
	const similarTo = (name: string, except: number | null = null) =>
		name.trim().length < 3 ? [] : ideas.filter((i) => i.id !== except && similarPlace(name, ideaName(i)));
	// Same place twice in one city is blocked; similar places in other cities only warn.
	const inCity = (i: Idea, cityId: number | null) => i.cityId === cityId;
	const addMatches = $derived(similarTo(addPlace));
	const addClash = $derived(addMatches.find((i) => inCity(i, city?.id ?? null)));
	const addOthers = $derived(addMatches.filter((i) => !inCity(i, city?.id ?? null)));
	let editCity: number | null = $state(null);
	const editMatches = $derived(editing === null ? [] : similarTo(editPlace, editing));
	const editClash = $derived(editMatches.find((i) => inCity(i, editCity)));
	const editOthers = $derived(editMatches.filter((i) => !inCity(i, editCity)));
	/** Ideas that look like another idea on the trip get a yellow highlight. */
	const dupesOf = (i: Idea) => similarTo(ideaName(i), i.id);
	const bucketHere = $derived(bucket.filter((b) => !mine.some((i) => similarPlace(b.name, ideaName(i)))));
	const typed = (e: Event) => (e.target as HTMLInputElement).value;
	const title = $derived(city ? placeName(city.placeId) : 'Ideas without a city');
	const mine = $derived(ideas.filter((i) => (city ? i.cityId === city.id : i.cityId === null)));

	let columns = $derived(PRIORITIES.map((p) => ({ priority: p.key, items: mine.filter((i) => i.priority === p.key) })));
	let addPriority: CityPriority = $state('must');
	const flipDurationMs = 150;

	function consider(ci: number, e: CustomEvent<DndEvent<Idea>>) {
		columns = columns.map((c, i) => (i === ci ? { ...c, items: e.detail.items } : c));
	}
	let timer: ReturnType<typeof setTimeout> | undefined;
	function finalize(ci: number, e: CustomEvent<DndEvent<Idea>>) {
		columns = columns.map((c, i) => (i === ci ? { ...c, items: e.detail.items } : c));
		clearTimeout(timer);
		timer = setTimeout(async () => {
			await fetch('/api/reorder', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					kind: 'ideas',
					tripId,
					columns: columns.map((c) => ({ priority: c.priority, ids: c.items.map((x) => x.id) }))
				})
			});
			await invalidateAll();
		}, 0);
	}

	const submitOnChange = (e: Event & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) =>
		e.currentTarget.form?.requestSubmit();
	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (editing !== null) editing = null;
		else onclose();
	}
	let addForm: HTMLFormElement | undefined = $state();
	const focusPlace = () => addForm?.querySelector<HTMLInputElement>('input[name=placeName]')?.focus();
	$effect(() => {
		if (addForm) focusPlace();
	});
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="modal card stack" role="dialog" aria-modal="true" aria-labelledby="city-modal-title">
		<header class="spread head">
			<div>
				<h2 id="city-modal-title">{title}</h2>
				{#if city}<span class="badge prio-{city.priority}">{city.priority === 'must' ? 'Must' : city.priority === 'maybe' ? 'Maybe' : 'Skip'} city</span>{/if}
			</div>
			<button type="button" class="ghost close" aria-label="Close" onclick={onclose}>✕</button>
		</header>

		<div class="body stack">

		{#if city}
			<div class="city-meta">
				<form method="POST" action="?/updateCity" use:enhance={keep} class="why">
					<input type="hidden" name="cityId" value={city.id} />
					<label>
						{city.priority === 'skip' ? 'Why not' : 'Why go'}
						<input name="notes" value={city.notes ?? ''} placeholder="Onsen, the Hells" onchange={submitOnChange} />
					</label>
				</form>
				<form method="POST" action="?/setCityNights" use:enhance={keep} class="nights">
					<input type="hidden" name="cityId" value={city.id} />
					<label>Nights <input type="number" name="nightsMin" min="0" max="60" value={city.nightsMin} onchange={submitOnChange} /></label>
					<label>to <input type="number" name="nightsMax" min="0" max="60" placeholder="–" value={city.nightsMax ?? ''} onchange={submitOnChange} /></label>
				</form>
			</div>
		{/if}

		<form
			method="POST"
			action="?/addIdea"
			use:enhance={() => async ({ update }) => {
				await update();
				addPlace = '';
				focusPlace();
			}}
			class="add"
			bind:this={addForm}
		>
			<input type="hidden" name="cityId" value={city?.id ?? ''} />
			<input type="hidden" name="priority" value={addPriority} />
			<div class="place" oninput={(e) => (addPlace = typed(e))}>
				<PlaceInput name="placeName" {places} placeholder="Place, e.g. Kuromon Market" required />
			</div>
			<input class="notes" name="details" placeholder="Notes: what to do or see there" aria-label="Notes" />
			{#if addClash}
				{@render clashNote(addClash)}
			{:else if addOthers.length}
				{@render similarNote(addOthers)}
			{/if}
			{#if error}<p class="clash small" role="alert">{error}</p>{/if}
			<div class="seg" role="radiogroup" aria-label="Priority">
				{#each PRIORITIES as p (p.key)}
					<button type="button" role="radio" aria-checked={addPriority === p.key} class:on={addPriority === p.key} onclick={() => (addPriority = p.key)}>
						{p.label}
					</button>
				{/each}
			</div>
			<button class="primary" disabled={!!addClash}>Add</button>
		</form>

		{#if bucketHere.length}
			<div class="bucket-strip small">
				<span class="muted">From your bucket list:</span>
				{#each bucketHere as b (b.placeId)}
					<form method="POST" action="?/addIdea" use:enhance>
						<input type="hidden" name="cityId" value={city?.id ?? ''} />
						<input type="hidden" name="placeName" value={b.name} />
						<input type="hidden" name="details" value={bucketNote(b)} />
						<input type="hidden" name="priority" value="maybe" />
						<button class="sm chip-btn" title="{bucketOrigin(b)} · add as Maybe">+ {b.name}</button>
					</form>
				{/each}
			</div>
		{/if}

		<div class="cols">
			{#each columns as col, ci (col.priority)}
				{@const meta = PRIORITIES[ci]}
				<section class="col prio-{col.priority}">
					<h3>{meta.label} <span class="muted small">· {col.items.length} · {meta.hint}</span></h3>
					<div
						class="zone"
						use:dndzone={{ items: col.items, flipDurationMs, type: `ideas-${city?.id ?? 'none'}`, dropTargetStyle: {}, dragDisabled: editing !== null }}
						onconsider={(e) => consider(ci, e)}
						onfinalize={(e) => finalize(ci, e)}
					>
						{#each col.items as idea (idea.id)}
							{@const dupes = dupesOf(idea)}
							<article class="idea" class:dupe={dupes.length > 0} animate:flip={{ duration: flipDurationMs }}>
								<div class="spread top">
									<strong class="grow">{ideaName(idea)}</strong>
									{#if idea.status === 'planned'}<span class="badge green">planned</span>{/if}
									{#if idea.status === 'parked'}<span class="badge amber">parked</span>{/if}
									<button type="button" class="sm ghost" aria-expanded={editing === idea.id} onclick={() => {
											editing = editing === idea.id ? null : idea.id;
											editPlace = ideaName(idea);
											editCity = idea.cityId;
										}}>
										{editing === idea.id ? 'Close' : 'Edit'}
									</button>
								</div>
								{#if dupes.length}
									<div class="small dupe-note">
										Similar to {dupes.map((d) => `${ideaName(d)} (${cityLabel(d.cityId)})`).join(', ')}
									</div>
								{/if}
								{#if idea.details}<p class="small details">{idea.details}</p>{/if}
								{#if idea.reason}<p class="small muted">Why: {idea.reason}</p>{/if}

								{#if editing === idea.id}
									<form
										method="POST"
										action="?/updateIdea"
										use:enhance={() => async ({ update, result }) => {
											await update({ reset: false });
											if (result.type === 'success') editing = null;
										}}
										class="stack edit"
									>
										<input type="hidden" name="ideaId" value={idea.id} />
										<input type="hidden" name="status" value={idea.status} />
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<div oninput={(e) => (editPlace = typed(e))}>
											<label>Place <PlaceInput name="placeName" value={ideaName(idea)} {places} required /></label>
										</div>
										{#if editClash}
											{@render clashNote(editClash)}
										{:else if editOthers.length}
											{@render similarNote(editOthers)}
										{/if}
										<label>Notes <textarea name="details" rows="2" placeholder="What to do or see there" value={idea.details ?? ''}></textarea></label>
										<div class="pair">
											<label>
												Priority
												<select name="priority" value={idea.priority}>
													{#each PRIORITIES as p (p.key)}<option value={p.key}>{p.label}</option>{/each}
												</select>
											</label>
											<label>
												City
												<select
													name="cityId"
													value={String(idea.cityId ?? '')}
													onchange={(e) => (editCity = e.currentTarget.value ? Number(e.currentTarget.value) : null)}
												>
													{#each cities as c (c.id)}
														<option value={String(c.id)}>{placeName(c.placeId)}{c.priority === 'skip' ? ' (skipped)' : ''}</option>
													{/each}
													<option value="">No city</option>
												</select>
											</label>
										</div>
										<input name="reason" value={idea.reason ?? ''} placeholder="Why (or why not)" aria-label="Reason" />
										<div class="row">
											<button class="sm primary" disabled={!!editClash}>Save</button>
											<button class="sm danger ghost" formaction="?/deleteIdea">Delete</button>
										</div>
									</form>
								{/if}
							</article>
						{/each}
					</div>
					{#if col.items.length === 0}<p class="hint small muted">Drag ideas here</p>{/if}
				</section>
			{/each}
		</div>

		</div>

		{#if city}
			<footer class="foot">
				<form
					method="POST"
					action="?/deleteCity"
					use:enhance={({ cancel }) => {
						if (!confirm(`Remove ${title} from the trip? Its ideas are kept, without a city.`)) return cancel();
						return async ({ update }) => {
							await update();
							onclose();
						};
					}}
				>
					<input type="hidden" name="cityId" value={city.id} />
					<button class="sm danger ghost">Remove city</button>
				</form>
				<button type="button" onclick={onclose}>Done</button>
			</footer>
		{/if}
	</div>
</div>

{#snippet clashNote(m: Idea)}
	<div class="clash small" role="alert">
		<strong>{ideaName(m)}</strong> is already in {cityLabel(m.cityId)}. Edit that one instead.
	</div>
{/snippet}

{#snippet similarNote(matches: Idea[])}
	<div class="similar small" role="status">
		<strong>Similar place already on this trip:</strong>
		{#each matches as m, i (m.id)}
			{i ? ', ' : ''}{ideaName(m)} <span class="muted">({cityLabel(m.cityId)} · {m.priority})</span>
		{/each}
		<span class="muted">· you can still add it.</span>
	</div>
{/snippet}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgb(0 0 0 / 0.45);
		overflow: hidden;
		padding: clamp(0.75rem, 5vw, 4rem) clamp(0.75rem, 6vw, 6rem);
	}
	/*
	 * Nearly full screen with a margin around it. Title and footer stay put; only the body
	 * (city details, add bar, idea columns) scrolls.
	 */
	.modal {
		box-sizing: border-box;
		height: 100%;
		overflow: hidden;
		box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
		background: var(--surface);
		display: flex;
		flex-direction: column;
		padding: 1rem clamp(1rem, 3vw, 2rem);
	}
	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		margin-right: -0.5rem;
		padding-right: 0.5rem;
	}
	.cols {
		flex: 1 0 auto;
	}
	.col {
		align-self: stretch;
		display: flex;
		flex-direction: column;
	}
	.zone {
		flex: 1;
	}
	.foot {
		flex: none;
		padding-top: 0.6rem;
		border-top: 1px solid var(--border);
	}
	.head {
		align-items: flex-start;
	}
	h2 {
		margin: 0 0 0.25rem;
	}
	.close {
		font-size: 1.1rem;
		line-height: 1;
	}
	.badge.prio-must {
		background: var(--focus-soft);
		color: var(--focus);
	}
	.badge.prio-maybe {
		background: var(--maybe-soft);
		color: var(--maybe);
	}
	.city-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: end;
	}
	.why {
		flex: 1 1 280px;
	}
	.nights {
		display: flex;
		gap: 0.5rem;
	}
	.nights input {
		width: 4.5rem;
	}
	.add {
		display: grid;
		grid-template-columns: minmax(200px, 1fr) auto auto;
		grid-template-areas:
			'place seg add'
			'notes notes notes';
		gap: 0.5rem;
		align-items: center;
		padding: 0.6rem;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	@media (max-width: 720px) {
		.add {
			grid-template-columns: 1fr;
			grid-template-areas: 'place' 'notes' 'seg' 'add';
		}
		.add .seg button {
			flex: 1;
		}
	}
	.add .place {
		grid-area: place;
	}
	.add .notes {
		grid-area: notes;
	}
	.add .similar,
	.add .clash {
		grid-column: 1 / -1;
	}
	.bucket-strip {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
	}
	.chip-btn {
		border-style: dashed;
		border-radius: 999px;
	}
	.modal button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.clash {
		margin: 0;
		padding: 0.4rem 0.6rem;
		border-radius: 7px;
		background: var(--accent-soft);
		color: var(--text);
		border: 1px solid var(--accent);
	}
	.similar {
		padding: 0.4rem 0.6rem;
		border-radius: 7px;
		background: var(--dupe-soft);
		color: var(--text);
		border: 1px solid var(--dupe);
	}
	.idea.dupe {
		background: var(--dupe-soft);
		border-color: var(--dupe);
		box-shadow: inset 3px 0 0 var(--dupe);
	}
	.dupe-note {
		margin-top: 0.15rem;
		color: var(--text);
	}
	.dupe-note::before {
		content: '⚠ ';
		color: var(--dupe);
	}
	.add .seg {
		grid-area: seg;
	}
	.add > button.primary {
		grid-area: add;
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: 7px;
		overflow: hidden;
	}
	.seg button {
		border: 0;
		border-radius: 0;
		padding: 0.35rem 0.65rem;
		background: var(--surface);
	}
	.seg button + button {
		border-left: 1px solid var(--border);
	}
	.seg button.on {
		background: var(--focus-soft);
		color: var(--focus);
		font-weight: 600;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.6rem;
		align-items: stretch;
	}
	@media (max-width: 720px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
	.col {
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-top-width: 3px;
		border-radius: var(--radius);
		padding: 0.5rem;
	}
	.col.prio-must {
		border-top-color: var(--focus);
	}
	.col.prio-maybe {
		border-top-color: var(--maybe);
	}
	.col.prio-skip {
		border-top-color: var(--muted);
	}
	.col.prio-skip .idea {
		opacity: 0.7;
	}
	h3 {
		margin: 0 0 0.4rem;
		font-size: 0.95rem;
	}
	.zone {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-height: 3rem;
	}
	.idea {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.45rem 0.55rem;
		cursor: grab;
	}
	.top {
		flex-wrap: nowrap;
		gap: 0.35rem;
	}
	.details {
		margin: 0.25rem 0 0;
		white-space: pre-wrap;
	}
	.edit {
		margin-top: 0.45rem;
		cursor: auto;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}
	.col {
		position: relative;
	}
	.hint {
		position: absolute;
		inset: 2rem 0 0;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0;
		pointer-events: none;
	}
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
</style>
