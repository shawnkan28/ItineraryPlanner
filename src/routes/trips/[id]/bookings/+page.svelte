<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { BOOKING_STATUSES, CATEGORIES, bookingBadges, isDue } from '$lib/bookings';
	import { niceDate } from '$lib/dates';
	import { keep } from '$lib/forms';
	import { formatMoney, fromMinor, sumByCurrency } from '$lib/money';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { Booking } from '$lib/server/db/schema';

	let { data, form } = $props();
	const q = $derived(page.url.searchParams);
	const fStatus = $derived(q.get('status') ?? '');
	const fCategory = $derived(q.get('category') ?? '');
	const fDay = $derived(q.get('day') && !q.get('new') ? q.get('day')! : '');
	const fDue = $derived(q.get('due') === '1');
	let showNew = $state(page.url.searchParams.get('new') === '1');
	let open: number | null = $state(null);

	function setFilter(key: string, value: string) {
		const u = new URL(page.url);
		if (value) u.searchParams.set(key, value);
		else u.searchParams.delete(key);
		u.searchParams.delete('new');
		goto(u, { replaceState: true, keepFocus: true, noScroll: true });
	}

	const dayNo = (id: number | null) => data.days.find((d) => d.id === id)?.dayNumber;
	const dayOrder = (b: Booking) => dayNo(b.dayId) ?? 999;
	const rows = $derived(
		data.bookings
			.filter((b) => !fStatus || b.status === fStatus)
			.filter((b) => !fCategory || b.category === fCategory)
			.filter((b) => !fDay || String(b.dayId) === fDay)
			.filter((b) => !fDue || isDue(b, data.today))
			.sort((a, b) => dayOrder(a) - dayOrder(b) || a.id - b.id)
	);
	const totals = $derived(sumByCurrency(data.bookings.filter((b) => b.status === 'booked')));
	const tasksText = (b: Booking) => b.tasks.map((t) => `[${t.done ? 'x' : ' '}] ${t.text}`).join('\n');
	const err = (id: string) => (form && 'errors' in form && form.formId === id ? form.errors : null);
</script>

<svelte:head><title>Bookings · {data.trip.name}</title></svelte:head>

