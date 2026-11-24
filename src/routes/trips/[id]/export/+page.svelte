<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data, form } = $props();
	let selected = $state(0);
	const current = $derived(data.files[Math.min(selected, data.files.length - 1)]);
	const counts = $derived(
		data.files.reduce<Record<string, number>>((acc, f) => ((acc[f.status] = (acc[f.status] ?? 0) + 1), acc), {})
	);
	const query = $derived(
		new URLSearchParams(
			Object.entries(data.choice).map(([k, v]) => [k, v ? '1' : '0'])
		).toString()
	);
	const STATUS: Record<string, { label: string; color: string }> = {
		new: { label: 'new', color: 'blue' },
		identical: { label: 'unchanged', color: '' },
		update: { label: 'will update', color: 'green' },
		conflict: { label: 'edited in vault', color: 'red' }
	};

	function toggle(key: string, value: boolean) {
		const u = new URL(page.url.href);
		u.searchParams.set(key, value ? '1' : '0');
		goto(u, { replace: true, reset: false });
	}
	const name = (p: string) => p.split('/').pop();
	const folder = (p: string) => p.split('/').slice(0, -1).join('/');
</script>

<svelte:head><title>Export · {data.trip.name}</title></svelte:head>

<main class="stack">
	<h2>Export to Obsidian</h2>
	<p class="muted small">
		Exports one journal note per day and the final “Itinerary” overview. Cities, ideas and route options stay in the app.
		Files edited in the vault since the last export are never overwritten without asking, and nothing is ever deleted.
	</p>

	<div class="card stack">
		<div class="row opts">
			<label class="inline"><input type="checkbox" checked={data.choice.days} onchange={(e) => toggle('days', e.currentTarget.checked)} /> Day notes</label>
			<label class="inline"><input type="checkbox" checked={data.choice.overview} onchange={(e) => toggle('overview', e.currentTarget.checked)} /> Itinerary overview</label>
			<label class="inline"><input type="checkbox" checked={data.choice.attachments} onchange={(e) => toggle('attachments', e.currentTarget.checked)} /> Attachments</label>
			<label class="inline"><input type="checkbox" checked={data.choice.hub} onchange={(e) => toggle('hub', e.currentTarget.checked)} /> Trip hub note</label>
			<label class="inline"><input type="checkbox" checked={data.choice.stubs} onchange={(e) => toggle('stubs', e.currentTarget.checked)} /> Stub notes for new places</label>
		</div>
		<div class="row small">
			{#if data.vaultOk}
				<span>Vault: <span class="mono">{data.vault}</span></span>
			{:else if data.vault}
				<span class="error">Vault path not found: <span class="mono">{data.vault}</span></span>
			{:else}
				<span class="muted">No vault path set (<a href="/settings">Settings</a>), so export as a zip with the same folders.</span>
			{/if}
			{#if data.last}<span class="muted">· last export {new Date(data.last.runAt).toLocaleString()} ({data.last.target === 'zip' ? 'zip' : 'vault'})</span>{/if}
		</div>
		<div class="row small">
			{#each Object.entries(counts) as [s, n] (s)}<span class="badge {STATUS[s].color}">{n} {STATUS[s].label}</span>{/each}
			{#if data.attachments.length}<span class="badge">{data.attachments.length} attachments</span>{/if}
		</div>
	</div>

	{#if data.missing.length}
		<details class="card">
			<summary><strong>Missing notes ({data.missing.length})</strong> <span class="muted small">links that don't match a place imported from the vault</span></summary>
			<ul class="small missing">
				{#each data.missing as m (m.name)}
					<li>
						<span class="mono">[[{m.name}]]</span>
						{#if m.placeId}<span class="badge blue">created in app</span>{/if}
						<span class="muted">in {m.usedIn.slice(0, 3).join(', ')}{m.usedIn.length > 3 ? ` +${m.usedIn.length - 3}` : ''}</span>
					</li>
				{/each}
			</ul>
			<p class="muted small">Tick “Stub notes for new places” to create notes for places made in the app (never overwrites existing ones), or import places in <a href="/settings">Settings</a>.</p>
		</details>
	{/if}

	{#if form && 'error' in form}<p class="error">{form.error}</p>{/if}
	{#if form && 'log' in form}
		<div class="card stack">
			<strong>Export written</strong>
			<ul class="small log">
				{#each form.log as l (l.path)}<li><span class="badge {l.action === 'skipped' ? 'amber' : l.action === 'unchanged' ? '' : 'green'}">{l.action}</span> <span class="mono">{l.path}</span></li>{/each}
			</ul>
		</div>
	{/if}

	<form method="POST" action="?/write" use:enhance class="stack">
		{#each Object.entries(data.choice) as [k, v] (k)}<input type="hidden" name={k} value={v ? '1' : '0'} />{/each}

		<div class="preview">
			<ul class="files card">
				{#each data.files as f, i (f.path)}
					<li>
						<button type="button" class:sel={i === selected} onclick={() => (selected = i)}>
							<span class="grow">
								<span class="fname">{name(f.path)}</span>
								<span class="muted small fpath">{folder(f.path)}</span>
							</span>
							<span class="badge {STATUS[f.status].color}">{STATUS[f.status].label}</span>
						</button>
						{#if f.status === 'conflict'}
							<div class="resolve small">
								<label class="inline"><input type="radio" name="resolve:{f.path}" value="skip" checked /> skip</label>
								<label class="inline"><input type="radio" name="resolve:{f.path}" value="copy" /> write “(app)” copy</label>
								<label class="inline"><input type="radio" name="resolve:{f.path}" value="overwrite" /> overwrite</label>
							</div>
						{/if}
					</li>
				{:else}
					<li class="muted small">Nothing selected to export.</li>
				{/each}
			</ul>

			<div class="card viewer">
				{#if current}
					<div class="spread small">
						<span class="mono">{current.path}</span>
						<span class="badge {STATUS[current.status].color}">{STATUS[current.status].label}</span>
					</div>
					{#if current.diff}
						<p class="small muted">Changed in the vault since the last export. <span class="minus">− vault</span> <span class="plus">+ app</span></p>
						<pre class="diff">{#each current.diff as line, li (li)}<span class="l {line.op === '+' ? 'plus' : line.op === '-' ? 'minus' : ''}">{line.op} {line.text}
</span>{/each}</pre>
					{:else}
						<pre>{current.content}</pre>
					{/if}
				{/if}
			</div>
		</div>

		<div class="row actions">
			{#if data.vaultOk}
				<button class="primary" disabled={!data.files.length}>Write to vault</button>
			{/if}
			<a class="btn" class:primary={!data.vaultOk} href="/trips/{data.trip.id}/export/zip?{query}" data-sveltekit-reload>Download zip</a>
		</div>
	</form>
</main>

<style>
	.opts {
		gap: 0.5rem 1.25rem;
	}
	.missing {
		margin: 0.5rem 0;
		padding-left: 1.2rem;
		display: grid;
		gap: 0.2rem;
	}
	.log {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.2rem;
	}
	.preview {
		display: grid;
		gap: 1rem;
		grid-template-columns: minmax(0, 340px) minmax(0, 1fr);
		align-items: start;
	}
	@media (max-width: 900px) {
		.preview {
			grid-template-columns: 1fr;
		}
	}
	.files {
		list-style: none;
		margin: 0;
		padding: 0.35rem;
		max-height: 70vh;
		overflow: auto;
	}
	.files li + li {
		border-top: 1px solid var(--border);
	}
	.files button {
		all: unset;
		box-sizing: border-box;
		display: flex;
		gap: 0.5rem;
		width: 100%;
		padding: 0.45rem;
		cursor: pointer;
		border-radius: 6px;
		align-items: center;
	}
	.files button.sel {
		background: var(--surface-2);
	}
	.fname,
	.fpath {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.resolve {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding: 0 0.45rem 0.45rem;
	}
	.viewer pre {
		margin: 0.5rem 0 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font: 12.5px/1.5 ui-monospace, 'Cascadia Code', Menlo, monospace;
		max-height: 70vh;
		overflow: auto;
	}
	.diff .l {
		display: block;
	}
	.plus {
		background: var(--focus-soft);
		color: var(--focus);
	}
	.minus {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.actions {
		position: sticky;
		bottom: 0;
		background: var(--bg);
		padding: 0.5rem 0;
	}
</style>
