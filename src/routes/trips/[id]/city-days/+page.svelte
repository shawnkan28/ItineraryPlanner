<script lang="ts">
	/**
	 * Phase 2: how many days each city gets. One city at a time: an unscheduled pool of its
	 * Must / Maybe ideas and a column per day; drag ideas into days. Days set the city's nights.
	 */
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { daysBetween } from '#lib/dates.ts';
	import { keep } from '#lib/forms.ts';
	import type { Idea } from '#lib/server/db/schema.ts';

	let { data } = $props();
	const placeName = (id: number | null) => data.places.find((p) => p.id === id)?.name ?? '';
	const ideaName = (i: Idea) => placeName(i.placeId) || i.title;
	const tripNights = $derived(daysBetween(data.trip.startDate, data.trip.endDate));

	const daysOf = (cityId: number) => data.days.filter((d) => d.tripCityId === cityId);
	const selectedId = $derived(Number(page.url.searchParams.get('city')) || data.cities[0]?.id || null);
	const city = $derived(data.cities.find((c) => c.id === selectedId) ?? data.cities[0] ?? null);
	const totalDays = $derived(data.days.length);
	const mustDays = $derived(data.cities.filter((c) => c.priority === 'must').reduce((n, c) => n + daysOf(c.id).length, 0));
	const pct = (n: number) => Math.max(0, Math.min(100, (n / Math.max(tripNights, 1)) * 100));

	type Column = { dayId: number | null; items: Idea[] };
	const byPriority = (a: Idea, b: Idea) => Number(a.priority === 'maybe') - Number(b.priority === 'maybe');
	let columns: Column[] = $derived(
		city
			? [
					{
						dayId: null,
						items: data.ideas.filter((i) => i.cityId === city.id && i.cityDayId === null).sort(byPriority)
					},
					...daysOf(city.id).map((d) => ({ dayId: d.id, items: data.ideas.filter((i) => i.cityDayId === d.id) }))
				]
			: []
	);
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
					kind: 'cityDays',
					tripId: data.trip.id,
					cityId: city!.id,
					columns: columns.map((c) => ({ dayId: c.dayId, ids: c.items.map((x) => x.id) }))
				})
			});
			await invalidateAll();
		}, 0);
	}

	// Drag the city pills to set the order; a plain click still selects the city.
	type Pill = (typeof data.cities)[number];
	let pills: Pill[] = $derived(data.cities);
	function pillsConsider(e: CustomEvent<DndEvent<Pill>>) {
		pills = e.detail.items;
	}
	async function pillsFinalize(e: CustomEvent<DndEvent<Pill>>) {
		pills = e.detail.items;
		await fetch('/api/reorder', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ kind: 'cityOrder', tripId: data.trip.id, ids: pills.map((c) => c.id) })
		});
		await invalidateAll();
	}

	const pick = (id: number) => goto(`?city=${id}`, { replace: true, reset: false });
	const dayLabel = (dayId: number) => data.days.find((d) => d.id === dayId)?.label ?? '';
	const dayNumber = (dayId: number) => daysOf(city!.id).findIndex((d) => d.id === dayId) + 1;
</script>

<svelte:head><title>Days · {data.trip.name}</title></svelte:head>

