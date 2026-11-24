<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { niceDate } from '#lib/dates.ts';
	import { keep } from '#lib/forms.ts';
	import { SECTION_LABEL } from '#lib/export/markdown.ts';
	import LinkField from '#lib/components/LinkField.svelte';
	import PlaceInput from '#lib/components/PlaceInput.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import JournalEditor from '#lib/components/JournalEditor.svelte';
	import type { PlanItem, SectionKind } from '#lib/server/db/schema.ts';

	let { data, form } = $props();
	const day = $derived(data.day);
	const base = $derived(`/trips/${data.trip.id}`);
	const placeName = (id: number | null) => data.places.find((p) => p.id === id)?.name ?? '';
	const idx = $derived(data.days.findIndex((d) => d.id === day.id));
	const prev = $derived(idx > 0 ? data.days[idx - 1] : null);
	const next = $derived(idx < data.days.length - 1 ? data.days[idx + 1] : null);

	let tab = $derived(page.url.searchParams.get('tab') === 'journal' ? 'journal' : 'plan');

	const KIND_COLORS: Record<SectionKind, string> = {
		focus: 'green',
		maybe: 'amber',
		optional: 'purple',
		plan_b: 'purple',
		booking: 'red',
		info: 'red',
		getting_there: 'blue'
	};
	const KINDS = Object.keys(SECTION_LABEL) as SectionKind[];

	// local copy for drag and drop; resets whenever data reloads
	let sections = $derived(data.sections.map((s) => ({ ...s, items: [...s.items] })));
	let editing: number | null = $state(null);
	const flipDurationMs = 150;

	function consider(si: number, e: CustomEvent<DndEvent<PlanItem>>) {
		sections = sections.map((s, i) => (i === si ? { ...s, items: e.detail.items } : s));
	}
	async function finalize(si: number, e: CustomEvent<DndEvent<PlanItem>>) {
		sections = sections.map((s, i) => (i === si ? { ...s, items: e.detail.items } : s));
		await fetch('/api/reorder', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				kind: 'items',
				dayId: day.id,
				sections: sections.map((s) => ({ sectionId: s.id, ids: s.items.map((i) => i.id) }))
			})
		});
		await invalidateAll();
	}

	/** "Key times": timed Focus items, like the Excel day sheets. */
	const keyTimes = $derived(
		data.sections
			.filter((s) => s.kind === 'focus')
			.flatMap((s) => s.items)
			.filter((i) => i.sortTime)
			.sort((a, b) => a.sortTime!.localeCompare(b.sortTime!))
	);
	const stay = $derived(data.stays.find((s) => s.id === day.stayId));
	const linksText = (i: PlanItem) => i.links.map((l) => (l.label === l.url ? l.url : `${l.label} | ${l.url}`)).join('\n');
	const plain = (s: string) => s.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a);
</script>

<svelte:head><title>Day {day.dayNumber} · {data.trip.name}</title></svelte:head>

