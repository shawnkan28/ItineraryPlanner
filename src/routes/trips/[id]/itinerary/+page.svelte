<script lang="ts">
	import { stopTitle } from '#lib/route.ts';
	import { enhance } from '$app/forms';
	import { addDays, ddMonRange, dddDd } from '#lib/dates.ts';
	import { keep } from '#lib/forms.ts';
	import PlaceInput from '#lib/components/PlaceInput.svelte';
	import LinkField from '#lib/components/LinkField.svelte';

	let { data } = $props();
	const base = $derived(`/trips/${data.trip.id}`);
	const placeName = (id: number | null) => data.places.find((p) => p.id === id)?.name ?? '';
	const baseName = (b: (typeof data.bases)[number]) =>
		stopTitle(b, data.bases[data.bases.indexOf(b) + 1], (id) => placeName(id) || null);
	const range = (start: string | null, nights: number) =>
		start ? ddMonRange(start, addDays(start, Math.max(nights, 1) - 1)) : '';
	const stayName = (id: number | null) => data.stays.find((s) => s.id === id)?.hotel ?? '';
	let editing: number | null = $state(null);
</script>

<svelte:head><title>Itinerary · {data.trip.name}</title></svelte:head>

<main class="stack">
	<h2>Phase 4 · Itinerary</h2>

	{#if data.decisions.length}
		<section class="card callout question">
			<strong>Still to decide</strong>
			<ul>
				{#each data.decisions as d (d.id)}
					<li><strong>{d.question}:</strong> {d.notes ?? d.options.map((o) => o.label).join(' / ')}</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="stack">
		<div class="spread">
			<h3>Bases</h3>
			<a class="small" href="{base}/route">Edit route →</a>
		</div>
		{#if data.bases.length === 0}
			<p class="empty">No route chosen. <a href="{base}/route">Pick one in Phase 3.</a></p>
		{:else}
			<div class="table-wrap">
				<table>
					<thead><tr><th>Base</th><th>Nights</th><th>Dates</th></tr></thead>
					<tbody>
						{#each data.bases as b (b.id)}
							<tr>
								<td>{baseName(b)}</td>
								<td>{b.nights}</td>
								<td class="nowrap">{range(b.startDate, b.nights)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section class="stack">
		<h3>Days</h3>
		<div class="table-wrap">
			<table class="days">
				<thead>
					<tr><th>Day</th><th>Date</th><th>Base</th><th>Plan</th><th class="hide-sm">Stay</th><th class="hide-sm"></th></tr>
				</thead>
				<tbody>
					{#each data.fullDays as d (d.id)}
						{#if editing === d.id}
							<tr>
								<td colspan="6">
									<form
										method="POST"
										action="?/updateDay"
										use:enhance={() => async ({ update }) => {
											await update({ reset: false });
											editing = null;
										}}
										class="form-grid"
									>
										<input type="hidden" name="dayId" value={d.id} />
										<label>City <PlaceInput name="titlePlaceName" value={placeName(d.titlePlaceId)} places={data.places} levels={['city', 'area', 'region']} /></label>
										<label>Base label <LinkField name="baseLabel" value={d.baseLabel ?? ''} places={data.places} /></label>
										<label class="wide">Summary <LinkField name="summary" value={d.summary ?? ''} places={data.places} /></label>
										<div class="row wide">
											<button class="primary sm">Save</button>
											<button type="button" class="sm" onclick={() => (editing = null)}>Cancel</button>
										</div>
									</form>
								</td>
							</tr>
						{:else}
							<tr>
								<td class="nowrap"><a href="{base}/days/{d.id}"><strong>Day {d.dayNumber}</strong></a></td>
								<td class="nowrap">{dddDd(d.date)}</td>
								<td>{d.baseLabel ?? placeName(d.titlePlaceId)}</td>
								<td>
									{d.summary ?? ''}
									<div class="small muted">
										{data.itemCount[d.id] ?? 0} plan items
										{#if data.journaled.includes(d.id)}· <span class="badge green">journal</span>{/if}
									</div>
								</td>
								<td class="hide-sm small">{stayName(d.stayId) || d.stayNote || ''}</td>
								<td class="hide-sm"><button class="sm ghost" onclick={() => (editing = d.id)}>Edit</button></td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	{#if data.dropped.length}
		<section class="stack">
			<div class="spread">
				<h3>Dropped / parked</h3>
				<a class="small" href="{base}/ideas">Ideas board →</a>
			</div>
			<ul class="card dropped">
				{#each data.dropped as i (i.id)}
					<li>
						<span class="badge {i.status === 'dropped' ? '' : 'amber'}">{i.status === 'dropped' ? 'Dropped' : 'Parked'}</span>
						{i.placeId ? placeName(i.placeId) : i.title}
						{#if i.reason}<span class="muted">({i.reason})</span>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

<style>
	.callout.question {
		border-left: 4px solid var(--maybe);
	}
	.callout ul {
		margin: 0.4rem 0 0;
		padding-left: 1.2rem;
	}
	.dropped {
		list-style: none;
		margin: 0;
		display: grid;
		gap: 0.35rem;
	}
	.days td {
		vertical-align: middle;
	}
</style>