<main class="stack wide">
	<div class="spread">
		<div>
			<h2>Phase 2 · Days in each city</h2>
			<p class="muted small">
				Pick a city, add a day for each day you want there, and drag its ideas into the days. Drag
				the city buttons to put them in order. The number of days becomes the city's nights in Route.
			</p>
		</div>
		<a class="next" href="/trips/{data.trip.id}/route">Next: build route →</a>
	</div>

	{#if data.cities.length === 0}
		<p class="card small">No cities yet. <a href="/trips/{data.trip.id}/cities">Shortlist cities and their ideas</a> first.</p>
	{:else}
		<div class="card summary small">
			<div><strong>{totalDays} {totalDays === 1 ? 'day' : 'days'} planned</strong> ({mustDays} in Must cities) · trip has {tripNights} nights</div>
			<div class="meter" title="Days planned against the trip length">
				<div class="fill must" style="width:{pct(mustDays)}%"></div>
				<div class="fill maybe" style="width:{Math.min(pct(totalDays - mustDays), 100 - pct(mustDays))}%"></div>
			</div>
			{#if totalDays > tripNights}
				<div class="bad">{totalDays - tripNights} more days than the trip has: trim a city, or drop a Maybe one.</div>
			{:else}
				<div class="muted">{tripNights - totalDays} nights not planned yet.</div>
			{/if}
		</div>

		<nav
			class="cities"
			aria-label="Cities (drag to reorder)"
			use:dndzone={{ items: pills, flipDurationMs, type: 'city-order', dropTargetStyle: {} }}
			onconsider={pillsConsider}
			onfinalize={pillsFinalize}
		>
			{#each pills as c (c.id)}
				{@const n = daysOf(c.id).length}
				<button
					type="button"
					class="pill prio-{c.priority}"
					class:on={c.id === city?.id}
					aria-current={c.id === city?.id ? 'true' : undefined}
					onclick={() => pick(c.id)}
					animate:flip={{ duration: flipDurationMs }}
				>
					<span class="grip" aria-hidden="true">⠿</span>
					{placeName(c.placeId)} <span class="muted">· {n ? `${n} ${n === 1 ? 'day' : 'days'}` : 'no days'}</span>
				</button>
			{/each}
		</nav>

		{#if city}
			<section class="city">
				<header class="spread">
					<div>
						<h3>{placeName(city.placeId)} <span class="badge {city.priority === 'must' ? 'green' : 'amber'}">{city.priority}</span></h3>
						{#if city.notes}<p class="small muted why">{city.notes}</p>{/if}
					</div>
					<form method="POST" action="?/addDay&city={city.id}" use:enhance>
						<input type="hidden" name="cityId" value={city.id} />
						<button class="primary">+ Add day</button>
					</form>
				</header>

				<div class="board">
					{#each columns as col, ci (col.dayId ?? 'pool')}
						<section class="column" class:pool={col.dayId === null}>
							{#if col.dayId === null}
								<header>
									<h4>Ideas <span class="muted small">· {col.items.length} not in a day</span></h4>
								</header>
							{:else}
								<header class="day-head">
									<h4>Day {dayNumber(col.dayId)}</h4>
									<form method="POST" action="?/renameDay&city={city.id}" use:enhance={keep} class="grow">
										<input type="hidden" name="dayId" value={col.dayId} />
										<input
											name="label"
											class="label"
											value={dayLabel(col.dayId)}
											placeholder="Theme (optional)"
											aria-label="Day {dayNumber(col.dayId)} theme"
											onchange={(e) => e.currentTarget.form?.requestSubmit()}
										/>
									</form>
									<form
										method="POST"
										action="?/deleteDay&city={city.id}"
										use:enhance={({ cancel }) => {
											if (col.items.length && !confirm(`Remove Day ${dayNumber(col.dayId!)}? Its ideas go back to the Ideas column.`)) cancel();
										}}
									>
										<input type="hidden" name="dayId" value={col.dayId} />
										<button class="sm ghost" aria-label="Remove Day {dayNumber(col.dayId)}" title="Remove this day">✕</button>
									</form>
								</header>
							{/if}
							<div
								class="zone"
								use:dndzone={{ items: col.items, flipDurationMs, type: `city-${city.id}`, dropTargetStyle: {} }}
								onconsider={(e) => consider(ci, e)}
								onfinalize={(e) => finalize(ci, e)}
							>
								{#each col.items as idea (idea.id)}
									<article class="idea prio-{idea.priority}" animate:flip={{ duration: flipDurationMs }}>
										<div class="spread top">
											<strong class="grow">{ideaName(idea)}</strong>
											<span class="badge small {idea.priority === 'must' ? 'green' : 'amber'}">{idea.priority}</span>
										</div>
										{#if idea.details}<p class="small details">{idea.details}</p>{/if}
									</article>
								{/each}
							</div>
							{#if col.items.length === 0}
								<p class="hint small muted">
									{#if col.dayId === null}
										{daysOf(city.id).length ? 'Every idea has a day' : 'Add a day, then drag ideas into it'}
									{:else}
										Drag ideas here
									{/if}
								</p>
							{/if}
						</section>
					{/each}
					{#if daysOf(city.id).length === 0}
						<form method="POST" action="?/addDay&city={city.id}" use:enhance class="column add-col">
							<input type="hidden" name="cityId" value={city.id} />
							<button class="ghost">+ Add Day 1</button>
						</form>
					{/if}
				</div>
				<p class="small muted">
					Ideas for {placeName(city.placeId)} are added in <a href="/trips/{data.trip.id}/cities">1 · Cities</a>. Skipped ideas don't show here.
				</p>
			</section>
		{/if}
	{/if}
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
	.summary {
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
	.cities {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.grip {
		color: var(--muted);
		margin-right: 0.15rem;
		cursor: grab;
	}
	.pill {
		cursor: grab;
		border-radius: 999px;
		padding: 0.35rem 0.8rem;
		border-left-width: 4px;
	}
	.pill.prio-must {
		border-left-color: var(--focus);
	}
	.pill.prio-maybe {
		border-left-color: var(--maybe);
	}
	.pill.on {
		background: var(--focus-soft);
		border-color: var(--focus);
		font-weight: 600;
	}
	.city {
		display: grid;
		gap: 0.6rem;
	}
	h3 {
		margin: 0;
	}
	.why {
		margin: 0.2rem 0 0;
	}
	.board {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(240px, 280px);
		gap: 0.75rem;
		overflow-x: auto;
		padding-bottom: 0.5rem;
		align-items: stretch;
	}
	@media (max-width: 640px) {
		.board {
			grid-auto-flow: row;
			grid-auto-columns: auto;
		}
	}
	.column {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 320px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-top: 3px solid var(--info);
		border-radius: var(--radius);
		padding: 0.55rem;
	}
	.column.pool {
		border-top-color: var(--muted);
		background: var(--bg);
		border-style: dashed;
	}
	h4 {
		margin: 0;
		white-space: nowrap;
	}
	.day-head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.label {
		width: 100%;
		padding: 0.2rem 0.4rem;
		font-size: 0.85rem;
	}
	.zone {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-height: 3rem;
	}
	.idea {
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 3px solid var(--maybe);
		border-radius: 8px;
		padding: 0.45rem 0.55rem;
		cursor: grab;
	}
	.idea.prio-must {
		border-left-color: var(--focus);
	}
	.top {
		flex-wrap: nowrap;
		gap: 0.3rem;
	}
	.details {
		margin: 0.25rem 0 0;
		color: var(--muted);
		white-space: pre-wrap;
	}
	.hint {
		position: absolute;
		inset: 2.5rem 0 0;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0;
		padding: 0 1rem;
		text-align: center;
		pointer-events: none;
	}
	.add-col {
		align-items: center;
		justify-content: center;
		background: none;
		border-style: dashed;
		border-top-width: 1px;
	}
</style>
