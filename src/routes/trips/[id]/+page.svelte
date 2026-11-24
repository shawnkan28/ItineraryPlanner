<script lang="ts">
	import { enhance } from '$app/forms';
	import { bookingBadges } from '#lib/bookings.ts';
	import { keep } from '#lib/forms.ts';
	import { formatMoney } from '#lib/money.ts';

	let { data, form } = $props();
	const trip = $derived(data.trip);
	const dayNo = (id: number | null) => data.days.find((d) => d.id === id)?.dayNumber;
</script>

<svelte:head><title>{trip.name} · Itinerary</title></svelte:head>

<main class="stack">
	<div class="stats">
		<a class="card stat" href="/trips/{trip.id}/bookings?status=to_book">
			<span class="n">{data.toBook.length}</span><span class="muted">still to book</span>
		</a>
		<a class="card stat" href="/trips/{trip.id}/bookings?due=1">
			<span class="n" class:red={data.due.length > 0}>{data.due.length}</span><span class="muted">due in 14 days</span>
		</a>
		<div class="card stat">
			<span class="n">{data.bookedCount}</span><span class="muted">booked</span>
		</div>
		<div class="card stat">
			<span class="n money">
				{#each Object.entries(data.totals) as [cur, minor] (cur)}
					<span>{formatMoney(minor, cur)}</span>
				{:else}
					<span>–</span>
				{/each}
			</span>
			<span class="muted">booked cost</span>
		</div>
	</div>

	<div class="grid two">
		<section class="card stack">
			<h2>Due bookings</h2>
			{#if data.due.length === 0}
				<p class="muted">Nothing opens or is due in the next 14 days.</p>
			{:else}
				<ul class="list">
					{#each data.due as b (b.id)}
						<li class="spread">
							<span>
								{#if dayNo(b.dayId)}<span class="muted">Day {dayNo(b.dayId)} ·</span>{/if}
								{b.title}
								{#if b.provider}<span class="muted small">({b.provider})</span>{/if}
							</span>
							<span class="row">
								{#each bookingBadges(b, data.today) as badge (badge.text)}
									<span class="badge {badge.color}">{badge.text}</span>
								{/each}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
			<a href="/trips/{trip.id}/bookings">All bookings →</a>
		</section>

		<section class="card stack">
			<h2>Still to decide</h2>
			{#if data.openDecisions.length === 0}
				<p class="muted">No open decisions.</p>
			{:else}
				<ul class="list">
					{#each data.openDecisions as d (d.id)}
						<li>
							<strong>{d.question}</strong>
							{#if d.options.length}<span class="muted small"> · {d.options.map((o) => o.label).join(' / ')}</span>{/if}
						</li>
					{/each}
				</ul>
			{/if}
			<a href="/trips/{trip.id}/cities">Cities, ideas & decisions →</a>
		</section>
	</div>

	<details class="card">
		<summary><h2 style="margin:0">Trip settings</h2></summary>
		<form method="POST" action="?/update" use:enhance={keep} class="stack" style="margin-top:1rem">
			<div class="form-grid">
				<label>Name <input name="name" value={trip.name} required /></label>
				<label>Start <input type="date" name="startDate" value={trip.startDate} required /></label>
				<label>End <input type="date" name="endDate" value={trip.endDate} required /></label>
				<label>Travellers <input name="travellers" value={trip.travellers.join(', ')} /></label>
				<label>Home currency <input name="homeCurrency" value={trip.homeCurrency} maxlength="3" /></label>
				<label>
					Status
					<select name="status" value={trip.status}>
						{#each ['planning', 'booked', 'ongoing', 'done', 'exported'] as s (s)}<option>{s}</option>{/each}
					</select>
				</label>
				<label class="wide">Notes <textarea name="notes" rows="3">{trip.notes ?? ''}</textarea></label>
			</div>
			{#if form && 'errors' in form && form.errors}<p class="error">{Object.values(form.errors).join(', ')}</p>{/if}
			<p class="muted small">Changing dates adds or renumbers days. Days that already have a plan or journal are never deleted.</p>
			<div class="row">
				<button class="primary">Save</button>
				{#if form && 'saved' in form}<span class="muted small">Saved</span>{/if}
			</div>
		</form>
		<form method="POST" action="?/delete" use:enhance class="row danger-zone">
			<input name="confirm" placeholder='Type "delete"' style="max-width:180px" />
			<button class="danger">Delete trip</button>
			{#if form && 'deleteError' in form}<span class="error">{form.deleteError}</span>{/if}
		</form>
	</details>
</main>

<style>
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 0.75rem;
	}
	.stat {
		display: grid;
		gap: 0.15rem;
		text-decoration: none;
	}
	.n {
		font-size: 1.6rem;
		font-weight: 700;
	}
	.n.money {
		font-size: 1.05rem;
		display: grid;
	}
	.red {
		color: var(--accent);
	}
	.two {
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.list li {
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--border);
	}
	.list li:last-child {
		border: 0;
	}
	.danger-zone {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
</style>
