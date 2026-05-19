<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { userAuth, logout, LANGUAGES } from '$lib/auth.svelte.js';
  import { i18n, t, setLang } from '$lib/i18n.js';
  import { contactsStore, loadContacts, addContact, deleteContact } from '$lib/emergency-contacts.js';
  import { meshState, bleConnect, bleDisconnect, rtcAnnounce, rtcDisconnect, isBLESupported, isWebRTCSupported, getMeshCapabilities } from '$lib/mesh.js';
  import { checkInState } from '$lib/fakecall.js';

  const T = $derived((key) => t($i18n.lang, key));

  let activeTab     = $state('profile');
  let settingsSaved = $state(false);
  let showLogout    = $state(false);
  let editLang      = $state('en');
  let meshCaps      = $state({ ble:false, webrtc:false, broadcast:false, storage:false });

  // Emergency contacts
  let ecName    = $state('');
  let ecPhone   = $state('');
  let ecRelation= $state('Family');
  let ecNotify  = $state(true);
  let ecSaving  = $state(false);
  let ecError   = $state('');
  let ecSuccess = $state('');

  // Mesh
  let meshError     = $state('');
  let showScanAll   = $state(false);
  let rtcWaiting    = $state(false);

  onMount(() => {
    if (!$userAuth.isVerified) { goto('/'); return; }
    editLang = $userAuth.language ?? 'en';
    meshCaps = getMeshCapabilities();
    if ($userAuth.userId) loadContacts($userAuth.userId);
  });

  function saveLang() {
    setLang(editLang);
    userAuth.update(s => ({ ...s, language: editLang }));
    settingsSaved = true;
    setTimeout(() => settingsSaved = false, 2500);
  }

  async function doLogout() { await logout(); goto('/'); }

  async function saveContact() {
    ecError = ''; ecSuccess = '';
    if (!ecName.trim() || !ecPhone.trim()) { ecError = 'Name and phone are required.'; return; }
    ecSaving = true;
    const r = await addContact($userAuth.userId, { name:ecName, phone:ecPhone, relation:ecRelation, notify_sos:ecNotify });
    ecSaving = false;
    if (!r.ok) { ecError = r.error; return; }
    ecSuccess = '✓ Contact saved';
    ecName = ''; ecPhone = ''; ecRelation = 'Family';
    setTimeout(() => ecSuccess = '', 3000);
  }

  async function removeContact(id) { await deleteContact($userAuth.userId, id); }

  async function connectBLE(scanAll = false) {
    meshError = ''; showScanAll = false;
    const r = await bleConnect(scanAll);
    if (!r.ok) { meshError = r.error; if (r.noMatch) showScanAll = true; }
  }

  async function connectWebRTC() {
    meshError = ''; rtcWaiting = true;
    await rtcAnnounce();
    setTimeout(() => { rtcWaiting = false; }, 12000);
  }

  const tabs = [
    { id:'profile',  label:'👤 Profile'  },
    { id:'contacts', label:'🆘 Contacts' },
    { id:'security', label:'🔐 Security' },
    { id:'mesh',     label:'📡 Mesh'     },
    { id:'about',    label:'ℹ️ About'    },
  ];
</script>

<svelte:head><title>P.I.N.G. — Settings</title></svelte:head>

