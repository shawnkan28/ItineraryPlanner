<script lang="ts">
	import { enhance } from '$app/forms';
	import { addDays, daysBetween, niceDate } from '$lib/dates';
	import { keep } from '$lib/forms';
	import PlaceInput from '$lib/components/PlaceInput.svelte';

	let { data, form } = $props();
	const tripNights = $derived(daysBetween(data.trip.startDate, data.trip.endDate));
	const placeName = (id: number | null) => data.places.find((p) => p.id === id)?.name ?? '';
	const kinds: Record<string, string> = {
		stay: 'Stay',
		overnight_transport: 'Overnight transport',
		depart: 'Depart / fly home'
	};

	/** Dates for a draft option even before it's chosen. */
	function draftDates(stops: { nights: number }[]) {
		let d = data.trip.startDate;
		return stops.map((s) => {
			const start = d;
			d = addDays(d, s.nights);
			return start;
		});
	}
</script>

<svelte:head><title>Route · {data.trip.name}</title></svelte:head>

<main class="stack">
	<div class="spread">
		<div>
			<h2>Phase 1 · Route options</h2>
			<p class="muted small">
				Draft routes as a list of bases and nights. The trip has <strong>{tripNights}</strong> nights.
				Choosing a route makes its stops the Base table and fills in each day's city.
			</p>
		</div>
		<form method="POST" action="?/addOption" use:enhance><button>+ New option</button></form>
	</div>
	{#if form && 'error' in form}<p class="error">{form.error}</p>{/if}
	{#if form && 'chosen' in form}<p class="badge green">“{form.chosen}” is now the final route</p>{/if}

	<div class="options">
		{#each data.options as opt (opt.id)}
			{@const total = opt.stops.reduce((n, s) => n + s.nights, 0)}
			{@const dates = draftDates(opt.stops)}
			<section class="card stack option" class:chosen={opt.isChosen}>
				<form method="POST" action="?/updateOption" use:enhance={keep} class="row">
					<input type="hidden" name="optionId" value={opt.id} />
					<input
						name="name"
						value={opt.name}
						class="grow name"
						aria-label="Option name"
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					/>
					{#if opt.isChosen}<span class="badge green">chosen</span>{/if}
				</form>

				{#if opt.stops.length === 0}
					<p class="muted small">No bases yet.</p>
				{/if}
				<ol class="stops">
					{#each opt.stops as s, i (s.id)}
						<li>
							<details>
								<summary class="spread">
									<span>
										<strong>{s.label || placeName(s.placeId) || '(no place)'}</strong>
										<span class="muted small">
											· {s.nights}
											{s.nights === 1 ? 'night' : 'nights'}
											{#if s.kind !== 'stay'}· {kinds[s.kind]}{/if}
										</span>
									</span>
									<span class="muted small nowrap">{niceDate(s.startDate ?? dates[i])}</span>
								</summary>
								<form method="POST" action="?/updateStop" use:enhance={keep} class="form-grid edit">
									<input type="hidden" name="stopId" value={s.id} />
									<label>
										City
										<PlaceInput
											name="placeName"
											value={placeName(s.placeId)}
											places={data.places}
											levels={['city', 'area', 'place']}
										/>
									</label>
									<label>
										Label (optional)
										<input name="label" value={s.label ?? ''} placeholder="Osaka → Beppu" />
									</label>
									<label>Nights <input type="number" min="0" name="nights" value={s.nights} /></label>
									<label>
										Kind
										<select name="kind" value={s.kind}>
											{#each Object.entries(kinds) as [k, v] (k)}<option value={k}>{v}</option>{/each}
										</select>
									</label>
									<div class="row wide">
										<button class="primary sm">Save</button>
										<button class="sm" formaction="?/moveStop" name="dir" value="up" disabled={i === 0}>↑</button>
										<button
											class="sm"
											formaction="?/moveStop"
											name="dir"
											value="down"
											disabled={i === opt.stops.length - 1}>↓</button
										>
										<button class="sm danger" formaction="?/deleteStop">Delete</button>
									</div>
								</form>
							</details>
						</li>
					{/each}
				</ol>

				<form method="POST" action="?/addStop" use:enhance class="add">
					<input type="hidden" name="optionId" value={opt.id} />
					<PlaceInput
						name="placeName"
						places={data.places}
						placeholder="Add a base (city)"
						levels={['city', 'area', 'place']}
					/>
					<input type="number" min="0" name="nights" value="1" aria-label="Nights" />
					<button>Add</button>
				</form>

				<p class="small" class:bad={total !== tripNights} class:good={total === tripNights}>
					{total} / {tripNights} nights
					{#if total < tripNights}· {tripNights - total} missing{:else if total > tripNights}· {total -
							tripNights} too many{:else}✓{/if}
				</p>

				<form method="POST" action="?/updateOption" use:enhance={keep}>
					<input type="hidden" name="optionId" value={opt.id} />
					<input type="hidden" name="name" value={opt.name} />
					<textarea
						name="notes"
						rows="2"
						placeholder="Notes: pros / cons of this route"
						value={opt.notes ?? ''}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					></textarea>
				</form>

				<div class="row">
					{#if !opt.isChosen}
						<form method="POST" action="?/choose" use:enhance>
							<input type="hidden" name="optionId" value={opt.id} />
							<button class="primary">Choose this route</button>
						</form>
					{:else}
						<form method="POST" action="?/choose" use:enhance>
							<input type="hidden" name="optionId" value={opt.id} />
							<button class="sm" title="Re-date stops and fill empty day cities">Re-apply to days</button>
						</form>
					{/if}
					<form method="POST" action="?/addOption" use:enhance>
						<input type="hidden" name="copyFrom" value={opt.id} />
						<input type="hidden" name="name" value="{opt.name} (copy)" />
						<button class="sm">Duplicate</button>
					</form>
					{#if !opt.isChosen}
						<form method="POST" action="?/deleteOption" use:enhance>
							<input type="hidden" name="optionId" value={opt.id} />
							<button class="sm danger ghost">Delete</button>
						</form>
					{/if}
				</div>
			</section>
		{/each}
	</div>
</main>

<style>
	.options {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
		align-items: start;
	}
	.option.chosen {
		border-color: var(--focus);
		box-shadow: 0 0 0 1px var(--focus);
	}
	.name {
		font-weight: 600;
	}
	.stops {
		margin: 0;
		padding-left: 1.4rem;
	}
	.stops li {
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--border);
	}
	.edit {
		margin-top: 0.5rem;
	}
	.add {
		display: grid;
		grid-template-columns: 1fr 70px auto;
		gap: 0.4rem;
	}
	.bad {
		color: var(--maybe);
	}
	.good {
		color: var(--focus);
	}
</style>
