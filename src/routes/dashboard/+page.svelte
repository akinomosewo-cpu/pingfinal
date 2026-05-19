<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { userAuth, logout, LANGUAGES } from '$lib/auth.svelte.js';
  import { alertStore, addAlert, markAllRead, subscribeToRegionAlerts, broadcastSOS, unsubscribeAlerts } from '$lib/alerts.svelte.js';
  import { contactsStore, loadContacts, addContact, deleteContact, notifyEmergencyContacts, buildEmergencyActions } from '$lib/emergency-contacts.js';
  import {
    meshInit, meshSend, meshDestroy, meshState,
    bleConnect, bleDisconnect, isBLESupported,
    rtcAnnounce, rtcDisconnect, isWebRTCSupported,
    buildSOSPacket, buildMsgPacket, getCurrentLocation,
    getMeshCapabilities,
  } from '$lib/mesh.js';
  import { broadcastPacket, drainOfflineQueue } from '$lib/bluetooth.js';
  import { startLocationWatch, stopLocationWatch, formatCoord } from '$lib/location.js';
  import { i18n, t, setLang } from '$lib/i18n.js';
  import { getNearestSafeZones, getDirectionsUrl, getWalkingUrl, formatDistance, formatETA, ZONE_ICONS, ZONE_COLORS } from '$lib/safezones.js';
  import { fakeCallState, triggerFakeCall, answerFakeCall, endFakeCall, formatCallDuration, checkInState, startCheckInSchedule, stopCheckInSchedule, confirmCheckIn } from '$lib/fakecall.js';

  const T = $derived((key) => t($i18n.lang, key));

  let tab = $state('alerts');
  let sosState = $state('idle');
  let sosInterval = null;
  let loc = $state({ lat: null, lng: null, accuracy: null, region: null, error: null, lastUpdated: null });
  let locGranted = $state(false);
  let meshCaps = $state({ ble: false, webrtc: false, broadcast: false, storage: false });
  let meshError = $state('');
  let meshErrorDetail = $state('');
  let showScanAll = $state(false);
  let rtcWaiting = $state(false);
  let settingsTab = $state('profile');
  let safeSection = $state('tools');
  let sosContacts = $state([]);
  let showEmergencyNumbers = $state(false); // shows all emergency numbers after SOS fires
  // Emergency contacts
  let ecName     = $state('');
  let ecPhone    = $state('');
  let ecEmail    = $state('');
  let ecRelation = $state('Family');
  let ecNotify   = $state(true);
  let ecSaving   = $state(false);
  let ecError    = $state('');
  let ecSuccess  = $state('');
  let editLang = $state('en');
  let settingsSaved = $state(false);
  let showLogoutConfirm = $state(false);
  let chatMsgs = $state([]);
  let chatMsg = $state('');
  let _meshTick = $state(0);
  let _meshInterval = null;
  let _locTick = $state(0);  // increments on every GPS update to force map iframe refresh
  let _guardReady = $state(false);

  // Power off / stealth mode
  let powerOff = $state(false);
  let tripleClickCount = $state(0);
  let tripleClickTimer = null;

  // Safe zones
  let nearestZones = $state([]);
  let selectedZone = $state(null);
  let mapMode = $state('location'); // 'location' | 'safezones'

  // Fake call
  let showFakeCallSetup = $state(false);
  let customCallerName = $state('');
  let checkInMins = $state(30);
  let showCheckInPrompt = $state(false);
  let checkInActive = $state(false);

  // Private chat
  let privateTab = $state('community'); // 'community' | 'private'

  $effect(() => {
    if (_guardReady && !$userAuth.isVerified) goto('/');
  });

  // Language save: persist immediately on change
  function saveLang() {
    setLang(editLang);
    // Also save to user auth
    userAuth.update(s => ({ ...s, language: editLang }));
    settingsSaved = true;
    setTimeout(() => settingsSaved = false, 2000);
  }

  onMount(() => {
    editLang = $userAuth.language ?? 'en';
    // Load saved language immediately
    setLang(editLang);
    meshCaps = getMeshCapabilities();
    startLocation();
    drainOfflineQueue(onMeshPacket);
    meshInit(
      $userAuth.username || $userAuth.firstName || 'User',
      $userAuth.villageKey || 'default',
      onMeshPacket
    );
    _meshInterval = setInterval(() => { _meshTick++; }, 600);
    _guardReady = true;

    // Check-in state listener
    checkInState.subscribe(s => {
      checkInActive = s.active;
      if (s.missedCount > 0 && s.active) showCheckInPrompt = true;
    });
  });

  onDestroy(() => {
    clearInterval(sosInterval);
    clearInterval(_meshInterval);
    stopLocationWatch();
    meshDestroy();
    stopCheckInSchedule();
  });

  function startLocation() {
    startLocationWatch(update => {
      loc = update;
      locGranted = !!update.lat;
      _locTick++;
      if (update.lat) {
        nearestZones = getNearestSafeZones(update.lat, update.lng, 6);
      }
    });
  }

  // Subscribe to region alerts once user is verified and village key is known
  $effect(() => {
    if ($userAuth.isVerified && $userAuth.villageKey && $userAuth.username) {
      subscribeToRegionAlerts($userAuth.villageKey, $userAuth.username);
      if ($userAuth.userId) loadContacts($userAuth.userId);
    }
  });

  async function connectBLE(scanAll = false) {
    meshError = ''; meshErrorDetail = ''; showScanAll = false;
    const result = await bleConnect(scanAll);
    if (!result.ok) {
      meshError = result.error;
      meshErrorDetail = meshState.errorDetail ?? '';
      if (result.noMatch) showScanAll = true;
    }
  }

  async function connectWebRTC() {
    meshError = ''; meshErrorDetail = ''; rtcWaiting = true;
    const result = await rtcAnnounce();
    if (!result.ok) { meshError = result.error; rtcWaiting = false; }
    setTimeout(() => { rtcWaiting = false; }, 12000);
  }

  function disconnectMesh() {
    bleDisconnect();
    rtcDisconnect();
  }

  function onMeshPacket(pkt) {
    if (!pkt?.type) return;
    meshState.log = [{ ...pkt, _received: Date.now() }, ...meshState.log.slice(0, 49)];
    if (pkt.type === 'MSG') chatMsgs = [...chatMsgs, { from: pkt.from, msg: pkt.msg, ts: pkt.ts, mine: false }];
    if (pkt.type === 'SOS') addAlert({ type: 'SOS', from: pkt.from, msg: pkt.msg, lat: pkt.lat, lng: pkt.lng, ts: pkt.ts });
  }

  function activatePowerOff() {
    powerOff = true;
    tripleClickCount = 0;
  }

  function handleTripleClick() {
    tripleClickCount++;
    clearTimeout(tripleClickTimer);
    if (tripleClickCount >= 3) {
      powerOff = false;
      tripleClickCount = 0;
    } else {
      tripleClickTimer = setTimeout(() => { tripleClickCount = 0; }, 600);
    }
  }

  async function saveEmergencyContact() {
    ecError = ''; ecSuccess = '';
    if (!ecName.trim() || !ecPhone.trim()) { ecError = 'Name and phone are required.'; return; }
    ecSaving = true;
    const result = await addContact($userAuth.userId, { name: ecName, phone: ecPhone, email: ecEmail, relation: ecRelation, notify_sos: ecNotify });
    ecSaving = false;
    if (!result.ok) { ecError = result.error; return; }
    ecSuccess = '✓ Contact saved'; ecName = ''; ecPhone = ''; ecEmail = ''; ecRelation = 'Family';
    setTimeout(() => ecSuccess = '', 3000);
  }

  async function removeContact(id) {
    await deleteContact($userAuth.userId, id);
  }

  async function fireSOS() {
    if (sosState === 'fired') return;
    sosState = 'fired';
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([300,100,300,100,600]);
    // Auto-dial 112 immediately — no confirmation needed
    const a = document.createElement('a'); a.href='tel:080002255372'; a.click();
    const curLoc = loc?.lat ? loc : await getCurrentLocation();
    const pkt = buildSOSPacket($userAuth, curLoc);
    addAlert({ type:'SOS', from:`${$userAuth.firstName} (YOU)`, msg:'🚨 SOS activated — Police called', lat:curLoc?.lat, lng:curLoc?.lng, ts:Date.now() });
    // Broadcast to village via Supabase
    if ($userAuth.villageKey) broadcastSOS($userAuth.username, $userAuth.villageKey, curLoc?.lat ?? null, curLoc?.lng ?? null);
    // Mesh broadcast
    await meshSend(pkt);
    // Notify emergency contacts via WhatsApp (opens automatically for first contact)
    try {
      const actions = await notifyEmergencyContacts($userAuth, curLoc);
      sosContacts = actions ?? [];
    } catch {}
    showEmergencyNumbers = true;
    setTimeout(() => { sosState = 'idle'; sosContacts = []; showEmergencyNumbers = false; }, 60000);
  }

  async function sendChat() {
    const text = chatMsg.trim();
    if (!text) return;
    chatMsg = '';
    const pkt = buildMsgPacket(userAuth, text);
    chatMsgs = [...chatMsgs, { from: $userAuth.username || $userAuth.firstName, msg: text, ts: Date.now(), mine: true }];
    await meshSend(pkt);
  }

  function saveSettings() {
    saveLang();
    userAuth.update(s => ({ ...s, language: editLang }));
  }

  async function doLogout() { await logout(); goto('/'); }
  function fmtTime(ts) { return new Date(ts).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }); }
  const langName = (code) => LANGUAGES.find(l => l.code === code)?.native ?? code;
  const unread = $derived($alertStore.alerts?.filter(a => !a.read).length ?? 0);

  // Fake call handlers
  function startFakeCall() {
    showFakeCallSetup = false;
    const caller = customCallerName.trim()
      ? { name: customCallerName.trim(), number: '+234 XXX XXX XXXX' }
      : null;
    triggerFakeCall(caller);
  }

  function startCheckIn() {
    startCheckInSchedule(checkInMins, () => {
      showCheckInPrompt = true;
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    });
  }
