<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import {
		userAuth, signUpEmail, signInEmail, signInWithGoogle,
		validateNigerianPhone, normalisePhone, deriveVillageFromLocation, LANGUAGES
	} from '$lib/auth.svelte.js';
	import { isSupabaseReady } from '$lib/supabase.js';
	import { startLocationWatch, stopLocationWatch, formatCoord } from '$lib/location.js';
	import { i18n, setLang, t } from '$lib/i18n.js';

	// Reactive translation helper
	const T = $derived((key) => t($i18n.lang, key));

	// ── Calculator ─────────────────────────────────────────────────
	let display = $state('0'), expression = $state('');
	let prevValue = $state(null), operator = $state(null), waitingNext = $state(false);
	let acCount = $state(0), acFlash = $state(false), acTimer = null;

	// ── Sheet ──────────────────────────────────────────────────────
	let sheetOpen = $state(false);
	let mode = $state('signup'); // 'signup' | 'login'
	// step: 'lang' | 'form' | 'location' | 'confirm-email' | 'trust' | 'done'
	let step = $state('lang');
	let loading = $state(false);
	let error = $state('');

	// ── Fields ─────────────────────────────────────────────────────
	let selLang = $state('en');
	let firstName = $state(''), lastName = $state('');
	let email = $state(''), password = $state(''), showPw = $state(false);
	let phone = $state(''), role = $state('resident');

	// ── Location & village ─────────────────────────────────────────
	let locState = $state({ lat: null, lng: null, region: null, error: null, accuracy: null });
	let locLoading = $state(false);
	let derivedVillage = $state(null);

	// ── Result ─────────────────────────────────────────────────────
	let createdUsername = $state('');
	let createdVillageKey = $state('');

	onMount(() => {
		if ($userAuth.isVerified) goto('/dashboard');
	});

	// ── Calculator ─────────────────────────────────────────────────
	function pressAC() {
		display = '0'; expression = ''; prevValue = null; operator = null; waitingNext = false;
		acFlash = true; setTimeout(() => (acFlash = false), 160);
		acCount++; clearTimeout(acTimer);
		if (acCount >= 3) { acCount = 0; setTimeout(() => openSheet(), 300); return; }
		acTimer = setTimeout(() => (acCount = 0), 2000);
	}
	function pressDigit(d) { waitingNext ? (display = String(d), waitingNext = false) : (display = display === '0' ? String(d) : display + d); }
	function pressDot()  { if (waitingNext) { display = '0.'; waitingNext = false; } else if (!display.includes('.')) display += '.'; }
	function pressOp(op) {
		const cur = parseFloat(display);
		if (prevValue !== null && !waitingNext) { const r = calc(prevValue, cur, operator); display = fmt(r); prevValue = r; } else prevValue = cur;
		operator = op; waitingNext = true; expression = `${display} ${op}`;
	}
	function pressEq() {
		if (!operator || prevValue === null) return;
		const cur = parseFloat(display), r = calc(prevValue, cur, operator);
		expression = `${prevValue} ${operator} ${cur} =`;
		display = fmt(r); prevValue = null; operator = null; waitingNext = true;
	}
	function pressBack() { display = display.length > 1 ? display.slice(0,-1) : '0'; }
	function pressPct()  { display = String(parseFloat(display)/100); }
	function calc(a,b,op) { return op==='+' ? a+b : op==='−' ? a-b : op==='×' ? a*b : op==='÷' && b ? a/b : b; }
	function fmt(n) { return isFinite(n) ? String(parseFloat(n.toPrecision(10))) : 'Error'; }

	// ── Sheet open/close ───────────────────────────────────────────
	function openSheet() { sheetOpen = true; step = 'lang'; error = ''; mode = 'signup'; }
	function closeSheet() {
		sheetOpen = false;
		stopLocationWatch();
		setTimeout(() => { step = 'lang'; error = ''; derivedVillage = null; locState = { lat: null, lng: null, region: null, error: null, accuracy: null }; }, 350);
	}

	// ── Language step ──────────────────────────────────────────────
	function pickLang(code) { selLang = code; }
	function confirmLang()  { setLang(selLang); $i18n.lang = selLang; step = 'form'; error = ''; }

	// ── Location step ──────────────────────────────────────────────
	function requestLocation() {
		locLoading = true; error = '';
		startLocationWatch(update => {
			locState = update;
			locLoading = false;
			if (update.lat && update.region) {
				derivedVillage = deriveVillageFromLocation(update.lat, update.lng, email || Date.now());
				stopLocationWatch();
			}
		});
	}

	// ── Sign up ────────────────────────────────────────────────────
	async function validateForm() {
		if (!firstName.trim()) { error = 'Enter your first name.'; return false; }
		if (!lastName.trim())  { error = 'Enter your last name.'; return false; }
		if (!email.trim() || !email.includes('@')) { error = 'Enter a valid email.'; return false; }
		if (password.length < 8) { error = 'Password must be at least 8 characters.'; return false; }
		if (phone.trim() && !validateNigerianPhone(phone)) { error = 'Invalid phone. Use: 08012345678'; return false; }
		return true;
	}

	async function submitSignUp() {
		error = '';
		if (!(await validateForm())) return;
		if (!locState.lat) { step = 'location'; return; }
		await doSignUp();
	}

	async function skipLocation() {
		derivedVillage = { region: { key: 'NG', name: 'Nigeria' }, key: 'NG' + Date.now().toString().slice(-4), villageName: 'Nigeria' };
		await doSignUp();
	}

	async function doSignUp() {
		loading = true; error = '';
		const region = locState.region ?? derivedVillage?.region ?? { key: 'NG', name: 'Nigeria' };
		const result = await signUpEmail({
			email, password, firstName, lastName,
			phone: phone.trim() ? normalisePhone(phone) : '',
			role, region, language: selLang
		});
		loading = false;
		if (!result.ok) { error = result.error; return; }
		createdUsername = result.username;
		createdVillageKey = result.villageKey;
		if (result.needsConfirm) { step = 'confirm-email'; return; }
		step = 'trust';
	}

	// ── Sign in ────────────────────────────────────────────────────
	async function submitSignIn() {
		error = '';
		if (!email.trim() || !email.includes('@')) { error = 'Enter your email.'; return; }
		if (!password) { error = 'Enter your password.'; return; }
		loading = true;
		const { ok, error: e } = await signInEmail({ email, password });
		loading = false;
		if (!ok) { error = e; return; }
		step = 'trust';
	}

	async function googleSignIn() {
		loading = true;
		const { ok, error: e } = await signInWithGoogle();
		loading = false;
		if (!ok) error = e;
	}

	function finish() { step = 'done'; setTimeout(() => goto('/dashboard'), 1500); }

	const langLabels = { en:'English', pcm:'Pidgin', ha:'Hausa', ig:'Igbo', yo:'Yorùbá', ful:'Fulfulde', tiv:'Tiv', ijo:'Ijaw' };
