<script lang="ts">
	import { niceDate } from '$lib/dates';

	let { data } = $props();
	const base = $derived(`/trips/${data.trip.id}`);
	const placeName = (id: number | null) => data.places.find((p) => p.id === id)?.name ?? '';
	const journal = (dayId: number) => data.journals.find((j) => j.dayId === dayId);
	const filled = (dayId: number) => {
		const j = journal(dayId);
		if (!j) return 0;
		return [j.highlights, j.logMorning, j.logAfternoon, j.logEvening, j.breakfast, j.lunch, j.dinner, j.tips].filter(
			(v) => v && v.trim()
		).length;
	};
	const todayDay = $derived(data.fullDays.find((d) => d.date === data.today));

	let drafts: number[] = $state([]);
	$effect(() => {
		try {
			drafts = data.fullDays.filter((d) => localStorage.getItem(`journal-draft-${d.id}`)).map((d) => d.id);
		} catch {
			drafts = [];
		}
	});
</script>

<svelte:head><title>Journal · {data.trip.name}</title></svelte:head>

<main class="stack">
	<div class="spread">
		<h2>Journal</h2>
		{#if todayDay}
			<a class="btn primary" href="{base}/days/{todayDay.id}?tab=journal">Write today · Day {todayDay.dayNumber}</a>
		{/if}
	</div>

	<ul class="days">
		{#each data.fullDays as d (d.id)}
			{@const j = journal(d.id)}
			<li>
				<a class="card day" class:today={d.date === data.today} href="{base}/days/{d.id}?tab=journal">
					<div class="spread">
						<strong>Day {d.dayNumber}{#if d.titlePlaceId}: {placeName(d.titlePlaceId)}{/if}</strong>
						<span class="row">
							{#if drafts.includes(d.id)}<span class="badge amber">unsynced draft</span>{/if}
							<span class="badge {filled(d.id) >= 5 ? 'green' : filled(d.id) ? 'amber' : ''}">{filled(d.id)}/8</span>
						</span>
					</div>
					<div class="small muted">{niceDate(d.date)}</div>
					{#if j?.quickSummary || d.summary}<p class="small">{j?.quickSummary || d.summary}</p>{/if}
				</a>
			</li>
		{/each}
	</ul>
</main>

<style>
	.days {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
	}
	.day {
		display: block;
		text-decoration: none;
		padding: 0.75rem;
	}
	.day.today {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}
	.day p {
		margin: 0.3rem 0 0;
	}
</style>