</script>

<div class="app">
  <!-- TOP BAR -->
  <header class="topbar">
    <div class="brand">
      <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="3" fill="#29b6f6"/>
        <circle cx="14" cy="14" r="7.5" stroke="#29b6f6" stroke-width="1.5" fill="none" opacity=".7"/>
        <circle cx="14" cy="14" r="12" stroke="#29b6f6" stroke-width=".8" fill="none" opacity=".25"/>
      </svg>
      <div>
        <span class="bname">P.I.N.G.</span>
        <span class="bsub">{T("appSub")}</span>
      </div>
    </div>
    <div class="top-right">
      <div class="dots">
        <span class="dot" class:on={meshState.connected} title="Mesh"></span>
        <span class="dot blue" class:on={locGranted} title="GPS"></span>
      </div>
      {#if $userAuth.villageKey}<span class="usr-village">{$userAuth.villageDisplayName || $userAuth.villageKey}</span>{/if}
      {#if $userAuth.username}<span class="usr">@{$userAuth.username}</span>{/if}
      <button class="gear-btn" onclick={() => goto('/settings')} aria-label="Settings">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
      <button class="power-btn" onclick={activatePowerOff} title="Stealth mode (triple-click to wake)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v7M6.35 5.35a9 9 0 1 0 11.3 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </header>

  <!-- FAKE CALL OVERLAY -->
  {#if $fakeCallState.active}
    <div class="call-overlay">
      <div class="call-card">
        {#if $fakeCallState.phase === 'ringing'}
          <div class="call-avatar">{$fakeCallState.callerName[0] ?? '?'}</div>
          <p class="call-name">{$fakeCallState.callerName}</p>
          <p class="call-number">{$fakeCallState.callerNumber}</p>
          <p class="call-status">Incoming call…</p>
          <div class="call-btns">
            <button class="call-decline" onclick={endFakeCall}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" fill="white"/></svg>
            </button>
            <button class="call-answer" onclick={answerFakeCall}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" fill="white"/></svg>
            </button>
          </div>
          <p class="call-hint">Decline · Answer</p>
        {:else if $fakeCallState.phase === 'active'}
          <div class="call-avatar active">{$fakeCallState.callerName[0] ?? '?'}</div>
          <p class="call-name">{$fakeCallState.callerName}</p>
          <p class="call-status green">{formatCallDuration($fakeCallState.duration)}</p>
          <button class="call-end-btn" onclick={endFakeCall}>End Call</button>
        {:else}
          <p class="call-name" style="color:#7a8fa8">Call ended</p>
        {/if}
      </div>
    </div>
  {/if}

  <!-- CHECK-IN PROMPT -->
  {#if showCheckInPrompt}
    <div class="checkin-overlay">
      <div class="checkin-card">
        <p class="checkin-icon">🔔</p>
        <p class="checkin-title">Are you OK?</p>
        <p class="checkin-sub">P.I.N.G. check-in — tap to confirm you're safe</p>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn-safe" onclick={() => { confirmCheckIn(); showCheckInPrompt = false; }}>✅ I'm Safe</button>
          <button class="btn-sos-sm" onclick={() => { showCheckInPrompt = false; fireSOS(); }}>🚨 Need Help</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- POWER OFF OVERLAY -->
  {#if powerOff}
    <div class="poweroff-overlay" onclick={handleTripleClick}>
      <!-- Completely black screen — triple tap/click to wake -->
    </div>
  {/if}

  <!-- SOS -->
  <div class="sos-zone" class:sos-zone-expanded={showEmergencyNumbers}>

    {#if !showEmergencyNumbers}
      <!-- Default: just the big SOS button -->
      <button class="sos" class:fired={sosState==='fired'} onclick={fireSOS} disabled={sosState==='fired'}>
        <span class="sos-t">{sosState==='fired' ? '🚨' : 'SOS'}</span>
        <span class="sos-s">{sosState==='fired' ? 'Calling Emergency…' : 'Press to call Emergency'}</span>
      </button>

    {:else}
      <!-- After SOS fires: show emergency numbers + WhatsApp contacts -->
      <div class="sos-fired-panel">

        <!-- Header -->
        <div class="sfp-head">
          <span class="sfp-pulse">🚨</span>
          <div>
            <p class="sfp-title">SOS Activated</p>
            <p class="sfp-sub">{T('sosActivated')}</p>
          </div>
          <button class="sfp-dismiss" onclick={() => { showEmergencyNumbers=false; sosState='idle'; sosContacts=[]; }}>✕</button>
        </div>

        <!-- Emergency numbers — tap next if 199 doesn't answer -->
        <div class="en-section">
          <p class="en-label">📞 If 199 doesn't answer, tap next:</p>
          <div class="en-grid">
            <a href="tel:080002255372"  class="en-btn calling">📞 112 — GSM Emergency <span class="en-status">Calling now…</span></a>
            <a href="tel:080002255372"  class="en-btn">📞 112 — GSM Emergency</a>
            <a href="tel:767"  class="en-btn">🏥 767 — LASEMA</a>
            <a href="tel:123"  class="en-btn">🚒 123 — Fire Service</a>
            <a href="tel:08032003567" class="en-btn">🛡️ NEMA — 0803 200 3567</a>
            <a href="tel:08052100373" class="en-btn">🔐 DSS — 0805 210 0373</a>
          </div>
        </div>

        <!-- WhatsApp contacts -->
        {#if sosContacts.length > 0}
          <div class="en-section">
            <p class="en-label">{T('notifyContacts')}</p>
            <div class="wa-contacts">
              {#each sosContacts as c}
                <div class="wa-row">
                  <span class="wa-name">{c.name} <span class="wa-rel">{c.relation}</span></span>
                  <div class="wa-btns">
                    <a class="wa-btn green" href={c.whatsappUrl} target="_blank" rel="noopener">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WhatsApp
                    </a>
                    <a class="wa-btn blue" href={c.callUrl}>📞 Call</a>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="en-section">
            <p class="en-label muted">💡 Add emergency contacts in Settings → 🆘 Contacts</p>
          </div>
        {/if}

      </div>
    {/if}

  </div>



  <!-- CONTENT -->
  <main class="content">

    <!-- ALERTS -->
    {#if tab === 'alerts'}
      {#if ($alertStore.onlineUsers ?? []).filter(u => u !== $userAuth.username).length > 0}
        <div class="online-bar">
          <span class="ou-lbl">🟢 Online in your area ({($alertStore.onlineUsers??[]).length})</span>
          <div class="ou-list">
            {#each ($alertStore.onlineUsers??[]).filter(u=>u!==$userAuth.username) as u}
              <span class="ou-chip">@{u}</span>
            {/each}
          </div>
        </div>
      {/if}
      <div class="sec-head">
        <h3>{T('communityAlertsTitle')}</h3>
        <button class="ghost" onclick={markAllRead}>{T('markRead')}</button>
      </div>
      {#if !$alertStore.alerts?.filter(a=>a.type!=='JOIN').length}
        <div class="empty"><div class="empty-icon">🛡️</div><p>{T('noAlerts')}</p></div>
      {:else}
        {#each [...$alertStore.alerts].filter(a=>a.type!=='JOIN') as a}
          <div class="card" class:sos={a.type==='SOS'} class:unread={!a.read}>
            <div class="card-top">
              <span class="tag" class:red={a.type==='SOS'}>{a.type}</span>
              <span class="ts">{fmtTime(a.ts)}</span>
            </div>
            <p class="afrom">{a.from}</p>
            <p class="amsg">{a.msg}</p>
            {#if a.lat}<p class="aloc">📍 {formatCoord(a.lat,true)} · {formatCoord(a.lng,false)}</p>{/if}
          </div>
        {/each}
      {/if}

    <!-- MAP + SAFE ZONES -->
    {:else if tab === 'map'}
      <div class="map-tabs">
        <button class="mtab" class:on={mapMode==='location'} onclick={() => mapMode='location'}>📍 My Location</button>
        <button class="mtab" class:on={mapMode==='safezones'} onclick={() => mapMode='safezones'}>🛡️ Safe Zones</button>
      </div>

      {#if mapMode === 'location'}
        <div class="sec-head"><h3>Real-Time Location</h3></div>
        {#if loc.lat}
          <div class="coord-grid">
            <div class="cg"><span class="cg-l">LATITUDE</span><span class="cg-v">{formatCoord(loc.lat,true)}</span><span class="cg-r">{loc.lat.toFixed(6)}</span></div>
            <div class="cg"><span class="cg-l">LONGITUDE</span><span class="cg-v">{formatCoord(loc.lng,false)}</span><span class="cg-r">{loc.lng.toFixed(6)}</span></div>
            <div class="cg"><span class="cg-l">ACCURACY</span><span class="cg-v">±{loc.accuracy ?? '—'}m</span></div>
            <div class="cg"><span class="cg-l">REGION</span><span class="cg-v sm">{loc.region?.name ?? '—'}</span></div>
            <div class="cg span2"><span class="cg-l">COMMUNITY</span><span class="cg-v">{$userAuth.villageDisplayName || '—'}</span></div>
          </div>
          {#if loc.lastUpdated}<p class="upd">Updated {loc.lastUpdated.toLocaleTimeString('en-NG')}</p>{/if}
          <div class="map-wrap">
            <iframe title="Your Location Map" loading="lazy" style="width:100%;height:260px;border:none;border-radius:12px;"
              src="https://www.openstreetmap.org/export/embed.html?bbox={loc.lng-.008},{loc.lat-.008},{loc.lng+.008},{loc.lat+.008}&layer=mapnik&marker={loc.lat},{loc.lng}&_t={_locTick}">
            </iframe>
            <a class="osm" href="https://www.openstreetmap.org/?mlat={loc.lat}&mlon={loc.lng}" target="_blank" rel="noopener">Open in OpenStreetMap ↗</a>
          </div>
        {:else if loc.error}
          <div class="empty"><div class="empty-icon">⚠️</div><p>{loc.error}</p></div>
        {:else}
          <div class="empty"><div class="empty-icon">📍</div><p>Acquiring GPS…</p><div class="spin"></div></div>
        {/if}

      {:else}
        <!-- SAFE ZONES MAP -->
        <div class="sec-head"><h3>Nearest Safe Zones</h3></div>
        {#if loc.lat && nearestZones.length}
          <div class="map-wrap" style="margin-bottom:12px">
            <iframe title="Safe Zones Map" loading="lazy" style="width:100%;height:200px;border:none;border-radius:12px;"
              src="https://www.openstreetmap.org/export/embed.html?bbox={loc.lng-.05},{loc.lat-.05},{loc.lng+.05},{loc.lat+.05}&layer=mapnik&marker={loc.lat},{loc.lng}">
            </iframe>
          </div>
          <div class="zones-list">
            {#each nearestZones as z}
              <div class="zone-card" class:selected={selectedZone?.id===z.id} onclick={() => selectedZone = selectedZone?.id===z.id ? null : z}>
                <div class="zone-icon" style="background:{ZONE_COLORS[z.type]}20;color:{ZONE_COLORS[z.type]}">{ZONE_ICONS[z.type]}</div>
                <div class="zone-info">
                  <p class="zone-name">{z.name}</p>
                  <p class="zone-addr">{z.address}</p>
                  {#if z.dist !== undefined}
                    <p class="zone-dist">📍 {formatDistance(z.dist)} · {formatETA(z.dist)}</p>
                  {/if}
                  {#if z.phone}<p class="zone-phone">📞 {z.phone}</p>{/if}
                </div>
                <div class="zone-btns" onclick={(e)=>e.stopPropagation()}>
                  <a class="zone-dir-btn" href={getWalkingUrl(loc.lat, loc.lng, z.lat, z.lng)} target="_blank" rel="noopener" title="Walk">🚶</a>
                  <a class="zone-dir-btn drive" href={getDirectionsUrl(loc.lat, loc.lng, z.lat, z.lng, z.name)} target="_blank" rel="noopener" title="Drive">🗺️</a>
                </div>
              </div>
            {/each}
          </div>
        {:else if !loc.lat}
          <div class="empty"><div class="empty-icon">📍</div><p>Enable GPS to see nearest safe zones</p></div>
        {:else}
          <div class="zones-list">
            {#each nearestZones as z}
              <div class="zone-card">
                <div class="zone-icon" style="background:{ZONE_COLORS[z.type]}20;color:{ZONE_COLORS[z.type]}">{ZONE_ICONS[z.type]}</div>
                <div class="zone-info">
                  <p class="zone-name">{z.name}</p>
                  <p class="zone-addr">{z.address}</p>
                  {#if z.phone}<p class="zone-phone">📞 {z.phone}</p>{/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}

    <!-- SAFETY TOOLS -->
    {:else if tab === 'safe'}

      <!-- ════ SECTION SWITCHER ════ -->
      <div class="safe-switcher">
        <button class="ssw" class:on={safeSection==='tools'}    onclick={() => safeSection='tools'}>{T('safetyToolsTitle').split(' ')[0]} Safety</button>
        <button class="ssw" class:on={safeSection==='contacts'} onclick={() => safeSection='contacts'}>{T('contactsTitle')}</button>
        <button class="ssw" class:on={safeSection==='profile'}  onclick={() => safeSection='profile'}>{T('profileTitle')}</button>
        <button class="ssw" class:on={safeSection==='mesh'}     onclick={() => safeSection='mesh'}>{T('meshNetworkTitle').split(' ')[0]} Mesh</button>
      </div>

      <!-- ── SAFETY TOOLS ── -->
      {#if safeSection === 'tools'}

        <!-- Fake Call -->
        <div class="safety-card">
          <div class="scard-head"><span class="scard-icon">📞</span>
            <div><p class="scard-title">{T('fakeCall')}</p><p class="scard-sub">{T('fakeCallDesc')}</p></div>
          </div>
          {#if !showFakeCallSetup}
            <div class="scard-btns">
              <button class="btn-p" onclick={() => startFakeCall()}>{T('triggerNow')}</button>
              <button class="btn-g" onclick={() => showFakeCallSetup = true}>{T('customise')}</button>
            </div>
          {:else}
            <div class="field" style="margin-top:10px">
              <label class="fl">{T('callerName')}</label>
              <input class="finput" bind:value={customCallerName} placeholder="e.g. Mum, Chidi…"/>
            </div>
            <div class="scard-btns" style="margin-top:8px">
              <button class="btn-p" onclick={startFakeCall}>📞 Start</button>
              <button class="btn-g" onclick={() => { showFakeCallSetup=false; customCallerName=''; }}>{T('cancel')}</button>
            </div>
          {/if}
        </div>

        <!-- Check-In -->
        <div class="safety-card">
          <div class="scard-head"><span class="scard-icon">✅</span>
            <div><p class="scard-title">{T('checkIn')}</p><p class="scard-sub">{T('checkInDesc')}</p></div>
          </div>
          {#if !checkInActive}
            <div class="field" style="margin-top:10px">
              <label class="fl">{T('checkInEvery')}</label>
              <select class="fsel" bind:value={checkInMins}>
                <option value={15}>{T('min15')}</option>
                <option value={30}>{T('min30')}</option>
                <option value={60}>{T('hr1')}</option>
                <option value={120}>{T('hr2')}</option>
              </select>
            </div>
            <button class="btn-p" style="margin-top:10px" onclick={startCheckIn}>✅ Start Check-Ins</button>
          {:else}
            <div class="checkin-status">
              <span class="dot on" style="width:8px;height:8px"></span>
              <span>{T('active')} — {T('everyMin').replace('min','')} {$checkInState.intervalMins}min</span>
            </div>
            {#if $checkInState.lastCheckIn}<p class="upd">Last: {fmtTime($checkInState.lastCheckIn)}</p>{/if}
            <button class="btn-g" style="margin-top:8px" onclick={stopCheckInSchedule}>{T('stopCheckIn')}</button>
          {/if}
        </div>

        <!-- Emergency Numbers -->
        <div class="safety-card">
          <div class="scard-head"><span class="scard-icon">📱</span>
            <div><p class="scard-title">{T('emergencyNumbers')}</p><p class="scard-sub">{T('emergencyDesc')}</p></div>
          </div>
          <div class="em-grid">
            <a href="tel:199" class="em-btn red">🚓 Police — 199</a>
            <a href="tel:080002255372" class="em-btn blue">📞 GSM — 112</a>
            <a href="tel:123" class="em-btn amber">🚒 Fire — 123</a>
            <a href="tel:767" class="em-btn green">🏥 LASEMA — 767</a>
          </div>
        </div>

        <!-- Links -->
        <a href="/safety" class="safe-link-card">{T('safetyGuide')}</a>
        <a href="/install" class="safe-link-card">{T('installApp')}</a>

      <!-- ── EMERGENCY CONTACTS ── -->
      {:else if safeSection === 'contacts'}
        <p class="ec-intro">When you press SOS, these people get a WhatsApp message with your location — free, instant.</p>

        {#if $contactsStore.contacts.length}
          {#each $contactsStore.contacts as c}
            <div class="safety-card" style="display:flex;align-items:center;gap:.75rem;padding:.8rem 1rem;">
              <div class="ec-avatar">{c.name[0].toUpperCase()}</div>
              <div style="flex:1;min-width:0">
                <p class="ec-name">{c.name} <span class="ec-rel">{c.relation}</span></p>
                <a class="ec-wa" href={"https://wa.me/"+c.phone.replace(/D/g,'')} target="_blank" rel="noopener">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  {c.phone}
                </a>
              </div>
              <button class="ec-del" onclick={() => removeContact(c.id)}>✕</button>
            </div>
          {/each}
        {:else}
          <div class="safety-card" style="text-align:center;padding:1.5rem;color:#7a8fa8;font-size:.8rem">
            <p>{T('noContactsYet')}</p><p style="font-size:.68rem;margin-top:.25rem;color:#3f5166">{T('addTrustedBelow')}</p>
          </div>
        {/if}

        <div class="safety-card" style="display:flex;flex-direction:column;gap:.65rem;">
          <p class="scard-title" style="margin:0">{T('addContactTitle')}</p>
          <div><label class="fl">{T('fullNameStar')}</label><input class="finput" bind:value={ecName} placeholder="e.g. Mum"/></div>
          <div><label class="fl">{T('waPhoneStar')}</label><input class="finput" bind:value={ecPhone} placeholder="08012345678" type="tel"/></div>
          <div><label class="fl">{T('relationshipLabel')}</label>
            <select class="fsel" bind:value={ecRelation}>
              <option>Family</option><option>Friend</option><option>Partner</option><option>Neighbour</option><option>Colleague</option><option>Other</option>
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:.5rem">
            <input type="checkbox" id="ecn2" bind:checked={ecNotify} style="accent-color:#e53935;width:16px;height:16px"/>
            <label for="ecn2" style="font-size:.74rem;color:#7a8fa8">{T('notifyOnSOSLabel')}</label>
          </div>
          {#if ecError}<p style="font-size:.7rem;color:#e53935;margin:0">{ecError}</p>{/if}
          {#if ecSuccess}<p style="font-size:.7rem;color:#00e676;margin:0">{ecSuccess}</p>{/if}
          <button class="btn-p" onclick={saveEmergencyContact} disabled={ecSaving}>{ecSaving?'Saving…':'💾 Save Contact'}</button>
        </div>

      <!-- ── PROFILE & LANGUAGE ── -->
      {:else if safeSection === 'profile'}
        <!-- Username banner -->
        <div class="username-box">
          <div class="username-box-label">{T('yourChatUsernameLabel')}</div>
          <div class="username-box-value">@{$userAuth.username || 'Not set'}</div>
          <div class="username-box-hint">{T('shareUsernameHint')}</div>
        </div>

        <div class="safety-card" style="display:flex;flex-direction:column;gap:.5rem;">
          <div class="row"><span class="rl">Name</span><span class="rv">{$userAuth.firstName} {$userAuth.lastName}</span></div>
          <div class="row"><span class="rl">Email</span><span class="rv" style="font-size:.68rem">{$userAuth.email||'—'}</span></div>
          <div class="row"><span class="rl">Region</span><span class="rv">{$userAuth.villageDisplayName||$userAuth.villageKey||'—'}</span></div>
          <div class="row"><span class="rl">Village Key</span><span class="rv" style="color:#7a8fa8">Sent to email 📧</span></div>
        </div>

        <div class="safety-card" style="display:flex;flex-direction:column;gap:.65rem;">
          <label class="fl">{T('language')}</label>
          <select class="fsel" bind:value={editLang} onchange={saveLang}>
            {#each LANGUAGES as l}<option value={l.code}>{l.native} — {l.label}</option>{/each}
          </select>
          {#if settingsSaved}<p style="font-size:.7rem;color:#00e676;margin:0">✓ Language saved</p>{/if}
        </div>

        <!-- Security -->
        <div class="safety-card" style="display:flex;flex-direction:column;gap:.5rem;">
          <div class="row"><span class="rl">Session</span><span class="rv">{$userAuth.sessionExpiry ? new Date($userAuth.sessionExpiry).toLocaleDateString('en-NG') : '—'}</span></div>
          <div class="row"><span class="rl">Auth</span><span class="rv cap">{$userAuth.authMethod}</span></div>
          <div class="row" style="border:none"><span class="rl">Encryption</span><span class="rv">HMAC-SHA256</span></div>
        </div>

        {#if !showLogoutConfirm}
          <button class="btn-danger" onclick={() => showLogoutConfirm=true}>{T('logOut')}</button>
        {:else}
          <div class="safety-card" style="display:flex;flex-direction:column;gap:.65rem">
            <p style="font-size:.8rem;color:#7a8fa8;margin:0">{T('confirmLogout')}</p>
            <div style="display:flex;gap:.5rem">
              <button class="btn-danger" onclick={doLogout}>{T('yesLogOut')}</button>
              <button class="btn-g" onclick={() => showLogoutConfirm=false}>{T('cancel')}</button>
            </div>
          </div>
        {/if}

      <!-- ── MESH ── -->
      {:else if safeSection === 'mesh'}
        <div class="safety-card" style="display:flex;flex-direction:column;gap:.5rem;">
          <div class="row"><span class="rl">Transport</span><span class="rv" style="color:#00e676">{meshState.transport.toUpperCase()}</span></div>
          <div class="row"><span class="rl">Peers</span><span class="rv">{meshState.peers.length}</span></div>
          <div class="row"><span class="rl">BLE</span><span class="rv">{meshState.bleStatus.toUpperCase()}</span></div>
          <div class="row" style="border:none"><span class="rl">WebRTC</span><span class="rv">{meshState.rtcStatus.toUpperCase()}</span></div>
        </div>
        {#if meshError}<p style="font-size:.72rem;color:#e53935;padding:0 .25rem">{meshError}</p>{/if}
        <div class="safety-card" style="display:flex;flex-direction:column;gap:.65rem">
          <p class="scard-title" style="margin:0">{T('rtcSection')}</p>
          {#if meshState.rtcStatus==='connected'}
            <p style="font-size:.72rem;color:#00e676">✓ Connected</p>
            <button class="btn-g" onclick={rtcDisconnect}>{T('disconnect')}</button>
          {:else}
            <button class="btn-p" onclick={connectWebRTC} disabled={rtcWaiting}>
              {rtcWaiting?T('waitingPeers'):T('announcePresence')}
            </button>
          {/if}
        </div>
        {#if meshCaps.ble}
          <div class="safety-card" style="display:flex;flex-direction:column;gap:.65rem">
            <p class="scard-title" style="margin:0">{T('btSection')}</p>
            {#if meshState.bleStatus==='connected'}
              <p style="font-size:.72rem;color:#00e676">✓ {meshState.peers.find(p=>p.transport==='ble')?.name??'Device'} connected</p>
              <button class="btn-g" onclick={bleDisconnect}>{T('disconnect')}</button>
            {:else}
              <button class="btn-p" onclick={() => connectBLE(false)} disabled={meshState.bleStatus==='connecting'}>
                {meshState.bleStatus==='connecting'?T('scanning'):T('scanDevices')}
              </button>
              {#if showScanAll}
                <button class="btn-g" onclick={() => connectBLE(true)}>{T('scanAll')}</button>
              {/if}
            {/if}
          </div>
        {/if}
      {/if}

    {/if}
  </main>

  <!-- TAB BAR -->
  <nav class="tabbar">
    <button class="tb" class:on={tab==='alerts'} onclick={() => tab='alerts'}>
      <span class="tb-icon">🔔</span>
      <span class="tb-lbl">{T('alerts')}</span>
      {#if unread > 0}<span class="badge">{unread}</span>{/if}
    </button>
    <button class="tb" class:on={tab==='map'} onclick={() => tab='map'}>
      <span class="tb-icon">🗺️</span><span class="tb-lbl">{T('map')}</span>
    </button>
    <button class="tb" onclick={() => goto('/chat')}>
      <span class="tb-icon">💬</span><span class="tb-lbl">{T('chat')}</span>
    </button>
    <button class="tb" class:on={tab==='safe'} onclick={() => tab='safe'}>
      <span class="tb-icon">🛡️</span><span class="tb-lbl">{T('safety')}</span>
    </button>

  </nav>
</div>

<style>
/* ── Layout — full safe-area coverage ── */
.app{display:flex;flex-direction:column;height:100svh;height:100dvh;width:100%;max-width:100%;margin:0 auto;background:#080b0f;overflow:hidden;}

/* ── Top bar ── */
.topbar{display:flex;align-items:center;justify-content:space-between;padding:.65rem 1rem;padding-top:calc(.65rem + env(safe-area-inset-top,0px));padding-top:calc(.65rem + env(safe-area-inset-top));background:#0d1117;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;}
.brand{display:flex;align-items:center;gap:.55rem;}
.bname{font-size:.82rem;font-weight:800;letter-spacing:.2em;color:#29b6f6;display:block;}
.bsub{font-size:.46rem;color:#3f5166;letter-spacing:.06em;display:block;margin-top:1px;}
.top-right{display:flex;align-items:center;gap:.6rem;}
.dots{display:flex;gap:4px;}
.dot{width:7px;height:7px;border-radius:50%;background:#1a2332;transition:background .3s;}
.dot.on{background:#00e676;box-shadow:0 0 6px #00e676;}
.dot.blue.on{background:#29b6f6;box-shadow:0 0 6px #29b6f6;}
.usr{font-size:.6rem;color:#3f5166;font-family:monospace;}

/* ── SOS ── */
/* sos-zone defined below */
.sos{width:110px;height:110px;border-radius:50%;background:radial-gradient(circle,#c0392b,#96281b);border:3px solid rgba(255,45,45,.3);color:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;transition:all .15s;-webkit-tap-highlight-color:transparent;box-shadow:0 0 20px rgba(192,57,43,.25);}
.sos:active{box-shadow:0 0 0 16px rgba(192,57,43,.15),0 0 0 32px rgba(192,57,43,.06);transform:scale(1.05);}
.sos.fired{background:radial-gradient(circle,#e67e22,#d35400);animation:pulse 1s infinite;cursor:not-allowed;}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(230,126,34,.5)}50%{box-shadow:0 0 0 20px rgba(230,126,34,.1)}}
.sos-t{font-size:1.35rem;font-weight:900;letter-spacing:.08em;}
.sos-s{font-size:.52rem;opacity:.7;letter-spacing:.05em;}

/* ── Tabbar ── */
.tabbar{display:flex;background:#0d1117;border-top:1px solid rgba(255,255,255,.05);flex-shrink:0;padding-bottom:env(safe-area-inset-bottom,0px);min-height:56px;}
.tb{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:.5rem .1rem;background:none;border:none;color:#3f5166;cursor:pointer;transition:color .15s;position:relative;-webkit-tap-highlight-color:transparent;touch-action:manipulation;min-width:44px;-webkit-user-select:none;user-select:none;}
.tb-icon{font-size:.95rem;}
.tb-lbl{font-size:.47rem;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap;}
.tb.on{color:#29b6f6;}
.badge{position:absolute;top:3px;right:calc(50% - 18px);background:#ff2d2d;color:#fff;font-size:.45rem;font-weight:700;padding:1px 4px;border-radius:6px;min-width:14px;text-align:center;}

/* ── Content ── */
.content{flex:1;overflow-y:auto;overflow-x:hidden;padding:.85rem;padding-bottom:calc(.85rem + 60px);-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}
.sec-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.8rem;}
.sec-head h3{font-size:.72rem;font-weight:700;color:#e8edf3;letter-spacing:.12em;text-transform:uppercase;margin:0;}
.ghost{background:none;border:none;color:#3f5166;font-size:.68rem;cursor:pointer;}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6rem;padding:2.5rem 1rem;text-align:center;}
.empty-icon{font-size:2.4rem;}
.empty p{font-size:.8rem;color:#3f5166;line-height:1.5;}

/* ── Alert cards ── */
.card{background:#0d1117;border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:.85rem;margin-bottom:.6rem;}
.card.sos{border-color:rgba(255,45,45,.35);background:rgba(255,45,45,.04);}
.card.unread{border-left:3px solid #29b6f6;}
.card-top{display:flex;justify-content:space-between;margin-bottom:.3rem;}
.tag{font-size:.58rem;font-weight:700;letter-spacing:.1em;background:rgba(255,255,255,.07);color:#7a8fa8;padding:2px 7px;border-radius:5px;}
.tag.red{background:rgba(255,45,45,.15);color:#ff2d2d;}
.ts{font-size:.62rem;color:#3f5166;}
.afrom{font-size:.7rem;font-weight:600;color:#29b6f6;margin:.2rem 0 .1rem;}
.amsg{font-size:.82rem;color:#e8edf3;margin:0;}
.aloc{font-size:.62rem;color:#7a8fa8;margin:.3rem 0 0;}

/* ── Map tabs ── */
.map-tabs{display:flex;gap:6px;margin-bottom:.85rem;}
.mtab{flex:1;background:#111822;border:1px solid rgba(255,255,255,.07);border-radius:9px;padding:.5rem;font-size:.7rem;color:#7a8fa8;cursor:pointer;transition:all .15s;}
.mtab.on{background:#1a2332;color:#29b6f6;border-color:rgba(41,182,246,.3);}

/* ── Location coords ── */
.coord-grid{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:.6rem;}
.span2{grid-column:span 2;}
.cg{background:#0d1117;border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:.6rem .75rem;display:flex;flex-direction:column;gap:3px;}
.cg-l{font-size:.52rem;color:#3f5166;letter-spacing:.1em;font-weight:700;}
.cg-v{font-size:.82rem;font-weight:600;color:#e8edf3;font-family:monospace;}
.cg-v.sm{font-size:.72rem;}
.cg-r{font-size:.6rem;color:#7a8fa8;font-family:monospace;}
.upd{font-size:.6rem;color:#3f5166;text-align:right;margin:.3rem 0 .5rem;}
.map-wrap{border-radius:12px;overflow:hidden;}
.osm{display:block;font-size:.62rem;color:#3f5166;text-align:right;padding:.3rem 0;text-decoration:none;}

/* ── Safe zones ── */
.zones-list{display:flex;flex-direction:column;gap:.5rem;}
.zone-card{display:flex;align-items:center;gap:.7rem;background:#0d1117;border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:.75rem;cursor:pointer;transition:border-color .15s;}
.zone-card.selected{border-color:rgba(41,182,246,.4);}
.zone-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;}
.zone-info{flex:1;min-width:0;}
.zone-name{font-size:.8rem;font-weight:600;color:#e8edf3;margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.zone-addr{font-size:.65rem;color:#7a8fa8;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.zone-dist{font-size:.62rem;color:#29b6f6;margin:2px 0 0;}
.zone-dir{font-size:1.1rem;text-decoration:none;flex-shrink:0;padding:4px;}

/* ── Safety tools ── */
.safety-card{background:#0d1117;border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:.9rem;margin-bottom:.75rem;}
.scard-head{display:flex;align-items:flex-start;gap:.65rem;margin-bottom:.6rem;}
.scard-icon{font-size:1.6rem;flex-shrink:0;}
.scard-title{font-size:.82rem;font-weight:700;color:#e8edf3;margin:0 0 2px;}
.scard-sub{font-size:.68rem;color:#7a8fa8;margin:0;line-height:1.4;}
.scard-btns{display:flex;flex-direction:column;gap:7px;}
.em-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px;}
.em-btn{display:flex;align-items:center;justify-content:center;padding:.55rem .5rem;border-radius:10px;font-size:.7rem;font-weight:600;text-decoration:none;text-align:center;gap:4px;}
.em-btn.red{background:rgba(255,45,45,.12);color:#ff2d2d;border:1px solid rgba(255,45,45,.25);}
.em-btn.blue{background:rgba(41,182,246,.1);color:#29b6f6;border:1px solid rgba(41,182,246,.25);}
.em-btn.amber{background:rgba(245,166,35,.1);color:#f5a623;border:1px solid rgba(245,166,35,.25);}
.em-btn.green{background:rgba(0,230,118,.08);color:#00e676;border:1px solid rgba(0,230,118,.2);}
.checkin-status{display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:#00e676;margin-top:8px;}

/* ── Fake call overlay ── */
.call-overlay{position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem;}
.call-card{background:#0d1117;border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:2rem 1.5rem;text-align:center;width:100%;max-width:320px;}
.call-avatar{width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#0057b8,#29b6f6);margin:0 auto 1rem;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:700;color:#fff;animation:callring 1s infinite;}
.call-avatar.active{animation:none;background:linear-gradient(135deg,#00695c,#00e676);}
@keyframes callring{0%,100%{box-shadow:0 0 0 0 rgba(41,182,246,.4)}70%{box-shadow:0 0 0 20px rgba(41,182,246,0)}}
.call-name{font-size:1.3rem;font-weight:700;color:#e8edf3;margin:0 0 .25rem;}
.call-number{font-size:.78rem;color:#7a8fa8;margin:0 0 .5rem;}
.call-status{font-size:.78rem;color:#7a8fa8;margin:0 0 1.5rem;animation:blink 1.5s infinite;}
.call-status.green{color:#00e676;animation:none;font-size:1.2rem;font-weight:700;font-family:monospace;}
.call-btns{display:flex;justify-content:center;gap:2rem;margin-bottom:.5rem;}
.call-decline{width:56px;height:56px;border-radius:50%;background:#c0392b;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transform:rotate(135deg);}
.call-answer{width:56px;height:56px;border-radius:50%;background:#00695c;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.call-hint{font-size:.62rem;color:#3f5166;margin:0;}
.call-end-btn{background:#c0392b;color:#fff;border:none;border-radius:25px;padding:.75rem 2rem;font-size:.88rem;font-weight:600;cursor:pointer;margin-top:1rem;}

/* ── Check-in overlay ── */
.checkin-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:999;display:flex;align-items:flex-end;justify-content:center;padding:1rem;}
.checkin-card{background:#0d1117;border:1px solid rgba(41,182,246,.3);border-radius:20px;padding:1.5rem;text-align:center;width:100%;max-width:360px;margin-bottom:env(safe-area-inset-bottom);}
.checkin-icon{font-size:2rem;margin:0 0 .5rem;}
.checkin-title{font-size:1.1rem;font-weight:700;color:#e8edf3;margin:0 0 .25rem;}
.checkin-sub{font-size:.78rem;color:#7a8fa8;margin:0;}
.btn-safe{background:#00695c;color:#fff;border:none;border-radius:10px;padding:.7rem 1.2rem;font-size:.82rem;font-weight:600;cursor:pointer;}
.btn-sos-sm{background:#c0392b;color:#fff;border:none;border-radius:10px;padding:.7rem 1.2rem;font-size:.82rem;font-weight:600;cursor:pointer;}

/* ── Profile section ── */
.profile-banner{display:flex;align-items:center;gap:.85rem;background:#111822;border-radius:14px;padding:1rem;margin-bottom:.85rem;border:1px solid rgba(255,255,255,.06);}
.profile-avatar{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#0057b8,#29b6f6);display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:700;color:#fff;flex-shrink:0;}
.profile-name{font-size:.92rem;font-weight:700;color:#e8edf3;margin:0 0 2px;}
.profile-user{font-size:.72rem;color:#29b6f6;font-family:monospace;margin:0;}

/* ── Rows ── */
.rows{display:flex;flex-direction:column;gap:.35rem;}
.row{display:flex;justify-content:space-between;align-items:center;background:#0d1117;border-radius:8px;padding:.52rem .8rem;font-size:.76rem;border:1px solid rgba(255,255,255,.05);}
.row.highlight{border-color:rgba(41,182,246,.2);background:rgba(41,182,246,.04);}
.secret-row{border-color:rgba(41,182,246,.15);}
.rl{color:#7a8fa8;flex-shrink:0;}
.rv{color:#e8edf3;font-weight:500;text-align:right;max-width:58%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.rv.mono{font-family:monospace;}
.rv.blue{color:#29b6f6;}
.rv.cap{text-transform:capitalize;}
.rv.green{color:#00e676;}

/* ── Fields ── */
.field{display:flex;flex-direction:column;gap:.28rem;}
.fl{font-size:.6rem;color:#7a8fa8;text-transform:uppercase;letter-spacing:.08em;}
.fsel{background:#111822;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:.62rem .85rem;font-size:.85rem;color:#e8edf3;outline:none;width:100%;-webkit-appearance:none;}
.finput{background:#111822;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:.62rem .85rem;font-size:.85rem;color:#e8edf3;outline:none;width:100%;}
.finput::placeholder{color:#3f5166;}
.saved{font-size:.72rem;color:#00e676;margin:.3rem 0;}
.confirm{background:#111822;border-radius:10px;padding:.85rem;border:1px solid rgba(255,45,45,.25);}
.confirm p{font-size:.8rem;color:#e8edf3;margin:0;}
.spin{width:22px;height:22px;border:2px solid #111822;border-top-color:#29b6f6;border-radius:50%;animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── Settings tabs ── */
.stabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;overflow-x:auto;padding-bottom:2px;}
.stab{background:#111822;border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:.45rem .8rem;font-size:.7rem;color:#7a8fa8;cursor:pointer;transition:all .15s;-webkit-tap-highlight-color:transparent;touch-action:manipulation;user-select:none;-webkit-user-select:none;}
.stab.on{background:#1a2332;color:#29b6f6;border-color:rgba(41,182,246,.25);}

/* ── Mesh ── */
.mesh-card{background:#0d1117;border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:.85rem;margin-bottom:.75rem;}
.mr{display:flex;justify-content:space-between;padding:.28rem 0;border-bottom:1px solid rgba(255,255,255,.04);}
.mr:last-child{border-bottom:none;}
.ml{font-size:.68rem;color:#7a8fa8;}
.mv{font-size:.75rem;font-weight:600;color:#e8edf3;}
.mv.g{color:#00e676;}.mv.a{color:#f5a623;}.mv.r{color:#ff2d2d;}
.info{background:#0d1117;border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:.75rem;margin-top:.5rem;}
.err-sm{font-size:.72rem;color:#ff2d2d;margin:.4rem 0;}
.peers{margin-top:.75rem;}
.peers-t{font-size:.58rem;color:#3f5166;letter-spacing:.1em;text-transform:uppercase;margin:0 0 .4rem;}
.peer{display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:#e8edf3;padding:.25rem 0;}
.pdot{width:6px;height:6px;border-radius:50%;background:#00e676;flex-shrink:0;}
.ptag{font-size:.58rem;color:#3f5166;background:#111;border-radius:4px;padding:1px 5px;margin-left:auto;}
.caps-row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:.75rem;}
.cap{font-size:.65rem;padding:3px 9px;border-radius:20px;background:#111;border:1px solid rgba(255,255,255,.08);color:#3f5166;}
.cap.on{color:#00e676;border-color:rgba(0,230,118,.25);background:rgba(0,230,118,.06);}
.mesh-btns{display:flex;flex-direction:column;gap:8px;margin-bottom:.75rem;}

/* ── About ── */
.about-hd{display:flex;align-items:center;gap:.8rem;margin-bottom:.6rem;}
.an{font-size:1rem;font-weight:800;color:#29b6f6;letter-spacing:.2em;margin:0;}
.af{font-size:.58rem;color:#7a8fa8;margin:3px 0 0;}
.adesc{font-size:.76rem;color:#7a8fa8;line-height:1.6;margin:.4rem 0 .8rem;}

/* ── Buttons ── */
.btn-p{width:100%;background:#0057b8;color:#fff;border:none;border-radius:11px;padding:.8rem;font-size:.88rem;font-weight:600;cursor:pointer;transition:background .15s,transform .08s;}
.btn-p:active:not(:disabled){transform:scale(.98);background:#00409e;}
.btn-p:disabled{opacity:.4;cursor:not-allowed;}
.btn-g{background:none;border:1px solid rgba(255,255,255,.1);color:#7a8fa8;border-radius:9px;padding:.58rem .9rem;font-size:.78rem;cursor:pointer;width:100%;}
.btn-danger{background:#c0392b;color:#fff;border:none;border-radius:10px;padding:.68rem 1.2rem;font-size:.82rem;font-weight:600;cursor:pointer;}

@keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}

/* ── Username box ── */
.username-box{background:rgba(41,182,246,.06);border:1.5px solid rgba(41,182,246,.3);border-radius:14px;padding:.85rem 1rem;margin-bottom:.85rem;}
.username-box-label{font-size:.55rem;color:#29b6f6;text-transform:uppercase;letter-spacing:.12em;font-weight:700;margin-bottom:.3rem;}
.username-box-value{font-size:1.3rem;font-weight:800;color:#e8edf3;font-family:monospace;letter-spacing:.03em;}
.username-box-hint{font-size:.62rem;color:#7a8fa8;margin-top:.3rem;line-height:1.4;}

/* ── Mesh improvements ── */
.mesh-section{background:#0d1117;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:.9rem;margin-bottom:.75rem;}
.mesh-section-title{font-size:.78rem;font-weight:700;color:#e8edf3;margin:0 0 .25rem;}
.mesh-section-sub{font-size:.68rem;color:#7a8fa8;margin:0 0 .75rem;line-height:1.5;}
.mesh-connected-badge{background:rgba(0,230,118,.1);border:1px solid rgba(0,230,118,.3);color:#00e676;border-radius:8px;padding:.45rem .75rem;font-size:.72rem;font-weight:600;}
.mesh-hint{font-size:.68rem;color:#7a8fa8;margin:.5rem 0 .4rem;font-style:italic;line-height:1.4;}
.mesh-err-box{background:rgba(255,45,45,.07);border:1px solid rgba(255,45,45,.2);border-radius:10px;padding:.65rem .85rem;margin-bottom:.65rem;}
.err-detail{font-size:.65rem;color:#f5a623;margin:.2rem 0 0;}
.peer-name{flex:1;}
.ptag.green{color:#00e676;border-color:rgba(0,230,118,.25);background:rgba(0,230,118,.07);}

/* ── Safe zone improvements ── */
.zone-btns{display:flex;flex-direction:column;gap:4px;flex-shrink:0;}
.zone-dir-btn{font-size:1.05rem;text-decoration:none;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:rgba(41,182,246,.1);border:1px solid rgba(41,182,246,.2);}
.zone-dir-btn.drive{background:rgba(245,166,35,.1);border-color:rgba(245,166,35,.2);}
.zone-phone{font-size:.6rem;color:#3f5166;margin:2px 0 0;}

/* ── Power button ── */
.gear-btn{background:none;border:none;color:#7a8fa8;cursor:pointer;padding:6px;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:color .15s,background .15s;-webkit-tap-highlight-color:transparent;touch-action:manipulation;min-width:36px;min-height:36px;}
.gear-btn:active,.gear-btn.gear-on{background:rgba(41,182,246,.12);color:#29b6f6;}
.power-btn{background:none;border:none;color:#3f5166;cursor:pointer;padding:4px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:color .15s,background .15s;}
.power-btn:hover{background:#1a2332;color:#ff2d2d;}

/* ── Power off overlay (stealth mode) ── */
.poweroff-overlay{position:fixed;inset:0;background:#000;z-index:9999;cursor:pointer;-webkit-tap-highlight-color:transparent;}
.usr-village{font-size:.52rem;color:var(--green);font-family:monospace;background:rgba(0,230,118,.08);border:1px solid rgba(0,230,118,.15);border-radius:6px;padding:1px 5px;margin-right:2px;}

/* ── Online users bar ── */
.online-users-bar{padding:.6rem .9rem;background:rgba(0,230,118,.05);border-bottom:1px solid rgba(0,230,118,.1);flex-shrink:0;}
.ou-label{font-size:.6rem;color:var(--green);font-weight:700;text-transform:uppercase;letter-spacing:.08em;display:block;margin-bottom:.35rem;}
.ou-list{display:flex;flex-wrap:wrap;gap:.3rem;}
.ou-chip{font-size:.65rem;background:rgba(0,230,118,.1);border:1px solid rgba(0,230,118,.2);color:var(--green);border-radius:20px;padding:2px 8px;}
.ou-chip.muted{color:var(--text-muted);background:var(--bg-card);border-color:var(--border);}
.online-bar{padding:.55rem .9rem;background:rgba(0,230,118,.05);border-bottom:1px solid rgba(0,230,118,.12);flex-shrink:0;}
.ou-lbl{font-size:.6rem;color:#00e676;font-weight:700;letter-spacing:.08em;display:block;margin-bottom:.3rem;}
.ou-list{display:flex;flex-wrap:wrap;gap:.3rem;}
.ou-chip{font-size:.62rem;background:rgba(0,230,118,.1);border:1px solid rgba(0,230,118,.2);color:#00e676;border-radius:20px;padding:1px 7px;}
.ou-chip.muted{color:var(--text-muted);background:var(--bg-card);border-color:var(--border);}
.ec-section{padding:.5rem 0;display:flex;flex-direction:column;gap:.75rem;}
.ec-intro{font-size:.72rem;color:var(--text-secondary);line-height:1.6;background:rgba(229,57,53,.06);border:1px solid rgba(229,57,53,.15);border-radius:12px;padding:.75rem .9rem;}
.ec-list{display:flex;flex-direction:column;gap:.5rem;}
.ec-card{display:flex;align-items:flex-start;gap:.7rem;background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:.8rem;}
.ec-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#e53935,#b71c1c);color:#fff;font-size:.9rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.ec-info{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0;}
.ec-name{font-size:.82rem;font-weight:700;color:var(--text-primary);margin:0;}
.ec-rel{font-size:.6rem;background:var(--bg-hover);color:var(--text-muted);border-radius:4px;padding:1px 5px;margin-left:5px;font-weight:400;}
.ec-phone,.ec-email{font-size:.7rem;color:var(--text-secondary);margin:0;}
.ec-tags{display:flex;gap:.3rem;margin-top:3px;flex-wrap:wrap;}
.ec-tag{font-size:.58rem;padding:1px 6px;border-radius:10px;font-weight:600;}
.ec-tag.green{background:rgba(0,230,118,.1);color:#00e676;border:1px solid rgba(0,230,118,.2);}
.ec-tag.grey{background:var(--bg-hover);color:var(--text-muted);border:1px solid var(--border);}
.ec-del{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:.8rem;padding:4px;flex-shrink:0;}
.ec-del:hover{color:var(--red);}
.ec-empty{text-align:center;padding:1.25rem;background:var(--bg-card);border:1px dashed var(--border);border-radius:14px;color:var(--text-secondary);font-size:.78rem;}
.ec-empty-sub{font-size:.68rem;color:var(--text-muted);margin-top:.25rem;}
.ec-form{background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:.9rem;}
.ec-form-title{font-size:.75rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.08em;margin:0 0 .75rem;}
.ec-row{display:flex;flex-direction:column;gap:.3rem;margin-bottom:.65rem;}
.ec-label{font-size:.65rem;color:var(--text-secondary);font-weight:600;}
.ec-opt{font-weight:400;color:var(--text-muted);}
.ec-input{background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:.5rem .7rem;color:var(--text-primary);font-size:.82rem;outline:none;width:100%;font-family:var(--font-body);}
.ec-input:focus{border-color:rgba(229,57,53,.4);}
.ec-check-row{display:flex;align-items:center;gap:.5rem;margin-bottom:.65rem;}
.ec-check{width:16px;height:16px;accent-color:var(--red);flex-shrink:0;}
.ec-check-label{font-size:.74rem;color:var(--text-secondary);cursor:pointer;}
.ec-error{font-size:.7rem;color:var(--red);margin:.25rem 0;}
.ec-ok{font-size:.7rem;color:var(--green);margin:.25rem 0;}
.ec-how-box{background:rgba(41,182,246,.05);border:1px solid rgba(41,182,246,.15);border-radius:12px;padding:.8rem;}
.ec-how-title{font-size:.7rem;font-weight:700;color:var(--blue);margin:0 0 .3rem;}
.ec-how-body{font-size:.68rem;color:var(--text-secondary);line-height:1.6;margin:0;}
.sos-contacts-bar{background:rgba(0,230,118,.06);border:1px solid rgba(0,230,118,.2);border-radius:16px;padding:.75rem .9rem;margin-bottom:.5rem;width:100%;max-width:320px;}
.sc-label{font-size:.62rem;color:#00e676;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0 0 .5rem;}
.sc-list{display:flex;flex-direction:column;gap:.4rem;}
.sc-item{display:flex;align-items:center;justify-content:space-between;gap:.5rem;}
.sc-name{font-size:.75rem;color:var(--text-primary);font-weight:600;flex:1;}
.sc-btns{display:flex;gap:.3rem;flex-shrink:0;}
.sc-btn{display:flex;align-items:center;gap:4px;padding:.3rem .65rem;border-radius:8px;font-size:.68rem;font-weight:700;text-decoration:none;-webkit-tap-highlight-color:transparent;}
.sc-btn.wa{background:#25D366;color:#fff;}
.sc-btn.call{background:rgba(41,182,246,.15);color:#29b6f6;border:1px solid rgba(41,182,246,.3);}
.ec-wa-link{display:inline-flex;align-items:center;gap:3px;color:#25D366;text-decoration:none;font-size:.7rem;}
.ec-call-link{margin-left:.5rem;font-size:.7rem;color:var(--text-secondary);text-decoration:none;}
/* ── SOS fired panel ── */
.sos-zone{display:flex;justify-content:center;align-items:flex-start;padding:.75rem 0 .5rem;flex-shrink:0;transition:padding .2s;}
.sos-zone-expanded{padding:0;width:100%;}
.sos-fired-panel{width:100%;background:rgba(229,57,53,.06);border-bottom:1px solid rgba(229,57,53,.2);padding:.75rem .9rem;display:flex;flex-direction:column;gap:.6rem;animation:slideDown .25s ease;}
@keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
.sfp-head{display:flex;align-items:center;gap:.6rem;}
.sfp-pulse{font-size:1.4rem;animation:pulse 1s infinite;}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.sfp-title{font-size:.85rem;font-weight:800;color:var(--red);margin:0;}
.sfp-sub{font-size:.62rem;color:var(--text-muted);margin:0;}
.sfp-dismiss{margin-left:auto;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:.8rem;padding:4px 6px;border-radius:6px;}
.sfp-dismiss:hover{background:var(--bg-hover);color:var(--text-primary);}
.en-section{display:flex;flex-direction:column;gap:.4rem;}
.en-label{font-size:.62rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin:0;}
.en-label.muted{color:var(--text-muted);font-weight:400;text-transform:none;letter-spacing:0;font-style:italic;}
.en-grid{display:grid;grid-template-columns:1fr 1fr;gap:.35rem;}
.en-btn{display:flex;align-items:center;gap:4px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:.45rem .65rem;font-size:.7rem;font-weight:600;color:var(--text-primary);text-decoration:none;-webkit-tap-highlight-color:transparent;transition:background .12s;}
.en-btn:active{background:var(--bg-hover);}
.en-btn.calling{background:rgba(229,57,53,.12);border-color:rgba(229,57,53,.3);color:var(--red);grid-column:span 2;justify-content:space-between;}
.en-status{font-size:.6rem;font-weight:400;color:var(--red);opacity:.7;animation:blink 1.2s infinite;}
@keyframes blink{0%,100%{opacity:.7}50%{opacity:.2}}
.wa-contacts{display:flex;flex-direction:column;gap:.35rem;}
.wa-row{display:flex;align-items:center;justify-content:space-between;gap:.5rem;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:.45rem .65rem;}
.wa-name{font-size:.75rem;font-weight:600;color:var(--text-primary);flex:1;}
.wa-rel{font-size:.58rem;color:var(--text-muted);font-weight:400;margin-left:3px;}
.wa-btns{display:flex;gap:.3rem;flex-shrink:0;}
.wa-btn{display:flex;align-items:center;gap:3px;padding:.3rem .6rem;border-radius:8px;font-size:.68rem;font-weight:700;text-decoration:none;-webkit-tap-highlight-color:transparent;}
.wa-btn.green{background:#25D366;color:#fff;}
.wa-btn.blue{background:rgba(41,182,246,.15);color:#29b6f6;border:1px solid rgba(41,182,246,.3);}
.safe-switcher{display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.85rem;}
.ssw{flex:1;min-width:0;padding:.5rem .3rem;background:#111822;border:1px solid rgba(255,255,255,.08);border-radius:10px;font-size:.68rem;color:#7a8fa8;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:all .15s;white-space:nowrap;}
.ssw.on{background:rgba(41,182,246,.12);border-color:rgba(41,182,246,.35);color:#29b6f6;font-weight:700;}
.ssw:active{opacity:.75;}
.safe-link-card{display:flex;align-items:center;justify-content:space-between;background:#111822;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:.9rem 1rem;text-decoration:none;color:#29b6f6;font-size:.82rem;font-weight:600;-webkit-tap-highlight-color:transparent;margin-bottom:.4rem;}
.ec-wa{display:inline-flex;align-items:center;gap:3px;color:#25D366;text-decoration:none;font-size:.7rem;margin-top:2px;}
.btn-danger{width:100%;background:rgba(229,57,53,.1);color:#e53935;border:1px solid rgba(229,57,53,.3);border-radius:12px;padding:.75rem;font-size:.85rem;font-weight:700;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
.btn-danger:active{background:rgba(229,57,53,.2);}
</style>