<div class="page">
  <!-- Header -->
  <header class="topbar">
    <button class="back" onclick={() => goto('/dashboard')} aria-label="Back">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <path d="M15 18l-6-6 6-6"/>
      </svg>
    </button>
    <h1 class="title">Settings</h1>
    <div style="width:36px"></div>
  </header>

  <!-- Tab pills -->
  <div class="tab-scroll">
    {#each tabs as tab}
      <button class="pill" class:active={activeTab===tab.id} onclick={() => activeTab=tab.id}>
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Content -->
  <div class="body">

    <!-- ── PROFILE ── -->
    {#if activeTab === 'profile'}
      <div class="card">
        <div class="avatar-row">
          <div class="big-avatar">{($userAuth.firstName ?? 'U')[0].toUpperCase()}</div>
          <div>
            <p class="full-name">{$userAuth.firstName} {$userAuth.lastName}</p>
            <p class="username-tag">@{$userAuth.username || 'Not set'}</p>
          </div>
        </div>
      </div>

      <div class="username-banner">
        <p class="ub-label">YOUR CHAT USERNAME</p>
        <p class="ub-value">@{$userAuth.username || 'Not set'}</p>
        <p class="ub-hint">Share this so others can DM you</p>
      </div>

      <div class="card">
        <div class="row"><span class="rl">Full Name</span><span class="rv">{$userAuth.firstName} {$userAuth.lastName}</span></div>
        <div class="row"><span class="rl">Email</span><span class="rv">{$userAuth.email||'—'}</span></div>
        <div class="row"><span class="rl">Phone</span><span class="rv">{$userAuth.phone||'—'}</span></div>
        <div class="row"><span class="rl">Role</span><span class="rv">{$userAuth.role}</span></div>
        <div class="row"><span class="rl">Region</span><span class="rv">{$userAuth.region?.name||$userAuth.villageDisplayName||'—'}</span></div>
        <div class="row nb"><span class="rl">Village Key</span><span class="rv muted">Sent to your email 📧</span></div>
      </div>

      <div class="card">
        <label class="fl">Language</label>
        <select class="sel" bind:value={editLang} onchange={saveLang}>
          {#each LANGUAGES as l}<option value={l.code}>{l.native} — {l.label}</option>{/each}
        </select>
        {#if settingsSaved}<p class="saved">✓ Language saved</p>{/if}
      </div>

    <!-- ── CONTACTS ── -->
    {:else if activeTab === 'contacts'}
      <p class="intro">When you press SOS, these people get a WhatsApp message with your location automatically.</p>

      {#if $contactsStore.contacts.length}
        {#each $contactsStore.contacts as c}
          <div class="card ec-card">
            <div class="ec-av">{c.name[0].toUpperCase()}</div>
            <div class="ec-info">
              <p class="ec-name">{c.name} <span class="ec-rel">{c.relation}</span></p>
              <p class="ec-phone">{c.phone}</p>
              {#if c.notify_sos}<span class="badge green">🚨 SOS on</span>{/if}
            </div>
            <button class="ec-del" onclick={() => removeContact(c.id)}>✕</button>
          </div>
        {/each}
      {:else}
        <div class="empty-card">
          <p>No contacts yet</p>
          <p class="sub">Add someone trusted below</p>
        </div>
      {/if}

      <div class="card form-card">
        <p class="form-title">+ Add Contact</p>
        <label class="fl">Full name *</label>
        <input class="inp" bind:value={ecName} placeholder="e.g. Mum"/>
        <label class="fl">WhatsApp / Phone *</label>
        <input class="inp" bind:value={ecPhone} placeholder="08012345678" type="tel"/>
        <label class="fl">Relationship</label>
        <select class="sel" bind:value={ecRelation}>
          <option>Family</option><option>Friend</option><option>Partner</option><option>Neighbour</option><option>Colleague</option><option>Other</option>
        </select>
        <div class="check-row">
          <input type="checkbox" id="ecn" bind:checked={ecNotify}/>
          <label for="ecn">Notify when I press SOS</label>
        </div>
        {#if ecError}<p class="err">{ecError}</p>{/if}
        {#if ecSuccess}<p class="saved">{ecSuccess}</p>{/if}
        <button class="btn-primary" onclick={saveContact} disabled={ecSaving}>
          {ecSaving ? 'Saving…' : '💾 Save Contact'}
        </button>
      </div>

    <!-- ── SECURITY ── -->
    {:else if activeTab === 'security'}
      <div class="card">
        <div class="row"><span class="rl">Session expires</span><span class="rv">{$userAuth.sessionExpiry ? new Date($userAuth.sessionExpiry).toLocaleDateString('en-NG') : '—'}</span></div>
        <div class="row"><span class="rl">Auth method</span><span class="rv">{$userAuth.authMethod}</span></div>
        <div class="row nb"><span class="rl">Encryption</span><span class="rv">HMAC-SHA256</span></div>
      </div>

      {#if !showLogout}
        <button class="btn-danger" onclick={() => showLogout=true}>Log Out</button>
      {:else}
        <div class="card confirm-card">
          <p>Are you sure you want to log out?</p>
          <div class="confirm-btns">
            <button class="btn-danger" onclick={doLogout}>Yes, log out</button>
            <button class="btn-ghost" onclick={() => showLogout=false}>Cancel</button>
          </div>
        </div>
      {/if}

    <!-- ── MESH ── -->
    {:else if activeTab === 'mesh'}
      <div class="card">
        <div class="row"><span class="rl">Transport</span><span class="rv green">{meshState.transport.toUpperCase()}</span></div>
        <div class="row"><span class="rl">Peers</span><span class="rv">{meshState.peers.length}</span></div>
        <div class="row"><span class="rl">BLE</span><span class="rv">{meshState.bleStatus.toUpperCase()}</span></div>
        <div class="row nb"><span class="rl">WebRTC</span><span class="rv">{meshState.rtcStatus.toUpperCase()}</span></div>
      </div>

      {#if meshError}<p class="err">{meshError}</p>{/if}

      <div class="card">
        <p class="section-label">🔗 WebRTC</p>
        {#if meshState.rtcStatus === 'connected'}
          <p class="badge green" style="margin-bottom:8px">✓ Connected</p>
          <button class="btn-ghost" onclick={rtcDisconnect}>Disconnect</button>
        {:else}
          <button class="btn-primary" onclick={connectWebRTC} disabled={rtcWaiting}>
            {rtcWaiting ? '📡 Waiting for peers…' : '🔗 Announce Presence'}
          </button>
        {/if}
      </div>

      {#if meshCaps.ble}
        <div class="card">
          <p class="section-label">📡 Bluetooth</p>
          {#if meshState.bleStatus === 'connected'}
            <p class="badge green" style="margin-bottom:8px">✓ {meshState.peers.find(p=>p.transport==='ble')?.name ?? 'Device'} connected</p>
            <button class="btn-ghost" onclick={bleDisconnect}>Disconnect</button>
          {:else}
            <button class="btn-primary" onclick={() => connectBLE(false)} disabled={meshState.bleStatus==='connecting'}>
              {meshState.bleStatus==='connecting' ? 'Scanning…' : '📡 Scan for Devices'}
            </button>
            {#if showScanAll}
              <button class="btn-ghost" style="margin-top:8px" onclick={() => connectBLE(true)}>🔍 Scan All Devices</button>
            {/if}
          {/if}
        </div>
      {/if}

    <!-- ── ABOUT ── -->
    {:else if activeTab === 'about'}
      <div class="card about-card">
        <svg width="44" height="44" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="3" fill="#29b6f6"/>
          <circle cx="14" cy="14" r="7.5" stroke="#29b6f6" stroke-width="1.5" fill="none"/>
          <circle cx="14" cy="14" r="12" stroke="#29b6f6" stroke-width=".7" fill="none" opacity=".3"/>
        </svg>
        <p class="app-name">P.I.N.G.</p>
        <p class="app-sub">Protection In Nigeria</p>
      </div>

      <div class="card">
        <div class="row"><span class="rl">Version</span><span class="rv">v23.0</span></div>
        <div class="row"><span class="rl">Website</span><span class="rv"><a href="https://ping.com.ng" target="_blank" style="color:#29b6f6">ping.com.ng</a></span></div>
        <div class="row"><span class="rl">Police</span><span class="rv"><a href="tel:199" style="color:#ff4444;font-weight:700">199</a></span></div>
        <div class="row"><span class="rl">GSM Emergency</span><span class="rv"><a href="tel:112" style="color:#ff4444;font-weight:700">112</a></span></div>
        <div class="row nb"><span class="rl">Fire Service</span><span class="rv"><a href="tel:123" style="color:#ff4444;font-weight:700">123</a></span></div>
      </div>

      <a href="/safety" class="link-card">📋 Safety Guide →</a>
      <a href="/install" class="link-card">📲 Install P.I.N.G. →</a>
    {/if}

  </div>
</div>

<style>
  * { box-sizing: border-box; }
  .page {
    display: flex; flex-direction: column;
    min-height: 100dvh; height: 100dvh;
    background: #080b0f; color: #e8edf3;
    font-family: 'Syne', -apple-system, sans-serif;
    overflow: hidden;
  }

  /* Topbar */
  .topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: .75rem 1rem;
    padding-top: calc(.75rem + env(safe-area-inset-top, 0px));
    background: #0d1117; border-bottom: 1px solid rgba(255,255,255,.06);
    flex-shrink: 0;
  }
  .back {
    width: 36px; height: 36px; border-radius: 10px;
    background: rgba(255,255,255,.05); border: none; color: #e8edf3;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation;
  }
  .back:active { background: rgba(255,255,255,.12); }
  .title { font-size: 1rem; font-weight: 700; margin: 0; color: #e8edf3; }

  /* Tab pills */
  .tab-scroll {
    display: flex; gap: .4rem; overflow-x: auto; padding: .65rem .9rem;
    background: #0d1117; border-bottom: 1px solid rgba(255,255,255,.06);
    flex-shrink: 0; -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .tab-scroll::-webkit-scrollbar { display: none; }
  .pill {
    flex-shrink: 0; padding: .45rem .9rem; border-radius: 20px; font-size: .75rem;
    background: #111822; border: 1px solid rgba(255,255,255,.08); color: #7a8fa8;
    cursor: pointer; white-space: nowrap; font-family: inherit;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: all .15s;
  }
  .pill.active { background: rgba(41,182,246,.15); border-color: rgba(41,182,246,.4); color: #29b6f6; }
  .pill:active { opacity: .75; }

  /* Body */
  .body {
    flex: 1; overflow-y: auto; padding: .9rem;
    padding-bottom: max(.9rem, env(safe-area-inset-bottom, 0px));
    -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; gap: .75rem;
  }

  /* Cards */
  .card { background: #111822; border: 1px solid rgba(255,255,255,.07); border-radius: 16px; padding: 1rem; }
  .card.form-card { display: flex; flex-direction: column; gap: .6rem; }
  .card.about-card { display: flex; flex-direction: column; align-items: center; gap: .4rem; padding: 1.5rem 1rem; }
  .card.ec-card { display: flex; align-items: center; gap: .75rem; padding: .8rem 1rem; }
  .card.confirm-card { display: flex; flex-direction: column; gap: .65rem; }
  .empty-card { background: #111822; border: 1px dashed rgba(255,255,255,.1); border-radius: 16px; padding: 1.5rem 1rem; text-align: center; color: #7a8fa8; font-size: .82rem; }
  .empty-card .sub { font-size: .7rem; color: #3f5166; margin-top: .25rem; }

  /* Profile */
  .avatar-row { display: flex; align-items: center; gap: .85rem; }
  .big-avatar { width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg,#0057b8,#29b6f6); color: #fff; font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .full-name { font-size: .9rem; font-weight: 700; margin: 0; color: #e8edf3; }
  .username-tag { font-size: .72rem; color: #29b6f6; margin: 2px 0 0; font-family: monospace; }

  .username-banner { background: rgba(41,182,246,.07); border: 1.5px solid rgba(41,182,246,.25); border-radius: 14px; padding: .9rem 1rem; }
  .ub-label { font-size: .55rem; color: #29b6f6; text-transform: uppercase; letter-spacing: .12em; font-weight: 700; margin: 0 0 .3rem; }
  .ub-value { font-size: 1.4rem; font-weight: 800; color: #e8edf3; font-family: monospace; margin: 0; }
  .ub-hint { font-size: .62rem; color: #7a8fa8; margin: .25rem 0 0; }

  /* Rows */
  .row { display: flex; justify-content: space-between; align-items: center; padding: .5rem 0; border-bottom: 1px solid rgba(255,255,255,.04); }
  .row.nb { border-bottom: none; }
  .rl { font-size: .72rem; color: #7a8fa8; }
  .rv { font-size: .72rem; color: #e8edf3; text-align: right; }
  .rv.muted { color: #7a8fa8; }
  .rv.green { color: #00e676; }

  /* Forms */
  .fl { font-size: .68rem; color: #7a8fa8; font-weight: 600; display: block; margin-bottom: .25rem; }
  .inp { width: 100%; background: #080b0f; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: .6rem .75rem; color: #e8edf3; font-size: .82rem; outline: none; font-family: inherit; }
  .inp:focus { border-color: rgba(41,182,246,.4); }
  .sel { width: 100%; background: #080b0f; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: .6rem .75rem; color: #e8edf3; font-size: .82rem; outline: none; font-family: inherit; }
  .check-row { display: flex; align-items: center; gap: .5rem; }
  .check-row input { accent-color: #e53935; width: 16px; height: 16px; }
  .check-row label { font-size: .75rem; color: #7a8fa8; cursor: pointer; }
  .form-title { font-size: .75rem; font-weight: 700; color: #7a8fa8; text-transform: uppercase; letter-spacing: .08em; margin: 0; }

  /* Emergency contacts */
  .intro { font-size: .72rem; color: #7a8fa8; line-height: 1.6; background: rgba(229,57,53,.06); border: 1px solid rgba(229,57,53,.15); border-radius: 12px; padding: .75rem .9rem; }
  .ec-av { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg,#e53935,#b71c1c); color: #fff; font-size: .9rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .ec-info { flex: 1; min-width: 0; }
  .ec-name { font-size: .82rem; font-weight: 700; color: #e8edf3; margin: 0; }
  .ec-rel { font-size: .6rem; color: #7a8fa8; font-weight: 400; margin-left: 4px; }
  .ec-phone { font-size: .7rem; color: #7a8fa8; margin: 2px 0 4px; }
  .ec-del { background: none; border: none; color: #3f5166; cursor: pointer; font-size: .8rem; padding: 4px; flex-shrink: 0; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  .ec-del:active { color: #e53935; }

  /* Mesh */
  .section-label { font-size: .7rem; font-weight: 700; color: #7a8fa8; text-transform: uppercase; letter-spacing: .08em; margin: 0 0 .65rem; }

  /* About */
  .app-name { font-size: 1.3rem; font-weight: 800; letter-spacing: .2em; color: #29b6f6; margin: 0; }
  .app-sub { font-size: .7rem; color: #3f5166; margin: 0; letter-spacing: .06em; }
  .link-card { display: flex; align-items: center; justify-content: space-between; background: #111822; border: 1px solid rgba(255,255,255,.07); border-radius: 14px; padding: .9rem 1rem; text-decoration: none; color: #29b6f6; font-size: .82rem; font-weight: 600; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  .link-card:active { background: #1a2332; }

  /* Buttons */
  .btn-primary { width: 100%; background: #e53935; color: #fff; border: none; border-radius: 12px; padding: .75rem; font-size: .85rem; font-weight: 700; cursor: pointer; font-family: inherit; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  .btn-primary:disabled { opacity: .4; }
  .btn-primary:active { background: #c62828; }
  .btn-ghost { background: none; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; color: #7a8fa8; padding: .65rem 1rem; font-size: .82rem; cursor: pointer; font-family: inherit; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  .btn-danger { width: 100%; background: rgba(229,57,53,.1); color: #e53935; border: 1px solid rgba(229,57,53,.3); border-radius: 12px; padding: .75rem; font-size: .85rem; font-weight: 700; cursor: pointer; font-family: inherit; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  .btn-danger:active { background: rgba(229,57,53,.2); }
  .confirm-btns { display: flex; gap: .5rem; }
  .confirm-card p { font-size: .8rem; color: #7a8fa8; margin: 0; }

  .badge { display: inline-block; font-size: .65rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .badge.green { background: rgba(0,230,118,.1); color: #00e676; border: 1px solid rgba(0,230,118,.2); }
  .err { font-size: .72rem; color: #e53935; margin: 0; }
  .saved { font-size: .72rem; color: #00e676; margin: 0; }
</style>
