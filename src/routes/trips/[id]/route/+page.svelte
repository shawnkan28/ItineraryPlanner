<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { dndzone, SHADOW_ITEM_MARKER_PROPERTY_NAME, TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { addDays, daysBetween, niceDate } from '#lib/dates.ts';
	import { keep } from '#lib/forms.ts';
	import PlaceInput from '#lib/components/PlaceInput.svelte';
	import { MODE_ICON, STOP_KINDS, TRANSPORT_MODES, stopTitle } from '#lib/route.ts';
	import type { RouteStop, StopKind } from '#lib/server/db/schema.ts';

	let { data, form } = $props();
	const tripNights = $derived(daysBetween(data.trip.startDate, data.trip.endDate));
	const placeName = (id: number | null) => data.places.find((p) => p.id === id)?.name ?? '';
	const KIND_KEYS = Object.keys(STOP_KINDS) as StopKind[];
	const icon = (s: RouteStop) =>
		s.kind === 'overnight_transport' ? MODE_ICON[s.transportMode ?? 'ferry'] : STOP_KINDS[s.kind].icon;
	/** A card as a stop-like object, so palette cards (not saved yet) can be titled too. */
	const asStop = (c: Card | undefined) =>
		c ? (c.stop ?? { placeId: c.placeId, label: null, kind: 'stay' as const, transportMode: null, operator: null }) : null;
	const nameOf = (id: number | null) => placeName(id) || null;

	const cityOf = (placeId: number | null) => data.cities.find((c) => c.placeId === placeId);
	const mustCities = $derived(data.cities.filter((c) => c.priority === 'must'));

	// The stop editor: kind is chosen first and decides which fields follow.
	let editKind: StopKind = $state('stay');
	function openEditor(s: RouteStop) {
		editing = editing === s.id ? null : s.id;
		editKind = s.kind;
	}
	// Add form at the bottom of each column, per route option.
	let addKind: Record<number, StopKind> = $state({});
	const flipDurationMs = 150;

	/**
	 * One card type for the whole board. Existing stops have id `s-<stopId>`; cards dragged out of
	 * the places palette keep a `p-...` id until saved, and only carry a placeId.
	 */
	type Card = { id: string; stop: RouteStop | null; placeId: number | null; nights?: number; [key: string]: unknown };
	type Column = { optionId: number; items: Card[] };

	const stopCard = (s: RouteStop): Card => ({ id: `s-${s.id}`, stop: s, placeId: s.placeId });

	let columns: Column[] = $derived(
		data.options.map((o) => ({ optionId: o.id, items: o.stops.map(stopCard) }))
	);

	// Palette: shortlisted cities first (Must, then Maybe), then the rest of the library, filterable.
	let search = $state('');
	const RANK = { must: 0, maybe: 1, skip: 3 } as const;
	const rank = (placeId: number) => {
		const c = cityOf(placeId);
		return c ? RANK[c.priority] : 2;
	};
	const paletteSource = $derived(
		data.places
			.filter((p) => cityOf(p.id) || p.level === 'city' || p.level === 'area' || p.level === 'region')
			.filter((p) => {
				const q = search.trim().toLowerCase();
				return !q || p.name.toLowerCase().includes(q) || p.aliases.some((a) => a.toLowerCase().includes(q));
			})
			.filter((p) => search.trim() || cityOf(p.id)?.priority !== 'skip')
			.sort((a, b) => rank(a.id) - rank(b.id) || (cityOf(a.id)?.position ?? 0) - (cityOf(b.id)?.position ?? 0))
			.map((p): Card => ({ id: `p-${p.id}`, stop: null, placeId: p.id, nights: cityOf(p.id)?.nightsMin }))
	);
	let palette: Card[] = $derived(paletteSource);

	// Dragging from the palette copies: put a fresh card back where the dragged one was.
	function paletteConsider(e: CustomEvent<DndEvent<Card>>) {
		const { trigger, id } = e.detail.info;
		if (trigger === TRIGGERS.DRAG_STARTED) {
			const idx = palette.findIndex((c) => c.id === id);
			const items = e.detail.items.filter((c) => !c[SHADOW_ITEM_MARKER_PROPERTY_NAME]);
			items.splice(idx, 0, { ...palette[idx], id: `${palette[idx].id}-${Math.random().toString(36).slice(2, 8)}` });
			palette = items;
		} else {
			palette = [...palette];
		}
	}
	function paletteFinalize() {
		palette = paletteSource;
	}

	function consider(ci: number, e: CustomEvent<DndEvent<Card>>) {
		columns = columns.map((c, i) => (i === ci ? { ...c, items: e.detail.items } : c));
	}
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	function finalize(ci: number, e: CustomEvent<DndEvent<Card>>) {
		columns = columns.map((c, i) => (i === ci ? { ...c, items: e.detail.items } : c));
		// a move between columns finalizes both; save once with the final state
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 0);
	}
	let saving = $state(false);
	async function save() {
		saving = true;
		try {
			await fetch('/api/reorder', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					kind: 'stops',
					tripId: data.trip.id,
					columns: columns.map((c) => ({
						optionId: c.optionId,
						items: c.items.map((card) => (card.stop ? { id: card.stop.id } : { placeId: card.placeId, nights: card.nights }))
					}))
				})
			});
			await invalidateAll();
		} finally {
			saving = false;
		}
	}

	/** Start date of every card in a column (drafts are dated from the trip start too). */
	function datesFor(items: Card[]) {
		let d = data.trip.startDate;
		return items.map((c) => {
			const start = d;
			d = addDays(d, c.stop?.nights ?? c.nights ?? 1);
			return start;
		});
	}
	const totalNights = (items: Card[]) => items.reduce((n, c) => n + (c.stop?.nights ?? c.nights ?? 1), 0);
	let editing: number | null = $state(null);
	const optionOf = (id: number) => data.options.find((o) => o.id === id)!;
	const missingMust = (items: Card[]) => mustCities.filter((c) => !items.some((card) => card.placeId === c.placeId));
