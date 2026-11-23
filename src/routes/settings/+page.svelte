<script lang="ts">
	import { enhance } from '$app/forms';
	import { keep } from '$lib/forms';

	let { data, form } = $props();
</script>

<svelte:head><title>Settings · Itinerary</title></svelte:head>

<main class="stack narrow">
	<h1>Settings</h1>

	<section class="card stack">
		<h2>Obsidian vault</h2>
		<p class="muted small">
			The folder that contains <span class="mono">Travel/</span> and <span class="mono">_attachments/</span>.
			In Docker, mount the vault and set the path to the mount point. Without a vault, exports are downloaded as a zip.
		</p>
		<form method="POST" action="?/vault" use:enhance={keep} class="row">
			<input name="vaultPath" class="grow" value={data.vaultFromEnv ? '' : (data.vault ?? '')} placeholder={data.vaultFromEnv ? `${data.vault} (from VAULT_PATH)` : '/vault'} />
			<button class="primary">Save</button>
		</form>
		{#if form && 'vaultError' in form}<p class="error">{form.vaultError}</p>{/if}
		{#if form && 'vaultSaved' in form}<p class="small muted">Saved.</p>{/if}
		<p class="small">
			{#if data.vaultOk}<span class="badge green">found</span> <span class="mono">{data.vault}</span>
			{:else if data.vault}<span class="badge red">not found</span> <span class="mono">{data.vault}</span>
			{:else}<span class="badge">not set</span>{/if}
		</p>

		<form method="POST" action="?/importPlaces" use:enhance class="stack">
			<p class="muted small">
				Read-only scan of <span class="mono">Travel/00-country</span> … <span class="mono">Travel/04-place</span>: note name,
				aliases and parent (from the area / city / region / country frontmatter). Nothing is written to the vault.
			</p>
			<div class="row">
				<button disabled={!data.vaultOk}>Import places from vault</button>
				{#if form && 'imported' in form && form.imported}
					<span class="small">Scanned {form.imported.scanned} notes: {form.imported.created} new, {form.imported.updated} updated.</span>
				{/if}
				{#if form && 'importError' in form}<span class="error">{form.importError}</span>{/if}
			</div>
		</form>
	</section>

	<section class="card stack">
		<h2>Backup</h2>
		<p class="muted small">A consistent copy of the SQLite database made with the SQLite backup API (safe while the app is running).</p>
		<p class="small mono">{data.dbPath}</p>
		<div><a class="btn" href="/api/backup" data-sveltekit-reload>Download backup</a></div>
	</section>

	<section class="card stack">
		<h2>Booking calendar (.ics)</h2>
		<p class="muted small">Subscribe on your phone to get the “opens on” and “book by” dates of bookings still to book. The link contains a secret token; it works without logging in.</p>
		{#each data.trips as trip (trip.id)}
			<div class="row small">
				<strong>{trip.name}</strong>
				<input readonly value="{data.icsBase}/{trip.id}.ics" class="grow mono" onfocus={(e) => e.currentTarget.select()} />
			</div>
		{:else}
			<p class="muted small">No trips yet.</p>
		{/each}
	</section>

	<section class="card stack">
		<h2>Access</h2>
		{#if data.authEnabled}
			<p class="small"><span class="badge green">password on</span> Set with <span class="mono">APP_PASSWORD</span>.</p>
		{:else}
			<p class="small"><span class="badge red">no password</span> Set <span class="mono">APP_PASSWORD</span> (and <span class="mono">SESSION_SECRET</span>) before exposing the app outside your network.</p>
		{/if}
	</section>
</main>

<style>
	.narrow {
		max-width: 760px;
	}
</style>
