<script lang="ts">
	import { enhance } from '$app/forms';
	import PlaceInput from '#lib/components/PlaceInput.svelte';
	import type { BucketEntry } from '#lib/server/bucket.ts';

	let { data, form } = $props();

	type Filter = 'all' | 'saved' | 'skipped' | 'been';
	let filter: Filter = $state('all');
	let search = $state('');
	let showHidden = $state(false);
	let addKind: 'city' | 'place' = $state('place');
	/** Card being edited, and the kind chosen in its form. */
	let editing: number | null = $state(null);
	let editKind: 'city' | 'place' = $state('place');
	function startEdit(e: BucketEntry) {
		editing = editing === e.placeId ? null : e.placeId;
		editKind = e.isCity ? 'city' : 'place';
	}

	const skipped = (e: BucketEntry) => e.sources.filter((s) => s.kind === 'skipped');
	const been = (e: BucketEntry) => e.sources.filter((s) => s.kind === 'been');
	const matches = (e: BucketEntry) => {
		if (e.hidden !== showHidden) return false;
		if (filter === 'saved' && !e.saved) return false;
		if (filter === 'skipped' && !skipped(e).length) return false;
		if (filter === 'been' && !been(e).length) return false;
		const q = search.trim().toLowerCase();
		return !q || e.name.toLowerCase().includes(q) || (e.cityName ?? '').toLowerCase().includes(q);
	};
	const visible = $derived(data.entries.filter(matches));
	const cities = $derived(visible.filter((e) => e.isCity));
	/** Places grouped under their city ("Other places" when unknown). */
	const placeGroups = $derived.by(() => {
		const groups = new Map<string, BucketEntry[]>();
		for (const e of visible.filter((x) => !x.isCity)) {
			const key = e.cityName ?? 'Other places';
			groups.set(key, [...(groups.get(key) ?? []), e]);
		}
		return [...groups.entries()].sort(([a], [b]) => (a === 'Other places' ? 1 : b === 'Other places' ? -1 : a.localeCompare(b)));
	});
	const count = (f: Filter) =>
		data.entries.filter((e) => !e.hidden && (f === 'all' || (f === 'saved' ? e.saved : f === 'skipped' ? skipped(e).length : been(e).length))).length;
	const hiddenCount = $derived(data.entries.filter((e) => e.hidden).length);
</script>

<svelte:head><title>Bucket list</title></svelte:head>

