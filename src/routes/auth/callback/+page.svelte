<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let status = $state('Signing you in…');
	let error  = $state('');

	onMount(async () => {
		try {
			const { supabase } = await import('$lib/supabase.js');
			if (!supabase) { goto('/'); return; }

			// Supabase JS v2 automatically handles PKCE code exchange and hash tokens
			// when detectSessionInUrl is true (the default). We just need to wait.
			// Poll for session up to 8 seconds.
			let session = null;
			for (let i = 0; i < 16; i++) {
				await new Promise(r => setTimeout(r, 500));
				const { data } = await supabase.auth.getSession();
				if (data?.session) { session = data.session; break; }
			}

			if (session) {
				// Hydrate user profile then go to dashboard
				try {
					const { checkOfflineAuth } = await import('$lib/auth.svelte.js');
					await checkOfflineAuth();
				} catch {}
				status = 'Welcome! Loading your dashboard…';
				goto('/dashboard');
			} else {
				// Fallback: try manual code exchange
				const url = window.location.href;
				if (url.includes('code=')) {
					try {
						const { data, error: exchErr } = await supabase.auth.exchangeCodeForSession(url);
						if (data?.session) {
							try { const { checkOfflineAuth } = await import('$lib/auth.svelte.js'); await checkOfflineAuth(); } catch {}
							goto('/dashboard'); return;
						}
						if (exchErr) { error = exchErr.message; }
					} catch(e) { error = e.message; }
				}
				status = 'Could not sign in.';
				setTimeout(() => goto('/'), 2000);
			}
		} catch(e) {
			error  = e.message ?? 'Unknown error';
			status = 'Sign-in failed.';
			setTimeout(() => goto('/'), 2500);
		}
	});
</script>

<div class="splash">
	<svg width="40" height="40" viewBox="0 0 28 28" fill="none">
		<circle cx="14" cy="14" r="3" fill="#29b6f6"/>
		<circle cx="14" cy="14" r="7.5" stroke="#29b6f6" stroke-width="1.5" fill="none" opacity=".6"/>
		<circle cx="14" cy="14" r="12" stroke="#29b6f6" stroke-width=".7" fill="none" opacity=".25"/>
	</svg>
	<p class="status">{status}</p>
	{#if error}<p class="err">⚠ {error}</p>{/if}
</div>

<style>
.splash { min-height:100dvh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.85rem; background:#080b0f; padding:2rem; }
.status { font-size:.8rem; color:#29b6f6; letter-spacing:.06em; text-align:center; }
.err    { font-size:.7rem; color:#ff5252; text-align:center; max-width:280px; line-height:1.5; }
</style>
