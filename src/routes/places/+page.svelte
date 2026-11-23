<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Place, PlaceLevel } from '$lib/server/db/schema';

	let { data, form } = $props();
	let q = $state('');
	let level = $state('');
	let source = $state('');
	let editing: number | 'new' | null = $state(null);
	const LEVELS: PlaceLevel[] = ['country', 'region', 'city', 'area', 'place'];

	const byId = $derived(new Map(data.allPlaces.map((p) => [p.id, p])));
	const path = (p: Place) => {
		const out: string[] = [];
		let cur = p.parentId ? byId.get(p.parentId) : undefined;
		let guard = 0;
		while (cur && guard++ < 6) {
			out.unshift(cur.name);
			cur = cur.parentId ? byId.get(cur.parentId) : undefined;
		}
		return out.join(' › ');
	};
	const rows = $derived(
		data.allPlaces.filter((p) => {
			if (level && p.level !== level) return false;
			if (source === 'vault' && !p.vaultPath) return false;
			if (source === 'app' && p.vaultPath) return false;
			if (!q) return true;
			const s = q.toLowerCase();
			return p.name.toLowerCase().includes(s) || p.aliases.some((a) => a.toLowerCase().includes(s));
		})
	);
	const err = (id: string) => (form && 'errors' in form && form.formId === id ? form.errors : null);
	const listId = 'all-places';
</script>

<svelte:head><title>Places · Itinerary</title></svelte:head>

<main class="stack">
	<div class="spread">
		<div>
			<h1>Places</h1>
			<p class="muted small">
				Link targets for the vault. Names must match the note names exactly. Import from the vault in
				<a href="/settings">Settings</a>; places created in the app show up as “missing notes” on export.
			</p>
		</div>
		<button class="primary" onclick={() => (editing = 'new')}>+ Place</button>
	</div>

	{#if editing === 'new'}
		<div class="card">{@render placeForm(null)}</div>
	{/if}

	<div class="row">
		<input class="grow" placeholder="Search names and aliases" bind:value={q} style="max-width:320px" />
		<select bind:value={level} style="width:auto" aria-label="Level">
			<option value="">All levels</option>
			{#each LEVELS as l (l)}<option>{l}</option>{/each}
		</select>
		<select bind:value={source} style="width:auto" aria-label="Source">
			<option value="">Vault + app</option>
			<option value="vault">From vault</option>
			<option value="app">Created in app</option>
		</select>
		<span class="muted small">{rows.length} of {data.allPlaces.length}</span>
	</div>

	<datalist id={listId}>
		{#each data.allPlaces as p (p.id)}<option value={p.name}></option>{/each}
	</datalist>

	<div class="table-wrap">
		<table>
			<thead><tr><th>Name</th><th>Level</th><th class="hide-sm">In</th><th class="hide-sm">Aliases</th><th>Source</th><th></th></tr></thead>
			<tbody>
				{#each rows as p (p.id)}
					{#if editing === p.id || err(String(p.id))}
						<tr><td colspan="6">{@render placeForm(p)}</td></tr>
					{:else}
						<tr>
							<td><strong>{p.name}</strong>{#if p.notes}<div class="small muted clamp">{p.notes}</div>{/if}</td>
							<td><span class="badge">{p.level}</span></td>
							<td class="hide-sm small">{path(p)}</td>
							<td class="hide-sm small muted">{p.aliases.join(', ')}</td>
							<td class="small">
								{#if p.vaultPath}<span class="badge green" title={p.vaultPath}>vault</span>{:else}<span class="badge blue">app</span>{/if}
								{#if data.usage[p.id]}<span class="muted"> · used {data.usage[p.id]}×</span>{/if}
							</td>
							<td><button class="sm ghost" onclick={() => (editing = p.id)}>Edit</button></td>
						</tr>
					{/if}
				{:else}
					<tr><td colspan="6" class="muted">No places.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</main>

{#snippet placeForm(p: Place | null)}
	{@const errors = err(p ? String(p.id) : 'new')}
	<form
		method="POST"
		action={p ? '?/update' : '?/add'}
		use:enhance={() => async ({ update, result }) => {
			await update({ reset: false });
			if (result.type === 'success') editing = null;
		}}
		class="form-grid"
	>
		{#if p}<input type="hidden" name="placeId" value={p.id} />{/if}
		<label>Name (= note name) <input name="name" value={p?.name ?? ''} required /></label>
		<label>
			Level
			<select name="level" value={p?.level ?? 'place'}>
				{#each LEVELS as l (l)}<option>{l}</option>{/each}
			</select>
		</label>
		<label>Parent <input name="parentName" list={listId} value={p?.parentId ? (byId.get(p.parentId)?.name ?? '') : ''} /></label>
		<label>Aliases (comma separated) <input name="aliases" value={p?.aliases.join(', ') ?? ''} /></label>
		<label class="wide">Notes (hours, prices, tips) <textarea name="notes" rows="2" value={p?.notes ?? ''}></textarea></label>
		{#if p?.vaultPath}<p class="small muted wide">From the vault: <span class="mono">{p.vaultPath}</span>. Renaming here does not rename the note.</p>{/if}
		{#if errors}<p class="error wide">{Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join(', ')}</p>{/if}
		<div class="row wide">
			<button class="primary sm">Save</button>
			<button type="button" class="sm" onclick={() => (editing = null)}>Cancel</button>
			{#if p}<button class="sm danger ghost" formaction="?/delete" formnovalidate>Delete</button>{/if}
		</div>
	</form>
{/snippet}

<style>
	.clamp {
		max-width: 40ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