<main class="stack">
	<div class="spread">
		<div class="row">
			{#if prev}<a class="btn sm" href="{base}/days/{prev.id}{tab === 'journal' ? '?tab=journal' : ''}">← Day {prev.dayNumber}</a>{/if}
			<h2 style="margin:0">
				Day {day.dayNumber}{#if day.titlePlaceId}: {placeName(day.titlePlaceId)}{/if}
				<span class="muted small">{niceDate(day.date)}</span>
			</h2>
			{#if next}<a class="btn sm" href="{base}/days/{next.id}{tab === 'journal' ? '?tab=journal' : ''}">Day {next.dayNumber} →</a>{/if}
		</div>
		<div class="seg">
			<a href="?" class:on={tab === 'plan'}>Plan</a>
			<a href="?tab=journal" class:on={tab === 'journal'}>Journal</a>
		</div>
	</div>

	<div class="split" class:journal-first={tab === 'journal'}>
		<!-- PLAN -->
		<div class="stack plan" class:hide-mobile={tab === 'journal'}>
			<details class="card" open={!day.summary}>
				<summary class="spread">
					<span><strong>Day details</strong> <span class="muted small">{day.summary ?? 'no summary yet'}</span></span>
					<span class="small muted">{stay ? stay.hotel : day.stayNote ?? 'no stay'}</span>
				</summary>
				<form method="POST" action="?/updateDay" use:enhance={keep} class="form-grid" style="margin-top:.75rem">
					<label>City (title) <PlaceInput name="titlePlaceName" value={placeName(day.titlePlaceId)} places={data.places} levels={['city', 'area', 'region']} /></label>
					<label>Base label (Days table) <LinkField name="baseLabel" value={day.baseLabel ?? ''} places={data.places} placeholder="Nagasaki (day trip)" /></label>
					<label class="wide">Summary (one line) <LinkField name="summary" value={day.summary ?? ''} places={data.places} /></label>
					<label>
						Stay
						<select name="stayId" value={day.stayId ?? ''}>
							<option value="">— none (ferry / fly home) —</option>
							{#each data.stays.filter((s) => s.status !== 'cancelled') as s (s.id)}
								<option value={s.id}>{s.hotel}{s.status === 'idea' ? ' (idea)' : ''}</option>
							{/each}
						</select>
					</label>
					<label>Stay note <input name="stayNote" value={day.stayNote ?? ''} placeholder="(check-in)" /></label>
					<div class="row wide">
						<button class="primary sm">Save day</button>
						{#if form && 'savedDay' in form}<span class="muted small">Saved</span>{/if}
					</div>
				</form>
			</details>

			{#if keyTimes.length}
				<div class="keytimes card">
					<span class="small muted">Key times</span>
					{#each keyTimes as k (k.id)}
						<span class="kt"><strong>{k.sortTime}</strong> {plain(k.title)}</span>
					{/each}
				</div>
			{/if}

			{#each sections as section, si (section.id)}
				<section class="section card kind-{section.kind}">
					<header class="spread">
						<div class="row">
							<span class="badge {KIND_COLORS[section.kind]}">{SECTION_LABEL[section.kind]}</span>
							{#if section.title}<strong>{section.title}</strong>{/if}
							{#if section.collapsed}<span class="muted small">collapsed</span>{/if}
						</div>
						<details class="sec-menu">
							<summary class="small muted">Edit</summary>
							<form method="POST" action="?/updateSection" use:enhance={keep} class="stack pop">
								<input type="hidden" name="sectionId" value={section.id} />
								<select name="kind" value={section.kind}>
									{#each KINDS as k (k)}<option value={k}>{SECTION_LABEL[k]}</option>{/each}
								</select>
								<input name="title" value={section.title ?? ''} placeholder="Title (optional)" />
								<label class="inline small"><input type="checkbox" name="collapsed" checked={section.collapsed} /> Collapsed in Obsidian</label>
								<div class="row">
									<button class="sm primary">Save</button>
									<button class="sm" formaction="?/sortSection">Sort by time</button>
									<button class="sm" formaction="?/moveSection" name="dir" value="up">↑</button>
									<button class="sm" formaction="?/moveSection" name="dir" value="down">↓</button>
									<button class="sm danger" formaction="?/deleteSection">Delete</button>
								</div>
							</form>
						</details>
					</header>

					<ul
						class="items"
						use:dndzone={{ items: section.items, flipDurationMs, type: 'plan-item', dropTargetStyle: {}, dragDisabled: editing !== null }}
						onconsider={(e) => consider(si, e)}
						onfinalize={(e) => finalize(si, e)}
					>
						{#each section.items as item (item.id)}
							<li animate:flip={{ duration: flipDurationMs }}>
								{#if editing === item.id}
									{@render itemForm(item, section.id)}
								{:else}
									<button type="button" class="item" onclick={() => (editing = item.id)}>
										{#if section.kind !== 'optional'}
											<span class="time mono">{item.timeLabel || (['focus', 'maybe', 'plan_b'].includes(section.kind) ? '--:--' : '')}</span>
										{/if}
										<span class="grow">
											{#if item.person}<span class="badge blue">{item.person}</span>{/if}
											{item.title}
											{#if item.placeId && !item.title.includes('[[')}<span class="muted small"> · {placeName(item.placeId)}</span>{/if}
											{#if item.details.length}
												<ul class="sub small muted">{#each item.details as d, di (di)}<li>{d}</li>{/each}</ul>
											{/if}
											{#if item.links.length}
												<span class="small">{#each item.links as l, li (li)}<a href={l.url} target="_blank" rel="noreferrer" onclick={(e) => e.stopPropagation()}>{l.label}</a>{' '}{/each}</span>
											{/if}
										</span>
										<span class="grip" aria-hidden="true">⋮⋮</span>
									</button>
								{/if}
							</li>
						{/each}
					</ul>

					<details class="add-item">
						<summary class="small muted">+ Add item</summary>
						{@render itemForm(null, section.id)}
					</details>
				</section>
			{:else}
				<p class="empty">No plan yet. Add a Focus section to start the timeline.</p>
			{/each}

			<form method="POST" action="?/addSection" use:enhance class="row add-section">
				<select name="kind" style="width:auto">
					{#each KINDS as k (k)}<option value={k}>{SECTION_LABEL[k]}</option>{/each}
				</select>
				<input name="title" placeholder="Title (optional), e.g. Plan A, luggage to the port first" class="grow" />
				<button>+ Section</button>
			</form>

			<section class="card stack">
				<div class="spread">
					<h3 style="margin:0">Bookings for this day</h3>
					<a class="small" href="{base}/bookings?new=1&day={day.id}">+ Add booking</a>
				</div>
				{#each data.bookings as b (b.id)}
					<div class="row small">
						<StatusBadge status={b.status} />
						<a href="{base}/bookings#booking-{b.id}">{b.title}</a>
						{#if b.provider}<span class="muted">({b.provider})</span>{/if}
						{#if b.tasks.length}<span class="muted">{b.tasks.filter((t) => t.done).length}/{b.tasks.length} checks</span>{/if}
					</div>
				{:else}
					<p class="muted small">None.</p>
				{/each}
			</section>
		</div>

		<!-- JOURNAL -->
		<div class="stack journal-col" class:hide-mobile={tab === 'plan'}>
			<div class="card">
				{#key day.id}
					<JournalEditor dayId={day.id} journal={data.journal} summaryPlaceholder={day.summary ?? ''} />
				{/key}
			</div>
			<section class="card stack">
				<h3 style="margin:0">Photos & attachments</h3>
				<div class="thumbs">
					{#each data.attachments as a (a.id)}
						<figure>
							{#if /\.(png|jpe?g|gif|webp|avif)$/i.test(a.filePath)}
								<img src="/attachments/{a.filePath}" alt={a.caption ?? ''} loading="lazy" />
							{:else}
								<a href="/attachments/{a.filePath}">{a.filePath.split('/').pop()}</a>
							{/if}
							<figcaption class="small">
								{a.caption ?? ''}
								<form method="POST" action="?/deleteAttachment" use:enhance style="display:inline">
									<input type="hidden" name="attachmentId" value={a.id} />
									<button class="sm ghost danger" aria-label="Delete">✕</button>
								</form>
							</figcaption>
						</figure>
					{/each}
				</div>
				<form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance class="stack">
					<input type="file" name="file" accept="image/*,application/pdf" required />
					<input name="caption" placeholder="Caption (e.g. Google Maps route)" />
					{#if form && 'uploadError' in form}<p class="error">{form.uploadError}</p>{/if}
					<button class="sm">Upload</button>
				</form>
			</section>
		</div>
	</div>
</main>

{#snippet itemForm(item: PlanItem | null, sectionId: number)}
	<form
		method="POST"
		action={item ? '?/updateItem' : '?/addItem'}
		use:enhance={() => async ({ update, result }) => {
			await update({ reset: !item });
			if (item && result.type === 'success') editing = null;
		}}
		class="item-form"
	>
		<input type="hidden" name="sectionId" value={sectionId} />
		{#if item}<input type="hidden" name="itemId" value={item.id} />{/if}
		<div class="f-time">
			<label>Time <input name="timeLabel" value={item?.timeLabel ?? ''} placeholder="07:55 / ~13:30 / Morning" /></label>
		</div>
		<div class="f-title">
			<label>Title <LinkField name="title" value={item?.title ?? ''} places={data.places} required placeholder="Type [[ to link a place" /></label>
		</div>
		<div class="f-place">
			<label>Main place <PlaceInput name="placeName" value={placeName(item?.placeId ?? null)} places={data.places} /></label>
		</div>
		<div class="f-person">
			<label>
				Person
				<select name="person" value={item?.person ?? ''}>
					<option value="">everyone</option>
					{#each data.trip.travellers as p (p)}<option>{p}</option>{/each}
				</select>
			</label>
		</div>
		<div class="f-sort">
			<label>Sort time <input name="sortTime" value={item?.sortTime ?? ''} placeholder="HH:MM (auto)" pattern={'\\d{2}:\\d{2}'} /></label>
		</div>
		<div class="f-details">
			<label>Details (one per line) <LinkField name="details" multiline rows={2} value={item?.details.join('\n') ?? ''} places={data.places} /></label>
		</div>
		<div class="f-links">
			<label>Links (label | url per line) <textarea name="links" rows="2" value={item ? linksText(item) : ''}></textarea></label>
		</div>
		{#if form && 'itemErrors' in form && (form.itemId === item?.id || (!item && form.sectionId === sectionId))}
			<p class="error f-full">{Object.entries(form.itemErrors ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ')}</p>
		{/if}
		<div class="row f-full">
			<button class="primary sm">{item ? 'Save' : 'Add'}</button>
			{#if item}
				<button type="button" class="sm" onclick={() => (editing = null)}>Cancel</button>
				<button class="sm danger ghost" formaction="?/deleteItem" formnovalidate>Delete</button>
			{/if}
		</div>
	</form>
{/snippet}

<style>
	.seg {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	.seg a {
		padding: 0.35rem 0.9rem;
		text-decoration: none;
		color: var(--muted);
	}
	.seg a.on {
		background: var(--text);
		color: var(--bg);
	}
	.split {
		display: grid;
		gap: 1rem;
		grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
		align-items: start;
	}
	@media (max-width: 900px) {
		.split {
			grid-template-columns: 1fr;
		}
		.hide-mobile {
			display: none !important;
		}
	}
	.keytimes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1rem;
		align-items: baseline;
		padding: 0.6rem 1rem;
	}
	.kt strong {
		font-variant-numeric: tabular-nums;
	}
	.section {
		padding: 0.75rem;
		border-left-width: 4px;
	}
	.kind-focus {
		border-left-color: var(--focus);
	}
	.kind-maybe {
		border-left-color: var(--maybe);
	}
	.kind-optional,
	.kind-plan_b {
		border-left-color: var(--optional);
	}
	.kind-booking,
	.kind-info {
		border-left-color: var(--accent);
	}
	.kind-getting_there {
		border-left-color: var(--info);
	}
	.sec-menu {
		position: relative;
	}
	.pop {
		position: absolute;
		right: 0;
		top: 1.6rem;
		width: min(360px, 85vw);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.75rem;
		z-index: 25;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.15);
	}
	.items {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		min-height: 1.5rem;
	}
	.items > li {
		border-top: 1px solid var(--border);
	}
	.item {
		all: unset;
		box-sizing: border-box;
		display: flex;
		gap: 0.75rem;
		width: 100%;
		padding: 0.45rem 0.25rem;
		cursor: pointer;
		align-items: flex-start;
	}
	.item:hover {
		background: var(--surface-2);
	}
	.time {
		min-width: 5.5rem;
		color: var(--muted);
		padding-top: 0.1rem;
	}
	.grip {
		color: var(--muted);
		cursor: grab;
		opacity: 0.5;
	}
	.sub {
		margin: 0.15rem 0 0;
		padding-left: 1.1rem;
	}
	.add-item {
		margin-top: 0.4rem;
	}
	.item-form {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: 9rem 1fr 1fr;
		padding: 0.6rem 0;
	}
	.f-title {
		grid-column: span 2;
	}
	.f-details,
	.f-links,
	.f-full {
		grid-column: 1 / -1;
	}
	@media (max-width: 640px) {
		.item-form {
			grid-template-columns: 1fr 1fr;
		}
		.f-title {
			grid-column: 1 / -1;
		}
	}
	.add-section {
		flex-wrap: nowrap;
	}
	@media (max-width: 640px) {
		.add-section {
			flex-wrap: wrap;
		}
	}
	.thumbs {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
	}
	.thumbs figure {
		margin: 0;
	}
	.thumbs img {
		width: 100%;
		aspect-ratio: 4/3;
		object-fit: cover;
		border-radius: 6px;
	}
</style>
