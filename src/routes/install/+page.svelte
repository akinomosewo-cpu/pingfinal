<script>
  import { goto } from '$app/navigation';
  import { i18n } from '$lib/i18n.js';
  let activeOS = $state('android');
  const tabs = [
    { id:'android', label:'Android' },
    { id:'ios',     label:'iPhone / iOS' },
    { id:'chrome',  label:'Chrome Desktop' },
    { id:'samsung', label:'Samsung Browser' },
  ];
</script>
<svelte:head><title>P.I.N.G. — Install the App</title></svelte:head>
<div class="page">
  <header class="topbar">
    <button class="back" onclick={() => goto('/dashboard')} aria-label="Back">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </button>
    <div class="head-mid">
      <span class="head-title">📲 Install P.I.N.G.</span>
      <span class="head-sub">Add to your home screen</span>
    </div>
  </header>

  <div class="content">
    <div class="hero">
      <div class="hero-icon">
        <svg width="48" height="48" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="3" fill="#29b6f6"/>
          <circle cx="14" cy="14" r="7.5" stroke="#29b6f6" stroke-width="1.5" fill="none" opacity=".6"/>
          <circle cx="14" cy="14" r="12" stroke="#29b6f6" stroke-width=".7" fill="none" opacity=".25"/>
        </svg>
      </div>
      <div>
        <p class="hero-title">P.I.N.G. works like a native app</p>
        <p class="hero-sub">Install it to your home screen — no App Store needed. Works offline. Loads instantly.</p>
      </div>
    </div>

    <!-- OS tabs -->
    <div class="os-tabs">
      {#each tabs as tab}
        <button class="ostab" class:on={activeOS===tab.id} onclick={() => activeOS=tab.id}>
          {tab.label}
        </button>
      {/each}
    </div>

    <!-- Android Chrome (most common) -->
    {#if activeOS === 'android'}
      <div class="steps-card">
        <p class="steps-title">Android — Chrome browser</p>
        <div class="step"><div class="step-n">1</div><div class="step-body"><p class="step-t">Open P.I.N.G. in Chrome</p><p class="step-d">Go to <strong>pingfinalng.vercel.app</strong> or your custom domain in Chrome on Android.</p></div></div>
        <div class="step"><div class="step-n">2</div><div class="step-body"><p class="step-t">Tap the three-dot menu</p><p class="step-d">Tap the <strong>⋮</strong> icon in the top-right corner of Chrome.</p></div></div>
        <div class="step"><div class="step-n">3</div><div class="step-body"><p class="step-t">Tap "Add to Home screen"</p><p class="step-d">A prompt may also appear automatically at the bottom of the screen — tap <strong>"Install"</strong>.</p></div></div>
        <div class="step"><div class="step-n">4</div><div class="step-body"><p class="step-t">Tap "Add"</p><p class="step-d">Confirm by tapping <strong>Add</strong>. The P.I.N.G. icon will appear on your home screen.</p></div></div>
        <div class="tip-box">💡 Android Chrome also shows a banner at the bottom automatically. Just tap <strong>"Install"</strong> when you see it.</div>
      </div>

    {:else if activeOS === 'ios'}
      <div class="steps-card">
        <p class="steps-title">iPhone / iPad — Safari browser</p>
        <div class="step"><div class="step-n">1</div><div class="step-body"><p class="step-t">Open P.I.N.G. in Safari</p><p class="step-d">Go to <strong>pingfinalng.vercel.app</strong> in Safari. It must be Safari — Chrome on iOS cannot install PWAs.</p></div></div>
        <div class="step"><div class="step-n">2</div><div class="step-body"><p class="step-t">Tap the Share button</p><p class="step-d">Tap the <strong>Share icon</strong> (the box with an arrow pointing up) at the bottom of the screen.</p></div></div>
        <div class="step"><div class="step-n">3</div><div class="step-body"><p class="step-t">Scroll down and tap "Add to Home Screen"</p><p class="step-d">Scroll through the share sheet until you see <strong>"Add to Home Screen"</strong> and tap it.</p></div></div>
        <div class="step"><div class="step-n">4</div><div class="step-body"><p class="step-t">Tap "Add"</p><p class="step-d">Confirm by tapping <strong>Add</strong> in the top-right corner. P.I.N.G. will appear on your home screen.</p></div></div>
        <div class="warn-box">⚠️ On iOS, Bluetooth (BLE) is not available in any browser due to Apple's restrictions. All other features — SOS, chat, map, safety guide — work fully.</div>
      </div>

    {:else if activeOS === 'chrome'}
      <div class="steps-card">
        <p class="steps-title">Chrome on Desktop (Windows / Mac / Linux)</p>
        <div class="step"><div class="step-n">1</div><div class="step-body"><p class="step-t">Open P.I.N.G. in Chrome</p><p class="step-d">Visit <strong>pingfinalng.vercel.app</strong> in Google Chrome.</p></div></div>
        <div class="step"><div class="step-n">2</div><div class="step-body"><p class="step-t">Look for the install icon</p><p class="step-d">In the address bar, look for a <strong>computer with a down-arrow</strong> icon (⊕) on the right side. Click it.</p></div></div>
        <div class="step"><div class="step-n">3</div><div class="step-body"><p class="step-t">Click "Install"</p><p class="step-d">A dialog will appear — click <strong>Install</strong>. P.I.N.G. opens as its own app window.</p></div></div>
        <div class="step"><div class="step-n">4</div><div class="step-body"><p class="step-t">Find it in your taskbar / applications</p><p class="step-d">P.I.N.G. is now pinned to your taskbar (Windows) or Launchpad (Mac) like any other app.</p></div></div>
        <div class="tip-box">💡 Alternatively: Chrome menu (⋮) → <strong>Save and share</strong> → <strong>Install Page as app</strong>.</div>
      </div>

    {:else if activeOS === 'samsung'}
      <div class="steps-card">
        <p class="steps-title">Samsung Internet Browser</p>
        <div class="step"><div class="step-n">1</div><div class="step-body"><p class="step-t">Open P.I.N.G. in Samsung Internet</p><p class="step-d">Go to <strong>pingfinalng.vercel.app</strong> in the Samsung Internet browser.</p></div></div>
        <div class="step"><div class="step-n">2</div><div class="step-body"><p class="step-t">Tap the menu icon</p><p class="step-d">Tap the <strong>three horizontal lines</strong> menu at the bottom right.</p></div></div>
        <div class="step"><div class="step-n">3</div><div class="step-body"><p class="step-t">Tap "Add page to" → "Home screen"</p><p class="step-d">Select <strong>"Add page to"</strong> then tap <strong>"Home screen"</strong>.</p></div></div>
        <div class="step"><div class="step-n">4</div><div class="step-body"><p class="step-t">Tap "Add"</p><p class="step-d">Confirm and P.I.N.G. appears on your home screen with its icon.</p></div></div>
        <div class="tip-box">💡 Samsung Internet also supports BLE on Android — Bluetooth mesh works here too.</div>
      </div>
    {/if}

    <!-- Benefits -->
    <div class="benefits">
      <p class="ben-title">Why install it?</p>
      <div class="ben-grid">
        <div class="ben-item"><span class="ben-ico">⚡</span><div><p class="ben-n">Loads instantly</p><p class="ben-d">No browser chrome, full screen</p></div></div>
        <div class="ben-item"><span class="ben-ico">📵</span><div><p class="ben-n">Works offline</p><p class="ben-d">SOS and alerts even without data</p></div></div>
        <div class="ben-item"><span class="ben-ico">🔔</span><div><p class="ben-n">Home screen icon</p><p class="ben-d">One tap to open in emergency</p></div></div>
        <div class="ben-item"><span class="ben-ico">🔒</span><div><p class="ben-n">Stays logged in</p><p class="ben-d">No re-login every session</p></div></div>
      </div>
    </div>

    <a href="https://pingfinalng.vercel.app" class="open-btn" target="_blank" rel="noopener">
      Open P.I.N.G. to install →
    </a>
  </div>
</div>

<style>
  .page{display:flex;flex-direction:column;height:100svh;height:100dvh;width:100%;background:var(--bg-primary);overflow:hidden;}
  .topbar{display:flex;align-items:center;gap:.6rem;padding:.65rem 1rem;padding-top:calc(.65rem + env(safe-area-inset-top,0px));background:var(--bg-secondary);border-bottom:1px solid var(--border);flex-shrink:0;}
  .back{background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:4px;display:flex;align-items:center;border-radius:6px;}
  .head-mid{flex:1;}
  .head-title{font-size:.9rem;font-weight:700;color:var(--text-primary);display:block;}
  .head-sub{font-size:.6rem;color:var(--text-muted);}
  .content{flex:1;overflow-y:auto;padding:.9rem;-webkit-overflow-scrolling:touch;padding-bottom:2rem;}
  .hero{display:flex;align-items:flex-start;gap:.85rem;background:rgba(41,182,246,.07);border:1px solid rgba(41,182,246,.2);border-radius:16px;padding:1rem;margin-bottom:1rem;}
  .hero-icon{flex-shrink:0;}
  .hero-title{font-size:.88rem;font-weight:700;color:var(--text-primary);margin:0 0 .25rem;}
  .hero-sub{font-size:.72rem;color:var(--text-secondary);margin:0;line-height:1.5;}
  .os-tabs{display:flex;gap:.35rem;margin-bottom:.85rem;flex-wrap:wrap;}
  .ostab{padding:.45rem .8rem;background:var(--bg-card);border:1px solid var(--border);border-radius:20px;font-size:.72rem;color:var(--text-secondary);cursor:pointer;transition:all .15s;-webkit-tap-highlight-color:transparent;}
  .ostab.on{background:rgba(41,182,246,.12);border-color:rgba(41,182,246,.35);color:var(--blue);}
  .steps-card{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:1rem;margin-bottom:.85rem;}
  .steps-title{font-size:.78rem;font-weight:700;color:var(--text-secondary);margin:0 0 .85rem;text-transform:uppercase;letter-spacing:.08em;}
  .step{display:flex;gap:.75rem;align-items:flex-start;margin-bottom:.75rem;}
  .step:last-of-type{margin-bottom:.5rem;}
  .step-n{width:24px;height:24px;border-radius:50%;background:var(--blue);color:#fff;font-size:.65rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;}
  .step-body{flex:1;}
  .step-t{font-size:.82rem;font-weight:700;color:var(--text-primary);margin:0 0 2px;}
  .step-d{font-size:.72rem;color:var(--text-secondary);margin:0;line-height:1.5;}
  .tip-box{background:rgba(0,230,118,.07);border:1px solid rgba(0,230,118,.2);border-radius:10px;padding:.6rem .8rem;font-size:.7rem;color:#00e676;line-height:1.5;margin-top:.5rem;}
  .warn-box{background:rgba(245,166,35,.07);border:1px solid rgba(245,166,35,.2);border-radius:10px;padding:.6rem .8rem;font-size:.7rem;color:var(--amber);line-height:1.5;margin-top:.5rem;}
  .benefits{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:1rem;margin-bottom:1rem;}
  .ben-title{font-size:.78rem;font-weight:700;color:var(--text-secondary);margin:0 0 .75rem;text-transform:uppercase;letter-spacing:.08em;}
  .ben-grid{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;}
  .ben-item{display:flex;align-items:flex-start;gap:.5rem;}
  .ben-ico{font-size:1.2rem;flex-shrink:0;}
  .ben-n{font-size:.78rem;font-weight:600;color:var(--text-primary);margin:0 0 1px;}
  .ben-d{font-size:.65rem;color:var(--text-muted);margin:0;}
  .open-btn{display:block;background:var(--blue);color:#fff;text-decoration:none;text-align:center;padding:.85rem;border-radius:14px;font-size:.85rem;font-weight:700;-webkit-tap-highlight-color:transparent;}
</style>