<main class="stack">
	<div>
		<h2>Bucket list</h2>
		<p class="muted small">
			Shared by all your trips. Cities and ideas you skip land here, and so do places from trips
			you've finished. <strong>Save</strong> the ones you want to see again: saved cities are offered on
			every trip's Cities tab, and saved places pop up when you add ideas for their city. Use Edit to set
			which city a place is in.
		</p>
	</div>

	<form method="POST" action="?/add" use:enhance class="card add">
		<div class="seg" role="radiogroup" aria-label="Kind">
			<button type="button" role="radio" aria-checked={addKind === 'place'} class:on={addKind === 'place'} onclick={() => (addKind = 'place')}>Place to visit</button>
			<button type="button" role="radio" aria-checked={addKind === 'city'} class:on={addKind === 'city'} onclick={() => (addKind = 'city')}>City</button>
		</div>
		<input type="hidden" name="kind" value={addKind} />
		<label class="name">
			{addKind === 'city' ? 'City' : 'Place'}
			<PlaceInput name="placeName" places={data.places} placeholder={addKind === 'city' ? 'Hakodate' : 'Shirakawa-go'} required />
		</label>
		{#if addKind === 'place'}
			<label>In city (optional) <PlaceInput name="cityName" places={data.places} levels={['city', 'area', 'region']} placeholder="Takayama" /></label>
		{/if}
		<label class="notes">Why <input name="notes" placeholder="Saw it on a friend's trip" /></label>
		<button class="primary">Save</button>
		{#if form?.errors}<p class="error full">{Object.values(form.errors).join(', ')}</p>{/if}
	</form>

	<div class="spread filters">
		<div class="tabs-inline" role="tablist">
			{#each [['all', 'All'], ['saved', 'Saved'], ['skipped', 'Skipped'], ['been', 'Been before']] as [key, label] (key)}
				<button type="button" role="tab" aria-selected={filter === key} class:on={filter === key} onclick={() => (filter = key as Filter)}>
					{label} <span class="muted">{count(key as Filter)}</span>
				</button>
			{/each}
		</div>
		<div class="row">
			<input bind:value={search} placeholder="Search" aria-label="Search bucket list" class="search" />
			{#if hiddenCount}
				<label class="inline small"><input type="checkbox" bind:checked={showHidden} /> Hidden ({hiddenCount})</label>
			{/if}
		</div>
	</div>

	{#if visible.length === 0}
		<p class="card muted small">
			{#if data.entries.length === 0}
				Nothing yet. Skip a city or an idea on a trip, finish a trip, or save a place above.
			{:else}
				Nothing matches.
			{/if}
		</p>
	{/if}

	{#if cities.length}
		<section class="stack">
			<h3>Cities <span class="muted small">· {cities.length}</span></h3>
			<div class="grid">
				{#each cities as e (e.placeId)}{@render card(e)}{/each}
			</div>
		</section>
	{/if}

	{#each placeGroups as [city, list] (city)}
		<section class="stack">
			<h3>{city} <span class="muted small">· {list.length}</span></h3>
			<div class="grid">
				{#each list as e (e.placeId)}{@render card(e)}{/each}
			</div>
		</section>
	{/each}
</main>

{#snippet card(e: BucketEntry)}
	<article class="card item" class:saved={e.saved}>
		<div class="spread top">
			<strong class="grow">{e.name}</strong>
			{#if e.saved}<span class="badge green">saved</span>{/if}
			{#if skipped(e).length}<span class="badge">skipped</span>{/if}
			{#if been(e).length}<span class="badge blue">been</span>{/if}
		</div>
		<ul class="sources small">
			{#each e.sources as s (s.tripId + s.kind)}
				<li>
					<span class="muted">{s.kind === 'been' ? 'Been on' : 'Skipped on'}</span>
					<a href="/trips/{s.tripId}/cities">{s.trip}</a>{#if s.note}<span class="muted"> · {s.note}</span>{/if}
				</li>
			{/each}
		</ul>
		{#if !e.isCity}
			<div class="small">
				{#if e.cityName}In <strong>{e.cityName}</strong>{:else}<span class="warn">No city yet: Edit to set one, or it won't pop up on trips</span>{/if}
			</div>
		{/if}
		{#if e.notes}<p class="small note">{e.notes}</p>{/if}
		{#if !e.saved && !e.hidden}<p class="small muted hint">Save it to see it on your trips.</p>{/if}

		{#if editing === e.placeId}
			<form
				method="POST"
				action="?/update"
				use:enhance={() => async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') editing = null;
				}}
				class="stack edit"
			>
				<input type="hidden" name="placeId" value={e.placeId} />
				<input type="hidden" name="kind" value={editKind} />
				<div class="seg" role="radiogroup" aria-label="Kind">
					<button type="button" role="radio" aria-checked={editKind === 'place'} class:on={editKind === 'place'} onclick={() => (editKind = 'place')}>Place to visit</button>
					<button type="button" role="radio" aria-checked={editKind === 'city'} class:on={editKind === 'city'} onclick={() => (editKind = 'city')}>City</button>
				</div>
				{#if editKind === 'place'}
					<label>In city <PlaceInput name="cityName" value={e.cityName ?? ''} places={data.places} levels={['city', 'area', 'region']} placeholder="Osaka City" /></label>
				{/if}
				<label>Note <textarea name="notes" rows="2" placeholder="Why go">{e.notes ?? ''}</textarea></label>
				<div class="row">
					<button class="sm primary">{e.saved ? 'Save changes' : 'Save to bucket list'}</button>
					<button type="button" class="sm" onclick={() => (editing = null)}>Cancel</button>
				</div>
			</form>
		{/if}
		<form method="POST" use:enhance class="row actions">
			<input type="hidden" name="placeId" value={e.placeId} />
			{#if e.hidden}
				<button class="sm" formaction="?/reset">Unhide</button>
			{:else}
				{#if e.saved}
					<button class="sm" formaction="?/reset">Unsave</button>
				{:else}
					<button class="sm" formaction="?/save">☆ Save</button>
				{/if}
				<button type="button" class="sm" aria-expanded={editing === e.placeId} onclick={() => startEdit(e)}>{editing === e.placeId ? 'Close' : 'Edit'}</button>
				<button class="sm ghost" formaction="?/hide" title="Not interested: hide it from the list">Hide</button>
			{/if}
		</form>
	</article>
{/snippet}

<style>
	.add {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: auto minmax(160px, 1.4fr) minmax(140px, 1fr) minmax(160px, 1.4fr) auto;
		align-items: end;
	}
	.add .full {
		grid-column: 1 / -1;
		margin: 0;
	}
	@media (max-width: 900px) {
		.add {
			grid-template-columns: 1fr;
		}
	}
	.seg,
	.tabs-inline {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: 7px;
		overflow: hidden;
		align-self: end;
	}
	.seg button,
	.tabs-inline button {
		border: 0;
		border-radius: 0;
		padding: 0.4rem 0.7rem;
		background: var(--surface);
		white-space: nowrap;
	}
	.seg button + button,
	.tabs-inline button + button {
		border-left: 1px solid var(--border);
	}
	.seg button.on,
	.tabs-inline button.on {
		background: var(--focus-soft);
		color: var(--focus);
		font-weight: 600;
	}
	.filters {
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.search {
		width: 200px;
	}
	h3 {
		margin: 0;
	}
	.grid {
		display: grid;
		gap: 0.6rem;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
	}
	.item {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.65rem 0.75rem;
	}
	.item.saved {
		border-color: var(--focus);
	}
	.top {
		flex-wrap: nowrap;
		gap: 0.3rem;
	}
	.sources {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.15rem;
	}
	.note {
		margin: 0;
		white-space: pre-wrap;
	}
	.hint {
		margin: 0;
	}
	.warn {
		color: var(--maybe);
	}
	.edit {
		padding-top: 0.4rem;
		border-top: 1px solid var(--border);
	}
	.actions {
		margin-top: auto;
		justify-content: flex-end;
	}
</style>
