<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { data, children } = $props();
</script>

<header class="top">
	<div class="inner">
		<a class="brand" href="/">
			<span class="dot"></span>
			Itinerary
		</a>
		{#if data.loggedIn}
			<nav>
				<a href="/" class:active={page.url.pathname === '/' || page.url.pathname.startsWith('/trips')}>Trips</a>
				<a href="/bucket" class:active={page.url.pathname.startsWith('/bucket')}>Bucket list</a>
				<a href="/places" class:active={page.url.pathname.startsWith('/places')}>Places</a>
				<a href="/settings" class:active={page.url.pathname.startsWith('/settings')}>Settings</a>
				{#if data.authEnabled}
					<form method="POST" action="/logout"><button class="ghost sm">Log out</button></form>
				{/if}
			</nav>
		{/if}
	</div>
</header>

{@render children()}

<style>
	.top {
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.inner {
		max-width: 1180px;
		margin: 0 auto;
		padding: 0.5rem 1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 700;
		text-decoration: none;
	}
	.dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--accent);
	}
	nav {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	nav a {
		padding: 0.3rem 0.6rem;
		border-radius: 6px;
		text-decoration: none;
		color: var(--muted);
	}
	nav a.active,
	nav a:hover {
		color: var(--text);
		background: var(--surface-2);
	}
	nav form {
		margin: 0;
	}
</style>
