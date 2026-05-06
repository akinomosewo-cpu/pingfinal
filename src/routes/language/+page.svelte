<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { userAuth } from '$lib/auth.svelte.js';

	const LANGUAGES = [
		{ code: 'en',     label: 'English',    native: 'English',      flag: '🇬🇧' },
		{ code: 'pcm',    label: 'Pidgin',     native: 'Nigerian Pidgin', flag: '🇳🇬' },
		{ code: 'ha',     label: 'Hausa',      native: 'Hausa',        flag: '🇳🇬' },
		{ code: 'ig',     label: 'Igbo',       native: 'Igbo',         flag: '🇳🇬' },
		{ code: 'yo',     label: 'Yoruba',     native: 'Yorùbá',       flag: '🇳🇬' },
		{ code: 'ff',     label: 'Fulfulde',   native: 'Fulfulde',     flag: '🇳🇬' },
		{ code: 'kn',     label: 'Kanuri',     native: 'Kànùrí',      flag: '🇳🇬' },
		{ code: 'tiv',    label: 'Tiv',        native: 'Tiv',          flag: '🇳🇬' },
	];

	let selected = $state('en');
	let saving   = $state(false);

	onMount(() => {
		const saved = localStorage.getItem('ping_lang');
		if (saved) selected = saved;
	});

	async function confirm() {
		saving = true;
		localStorage.setItem('ping_lang', selected);
		await new Promise(r => setTimeout(r, 400));
		// After language, go to dashboard (or back to login if not verified)
		goto(userAuth.isVerified ? '/dashboard' : '/');
	}
</script>

<svelte:head><title>P.I.N.G. — Choose Language</title></svelte:head>

<div class="page">
	<div class="top">
		<div class="ping-logo">
			<svg width="32" height="32" viewBox="0 0 32 32" fill="none">
				<circle cx="16" cy="16" r="3.5" fill="#ff2d2d"/>
				<circle cx="16" cy="16" r="9" stroke="#ff2d2d" stroke-width="1.5" fill="none" opacity=".6"/>
				<circle cx="16" cy="16" r="14.5" stroke="#ff2d2d" stroke-width=".8" fill="none" opacity=".2"/>
			</svg>
		</div>
		<h1>Choose your language</h1>
		<p class="sub">Yan yaren da kuke so · Họn ngôn ngữ của bạn</p>
		<p class="desc">Select the language you're most comfortable with. You can change this later in Settings.</p>
	</div>

	<div class="lang-grid">
		{#each LANGUAGES as lang}
			<button
				class="lang-card"
				class:active={selected === lang.code}
				onclick={() => selected = lang.code}
			>
				<span class="flag">{lang.flag}</span>
				<span class="label">{lang.native}</span>
				{#if lang.code !== lang.label.toLowerCase()}
					<span class="sub-label">{lang.label}</span>
				{/if}
				{#if selected === lang.code}
					<div class="check">✓</div>
				{/if}
			</button>
		{/each}
	</div>

	<div class="footer">
		<button class="btn-confirm" onclick={confirm} disabled={saving}>
			{saving ? 'Saving…' : 'Continue →'}
		</button>
		<p class="note">More languages coming soon</p>
	</div>
</div>

<style>
:global(body) { margin:0; background:#080b0f; font-family:-apple-system,'SF Pro Display',sans-serif; }

.page { min-height:100dvh; display:flex; flex-direction:column; padding:2rem 1.25rem; max-width:480px; margin:0 auto; }

.top { text-align:center; margin-bottom:2rem; }
.ping-logo { display:flex; justify-content:center; margin-bottom:1rem; }
h1 { font-size:1.7rem; font-weight:800; color:#e8edf3; margin:0 0 .4rem; letter-spacing:-.02em; }
.sub { font-size:.72rem; color:#3f5166; margin:0 0 .75rem; }
.desc { font-size:.82rem; color:#7a8fa8; line-height:1.6; margin:0; }

.lang-grid { display:grid; grid-template-columns:1fr 1fr; gap:.65rem; flex:1; }
.lang-card {
	background:#111822; border:1.5px solid rgba(255,255,255,0.07);
	border-radius:14px; padding:1rem .75rem;
	display:flex; flex-direction:column; align-items:center; gap:.3rem;
	cursor:pointer; position:relative; transition:border-color .15s, background .15s;
	text-align:center;
}
.lang-card:hover { border-color:rgba(255,45,45,.3); background:#1a2332; }
.lang-card.active { border-color:#ff2d2d; background:rgba(255,45,45,.06); }
.flag { font-size:1.6rem; }
.label { font-size:.9rem; font-weight:700; color:#e8edf3; }
.sub-label { font-size:.68rem; color:#7a8fa8; }
.check { position:absolute; top:8px; right:10px; color:#ff2d2d; font-size:.8rem; font-weight:800; }

.footer { margin-top:1.5rem; display:flex; flex-direction:column; align-items:center; gap:.6rem; }
.btn-confirm {
	width:100%; background:#ff2d2d; color:#fff; border:none; border-radius:13px;
	padding:.9rem; font-size:1rem; font-weight:700; cursor:pointer;
	transition:background .15s, transform .08s;
}
.btn-confirm:active:not(:disabled) { transform:scale(.98); }
.btn-confirm:disabled { opacity:.5; cursor:not-allowed; }
.note { font-size:.68rem; color:#3f5166; margin:0; }
</style>
