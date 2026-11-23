<script lang="ts">
	/**
	 * Text field with wikilink autocomplete: type `[[` and pick a place from the library.
	 * Used for titles, summaries and details so exported links match vault note names.
	 */
	type P = { id: number; name: string; aliases: string[] };
	let {
		name,
		value = $bindable(''),
		places,
		multiline = false,
		placeholder = '',
		rows = 3,
		required = false
	}: {
		name: string;
		value?: string | null;
		places: P[];
		multiline?: boolean;
		placeholder?: string;
		rows?: number;
		required?: boolean;
	} = $props();

	let el: HTMLInputElement | HTMLTextAreaElement | undefined = $state();
	let query: string | null = $state(null);
	let selected = $state(0);

	const matches = $derived.by(() => {
		if (query === null) return [];
		const q = query.toLowerCase();
		return places
			.map((p) => {
				const alias = p.aliases.find((a) => a.toLowerCase().includes(q));
				const score = p.name.toLowerCase().startsWith(q) ? 0 : p.name.toLowerCase().includes(q) ? 1 : alias ? 2 : 9;
				return { p, alias, score };
			})
			.filter((m) => m.score < 9)
			.sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name))
			.slice(0, 8);
	});

	function update() {
		if (!el) return;
		const before = el.value.slice(0, el.selectionStart ?? el.value.length);
		const m = before.match(/\[\[([^\]|\n]*)$/);
		query = m ? m[1] : null;
		selected = 0;
	}

	function pick(p: P, alias?: string) {
		if (!el) return;
		const pos = el.selectionStart ?? el.value.length;
		const before = el.value.slice(0, pos).replace(/\[\[([^\]|\n]*)$/, '');
		const after = el.value.slice(pos).replace(/^[^\]\n]*\]\]/, '');
		const link = alias ? `[[${p.name}|${alias}]]` : `[[${p.name}]]`;
		value = before + link + after;
		el.value = value;
		const caret = (before + link).length;
		query = null;
		requestAnimationFrame(() => {
			el?.focus();
			el?.setSelectionRange(caret, caret);
		});
	}

	function onkeydown(e: KeyboardEvent) {
		if (!matches.length) return;
		if (e.key === 'ArrowDown') {
			selected = (selected + 1) % matches.length;
			e.preventDefault();
		} else if (e.key === 'ArrowUp') {
			selected = (selected - 1 + matches.length) % matches.length;
			e.preventDefault();
		} else if (e.key === 'Enter' || e.key === 'Tab') {
			const m = matches[selected];
			pick(m.p, m.alias);
			e.preventDefault();
		} else if (e.key === 'Escape') {
			query = null;
		}
	}
</script>

<div class="wrap">
	{#if multiline}
		<textarea
			bind:this={el}
			{name}
			{rows}
			{placeholder}
			{required}
			bind:value
			oninput={update}
			onclick={update}
			{onkeydown}
			onblur={() => setTimeout(() => (query = null), 150)}
		></textarea>
	{:else}
		<input
			bind:this={el}
			{name}
			{placeholder}
			{required}
			bind:value
			autocomplete="off"
			oninput={update}
			onclick={update}
			{onkeydown}
			onblur={() => setTimeout(() => (query = null), 150)}
		/>
	{/if}
	{#if matches.length}
		<ul class="menu" role="listbox">
			{#each matches as m, i (m.p.id)}
				<li role="option" aria-selected={i === selected}>
					<button type="button" class:sel={i === selected} onmousedown={(e) => { e.preventDefault(); pick(m.p, m.alias); }}>
						{m.p.name}{#if m.alias}<span class="muted small"> · {m.alias}</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
	}
	.menu {
		position: absolute;
		left: 0;
		right: 0;
		top: 100%;
		margin: 2px 0 0;
		padding: 0.25rem;
		list-style: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		z-index: 30;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.12);
		max-height: 260px;
		overflow: auto;
	}
	.menu button {
		width: 100%;
		justify-content: flex-start;
		border: 0;
		min-height: 2rem;
	}
	.menu button.sel {
		background: var(--surface-2);
	}
</style>
