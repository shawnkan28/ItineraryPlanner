<script lang="ts">
	import { enhance } from '$app/forms';
	import { addDays, ddMonRange } from '#lib/dates.ts';
	import { formatMoney, fromMinor, sumByCurrency } from '#lib/money.ts';
	import PlaceInput from '#lib/components/PlaceInput.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import type { Stay } from '#lib/server/db/schema.ts';

	let { data, form } = $props();
	const placeName = (id: number | null) => data.places.find((p) => p.id === id)?.name ?? '';
	let editing: number | 'new' | null = $state(null);
	let newBase: number | null = $state(null);

	const groups = $derived([
		...data.bases.map((b) => ({
			base: b,
			title: b.label || placeName(b.placeId) || 'Base',
			range: b.startDate ? ddMonRange(b.startDate, addDays(b.startDate, Math.max(b.nights, 1) - 1)) : '',
			stays: data.stays.filter((s) => s.baseId === b.id)
		})),
		{
			base: null,
			title: 'Not linked to a base',
			range: '',
			stays: data.stays.filter((s) => !s.baseId || !data.bases.some((b) => b.id === s.baseId))
		}
	]);
	const totals = $derived(sumByCurrency(data.stays.filter((s) => s.status === 'booked')));
	const err = (id: string) => (form && 'errors' in form && form.formId === id ? form.errors : null);
</script>

<svelte:head><title>Stays · {data.trip.name}</title></svelte:head>

<main class="stack">
	<div class="spread">
		<h2>Stays</h2>
		<div class="small">
			Booked total:
			{#each Object.entries(totals) as [cur, minor] (cur)}<strong class="total">{formatMoney(minor, cur)}</strong>{:else}–{/each}
		</div>
	</div>
	{#if form && 'error' in form}<p class="error">{form.error}</p>{/if}
	{#if form && 'assigned' in form}<p class="badge green">{form.assigned} set as the stay for its nights</p>{/if}

	{#each groups as g (g.base?.id ?? 'none')}
		{#if g.base || g.stays.length}
			<section class="stack">
				<div class="spread">
					<h3>{g.title} {#if g.range}<span class="muted small">({g.range}){#if g.base} · {g.base.nights} nights{/if}</span>{/if}</h3>
					<button class="sm" onclick={() => { editing = 'new'; newBase = g.base?.id ?? null; }}>+ Hotel</button>
				</div>
				{#if editing === 'new' && newBase === (g.base?.id ?? null)}
					<div class="card">{@render stayForm(null, g.base?.id ?? null, g.base?.startDate ?? null, g.base?.startDate ? addDays(g.base.startDate, g.base.nights) : null)}</div>
				{/if}
				<div class="grid">
					{#each g.stays as s (s.id)}
						<article class="card stay" id="stay-{s.id}" class:booked={s.status === 'booked'} class:cancelled={s.status === 'cancelled'}>
							{#if editing === s.id || err(String(s.id))}
								{@render stayForm(s, s.baseId, null, null)}
							{:else}
								<div class="spread">
									<strong>{s.hotel}</strong>
									<StatusBadge status={s.status} />
								</div>
								<dl class="small">
									{#if s.url}<dt>Link</dt><dd><a href={s.url} target="_blank" rel="noreferrer">{s.bookedVia || 'Open'} ↗</a></dd>{/if}
									{#if s.address}<dt>Address</dt><dd>{s.address}</dd>{/if}
									{#if s.location}<dt>Area</dt><dd>{s.location}</dd>{/if}
									{#if s.priceMinor !== null}<dt>Price</dt><dd>{formatMoney(s.priceMinor, s.currency)}</dd>{/if}
									{#if s.checkIn || s.checkOut}<dt>Dates</dt><dd>{s.checkIn ?? '?'} → {s.checkOut ?? '?'}</dd>{/if}
									{#if s.placeId}<dt>Note</dt><dd>[[{placeName(s.placeId)}]]</dd>{/if}
								</dl>
								<div class="row">
									<button class="sm ghost" onclick={() => (editing = s.id)}>Edit</button>
									{#if s.status !== 'cancelled'}
										<form method="POST" action="?/assignDays" use:enhance>
											<input type="hidden" name="stayId" value={s.id} />
											<button class="sm ghost" title="Set this hotel on every day from check-in to check-out">Use for its days</button>
										</form>
									{/if}
								</div>
							{/if}
						</article>
					{/each}
				</div>
				{#if g.stays.length === 0 && editing !== 'new'}<p class="muted small">No hotel yet.</p>{/if}
			</section>
		{/if}
	{/each}
	{#if data.bases.length === 0}
		<p class="muted small">Choose a route in Phase 1 to group stays by base.</p>
		<button onclick={() => { editing = 'new'; newBase = null; }}>+ Hotel</button>
	{/if}
</main>

{#snippet stayForm(s: Stay | null, baseId: number | null, checkIn: string | null, checkOut: string | null)}
	{@const errors = err(s ? String(s.id) : 'new')}
	<form
		method="POST"
		action={s ? '?/update' : '?/add'}
		use:enhance={() => async ({ update, result }) => {
			await update({ reset: false });
			if (result.type === 'success') editing = null;
		}}
		class="form-grid"
	>
		{#if s}<input type="hidden" name="stayId" value={s.id} />{/if}
		<label class="wide">Hotel <input name="hotel" value={s?.hotel ?? ''} required /></label>
		<label>
			Base
			<select name="baseId" value={String(s?.baseId ?? baseId ?? '')}>
				<option value="">—</option>
				{#each data.bases as b (b.id)}<option value={String(b.id)}>{b.label || placeName(b.placeId)}</option>{/each}
			</select>
		</label>
		<label>
			Status
			<select name="status" value={s?.status ?? 'idea'}>
				<option value="idea">idea</option>
				<option value="booked">booked</option>
				<option value="cancelled">cancelled</option>
			</select>
		</label>
		<label class="wide">Link <input name="url" type="url" value={s?.url ?? ''} /></label>
		<label>Booked via <input name="bookedVia" value={s?.bookedVia ?? ''} placeholder="Booking.com" /></label>
		<label>Hotel note (vault) <PlaceInput name="placeName" value={placeName(s?.placeId ?? null)} places={data.places} placeholder="optional" /></label>
		<label class="wide">Address <input name="address" value={s?.address ?? ''} /></label>
		<label class="wide">Location (area / nearest station) <input name="location" value={s?.location ?? ''} /></label>
		<label>Price <input name="price" inputmode="decimal" value={s && s.priceMinor !== null && s.currency ? fromMinor(s.priceMinor, s.currency) : ''} /></label>
		<label>Currency <input name="currency" maxlength="3" value={s?.currency ?? data.trip.homeCurrency} /></label>
		<label>Check-in <input name="checkIn" value={s?.checkIn ?? checkIn ?? ''} placeholder="2027-03-13 15:00" /></label>
		<label>Check-out <input name="checkOut" value={s?.checkOut ?? checkOut ?? ''} placeholder="2027-03-15" /></label>
		{#if errors}<p class="error wide">{Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join(', ')}</p>{/if}
		<div class="row wide">
			<button class="primary sm">Save</button>
			<button type="button" class="sm" onclick={() => (editing = null)}>Cancel</button>
			{#if s}<button class="sm danger ghost" formaction="?/delete" formnovalidate>Delete</button>{/if}
		</div>
	</form>
{/snippet}

<style>
	.total {
		margin-left: 0.4rem;
	}
	.stay.booked {
		border-color: var(--focus);
	}
	.stay.cancelled {
		opacity: 0.55;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.15rem 0.75rem;
		margin: 0.5rem 0;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
</style>
