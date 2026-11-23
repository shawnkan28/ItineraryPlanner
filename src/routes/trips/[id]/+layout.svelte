<script lang="ts">
	import { page } from '$app/state';
	import { niceDate } from '#lib/dates.ts';

	let { data, children } = $props();
	const base = $derived(`/trips/${data.trip.id}`);
	const tabs = $derived([
		{ href: base, label: 'Dashboard', exact: true },
		{ href: `${base}/route`, label: '1 · Route' },
		{ href: `${base}/ideas`, label: '2 · Ideas' },
		{ href: `${base}/itinerary`, label: '3 · Itinerary' },
		{ href: `${base}/bookings`, label: 'Bookings' },
		{ href: `${base}/stays`, label: 'Stays' },
		{ href: `${base}/journal`, label: 'Journal' },
		{ href: `${base}/export`, label: 'Export' }
	]);
	const active = (tab: { href: string; label: string; exact?: boolean }) =>
		tab.exact
			? page.url.pathname === tab.href
			: page.url.pathname.startsWith(tab.href) ||
				(tab.label.startsWith('3') && page.url.pathname.startsWith(`${base}/days`) && page.url.searchParams.get('tab') !== 'journal') ||
				(tab.label === 'Journal' && page.url.pathname.startsWith(`${base}/days`) && page.url.searchParams.get('tab') === 'journal');
</script>

<div class="trip-head">
	<div class="inner">
		<div class="row">
			<h1>{data.trip.name}</h1>
			<span class="muted small">{niceDate(data.trip.startDate)} – {niceDate(data.trip.endDate)}</span>
		</div>
		<nav class="tabs">
			{#each tabs as tab (tab.href)}
				<a href={tab.href} class:active={active(tab)}>{tab.label}</a>
			{/each}
		</nav>
	</div>
</div>

{@render children()}

<style>
	.trip-head {
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.inner {
		max-width: 1180px;
		margin: 0 auto;
		padding: 0.75rem 1rem 0;
	}
	h1 {
		margin: 0;
	}
	.tabs {
		display: flex;
		gap: 0.15rem;
		overflow-x: auto;
		margin-top: 0.5rem;
		scrollbar-width: none;
	}
	.tabs a {
		padding: 0.45rem 0.75rem;
		text-decoration: none;
		color: var(--muted);
		border-bottom: 2px solid transparent;
		white-space: nowrap;
	}
	.tabs a.active {
		color: var(--text);
		border-bottom-color: var(--accent);
		font-weight: 600;
	}
</style>
