<script lang="ts">
	let { form } = $props();
</script>

<svelte:head><title>Log in · Itinerary</title></svelte:head>

<main>
	<form method="POST" class="card stack login">
		<h1>Log in</h1>
		<label>
			Password
			<input type="password" name="password" autocomplete="current-password" required />
		</label>
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<button class="primary">Log in</button>
	</form>
</main>

<style>
	.login {
		max-width: 360px;
		margin: 3rem auto;
	}
</style>
