<script lang="ts">
	/**
	 * Journal editor for the phone. Every keystroke is saved to localStorage first, then synced to
	 * the server (debounced). If the connection drops the draft stays local and is re-sent when the
	 * browser comes back online, or the next time the page opens.
	 */
	import { onMount } from 'svelte';
	import type { JournalEntry } from '#lib/server/db/schema.ts';

	type Fields = {
		quickSummary: string;
		highlights: string;
		lowlight: string;
		logMorning: string;
		logAfternoon: string;
		logEvening: string;
		breakfast: string;
		lunch: string;
		dinner: string;
		tips: string;
		banner: string;
	};
	type Draft = { entry: Fields; baseUpdatedAt: string | null; savedAt: number };

	let {
		dayId,
		journal,
		summaryPlaceholder = ''
	}: { dayId: number; journal: JournalEntry | null; summaryPlaceholder?: string } = $props();

	const key = $derived(`journal-draft-${dayId}`);
	const fromServer = (j: JournalEntry | null): Fields => ({
		quickSummary: j?.quickSummary ?? '',
		highlights: j?.highlights ?? '',
		lowlight: j?.lowlight ?? '',
		logMorning: j?.logMorning ?? '',
		logAfternoon: j?.logAfternoon ?? '',
		logEvening: j?.logEvening ?? '',
		breakfast: j?.breakfast ?? '',
		lunch: j?.lunch ?? '',
		dinner: j?.dinner ?? '',
		tips: j?.tips ?? '',
		banner: j?.banner ?? ''
	});

	// svelte-ignore state_referenced_locally
	let entry: Fields = $state(fromServer(journal));
	// svelte-ignore state_referenced_locally
	let baseUpdatedAt: string | null = $state(journal?.updatedAt ?? null);
	type Status = 'saved' | 'saving' | 'offline' | 'draft' | 'conflict' | 'error';
	let status: Status = $state('saved');
	let conflict: JournalEntry | null = $state(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function readDraft(): Draft | null {
		try {
			const raw = localStorage.getItem(key);
			return raw ? (JSON.parse(raw) as Draft) : null;
		} catch {
			return null;
		}
	}
	function writeDraft() {
		try {
			localStorage.setItem(key, JSON.stringify({ entry, baseUpdatedAt, savedAt: Date.now() } satisfies Draft));
		} catch {
			/* storage full or blocked: server sync still runs */
		}
	}
	function clearDraft() {
		try {
			localStorage.removeItem(key);
		} catch {
			/* ignore */
		}
	}

	async function sync(force = false) {
		clearTimeout(timer);
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			status = 'offline';
			return;
		}
		status = 'saving';
		try {
			const res = await fetch(`/api/journal/${dayId}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ entry: $state.snapshot(entry), baseUpdatedAt, force })
			});
			if (res.status === 409) {
				conflict = (await res.json()).server;
				status = 'conflict';
				return;
			}
			if (!res.ok) throw new Error(String(res.status));
			const out = await res.json();
			baseUpdatedAt = out.updatedAt;
			conflict = null;
			clearDraft();
			status = 'saved';
		} catch {
			status = navigator.onLine ? 'error' : 'offline';
		}
	}

	function onInput() {
		writeDraft();
		status = 'draft';
		clearTimeout(timer);
		timer = setTimeout(() => sync(), 1200);
	}

	function useServer() {
		if (!conflict) return;
		entry = fromServer(conflict);
		baseUpdatedAt = conflict.updatedAt;
		conflict = null;
		clearDraft();
		status = 'saved';
	}

	onMount(() => {
		const draft = readDraft();
		if (draft) {
			entry = { ...fromServer(journal), ...draft.entry };
			baseUpdatedAt = draft.baseUpdatedAt;
			status = 'draft';
			sync();
		}
		const online = () => {
			if (readDraft()) sync();
		};
		window.addEventListener('online', online);
		const flush = () => {
			if (status === 'draft') writeDraft();
		};
		document.addEventListener('visibilitychange', flush);
		return () => {
			window.removeEventListener('online', online);
			document.removeEventListener('visibilitychange', flush);
			clearTimeout(timer);
		};
	});

	const labels: Record<Status, string> = {
		saved: 'Saved',
		saving: 'Saving…',
		draft: 'Draft saved on this device',
		offline: 'Offline · saved on this device, will sync',
		conflict: 'Changed elsewhere',
		error: 'Not synced · saved on this device'
	};
</script>

<div class="journal stack">
	<div class="spread status-row">
		<h2>Journal</h2>
		<span class="badge {status === 'saved' ? 'green' : status === 'conflict' || status === 'error' ? 'red' : 'amber'}">
			{labels[status]}
		</span>
	</div>

	{#if status === 'conflict' && conflict}
		<div class="card small conflict stack">
			<p>This journal was changed on another device since this draft started.</p>
			<div class="row">
				<button class="sm primary" onclick={() => sync(true)}>Keep mine</button>
				<button class="sm" onclick={useServer}>Use the other version</button>
			</div>
		</div>
	{/if}

	<label>
		Quick summary
		<textarea rows="2" bind:value={entry.quickSummary} oninput={onInput} placeholder={summaryPlaceholder}></textarea>
	</label>
	<label>Highlights <textarea rows="2" bind:value={entry.highlights} oninput={onInput}></textarea></label>
	<label>Lowlight / tip <textarea rows="2" bind:value={entry.lowlight} oninput={onInput}></textarea></label>

	<h3>The log</h3>
	<label>Morning <textarea rows="4" bind:value={entry.logMorning} oninput={onInput}></textarea></label>
	<label>Afternoon <textarea rows="4" bind:value={entry.logAfternoon} oninput={onInput}></textarea></label>
	<label>Evening <textarea rows="4" bind:value={entry.logEvening} oninput={onInput}></textarea></label>

	<h3>Food</h3>
	<div class="food">
		<label>Breakfast <input bind:value={entry.breakfast} oninput={onInput} /></label>
		<label>Lunch <input bind:value={entry.lunch} oninput={onInput} /></label>
		<label>Dinner <input bind:value={entry.dinner} oninput={onInput} /></label>
	</div>

	<label>Tips for future visits <textarea rows="3" bind:value={entry.tips} oninput={onInput} placeholder="One per line"></textarea></label>
	<label>Banner image file name <input bind:value={entry.banner} oninput={onInput} placeholder="optional, e.g. kannawa.jpg" /></label>

	<div class="row">
		<button class="primary" onclick={() => sync()} disabled={status === 'saving'}>Save now</button>
	</div>
</div>

<style>
	.status-row h2 {
		margin: 0;
	}
	.journal textarea {
		font-size: 16px; /* no zoom on iOS */
	}
	.journal input {
		font-size: 16px;
	}
	.food {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
	}
	.conflict {
		border-color: var(--accent);
	}
</style>
