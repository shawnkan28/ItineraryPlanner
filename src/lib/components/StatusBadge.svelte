<script lang="ts">
	let { status }: { status: string } = $props();
	const colors: Record<string, string> = {
		planning: 'blue',
		booked: 'green',
		ongoing: 'amber',
		done: 'purple',
		exported: '',
		to_book: 'red',
		not_needed: '',
		cancelled: '',
		idea: 'blue',
		planned: 'green',
		dropped: '',
		parked: 'amber',
		open: 'amber',
		decided: 'green'
	};
</script>

<span class="badge {colors[status] ?? ''}">{status.replace('_', ' ')}</span>