</script>

<svelte:head><title>Calculator</title></svelte:head>

<!-- ══ CALCULATOR ═══════════════════════════════════════════════ -->
<main class="calc-bg">
	<div class="calc">
		<div class="display">
			<span class="expr">{expression}</span>
			<div class="val-row">
				<span class="val" class:sm={display.length>9}>{display}</span>
				<button class="back-btn" onclick={pressBack} aria-label="back">
					<svg width="20" height="14" viewBox="0 0 20 14" fill="none">
						<path d="M7 1L1 7l6 6M1 7h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
					</svg>
				</button>
			</div>
		</div>
		<div class="keys">
			<button class="k fn secret" class:flash={acFlash} onclick={pressAC} style="grid-column:span 2">AC</button>
			<button class="k fn" onclick={pressPct}>%</button>
			<button class="k op" class:hi={operator==='÷'} onclick={() => pressOp('÷')}>÷</button>
			{#each ['7','8','9'] as d}<button class="k num" onclick={() => pressDigit(d)}>{d}</button>{/each}
			<button class="k op" class:hi={operator==='×'} onclick={() => pressOp('×')}>×</button>
			{#each ['4','5','6'] as d}<button class="k num" onclick={() => pressDigit(d)}>{d}</button>{/each}
			<button class="k op" class:hi={operator==='−'} onclick={() => pressOp('−')}>−</button>
			{#each ['1','2','3'] as d}<button class="k num" onclick={() => pressDigit(d)}>{d}</button>{/each}
			<button class="k op" class:hi={operator==='+'} onclick={() => pressOp('+')}>+</button>
			<button class="k num zero" onclick={() => pressDigit('0')}>0</button>
			<button class="k num" onclick={pressDot}>.</button>
			<button class="k op" onclick={pressEq}>=</button>
		</div>
	</div>
</main>

<!-- ══ AUTH SHEET ════════════════════════════════════════════════ -->
{#if sheetOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="scrim" onclick={closeSheet}></div>
	<div class="sheet">
		<div class="pill"></div>

		<!-- ─ LANGUAGE PICKER ─────────────────────────────────── -->
		{#if step === 'lang'}
			<div class="sh-head">
				<button class="x" onclick={closeSheet}>✕</button>
				<div class="brand">
					<svg width="22" height="22" viewBox="0 0 28 28" fill="none">
						<circle cx="14" cy="14" r="3" fill="#0057b8"/>
						<circle cx="14" cy="14" r="7.5" stroke="#0057b8" stroke-width="1.5" fill="none"/>
						<circle cx="14" cy="14" r="12.5" stroke="#0057b8" stroke-width=".7" fill="none" opacity=".35"/>
					</svg>
					<div><p class="bname">P.I.N.G.</p><p class="bsub">{T("appSub")}</p></div>
				</div>
				<span class="badge" class:on={isSupabaseReady}>{isSupabaseReady?'🔒 Secure':'📡 Offline'}</span>
			</div>
			<div class="body">
				<h2 class="title">{T("chooseLanguage")}</h2>
				<p class="desc">{T("langDesc")}</p>
				<div class="lang-grid">
					{#each LANGUAGES as l}
						<button class="lang-btn" class:sel={selLang===l.code} onclick={() => pickLang(l.code)}>
							<span class="ln">{l.native}</span>
							<span class="ls">{l.label}</span>
						</button>
					{/each}
				</div>
			</div>
			<div class="foot">
				<button class="btn-p" onclick={confirmLang}>{T("continue")}</button>
				<p class="cl" role="button" tabindex="0" onclick={closeSheet} onkeydown={e=>e.key==='Enter'&&closeSheet()}>{T("returnCalc")}</p>
			</div>

		<!-- ─ SIGN UP / LOG IN FORM ───────────────────────────── -->
		{:else if step === 'form'}
			<div class="sh-head">
				<button class="x" onclick={() => { step='lang'; error=''; }}>← Back</button>
				<div class="tabs">
					<button class="tab" class:on={mode==='signup'} onclick={() => { mode='signup'; error=''; }}>Sign Up</button>
					<button class="tab" class:on={mode==='login'}  onclick={() => { mode='login';  error=''; }}>Log In</button>
				</div>
			</div>

			{#if mode === 'signup'}
			<div class="body">
				<h2 class="title">{T("joinPing")}</h2>
				<div class="row2">
					<div class="f"><label>First name</label><input type="text" bind:value={firstName} placeholder="Musa" autocomplete="given-name" maxlength="30"/></div>
					<div class="f"><label>Last name</label><input type="text" bind:value={lastName} placeholder="Aliyu" autocomplete="family-name" maxlength="30"/></div>
				</div>
				<div class="f">
					<label>Email address</label>
					<input type="email" bind:value={email} placeholder="you@example.com" autocomplete="email" inputmode="email"/>
				</div>
				<div class="f">
					<label>Password <span class="hint">min 8 chars</span></label>
					<div class="pw">
						<input type={showPw?'text':'password'} bind:value={password} placeholder="Create a strong password" autocomplete="new-password"/>
						<button class="eye" type="button" onclick={() => showPw=!showPw}>{showPw?'🙈':'👁️'}</button>
					</div>
				</div>
				<div class="f">
					<label>Phone <span class="hint">Optional · SMS alerts</span></label>
					<div class="ph">
						<span class="flag">🇳🇬 +234</span>
						<input type="tel" bind:value={phone} placeholder="08012345678" inputmode="tel" maxlength="14"/>
					</div>
				</div>
				<div class="f">
					<label>Role</label>
					<select bind:value={role}>
						<option value="resident">Resident</option>
						<option value="vanguard">Community Vanguard</option>
					</select>
				</div>
				{#if error}<p class="err">⚠ {error}</p>{/if}
			</div>
			<div class="foot">
				<button class="btn-p" onclick={submitSignUp} disabled={loading}>{loading?'Setting up…':'Create account →'}</button>
				<div class="or"><span>or</span></div>
				<button class="btn-google" onclick={googleSignIn} disabled={loading || !isSupabaseReady}>
					<svg width="18" height="18" viewBox="0 0 18 18"><path d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z" fill="#4285F4"/><path d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.49-1.63.78-2.7.78-2.08 0-3.84-1.4-4.47-3.29H1.85v2.07A8 8 0 008.98 17z" fill="#34A853"/><path d="M4.51 10.54A4.8 4.8 0 014.26 9c0-.53.09-1.05.25-1.54V5.39H1.85A8 8 0 001 9c0 1.29.31 2.51.85 3.61l2.66-2.07z" fill="#FBBC05"/><path d="M8.98 4.17c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.85 5.4L4.5 7.46c.63-1.89 2.4-3.29 4.48-3.29z" fill="#EA4335"/></svg>
					{T("googleSignIn")}
				</button>
				<p class="sw">Have an account? <button class="lnk" onclick={() => { mode='login'; error=''; }}>Log in</button></p>
				<p class="cl" role="button" tabindex="0" onclick={closeSheet} onkeydown={e=>e.key==='Enter'&&closeSheet()}>{T("returnCalc")}</p>
			</div>

			{:else}
			<!-- LOGIN -->
			<div class="body">
				<h2 class="title">{T("welcomeBack")}</h2>
				<div class="f">
					<label>Email address</label>
					<input type="email" bind:value={email} placeholder="you@example.com" autocomplete="email" inputmode="email"/>
				</div>
				<div class="f">
					<label>Password</label>
					<div class="pw">
						<input type={showPw?'text':'password'} bind:value={password} placeholder="Your password" autocomplete="current-password"/>
						<button class="eye" type="button" onclick={() => showPw=!showPw}>{showPw?'🙈':'👁️'}</button>
					</div>
				</div>
				{#if error}<p class="err">⚠ {error}</p>{/if}
			</div>
			<div class="foot">
				<button class="btn-p" onclick={submitSignIn} disabled={loading}>{loading?'Signing in…':'Sign in →'}</button>
				<div class="or"><span>or</span></div>
				<button class="btn-google" onclick={googleSignIn} disabled={loading || !isSupabaseReady}>
					<svg width="18" height="18" viewBox="0 0 18 18"><path d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z" fill="#4285F4"/><path d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.49-1.63.78-2.7.78-2.08 0-3.84-1.4-4.47-3.29H1.85v2.07A8 8 0 008.98 17z" fill="#34A853"/><path d="M4.51 10.54A4.8 4.8 0 014.26 9c0-.53.09-1.05.25-1.54V5.39H1.85A8 8 0 001 9c0 1.29.31 2.51.85 3.61l2.66-2.07z" fill="#FBBC05"/><path d="M8.98 4.17c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.85 5.4L4.5 7.46c.63-1.89 2.4-3.29 4.48-3.29z" fill="#EA4335"/></svg>
					{T("googleSignIn")}
				</button>
				<p class="sw">No account? <button class="lnk" onclick={() => { mode='signup'; error=''; }}>Sign up</button></p>
				<p class="cl" role="button" tabindex="0" onclick={closeSheet} onkeydown={e=>e.key==='Enter'&&closeSheet()}>{T("returnCalc")}</p>
			</div>
			{/if}

		<!-- ─ LOCATION STEP ────────────────────────────────────── -->
		{:else if step === 'location'}
			<div class="sh-head"><button class="x" onclick={() => { step='form'; error=''; }}>← Back</button></div>
			<div class="body center">
				<div class="loc-icon">📍</div>
				<h2 class="title">Your location</h2>
				<p class="desc">P.I.N.G. groups you with people nearby and generates your unique Village Key based on your area.</p>

				{#if locState.lat}
					<div class="loc-card">
						<div class="coord-row"><span class="coord-lbl">LAT</span><span class="coord-val">{formatCoord(locState.lat, true)}</span></div>
						<div class="coord-row"><span class="coord-lbl">LNG</span><span class="coord-val">{formatCoord(locState.lng, false)}</span></div>
						{#if locState.accuracy}<div class="coord-row"><span class="coord-lbl">ACC</span><span class="coord-val">±{locState.accuracy}m</span></div>{/if}
						{#if locState.region}<div class="coord-row"><span class="coord-lbl">REGION</span><span class="coord-val">{locState.region.name}</span></div>{/if}
						{#if derivedVillage}<div class="coord-row"><span class="coord-lbl">KEY</span><span class="coord-val key-val">{derivedVillage.key}</span></div>{/if}
					</div>
				{/if}

				{#if locState.error}<p class="err">⚠ {locState.error}</p>{/if}
			</div>
			<div class="foot">
				{#if !locState.lat}
					<button class="btn-p" onclick={requestLocation} disabled={locLoading}>{locLoading?T('gettingLocation'):'📍 Allow location access'}</button>
				{:else}
					<button class="btn-p" onclick={doSignUp} disabled={loading}>{loading?'Creating account…':'Continue →'}</button>
				{/if}
				<button class="btn-ghost" onclick={skipLocation} disabled={loading}>{T('skipLocation')}</button>
				<p class="cl" role="button" tabindex="0" onclick={closeSheet} onkeydown={e=>e.key==='Enter'&&closeSheet()}>{T("returnCalc")}</p>
			</div>

		<!-- ─ CONFIRM EMAIL ────────────────────────────────────── -->
		{:else if step === 'confirm-email'}
			<div class="body center" style="padding-top:2.5rem">
				<div class="big-icon">📧</div>
				<h2 class="title">Check your email</h2>
				<p class="desc">Confirmation sent to <strong>{email}</strong>.<br/>Your Village Key is <strong class="vkey">{createdVillageKey}</strong><br/>Your username is <strong>@{createdUsername}</strong></p>
				<p class="desc" style="font-size:.78rem;color:#aaa">This key was also sent to your email. Keep it safe.</p>
				<button class="btn-p" style="margin-top:1rem" onclick={() => { mode='login'; step='form'; }}>Go to Log In →</button>
			</div>

		<!-- ─ TRUST DEVICE ────────────────────────────────────── -->
		{:else if step === 'trust'}
			<div class="sh-head"><button class="x" onclick={closeSheet}>✕</button></div>
			<div class="trust-icon"><div class="tc">🛡️</div></div>
			<div class="body">
				<h2 class="title">{T('trustDevice')}</h2>
				<p class="desc">Staying logged in keeps P.I.N.G. ready offline and for instant SOS.</p>
				{#if createdUsername}<p class="username-badge">Your username: <strong>@{createdUsername}</strong></p>{/if}
				{#if createdVillageKey}<p class="username-badge">Your Village Key: <strong>{createdVillageKey}</strong></p>{/if}
				<div class="tfeats">
					<div class="tf">🔒 Keeps network access protected</div>
					<div class="tf">⚡ Instant SOS with no login delay</div>
					<div class="tf">📡 Mesh works without internet</div>
				</div>
			</div>
			<div class="foot">
				<button class="btn-p" onclick={finish}>{T('alwaysTrust')}</button>
				<button class="btn-ghost" onclick={finish}>{T('trustOnce')}</button>
			</div>

		<!-- ─ DONE ────────────────────────────────────────────── -->
		{:else if step === 'done'}
			<div class="body center" style="padding-top:3rem">
				<div class="check">✓</div>
				<h2 class="title" style="color:#0057b8">Protected!</h2>
				<p class="desc">Welcome, <strong>{firstName || userAuth.firstName}</strong>.</p>
				<p class="loading-dot">{T('loading')}</p>
			</div>
		{/if}
	</div>
{/if}

<style>
:global(body){margin:0;background:#f0f0f0;font-family:-apple-system,'SF Pro Display','Helvetica Neue',sans-serif;}
.calc-bg{height:100dvh;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;background:#f0f0f0;padding-bottom:env(safe-area-inset-bottom,0);}
.calc{width:100%;max-width:min(430px,100%);padding-bottom:.5rem;}
.display{padding:clamp(.8rem,3vw,1.4rem) clamp(1rem,4vw,1.4rem) .6rem;flex:1;display:flex;flex-direction:column;justify-content:flex-end;}
.expr{font-size:.95rem;color:#999;text-align:right;min-height:1.3em;display:block;}
.val-row{display:flex;align-items:center;justify-content:flex-end;gap:.5rem;}
.val{font-size:clamp(2.4rem,11vw,4rem);font-weight:300;color:#111;letter-spacing:-.03em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1;}
.val.sm{font-size:clamp(1.6rem,7vw,2.6rem);}
.back-btn{background:none;border:none;color:#bbb;cursor:pointer;padding:6px;display:flex;flex-shrink:0;}
.keys{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(7px,2.2vw,12px);padding:0 clamp(7px,2.2vw,12px) clamp(7px,2vh,14px);}
.k{height:clamp(62px,17vw,86px);border:none;border-radius:clamp(10px,3vw,16px);cursor:pointer;font-size:clamp(1.2rem,5vw,1.8rem);font-weight:400;display:flex;align-items:center;justify-content:center;transition:filter .08s,transform .06s;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;}
.k:active{filter:brightness(.86);transform:scale(.96);}
.k.fn{background:#d4d4d4;color:#111;}
.k.op{background:#f5a623;color:#fff;font-weight:500;}
.k.num{background:#fff;color:#111;box-shadow:0 1px 3px rgba(0,0,0,.09);}
.k.op.hi{background:#fff;color:#f5a623;}
.k.fn.secret.flash{background:#ff3b30!important;color:#fff;}
.k.zero{grid-column:span 2;justify-content:flex-start;padding-left:24px;}

/* Sheet */
.scrim{position:fixed;inset:0;background:rgba(0,0,0,.52);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:200;}
.sheet{position:fixed;bottom:0;left:0;right:0;z-index:300;background:#fff;border-radius:24px 24px 0 0;max-height:95dvh;overflow-y:auto;display:flex;flex-direction:column;padding-bottom:max(1.5rem,env(safe-area-inset-bottom));color:#111;}
.pill{width:36px;height:4px;background:rgba(0,0,0,.1);border-radius:2px;margin:12px auto 0;flex-shrink:0;}

/* Head */
.sh-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px 0;gap:.5rem;flex-shrink:0;}
.x{width:32px;height:32px;border-radius:50%;background:#f0f0f0;border:none;font-size:.76rem;color:#555;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:700;}
.brand{display:flex;align-items:center;gap:.5rem;flex:1;}
.bname{font-size:1.1rem;font-weight:800;letter-spacing:.18em;margin:0;line-height:1;color:#111;}
.bsub{font-size:.5rem;color:#aaa;margin:2px 0 0;}
.badge{font-size:.58rem;padding:3px 8px;border-radius:20px;background:#f5f5f7;color:#555;border:1px solid #e0e0e0;white-space:nowrap;}
.badge.on{background:#e8f4fd;color:#0057b8;border-color:#b3d4f5;}

/* Tabs */
.tabs{display:flex;background:#f5f5f7;border-radius:10px;padding:3px;gap:3px;}
.tab{padding:.45rem .9rem;border:none;background:transparent;border-radius:8px;font-size:.82rem;font-weight:500;color:#888;cursor:pointer;transition:background .15s,color .15s;}
.tab.on{background:#fff;color:#111;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.1);}

/* Body */
.body{padding:14px 20px 0;flex:1;}
.body.center{display:flex;flex-direction:column;align-items:center;text-align:center;gap:.5rem;}
.title{font-size:1.55rem;font-weight:700;color:#111;margin:0 0 6px;letter-spacing:-.02em;}
.desc{font-size:.86rem;color:#555;line-height:1.6;margin:0 0 14px;}

/* Language grid */
.lang-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px;}
.lang-btn{background:#f5f5f7;border:2px solid transparent;border-radius:12px;padding:.7rem .9rem;cursor:pointer;text-align:left;transition:all .15s;display:flex;flex-direction:column;gap:2px;}
.lang-btn.sel{background:#e8f4fd;border-color:#0057b8;}
.lang-btn .ln{font-size:.92rem;font-weight:600;color:#111;}
.lang-btn .ls{font-size:.65rem;color:#aaa;}

/* Form */
.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.f{display:flex;flex-direction:column;gap:.25rem;margin-bottom:10px;}
.f label{font-size:.64rem;color:#888;text-transform:uppercase;letter-spacing:.07em;display:flex;justify-content:space-between;align-items:center;}
.hint{font-size:.6rem;text-transform:none;letter-spacing:0;color:#ccc;}
.f input,.f select{background:#f5f5f7!important;border:none;border-radius:11px;padding:.7rem .9rem;font-size:.9rem;color:#111!important;width:100%;outline:none;transition:background .15s;-webkit-appearance:none;}
.f input:focus,.f select:focus{background:#ebebf0!important;outline:2px solid #0057b820;}
.f input::placeholder{color:#c5c5c5!important;}
.ph,.pw{display:flex;align-items:center;background:#f5f5f7;border-radius:11px;overflow:hidden;}
.ph:focus-within,.pw:focus-within{outline:2px solid #0057b820;}
.flag{padding:0 .7rem;font-size:.78rem;color:#555;border-right:1px solid #e0e0e0;white-space:nowrap;flex-shrink:0;}
.ph input,.pw input{border-radius:0!important;background:transparent!important;flex:1;padding-left:.6rem;outline:none!important;}
.eye{background:none;border:none;cursor:pointer;padding:.4rem .7rem;font-size:.88rem;flex-shrink:0;}
.err{font-size:.74rem;color:#e53935;margin:0 0 8px;}

/* Location */
.loc-icon{font-size:2.8rem;margin-bottom:.4rem;}
.loc-card{background:#f5f5f7;border-radius:14px;padding:1rem;width:100%;margin:8px 0;}
.coord-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #eee;}
.coord-row:last-child{border-bottom:none;}
.coord-lbl{font-size:.62rem;font-weight:700;color:#888;letter-spacing:.1em;}
.coord-val{font-size:.85rem;font-weight:600;color:#111;font-family:monospace;}
.key-val{color:#0057b8;font-size:1rem;letter-spacing:.15em;}
.big-icon{font-size:2.6rem;}

/* Trust */
.trust-icon{display:flex;padding:16px 20px 0;}
.tc{font-size:2.6rem;}
.username-badge{background:#e8f4fd;border-radius:8px;padding:.5rem .8rem;font-size:.8rem;color:#0057b8;margin:4px 0;}
.tfeats{display:flex;flex-direction:column;gap:8px;margin-top:8px;}
.tf{font-size:.84rem;color:#333;line-height:1.5;}

/* Google btn */
.btn-google{width:100%;background:#fff;border:1.5px solid #e0e0e0;border-radius:13px;padding:.8rem;font-size:.9rem;font-weight:500;color:#333;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.6rem;transition:border-color .15s,background .15s;}
.btn-google:hover:not(:disabled){border-color:#bbb;background:#fafafa;}
.btn-google:disabled{opacity:.4;cursor:not-allowed;}
.or{display:flex;align-items:center;gap:.7rem;color:#ccc;font-size:.72rem;}
.or::before,.or::after{content:'';flex:1;height:1px;background:#eee;}

/* Footer */
.foot{padding:14px 20px 0;display:flex;flex-direction:column;gap:8px;flex-shrink:0;}
.btn-p{width:100%;background:#0057b8;color:#fff;border:none;border-radius:13px;padding:.88rem;font-size:.95rem;font-weight:600;cursor:pointer;transition:background .15s,transform .08s;}
.btn-p:active:not(:disabled){transform:scale(.98);background:#00409e;}
.btn-p:disabled{opacity:.45;cursor:not-allowed;}
.btn-ghost{width:100%;background:none;border:1.5px solid #e0e0e0;color:#555;border-radius:13px;padding:.78rem;font-size:.88rem;cursor:pointer;}
.sw{text-align:center;font-size:.74rem;color:#888;margin:0;}
.lnk{background:none;border:none;color:#0057b8;font-size:.74rem;cursor:pointer;font-weight:600;padding:0;text-decoration:underline;}
.cl{text-align:center;font-size:.66rem;color:#bbb;cursor:pointer;padding:.3rem;}
.cl:hover{color:#888;}
.vkey{color:#0057b8;letter-spacing:.15em;font-size:1.1rem;}
.check{width:60px;height:60px;border-radius:50%;border:2.5px solid #0057b8;color:#0057b8;font-size:1.7rem;display:flex;align-items:center;justify-content:center;background:rgba(0,87,184,.06);animation:pop .4s cubic-bezier(.175,.885,.32,1.275);}
@keyframes pop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
.loading-dot{font-size:.7rem;color:#bbb;animation:blink 1s infinite;}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
</style>
