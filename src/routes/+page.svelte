<script lang="ts">
	import { enhance } from '$app/forms';
	import { niceDate, daysBetween } from '$lib/dates';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	let { data, form } = $props();
	let showNew = $state(false);
	const err = (k: string) => (form && 'errors' in form ? form.errors?.[k] : undefined);
</script>

<svelte:head><title>Trips · Itinerary</title></svelte:head>

<main class="stack">
	<div class="spread">
		<h1>Trips</h1>
		<button class="primary" onclick={() => (showNew = !showNew)}>+ New trip</button>
	</div>

	{#if showNew || (form && 'errors' in form)}
		<form method="POST" action="?/create" use:enhance class="card stack">
			<h2>New trip</h2>
			<div class="form-grid">
				<label>Name <input name="name" placeholder="Japan" required /></label>
				<label>Start <input type="date" name="startDate" required /></label>
				<label>End <input type="date" name="endDate" required /></label>
				<label>Travellers <input name="travellers" value="me" placeholder="me, Brandon" /></label>
				<label>Home currency <input name="homeCurrency" value="SGD" maxlength="3" /></label>
			</div>
			{#if err('endDate')}<p class="error">{err('endDate')}</p>{/if}
			{#if err('name')}<p class="error">Name: {err('name')}</p>{/if}
			<div class="row"><button class="primary">Create trip</button></div>
		</form>
	{/if}

	{#if data.trips.length === 0}
		<p class="empty">No trips yet. Create one to start planning.</p>
	{:else}
		<div class="grid">
			{#each data.trips as { trip, openBookings, days } (trip.id)}
				<a class="card trip" href="/trips/{trip.id}">
					<div class="spread">
						<h2>{trip.name}</h2>
						<StatusBadge status={trip.status} />
					</div>
					<p class="muted">
						{niceDate(trip.startDate)} – {niceDate(trip.endDate)} · {daysBetween(trip.startDate, trip.endDate) + 1} days
					</p>
					<div class="row small">
						<span>{days} day plans</span>
						{#if openBookings > 0}
							<span class="badge red">{openBookings} to book</span>
						{:else}
							<span class="badge green">nothing to book</span>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</main>

<style>
	.trip {
		text-decoration: none;
		display: block;
	}
	.trip:hover {
		border-color: var(--muted);
	}
	.trip p {
		margin: 0.25rem 0 0.5rem;
	}
</style>
