<script lang="ts">
	/** Plain input with place-name suggestions. Unknown names create a new place on save. */
	type P = { id: number; name: string; aliases: string[] };
	let {
		name,
		value = '',
		places,
		placeholder = 'Place',
		levels,
		required = false
	}: {
		name: string;
		value?: string | null;
		places: (P & { level?: string })[];
		placeholder?: string;
		levels?: string[];
		required?: boolean;
	} = $props();
	const listId = `places-${Math.random().toString(36).slice(2, 8)}`;
	const options = $derived(levels ? places.filter((p) => !p.level || levels.includes(p.level)) : places);
</script>

<input {name} value={value ?? ''} list={listId} {placeholder} {required} autocomplete="off" />
<datalist id={listId}>
	{#each options as p (p.id)}
		<option value={p.name}>{p.aliases.length ? p.aliases.join(', ') : ''}</option>
	{/each}
</datalist>
