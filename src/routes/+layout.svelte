<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let { children } = $props();
	let ready = $state(false);
	let initError = $state('');

	onMount(async () => {
		try { const { loadLang } = await import('$lib/i18n.js'); loadLang(); } catch {}
		try { const { checkOfflineAuth } = await import('$lib/auth.svelte.js'); await checkOfflineAuth(); } catch {}
		try { const { loadPersistedAlerts } = await import('$lib/alerts.svelte.js'); loadPersistedAlerts(); } catch {}
		ready = true;
		try {
			const { supabase } = await import('$lib/supabase.js');
			if (supabase) {
				supabase.auth.onAuthStateChange(async (event, session) => {
					if (event === 'SIGNED_IN' && session) {
						try { const { checkOfflineAuth } = await import('$lib/auth.svelte.js'); await checkOfflineAuth(); } catch {}
						const path = window.location.pathname;
						if (path === '/' || path.startsWith('/auth')) goto('/dashboard');
					}
					if (event === 'SIGNED_OUT') goto('/');
				});
			}
		} catch {}
	});
</script>

{#if ready}
	{@render children()}
{:else}
	<div class="splash">
		<svg width="36" height="36" viewBox="0 0 28 28" fill="none">
			<circle cx="14" cy="14" r="3" fill="#29b6f6"/>
			<circle cx="14" cy="14" r="7.5" stroke="#29b6f6" stroke-width="1.5" fill="none" opacity=".6"/>
			<circle cx="14" cy="14" r="12" stroke="#29b6f6" stroke-width=".7" fill="none" opacity=".25"/>
		</svg>
		<p>P.I.N.G.</p>
		{#if initError}<p class="err">{initError}</p>{/if}
	</div>
{/if}

<style>
	:global(*, *::before, *::after) { margin: 0; padding: 0; box-sizing: border-box; }

	:global(html) {
		height: 100%; height: 100dvh;
		background: #080b0f;
		overflow: hidden;
	}

	:global(body) {
		height: 100%; height: 100dvh;
		background: #080b0f;
		color: #e8edf3;
		font-family: 'Syne', -apple-system, 'Helvetica Neue', sans-serif;
		-webkit-font-smoothing: antialiased;
		-webkit-text-size-adjust: 100%;
		overflow: hidden;
		/* Safe area for notch / home indicator */
		padding-top: env(safe-area-inset-top, 0px);
		padding-bottom: env(safe-area-inset-bottom, 0px);
		padding-left: env(safe-area-inset-left, 0px);
		padding-right: env(safe-area-inset-right, 0px);
	}

	/* Reset body padding if we're handling it per-page */
	:global(body) { padding: 0; }

	:global(#svelte) {
		height: 100%; height: 100dvh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	:global(:root) {
		--bg-primary:    #080b0f;
		--bg-secondary:  #0d1117;
		--bg-card:       #111822;
		--bg-hover:      #1a2332;
		--border:        rgba(255,255,255,.06);
		--text-primary:  #e8edf3;
		--text-secondary:#7a8fa8;
		--text-muted:    #3f5166;
		--red:           #e53935;
		--red-dim:       #c62828;
		--red-glow:      rgba(229,57,53,.35);
		--green:         #00e676;
		--blue:          #29b6f6;
		--amber:         #f5a623;
		--font-display:  'Syne', sans-serif;
		--font-body:     'Syne', sans-serif;
		--font-mono:     'IBM Plex Mono', monospace;
		/* Safe area CSS vars */
		--sat: env(safe-area-inset-top, 0px);
		--sab: env(safe-area-inset-bottom, 0px);
	}

	/* Global scrollbar hide */
	:global(*::-webkit-scrollbar) { display: none; }
	:global(*) { scrollbar-width: none; -ms-overflow-style: none; }

	.splash {
		height: 100dvh; display: flex; flex-direction: column;
		align-items: center; justify-content: center; gap: .8rem; background: #080b0f;
	}
	.splash p { font-size: .75rem; font-weight: 700; letter-spacing: .25em; color: #29b6f6; }
	.err { color: #ff2d2d; font-size: .65rem; letter-spacing: 0; }
</style>
