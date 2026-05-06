<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { checkOfflineAuth } from '$lib/auth.svelte.js';

	let status = $state('Signing you in…');

	onMount(async () => {
		if (!supabase) { goto('/'); return; }

		try {
			// Supabase PKCE: exchange the code in the URL for a session
			const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);

			if (error) {
				// Code already exchanged or not present — try getting existing session
				const { data: sessionData } = await supabase.auth.getSession();
				if (sessionData?.session) {
					await checkOfflineAuth();
					status = 'Redirecting…';
					goto('/dashboard');
					return;
				}
				// No session at all — back to login
				status = 'Session not found, redirecting…';
				setTimeout(() => goto('/'), 1500);
				return;
			}

			if (data?.session) {
				await checkOfflineAuth();
				status = 'Welcome! Loading your dashboard…';
				goto('/dashboard');
				return;
			}

			goto('/');
		} catch (e) {
			// Last resort: check if session exists anyway
			try {
				const { data: sessionData } = await supabase.auth.getSession();
				if (sessionData?.session) {
					await checkOfflineAuth();
					goto('/dashboard');
					return;
				}
			} catch { }
			goto('/');
		}
	});
</script>

<div class="splash">
	<svg width="36" height="36" viewBox="0 0 28 28" fill="none">
		<circle cx="14" cy="14" r="3" fill="#29b6f6"/>
		<circle cx="14" cy="14" r="7.5" stroke="#29b6f6" stroke-width="1.5" fill="none" opacity=".6"/>
		<circle cx="14" cy="14" r="12" stroke="#29b6f6" stroke-width=".7" fill="none" opacity=".25"/>
	</svg>
	<p>{status}</p>
</div>

<style>
.splash {
	min-height: 100dvh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: .8rem;
	background: #080b0f;
}
.splash p {
	font-size: .78rem;
	color: #29b6f6;
	letter-spacing: .05em;
}
</style>