</script>

<svelte:head><title>Route · {data.trip.name}</title></svelte:head>

<main class="stack wide">
	<div class="spread">
		<div>
			<h2>Phase 2 · Route options</h2>
			<p class="muted small">
				Put your shortlisted cities in order. Drag cities from the left into a route, drag stops to
				reorder them or move them to another route. The trip has <strong>{tripNights}</strong> nights.
			</p>
		</div>
		<div class="row">
			{#if saving}<span class="muted small">Saving…</span>{/if}
			<form method="POST" action="?/addOption" use:enhance><button>+ New route</button></form>
		</div>
	</div>
	{#if form && 'error' in form}<p class="error">{form.error}</p>{/if}
	{#if form && 'chosen' in form}<p class="badge green">“{form.chosen}” is now the final route</p>{/if}

	{#if data.cities.length === 0}
		<p class="muted small">Tip: shortlist your cities in <a href="/trips/{data.trip.id}/cities">1 · Cities</a> first; they show up at the top of the palette.</p>
	{/if}
	<div class="board">
		<!-- PLACES PALETTE -->
		<section class="column palette">
			<header>
				<h3>Places</h3>
				<input bind:value={search} placeholder="Filter cities" aria-label="Filter places" />
			</header>
			<div
				class="zone"
				use:dndzone={{ items: palette, flipDurationMs, type: 'stop', dropFromOthersDisabled: true, dropTargetStyle: {} }}
				onconsider={paletteConsider}
				onfinalize={paletteFinalize}
			>
				{#each palette as card (card.id)}
					{@const city = cityOf(card.placeId)}
					<div class="chip" class:must={city?.priority === 'must'} class:maybe={city?.priority === 'maybe'} animate:flip={{ duration: flipDurationMs }}>
						<span class="grow">{placeName(card.placeId)}</span>
						{#if city && city.priority !== 'skip'}<span class="tag small">{city.priority} · {city.nightsMax ? `${city.nightsMin}–${city.nightsMax}` : city.nightsMin}n</span>{/if}
					</div>
				{/each}
			</div>
			{#if palette.length === 0}
				<p class="muted small">
					{search ? 'No match.' : 'No cities yet.'} Import from the vault in <a href="/settings">Settings</a>, or type a new city at the bottom of a route.
				</p>
			{/if}
		</section>

		<!-- ROUTE OPTIONS -->
		{#each columns as col, ci (col.optionId)}
			{@const opt = optionOf(col.optionId)}
			{@const total = totalNights(col.items)}
			{@const dates = datesFor(col.items)}
			{@const missing = missingMust(col.items)}
			<section class="column route" class:chosen={opt?.isChosen}>
				{#if opt}
					<header>
						<form method="POST" action="?/updateOption" use:enhance={keep} class="row">
							<input type="hidden" name="optionId" value={opt.id} />
							<input
								name="name"
								value={opt.name}
								class="grow name"
								aria-label="Route name"
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
							/>
							{#if opt.isChosen}<span class="badge green">chosen</span>{/if}
						</form>
						<div class="meter" title="{total} of {tripNights} nights">
							<div class="fill" class:over={total > tripNights} class:full={total === tripNights} style="width:{Math.min(100, (total / Math.max(tripNights, 1)) * 100)}%"></div>
						</div>
						<div class="small" class:bad={total !== tripNights} class:good={total === tripNights}>
							{total} / {tripNights} nights
							{#if total < tripNights}· {tripNights - total} to place{:else if total > tripNights}· {total - tripNights} too many{:else}✓{/if}
						</div>
						{#if missing.length}
							<div class="small missing" title="Must cities not in this route">
								Missing: {missing.map((c) => placeName(c.placeId)).join(', ')}
							</div>
						{/if}
					</header>

					<div
						class="zone stops"
						use:dndzone={{ items: col.items, flipDurationMs, type: 'stop', dropTargetStyle: {}, dragDisabled: editing !== null }}
						onconsider={(e) => consider(ci, e)}
						onfinalize={(e) => finalize(ci, e)}
					>
						{#each col.items as card, i (card.id)}
							{@const s = card.stop}
							<article class="card stop" animate:flip={{ duration: flipDurationMs }}>
								<div class="spread top">
									<div class="grow">
										<strong>
											{#if s && icon(s)}<span title={STOP_KINDS[s.kind].label}>{icon(s)}</span>{/if}
											{stopTitle(asStop(card)!, asStop(col.items[i + 1]), nameOf) || '(no place)'}
										</strong>
										{#if s?.kind === 'overnight_transport'}
											<div class="small sub">
												{[s.transportMode ?? 'ferry', s.operator, s.placeId ? `from ${placeName(s.placeId)}` : null].filter(Boolean).join(' · ')}
												{#if !s.placeId}· <span class="bad">pick where it departs</span>{/if}
											</div>
										{/if}
										<div class="muted small">
											{niceDate(dates[i])}{#if (s?.nights ?? 1) > 0} → {niceDate(addDays(dates[i], s?.nights ?? 1))}{/if}
										</div>
									</div>
									{#if s}
										<button class="sm ghost" onclick={() => openEditor(s)} aria-label="Edit stop">⋯</button>
									{/if}
								</div>
								{#if s}
									<form method="POST" action="?/setNights" use:enhance class="stepper">
										<input type="hidden" name="stopId" value={s.id} />
										<button class="sm" name="nights" value={Math.max(0, s.nights - 1)} disabled={s.nights === 0} aria-label="One night less">−</button>
										<span>{s.nights} {s.nights === 1 ? 'night' : 'nights'}</span>
										<button class="sm" name="nights" value={s.nights + 1} aria-label="One night more">+</button>
									</form>
									{#if editing === s.id}
										<form
											method="POST"
											action="?/updateStop"
											use:enhance={() => async ({ update, result }) => {
												await update({ reset: false });
												if (result.type === 'success') editing = null;
											}}
											class="stack edit"
										>
											<input type="hidden" name="stopId" value={s.id} />
											<input type="hidden" name="nights" value={s.nights} />
											<fieldset class="kinds">
												<legend class="small muted">Kind</legend>
												{#each KIND_KEYS as k (k)}
													<label class="kind" class:on={editKind === k}>
														<input type="radio" name="kind" value={k} bind:group={editKind} />
														{STOP_KINDS[k].label}
													</label>
												{/each}
											</fieldset>
											<label>
												{STOP_KINDS[editKind].place}
												<PlaceInput name="placeName" value={placeName(s.placeId)} places={data.places} levels={['city', 'area', 'place']} />
												<span class="hint">{STOP_KINDS[editKind].placeHint}</span>
											</label>
											{#if editKind === 'overnight_transport'}
												<div class="pair">
													<label>
														Mode
														<select name="transportMode" value={s.transportMode ?? 'ferry'}>
															{#each TRANSPORT_MODES as m (m)}<option value={m}>{MODE_ICON[m]} {m}</option>{/each}
														</select>
													</label>
													<label>Operator <input name="operator" value={s.operator ?? ''} placeholder="MOL Sunflower" /></label>
												</div>
											{/if}
											{#if editKind !== 'depart'}
												<label>
													Label (optional)
													<input
														name="label"
														value={s.label ?? ''}
														placeholder={editKind === 'overnight_transport'
															? stopTitle({ ...s, label: null, kind: editKind }, asStop(col.items[i + 1]), nameOf)
															: 'Shown instead of the city'}
													/>
													{#if editKind === 'overnight_transport'}<span class="hint">Leave empty to name it after the next stop</span>{/if}
												</label>
											{/if}
											<div class="row">
												<button class="primary sm">Save</button>
												<button type="button" class="sm" onclick={() => (editing = null)}>Cancel</button>
												<button class="sm danger ghost" formaction="?/deleteStop">Remove</button>
											</div>
										</form>
									{/if}
								{:else}
									<span class="muted small">saving…</span>
								{/if}
							</article>
						{/each}
					</div>
					{#if col.items.length === 0}<p class="drop-hint small muted">Drop places here</p>{/if}

					<form method="POST" action="?/addStop" use:enhance class="add">
						<input type="hidden" name="optionId" value={opt.id} />
						<select name="kind" bind:value={() => addKind[opt.id] ?? 'stay', (v) => (addKind[opt.id] = v)} aria-label="Kind of stop" class="add-kind">
							{#each KIND_KEYS as k (k)}<option value={k}>{STOP_KINDS[k].label}</option>{/each}
						</select>
						<input type="hidden" name="nights" value={STOP_KINDS[addKind[opt.id] ?? 'stay'].nights} />
						<PlaceInput
							name="placeName"
							places={data.places}
							placeholder={`+ ${STOP_KINDS[addKind[opt.id] ?? 'stay'].place}`}
							levels={['city', 'area', 'place']}
						/>
						<button class="sm">Add</button>
					</form>

					<details class="notes">
						<summary class="small muted">Notes{opt.notes ? ' ·' : ''} {opt.notes ? opt.notes.slice(0, 40) : ''}</summary>
						<form method="POST" action="?/updateOption" use:enhance={keep}>
							<input type="hidden" name="optionId" value={opt.id} />
							<input type="hidden" name="name" value={opt.name} />
							<textarea
								name="notes"
								rows="3"
								placeholder="Pros / cons of this route"
								value={opt.notes ?? ''}
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
							></textarea>
						</form>
					</details>

					<footer class="row">
						<form method="POST" action="?/choose" use:enhance>
							<input type="hidden" name="optionId" value={opt.id} />
							{#if opt.isChosen}
								<button class="sm" title="Re-date stops and fill empty day cities">Re-apply to days</button>
							{:else}
								<button class="sm primary">Choose this route</button>
							{/if}
						</form>
						<form method="POST" action="?/addOption" use:enhance>
							<input type="hidden" name="copyFrom" value={opt.id} />
							<input type="hidden" name="name" value="{opt.name} (copy)" />
							<button class="sm ghost">Duplicate</button>
						</form>
						{#if !opt.isChosen}
							<form method="POST" action="?/deleteOption" use:enhance>
								<input type="hidden" name="optionId" value={opt.id} />
								<button class="sm ghost danger">Delete</button>
							</form>
						{/if}
					</footer>
				{/if}
			</section>
		{/each}

		<form method="POST" action="?/addOption" use:enhance class="column add-col">
			<button class="ghost">+ New route</button>
		</form>
	</div>
</main>

<style>
	.wide {
		max-width: none;
	}
	.board {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		overflow-x: auto;
		padding-bottom: 1rem;
		min-height: 60vh;
	}
	.column {
		flex: 0 0 290px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: calc(100vh - 220px);
	}
	.column header {
		display: grid;
		gap: 0.35rem;
	}
	.column h3 {
		margin: 0;
	}
	.palette {
		flex-basis: 200px;
		position: sticky;
		left: 0;
		z-index: 2;
	}
	.route.chosen {
		border-color: var(--focus);
		box-shadow: 0 0 0 1px var(--focus);
	}
	.name {
		font-weight: 600;
	}
	.meter {
		height: 4px;
		border-radius: 2px;
		background: var(--border);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--maybe);
	}
	.fill.full {
		background: var(--focus);
	}
	.fill.over {
		background: var(--accent);
	}
	.zone {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-height: 3rem;
		overflow-y: auto;
		padding: 2px;
	}
	.missing {
		color: var(--accent);
	}
	.chip {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.chip.must {
		border-left: 3px solid var(--focus);
	}
	.chip.maybe {
		border-left: 3px solid var(--maybe);
	}
	.chip .tag {
		color: var(--muted);
		white-space: nowrap;
	}
	.palette .zone {
		gap: 0.3rem;
	}
	.chip {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 7px;
		padding: 0.35rem 0.6rem;
		cursor: grab;
		font-size: 0.9rem;
	}
	.stop {
		padding: 0.55rem 0.65rem;
		cursor: grab;
	}
	.top {
		align-items: flex-start;
		flex-wrap: nowrap;
	}
	.stepper {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.35rem;
		font-size: 0.85rem;
	}
	.stepper button {
		min-width: 1.9rem;
	}
	.edit {
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--border);
	}
	.drop-hint {
		margin: -2.6rem 0 0;
		text-align: center;
		pointer-events: none;
		padding: 0.75rem 0;
	}
	.add {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.35rem;
	}
	.add-kind {
		grid-column: 1 / -1;
	}
	.sub {
		color: var(--info);
	}
	.kinds {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.kinds legend {
		margin-bottom: 0.25rem;
	}
	.kind {
		display: inline-flex;
		align-items: center;
		padding: 0.2rem 0.55rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text);
		cursor: pointer;
		font-size: 0.8rem;
	}
	.kind input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.kind.on {
		background: var(--text);
		color: var(--bg);
		border-color: var(--text);
	}
	.kind:has(input:focus-visible) {
		outline: 2px solid var(--accent);
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}
	.hint {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.notes textarea {
		margin-top: 0.35rem;
	}
	.bad {
		color: var(--maybe);
	}
	.good {
		color: var(--focus);
	}
	footer {
		border-top: 1px solid var(--border);
		padding-top: 0.5rem;
		gap: 0.25rem;
	}
	.add-col {
		flex-basis: 180px;
		background: transparent;
		border-style: dashed;
		align-items: stretch;
	}
	@media (max-width: 640px) {
		.column {
			flex-basis: 82vw;
			max-height: none;
		}
		.palette {
			position: static;
			flex-basis: 60vw;
		}
	}
</style>