<main class="stack">
	<div class="spread">
		<h2>Bookings</h2>
		<button class="primary" onclick={() => (showNew = !showNew)}>+ New booking</button>
	</div>

	{#if showNew}
		<div class="card">
			{@render bookingForm(null)}
		</div>
	{/if}

	<div class="filters row">
		<select value={fStatus} onchange={(e) => setFilter('status', e.currentTarget.value)} aria-label="Status">
			<option value="">All statuses</option>
			{#each BOOKING_STATUSES as s (s)}<option value={s}>{s.replace('_', ' ')}</option>{/each}
		</select>
		<select value={fCategory} onchange={(e) => setFilter('category', e.currentTarget.value)} aria-label="Category">
			<option value="">All categories</option>
			{#each CATEGORIES as c (c)}<option>{c}</option>{/each}
		</select>
		<select value={fDay} onchange={(e) => setFilter('day', e.currentTarget.value)} aria-label="Day">
			<option value="">All days</option>
			{#each data.days as d (d.id)}<option value={String(d.id)}>Day {d.dayNumber}</option>{/each}
		</select>
		<label class="inline small"><input type="checkbox" checked={fDue} onchange={(e) => setFilter('due', e.currentTarget.checked ? '1' : '')} /> Due in 14 days</label>
		<span class="grow"></span>
		<span class="small muted">
			Booked:
			{#each Object.entries(totals) as [cur, minor] (cur)}<strong> {formatMoney(minor, cur)}</strong>{:else} –{/each}
			<span class="hide-sm">(hotels are totalled on Stays)</span>
		</span>
	</div>

	{#if rows.length === 0}
		<p class="empty">No bookings match.</p>
	{:else}
		<div class="list">
			{#each rows as b (b.id)}
				<article class="card booking" id="booking-{b.id}">
					<div class="head">
						<div class="grow">
							<div class="row">
								{#if dayNo(b.dayId)}<a class="muted small" href="/trips/{data.trip.id}/days/{b.dayId}">Day {dayNo(b.dayId)}</a>{/if}
								<span class="badge">{b.category}</span>
								<strong>{b.title}</strong>
								{#if b.provider}
									{#if b.url}<a class="small" href={b.url} target="_blank" rel="noreferrer">{b.provider} ↗</a>
									{:else}<span class="small muted">{b.provider}</span>{/if}
								{:else if b.url}<a class="small" href={b.url} target="_blank" rel="noreferrer">link ↗</a>{/if}
							</div>
							<div class="row small muted meta">
								{#if b.opensOn}<span>opens {niceDate(b.opensOn)}</span>{/if}
								{#if b.bookBy}<span>book by {niceDate(b.bookBy)}</span>{/if}
								{#if b.priceMinor !== null}<span>{formatMoney(b.priceMinor, b.currency)}</span>{/if}
								{#if b.cancellation}<span>free cancel: {b.cancellation}</span>{/if}
								{#if b.confirmation}<span>ref <span class="mono">{b.confirmation}</span></span>{/if}
							</div>
						</div>
						<div class="row">
							{#each bookingBadges(b, data.today) as badge (badge.text)}<span class="badge {badge.color}">{badge.text}</span>{/each}
							<StatusBadge status={b.status} />
						</div>
					</div>

					{#if b.tasks.length}
						<ul class="tasks">
							{#each b.tasks as task, i (i)}
								<li>
									<form method="POST" action="?/toggleTask" use:enhance={keep}>
										<input type="hidden" name="bookingId" value={b.id} />
										<input type="hidden" name="task" value={i} />
										<label class="inline">
											<input type="checkbox" checked={task.done} onchange={(e) => e.currentTarget.form?.requestSubmit()} />
											<span class:done={task.done}>{task.text}</span>
										</label>
									</form>
								</li>
							{/each}
						</ul>
					{/if}

					<div class="row actions">
						{#if b.status === 'to_book'}
							<form method="POST" action="?/markBooked" use:enhance class="row">
								<input type="hidden" name="bookingId" value={b.id} />
								<input name="confirmation" placeholder="Confirmation no." style="max-width:180px" />
								<button class="sm primary" name="status" value="booked">Mark booked</button>
							</form>
						{:else if b.status === 'booked'}
							<form method="POST" action="?/markBooked" use:enhance>
								<input type="hidden" name="bookingId" value={b.id} />
								<button class="sm ghost" name="status" value="to_book">Undo booked</button>
							</form>
						{/if}
						<button class="sm ghost" onclick={() => (open = open === b.id ? null : b.id)}>{open === b.id ? 'Close' : 'Edit'}</button>
					</div>
					{#if open === b.id || err(String(b.id))}
						{@render bookingForm(b)}
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</main>

{#snippet bookingForm(b: Booking | null)}
	{@const errors = err(b ? String(b.id) : 'new')}
	<form
		method="POST"
		action={b ? '?/update' : '?/add'}
		use:enhance={() => async ({ update, result }) => {
			await update({ reset: !b });
			if (result.type === 'success') {
				if (b) open = null;
				else showNew = false;
			}
		}}
		class="form-grid bform"
	>
		{#if b}<input type="hidden" name="bookingId" value={b.id} />{/if}
		<label class="wide">Title <input name="title" value={b?.title ?? ''} placeholder="Ferry Osaka → Beppu" required /></label>
		<label>
			Category
			<select name="category" value={b?.category ?? 'check'}>
				{#each CATEGORIES as c (c)}<option>{c}</option>{/each}
			</select>
		</label>
		<label>
			Day
			<select name="dayId" value={String(b?.dayId ?? (q.get('new') ? (q.get('day') ?? '') : ''))}>
				<option value="">— no day —</option>
				{#each data.days as d (d.id)}<option value={String(d.id)}>Day {d.dayNumber} · {niceDate(d.date)}</option>{/each}
			</select>
		</label>
		<label>
			Status
			<select name="status" value={b?.status ?? 'to_book'}>
				{#each BOOKING_STATUSES as s (s)}<option value={s}>{s.replace('_', ' ')}</option>{/each}
			</select>
		</label>
		<label>Provider <input name="provider" value={b?.provider ?? ''} placeholder="MOL Sunflower, Klook" /></label>
		<label class="wide">Link <input name="url" type="url" value={b?.url ?? ''} /></label>
		<label>Opens on <input type="date" name="opensOn" value={b?.opensOn ?? ''} /></label>
		<label>Book by <input type="date" name="bookBy" value={b?.bookBy ?? ''} /></label>
		<label>Price <input name="price" inputmode="decimal" value={b && b.priceMinor !== null && b.currency ? fromMinor(b.priceMinor, b.currency) : ''} /></label>
		<label>Currency <input name="currency" maxlength="3" value={b?.currency ?? data.trip.homeCurrency} /></label>
		<label>Confirmation <input name="confirmation" value={b?.confirmation ?? ''} /></label>
		<label>Free cancellation until <input name="cancellation" value={b?.cancellation ?? ''} /></label>
		<label>
			Hotel (stay)
			<select name="stayId" value={String(b?.stayId ?? '')}>
				<option value="">—</option>
				{#each data.stays as s (s.id)}<option value={String(s.id)}>{s.hotel}</option>{/each}
			</select>
		</label>
		<label class="wide">Checklist (one per line, "[x] " = done)
			<textarea name="tasks" rows="3" value={b ? tasksText(b) : ''} placeholder="Check that it stops at Tsunoshima Bridge"></textarea>
		</label>
		<label class="wide">Notes <textarea name="notes" rows="2" value={b?.notes ?? ''}></textarea></label>
		{#if errors}<p class="error wide">{Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join(', ')}</p>{/if}
		<div class="row wide">
			<button class="primary sm">{b ? 'Save' : 'Add booking'}</button>
			{#if b}<button class="sm danger ghost" formaction="?/delete" formnovalidate>Delete</button>{/if}
		</div>
	</form>
{/snippet}

<style>
	.filters select {
		width: auto;
	}
	.list {
		display: grid;
		gap: 0.6rem;
	}
	.booking {
		padding: 0.75rem 1rem;
	}
	.head {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.meta {
		margin-top: 0.15rem;
		gap: 0.25rem 0.9rem;
	}
	.tasks {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
	}
	.tasks form {
		margin: 0;
	}
	.done {
		text-decoration: line-through;
		color: var(--muted);
	}
	.actions {
		margin-top: 0.5rem;
	}
	.bform {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--border);
	}
</style>
