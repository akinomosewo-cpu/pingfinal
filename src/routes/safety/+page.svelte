<script>
	import { goto } from '$app/navigation';
	import { i18n } from '$lib/i18n.js';

	let activeSection = $state('emergency');

	const sections = [
		{ id: 'emergency', label: '🚨 Emergency', icon: '🚨' },
		{ id: 'violence',  label: '⚠️ Violence',  icon: '⚠️' },
		{ id: 'medical',   label: '🏥 Medical',   icon: '🏥' },
		{ id: 'fire',      label: '🔥 Fire',      icon: '🔥' },
		{ id: 'kidnap',    label: '🚗 Abduction', icon: '🚗' },
		{ id: 'digital',   label: '📱 Digital',   icon: '📱' },
	];
</script>

<svelte:head><title>P.I.N.G. — Safety Information</title></svelte:head>

<div class="page">
	<header class="topbar">
		<button class="back" onclick={() => goto('/dashboard')} aria-label="Back">
			<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
				<path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
			</svg>
		</button>
		<div class="head-mid">
			<span class="head-title">🛡️ Safety Information</span>
			<span class="head-sub">Nigeria Emergency Guide</span>
		</div>
	</header>

	<!-- Section tabs -->
	<div class="section-tabs">
		{#each sections as sec}
			<button class="stab" class:on={activeSection===sec.id} onclick={() => activeSection=sec.id}>
				{sec.icon}
			</button>
		{/each}
	</div>

	<div class="content">

		<!-- ── EMERGENCY NUMBERS ── -->
		{#if activeSection === 'emergency'}
			<div class="card-head">
				<h2>🚨 Emergency Numbers</h2>
				<p class="card-sub">Save these numbers. They work even with no data credit.</p>
			</div>

			<div class="numbers-grid">
				<a href="tel:199" class="num-card red">
					<span class="num-icon">🚓</span>
					<span class="num-label">Nigeria Police</span>
					<span class="num-val">199</span>
					<span class="num-sub">Nationwide</span>
				</a>
				<a href="tel:112" class="num-card blue">
					<span class="num-icon">📞</span>
					<span class="num-label">GSM Emergency</span>
					<span class="num-val">112</span>
					<span class="num-sub">Works on any network</span>
				</a>
				<a href="tel:123" class="num-card amber">
					<span class="num-icon">🚒</span>
					<span class="num-label">Fire Service</span>
					<span class="num-val">123</span>
					<span class="num-sub">Nationwide</span>
				</a>
				<a href="tel:767" class="num-card green">
					<span class="num-icon">🏥</span>
					<span class="num-label">LASEMA (Lagos)</span>
					<span class="num-val">767</span>
					<span class="num-sub">Lagos Emergency</span>
				</a>
				<a href="tel:08032003567" class="num-card purple">
					<span class="num-icon">👩‍⚕️</span>
					<span class="num-label">NEMA</span>
					<span class="num-val">0803 200 3567</span>
					<span class="num-sub">National Emergency Mgmt</span>
				</a>
				<a href="tel:08052100373" class="num-card teal">
					<span class="num-icon">🛡️</span>
					<span class="num-label">DSS Tipline</span>
					<span class="num-val">0805 210 0373</span>
					<span class="num-sub">Security threats</span>
				</a>
			</div>

			<div class="info-box">
				<p class="info-title">💡 Important</p>
				<p>All emergency numbers work <strong>without airtime</strong> on any Nigerian network. If 199 fails, try 112. If abroad, call +234 9 8709201.</p>
			</div>

		<!-- ── VIOLENCE / ATTACK ── -->
		{:else if activeSection === 'violence'}
			<div class="card-head">
				<h2>⚠️ If You're Under Attack</h2>
				<p class="card-sub">Stay calm. Follow these steps in order.</p>
			</div>

			<div class="steps">
				<div class="step">
					<span class="step-num red">1</span>
					<div class="step-body">
						<p class="step-title">RUN if you can safely escape</p>
						<p class="step-desc">Leave belongings behind. Alert others as you leave. Call 199 once you're safe.</p>
					</div>
				</div>
				<div class="step">
					<span class="step-num amber">2</span>
					<div class="step-body">
						<p class="step-title">HIDE if you can't run</p>
						<p class="step-desc">Find a room with a lockable door. Barricade the entrance. Silence your phone (vibrate off). Turn off lights. Stay low.</p>
					</div>
				</div>
				<div class="step">
					<span class="step-num blue">3</span>
					<div class="step-body">
						<p class="step-title">FIGHT only as a last resort</p>
						<p class="step-desc">Use anything available. Target eyes, throat, groin. Create noise. Multiple people should act together.</p>
					</div>
				</div>
				<div class="step">
					<span class="step-num green">4</span>
					<div class="step-body">
						<p class="step-title">AFTER — Report and get help</p>
						<p class="step-desc">Call 199 immediately. Go to the nearest police station or hospital. Do not touch anything at the scene.</p>
					</div>
				</div>
			</div>

			<div class="tip-box">
				<p class="tip-title">📱 Use P.I.N.G.</p>
				<p>Press the red SOS button — it calls 199 automatically AND alerts your community via mesh network, even without internet.</p>
			</div>

			<div class="info-box">
				<p class="info-title">🚨 Banditry / Armed Robbery</p>
				<p>Do not resist armed robbers. Comply calmly. Make mental notes of clothing and physical descriptions. Report to police after.</p>
			</div>

		<!-- ── MEDICAL ── -->
		{:else if activeSection === 'medical'}
			<div class="card-head">
				<h2>🏥 Medical Emergency</h2>
				<p class="card-sub">Every minute counts. Know what to do.</p>
			</div>

			<div class="med-grid">
				<div class="med-card">
					<p class="med-title">🩸 Severe Bleeding</p>
					<ol class="med-steps">
						<li>Apply firm direct pressure with a clean cloth</li>
						<li>Do not remove — add more cloth on top if soaked</li>
						<li>Elevate the limb above heart level</li>
						<li>Call 199 or head to nearest hospital immediately</li>
					</ol>
				</div>
				<div class="med-card">
					<p class="med-title">💓 Someone Unconscious</p>
					<ol class="med-steps">
						<li>Check for breathing — look, listen, feel</li>
						<li>If not breathing: 30 chest compressions, 2 rescue breaths</li>
						<li>Call 199 immediately</li>
						<li>Keep going until help arrives or they recover</li>
					</ol>
				</div>
				<div class="med-card">
					<p class="med-title">🌡️ Heatstroke</p>
					<ol class="med-steps">
						<li>Move to shade or air-conditioned area</li>
						<li>Remove excess clothing</li>
						<li>Apply cool (not ice cold) water to skin</li>
						<li>Give water if conscious. Call 199 if severe.</li>
					</ol>
				</div>
				<div class="med-card">
					<p class="med-title">🐍 Snakebite</p>
					<ol class="med-steps">
						<li>Keep calm and still — movement spreads venom</li>
						<li>Remove tight items (rings, watches) near bite</li>
						<li>Do NOT cut, suck or apply tourniquet</li>
						<li>Go to hospital immediately — anti-venom needed</li>
					</ol>
				</div>
			</div>

			<div class="numbers-grid" style="margin-top:12px">
				<a href="tel:199" class="num-card red">
					<span class="num-icon">🚑</span>
					<span class="num-label">Ambulance / Police</span>
					<span class="num-val">199</span>
				</a>
				<a href="tel:08023318540" class="num-card blue">
					<span class="num-icon">🏥</span>
					<span class="num-label">LUTH Emergency</span>
					<span class="num-val">0802 331 8540</span>
					<span class="num-sub">Lagos</span>
				</a>
			</div>

		<!-- ── FIRE ── -->
		{:else if activeSection === 'fire'}
			<div class="card-head">
				<h2>🔥 Fire Emergency</h2>
				<p class="card-sub">React fast — fires double in size every 60 seconds.</p>
			</div>

			<div class="steps">
				<div class="step">
					<span class="step-num red">1</span>
					<div class="step-body">
						<p class="step-title">GET OUT immediately</p>
						<p class="step-desc">Don't stop to grab belongings. Close doors behind you (slows fire spread). Use stairs, NEVER a lift.</p>
					</div>
				</div>
				<div class="step">
					<span class="step-num amber">2</span>
					<div class="step-body">
						<p class="step-title">Stay low if there's smoke</p>
						<p class="step-desc">Smoke kills faster than flames. Crawl below the smoke. Cover nose and mouth with damp cloth if possible.</p>
					</div>
				</div>
				<div class="step">
					<span class="step-num blue">3</span>
					<div class="step-body">
						<p class="step-title">If trapped — signal for help</p>
						<p class="step-desc">Close doors. Seal gaps with clothing. Signal from window. Shout and wave. Call 199 with your location.</p>
					</div>
				</div>
				<div class="step">
					<span class="step-num green">4</span>
					<div class="step-body">
						<p class="step-title">Meet at your assembly point</p>
						<p class="step-desc">Account for everyone. Never re-enter a burning building. Call 123 (fire service) and 199.</p>
					</div>
				</div>
			</div>

			<div class="info-box">
				<p class="info-title">⚡ Electrical Fire</p>
				<p>Never use water on electrical fires. Use a dry powder extinguisher or smother with a fire blanket. Disconnect power at the mains first if safe to do so.</p>
			</div>

			<div class="info-box">
				<p class="info-title">🛢️ Gas Leak</p>
				<p>Don't switch any lights or use a phone inside. Don't create any sparks. Open windows, leave the building, and call the fire service from outside: <strong>123</strong>.</p>
			</div>

		<!-- ── KIDNAP / ABDUCTION ── -->
		{:else if activeSection === 'kidnap'}
			<div class="card-head">
				<h2>🚗 Kidnap / Abduction</h2>
				<p class="card-sub">For families and individuals. Know what to do before and after.</p>
			</div>

			<div class="tip-box orange">
				<p class="tip-title">🛡️ Prevention First</p>
				<p>Vary your daily routes. Don't share location on public social media. Be suspicious of strangers offering unexpected gifts or help. Travel in groups at night.</p>
			</div>

			<div class="steps">
				<div class="step">
					<span class="step-num amber">IF TAKEN</span>
					<div class="step-body">
						<p class="step-title">Stay calm and comply</p>
						<p class="step-desc">Do not resist unless your life is in immediate danger. Cooperate — most victims who comply survive. Memorise your surroundings.</p>
					</div>
				</div>
				<div class="step">
					<span class="step-num blue">FOR FAMILIES</span>
					<div class="step-body">
						<p class="step-title">Report immediately, do not pay alone</p>
						<p class="step-desc">Call 199 and the DSS tipline (0805 210 0373). Do not attempt negotiations without law enforcement. Document all contacts from abductors.</p>
					</div>
				</div>
				<div class="step">
					<span class="step-num green">AFTER RESCUE</span>
					<div class="step-body">
						<p class="step-title">Seek medical and psychological support</p>
						<p class="step-desc">Trauma after abduction is normal. Go to hospital. Contact NAPTIP for victim support: 0800 CALL NAPTIP.</p>
					</div>
				</div>
			</div>

			<div class="numbers-grid" style="margin-top:12px">
				<a href="tel:08052100373" class="num-card teal">
					<span class="num-icon">🛡️</span>
					<span class="num-label">DSS Tipline</span>
					<span class="num-val">0805 210 0373</span>
				</a>
				<a href="tel:08000225546847" class="num-card purple">
					<span class="num-icon">👶</span>
					<span class="num-label">NAPTIP</span>
					<span class="num-val">0800 CALL NAPTIP</span>
					<span class="num-sub">Trafficking/Abduction</span>
				</a>
			</div>

		<!-- ── DIGITAL SAFETY ── -->
		{:else if activeSection === 'digital'}
			<div class="card-head">
				<h2>📱 Digital Safety</h2>
				<p class="card-sub">Protect yourself online and on your phone.</p>
			</div>

			<div class="med-grid">
				<div class="med-card">
					<p class="med-title">🔐 Password Safety</p>
					<ul class="med-steps">
						<li>Use a different password for each account</li>
						<li>Enable 2-factor authentication everywhere</li>
						<li>Never share OTPs — banks and agencies never ask</li>
						<li>Use a password manager (e.g. Bitwarden — free)</li>
					</ul>
				</div>
				<div class="med-card">
					<p class="med-title">📧 Scam / Fraud Calls</p>
					<ul class="med-steps">
						<li>Hang up immediately if they ask for OTP or BVN</li>
						<li>Report to EFCC: 0800 225 5322</li>
						<li>Don't click links in unexpected SMS messages</li>
						<li>Block and report suspicious numbers</li>
					</ul>
				</div>
				<div class="med-card">
					<p class="med-title">🌐 Staying Safe on P.I.N.G.</p>
					<ul class="med-steps">
						<li>Your username is your only identifier — guard it</li>
						<li>Don't share your Village Key publicly</li>
						<li>Report suspicious users via the admin channel</li>
						<li>P.I.N.G. will never ask for your password</li>
					</ul>
				</div>
				<div class="med-card">
					<p class="med-title">📸 Photo & Location Privacy</p>
					<ul class="med-steps">
						<li>Turn off location tagging in your camera app</li>
						<li>Don't post home address on public profiles</li>
						<li>Review app permissions regularly</li>
						<li>Use VPN on public WiFi</li>
					</ul>
				</div>
			</div>

			<div class="numbers-grid" style="margin-top:12px">
				<a href="tel:08002255322" class="num-card red">
					<span class="num-icon">⚖️</span>
					<span class="num-label">EFCC Fraud Line</span>
					<span class="num-val">0800 225 5322</span>
					<span class="num-sub">Financial crimes</span>
				</a>
				<a href="tel:07080060 1080" class="num-card blue">
					<span class="num-icon">🖥️</span>
					<span class="num-label">NITDA Cybercrime</span>
					<span class="num-val">0708 006 1080</span>
					<span class="num-sub">Cybercrime reports</span>
				</a>
			</div>
		{/if}

	</div>

	<!-- Sticky SOS bar -->
	<div class="sos-bar">
		<a href="tel:199" class="sos-quick red">🚓 199 — Police</a>
		<a href="tel:112" class="sos-quick blue">📞 112 — GSM</a>
		<a href="tel:123" class="sos-quick amber">🚒 123 — Fire</a>
	</div>
</div>

<style>
	.page {
		display: flex; flex-direction: column;
		height: 100svh; height: 100dvh;
		width: 100%; max-width: 100%; margin: 0 auto;
		background: var(--bg-primary); overflow: hidden;
	}
	.topbar {
		display: flex; align-items: center; gap: .6rem;
		padding: .65rem 1rem;
		padding-top: calc(.65rem + env(safe-area-inset-top, 0px));
		background: var(--bg-secondary); border-bottom: 1px solid var(--border); flex-shrink: 0;
	}
	.back { background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; display: flex; align-items: center; border-radius: 6px; }
	.back:hover { background: var(--bg-hover); color: var(--text-primary); }
	.head-mid { flex: 1; }
	.head-title { font-size: .9rem; font-weight: 700; color: var(--text-primary); display: block; }
	.head-sub { font-size: .6rem; color: var(--text-muted); }

	.section-tabs {
		display: flex; background: var(--bg-secondary); border-bottom: 1px solid var(--border);
		padding: .35rem .5rem; gap: .3rem; flex-shrink: 0; overflow-x: auto;
	}
	.stab {
		flex-shrink: 0; background: var(--bg-card); border: 1px solid var(--border);
		border-radius: 10px; padding: .45rem .7rem; font-size: 1rem; cursor: pointer;
		transition: all .15s; -webkit-tap-highlight-color: transparent;
	}
	.stab.on { background: rgba(229,57,53,.15); border-color: rgba(229,57,53,.4); }

	.content { flex: 1; overflow-y: auto; padding: .9rem; -webkit-overflow-scrolling: touch; padding-bottom: 4.5rem; }

	.card-head { margin-bottom: .85rem; }
	.card-head h2 { font-size: .95rem; font-weight: 800; color: var(--text-primary); margin: 0 0 .2rem; }
	.card-sub { font-size: .72rem; color: var(--text-muted); margin: 0; }

	/* Numbers grid */
	.numbers-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
	.num-card {
		display: flex; flex-direction: column; gap: 3px;
		border-radius: 14px; padding: .85rem .75rem;
		text-decoration: none; transition: opacity .15s; -webkit-tap-highlight-color: transparent;
	}
	.num-card:active { opacity: .75; }
	.num-icon { font-size: 1.3rem; }
	.num-label { font-size: .65rem; font-weight: 600; opacity: .8; }
	.num-val { font-size: .95rem; font-weight: 800; letter-spacing: .01em; }
	.num-sub { font-size: .58rem; opacity: .65; }
	.num-card.red    { background: rgba(229,57,53,.12);  color: #ff6b6b; border: 1px solid rgba(229,57,53,.25); }
	.num-card.blue   { background: rgba(41,182,246,.1);  color: #29b6f6; border: 1px solid rgba(41,182,246,.25); }
	.num-card.amber  { background: rgba(245,166,35,.1);  color: #f5a623; border: 1px solid rgba(245,166,35,.25); }
	.num-card.green  { background: rgba(0,230,118,.08);  color: #00e676; border: 1px solid rgba(0,230,118,.2); }
	.num-card.purple { background: rgba(206,147,216,.1); color: #ce93d8; border: 1px solid rgba(206,147,216,.25); }
	.num-card.teal   { background: rgba(38,198,218,.1);  color: #26c6da; border: 1px solid rgba(38,198,218,.25); }

	/* Steps */
	.steps { display: flex; flex-direction: column; gap: .6rem; margin-bottom: .85rem; }
	.step { display: flex; gap: .75rem; align-items: flex-start; background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; padding: .85rem; }
	.step-num { font-size: .65rem; font-weight: 800; letter-spacing: .06em; padding: .3rem .55rem; border-radius: 8px; flex-shrink: 0; line-height: 1.4; }
	.step-num.red    { background: rgba(229,57,53,.15);  color: #ff6b6b; }
	.step-num.amber  { background: rgba(245,166,35,.15); color: #f5a623; }
	.step-num.blue   { background: rgba(41,182,246,.15); color: #29b6f6; }
	.step-num.green  { background: rgba(0,230,118,.12);  color: #00e676; }
	.step-body { flex: 1; }
	.step-title { font-size: .82rem; font-weight: 700; color: var(--text-primary); margin: 0 0 .2rem; }
	.step-desc { font-size: .72rem; color: var(--text-secondary); margin: 0; line-height: 1.5; }

	/* Medical grid */
	.med-grid { display: flex; flex-direction: column; gap: .6rem; }
	.med-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; padding: .85rem; }
	.med-title { font-size: .82rem; font-weight: 700; color: var(--text-primary); margin: 0 0 .5rem; }
	.med-steps { margin: 0; padding-left: 1.1rem; }
	.med-steps li { font-size: .72rem; color: var(--text-secondary); line-height: 1.7; }
	.med-steps li::marker { color: var(--red); }

	/* Info / tip boxes */
	.info-box { background: rgba(41,182,246,.06); border: 1px solid rgba(41,182,246,.2); border-radius: 14px; padding: .85rem; margin-bottom: .65rem; }
	.info-title { font-size: .72rem; font-weight: 700; color: var(--blue); margin: 0 0 .3rem; }
	.info-box p:last-child { font-size: .72rem; color: var(--text-secondary); line-height: 1.6; margin: 0; }

	.tip-box { background: rgba(229,57,53,.07); border: 1px solid rgba(229,57,53,.2); border-radius: 14px; padding: .85rem; margin-bottom: .65rem; }
	.tip-box.orange { background: rgba(245,166,35,.07); border-color: rgba(245,166,35,.25); }
	.tip-title { font-size: .72rem; font-weight: 700; color: var(--red); margin: 0 0 .3rem; }
	.tip-box.orange .tip-title { color: var(--amber); }
	.tip-box p:last-child { font-size: .72rem; color: var(--text-secondary); line-height: 1.6; margin: 0; }

	/* Sticky SOS bar */
	.sos-bar {
		position: fixed; bottom: 0; left: 0; right: 0;
		display: flex; background: var(--bg-secondary);
		border-top: 1px solid var(--border);
		padding: .5rem; padding-bottom: max(.5rem, env(safe-area-inset-bottom, 0px));
		gap: .4rem; z-index: 100;
	}
	.sos-quick {
		flex: 1; display: flex; align-items: center; justify-content: center;
		padding: .55rem .3rem; border-radius: 10px; text-decoration: none;
		font-size: .68rem; font-weight: 700; gap: 3px; text-align: center;
		-webkit-tap-highlight-color: transparent; transition: opacity .12s;
	}
	.sos-quick:active { opacity: .7; }
	.sos-quick.red   { background: rgba(229,57,53,.15);  color: #ff6b6b; border: 1px solid rgba(229,57,53,.3); }
	.sos-quick.blue  { background: rgba(41,182,246,.12); color: #29b6f6; border: 1px solid rgba(41,182,246,.3); }
	.sos-quick.amber { background: rgba(245,166,35,.1);  color: #f5a623; border: 1px solid rgba(245,166,35,.25); }
</style>
