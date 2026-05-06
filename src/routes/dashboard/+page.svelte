<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { userAuth, logout, LANGUAGES } from '$lib/auth.svelte.js';
  import { alertStore, addAlert, markAllRead } from '$lib/alerts.svelte.js';
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
  import { getNearestSafeZones, getDirectionsUrl, formatDistance, ZONE_ICONS, ZONE_COLORS } from '$lib/safezones.js';
  import { fakeCallState, triggerFakeCall, answerFakeCall, endFakeCall, formatCallDuration, checkInState, startCheckInSchedule, stopCheckInSchedule, confirmCheckIn } from '$lib/fakecall.js';

  const T = $derived((key) => t($i18n.lang, key));

  let tab = $state('alerts');
  let sosState = $state('idle');
  let sosInterval = null;
  let loc = $state({ lat: null, lng: null, accuracy: null, region: null, error: null, lastUpdated: null });
  let locGranted = $state(false);
  let meshCaps = $state({ ble: false, webrtc: false, broadcast: false, storage: false });
  let meshError = $state('');
  let settingsTab = $state('profile');
  let editLang = $state('en');
  let settingsSaved = $state(false);
  let showLogoutConfirm = $state(false);
  let chatMsgs = $state([]);
  let chatMsg = $state('');
  let _meshTick = $state(0);
  let _meshInterval = null;
  let _guardReady = $state(false);

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
      if (update.lat) {
        nearestZones = getNearestSafeZones(update.lat, update.lng, 6);
      }
    });
  }

  async function connectBLE() {
    meshError = '';
    // Use BitChat-compatible service UUIDs
    const result = await bleConnect();
    if (!result.ok) meshError = result.error;
  }

  async function connectWebRTC() {
    meshError = '';
    const result = await rtcAnnounce();
    if (!result.ok) meshError = result.error;
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

  async function fireSOS() {
    if (sosState === 'fired') return;
    sosState = 'fired';
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 600]);
    window.open('tel:199');
    const curLoc = loc.lat ? loc : await getCurrentLocation();
    const pkt = buildSOSPacket(userAuth, curLoc);
    addAlert({
      type: 'SOS',
      from: `${$userAuth.firstName} (YOU)`,
      msg: '🚨 SOS activated — Police called',
      lat: curLoc?.lat,
      lng: curLoc?.lng,
      ts: Date.now()
    });
    await meshSend(pkt);
    setTimeout(() => { sosState = 'idle'; }, 8000);
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
      {#if $userAuth.username}<span class="usr">@{$userAuth.username}</span>{/if}
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

  <!-- SOS -->
  <div class="sos-zone">
    {#if sosState === 'idle'}
      <button class="sos" onclick={fireSOS}>
        <span class="sos-t">SOS</span>
        <span class="sos-s">Press to call 199</span>
      </button>
    {:else}
      <button class="sos fired" disabled>
        <span class="sos-t">🚨</span>
        <span class="sos-s">Calling Police…</span>
      </button>
    {/if}
  </div>

  <!-- TAB BAR -->
  <nav class="tabbar">
    <button class="tb" class:on={tab==='alerts'} onclick={() => tab='alerts'}>
      <span class="tb-icon">🔔</span>
      <span class="tb-lbl">Alerts</span>
      {#if unread > 0}<span class="badge">{unread}</span>{/if}
    </button>
    <button class="tb" class:on={tab==='map'} onclick={() => tab='map'}>
      <span class="tb-icon">🗺️</span><span class="tb-lbl">Map</span>
    </button>
    <button class="tb" onclick={() => goto('/chat')}>
      <span class="tb-icon">💬</span><span class="tb-lbl">Chat</span>
    </button>
    <button class="tb" class:on={tab==='safe'} onclick={() => tab='safe'}>
      <span class="tb-icon">🛡️</span><span class="tb-lbl">Safety</span>
    </button>
    <button class="tb" class:on={tab==='settings'} onclick={() => tab='settings'}>
      <span class="tb-icon">⚙️</span><span class="tb-lbl">Settings</span>
    </button>
  </nav>

  <!-- CONTENT -->
  <main class="content">

    <!-- ALERTS -->
    {#if tab === 'alerts'}
      <div class="sec-head">
        <h3>Community Alerts</h3>
        <button class="ghost" onclick={markAllRead}>Mark read</button>
      </div>
      {#if !$alertStore.alerts?.length}
        <div class="empty"><div class="empty-icon">🛡️</div><p>No alerts — your area is safe</p></div>
      {:else}
        {#each [...$alertStore.alerts] as a}
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
              src="https://www.openstreetmap.org/export/embed.html?bbox={loc.lng-.012},{loc.lat-.012},{loc.lng+.012},{loc.lat+.012}&layer=mapnik&marker={loc.lat},{loc.lng}">
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
                  {#if z.dist !== undefined}<p class="zone-dist">{formatDistance(z.dist)} away</p>{/if}
                </div>
                <a class="zone-dir" href={getDirectionsUrl(loc.lat, loc.lng, z.lat, z.lng)} target="_blank" rel="noopener"
                  onclick={(e)=>e.stopPropagation()}>
                  🗺️
                </a>
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
                <div class="zone-info"><p class="zone-name">{z.name}</p><p class="zone-addr">{z.address}</p></div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}

    <!-- SAFETY TOOLS -->
    {:else if tab === 'safe'}
      <div class="sec-head"><h3>Safety Tools</h3></div>

      <!-- Fake Call -->
      <div class="safety-card">
        <div class="scard-head">
          <span class="scard-icon">📞</span>
          <div>
            <p class="scard-title">Fake Incoming Call</p>
            <p class="scard-sub">Simulate a call to exit an uncomfortable situation</p>
          </div>
        </div>
        {#if !showFakeCallSetup}
          <div class="scard-btns">
            <button class="btn-p" onclick={() => startFakeCall()}>📞 Trigger Now (Random)</button>
            <button class="btn-g" onclick={() => showFakeCallSetup = true}>Customise caller…</button>
          </div>
        {:else}
          <div class="field" style="margin-top:10px">
            <label class="fl">Caller name (optional)</label>
            <input class="finput" bind:value={customCallerName} placeholder="e.g. Mum, Chidi, Work…" />
          </div>
          <div class="scard-btns" style="margin-top:8px">
            <button class="btn-p" onclick={startFakeCall}>📞 Start Fake Call</button>
            <button class="btn-g" onclick={() => { showFakeCallSetup = false; customCallerName = ''; }}>Cancel</button>
          </div>
        {/if}
      </div>

      <!-- Voice Check-In -->
      <div class="safety-card">
        <div class="scard-head">
          <span class="scard-icon">✅</span>
          <div>
            <p class="scard-title">Check-In Reminders</p>
            <p class="scard-sub">Get periodic prompts to confirm you're safe</p>
          </div>
        </div>
        {#if !checkInActive}
          <div class="field" style="margin-top:10px">
            <label class="fl">Check-in every</label>
            <select class="fsel" bind:value={checkInMins}>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
            </select>
          </div>
          <button class="btn-p" style="margin-top:10px" onclick={startCheckIn}>✅ Start Check-Ins</button>
        {:else}
          <div class="checkin-status">
            <span class="dot on" style="width:8px;height:8px"></span>
            <span>Active — checking every {$checkInState.intervalMins}min</span>
          </div>
          {#if $checkInState.lastCheckIn}
            <p class="upd">Last check-in: {fmtTime($checkInState.lastCheckIn)}</p>
          {/if}
          <button class="btn-g" style="margin-top:8px" onclick={stopCheckInSchedule}>Stop Check-Ins</button>
        {/if}
      </div>

      <!-- Quick emergency contacts -->
      <div class="safety-card">
        <div class="scard-head">
          <span class="scard-icon">📱</span>
          <div>
            <p class="scard-title">Emergency Numbers</p>
            <p class="scard-sub">Nigeria emergency services</p>
          </div>
        </div>
        <div class="em-grid">
          <a href="tel:199" class="em-btn red">🚓 Police — 199</a>
          <a href="tel:112" class="em-btn blue">📞 GSM Emergency — 112</a>
          <a href="tel:123" class="em-btn amber">🚒 Fire — 123</a>
          <a href="tel:08052500999" class="em-btn green">🏥 LASEMA — 767</a>
        </div>
      </div>

    <!-- SETTINGS -->
    {:else if tab === 'settings'}
      <div class="sec-head"><h3>Settings</h3></div>
      <div class="stabs">
        {#each [['profile','👤 Profile'],['security','🔐 Security'],['notifs','🔔 Alerts'],['mesh','📡 Mesh'],['about','ℹ️ About']] as [st,label]}
          <button class="stab" class:on={settingsTab===st} onclick={() => settingsTab=st}>{label}</button>
        {/each}
      </div>

      {#if settingsTab === 'profile'}
        <div class="profile-banner">
          <div class="profile-avatar">{($userAuth.firstName ?? 'U')[0].toUpperCase()}</div>
          <div>
            <p class="profile-name">{$userAuth.firstName} {$userAuth.lastName}</p>
            <p class="profile-user">@{$userAuth.username || '—'}</p>
          </div>
        </div>
        <div class="rows">
          <div class="row"><span class="rl">Full Name</span><span class="rv">{$userAuth.firstName} {$userAuth.lastName}</span></div>
          <div class="row highlight"><span class="rl">Username</span><span class="rv mono blue">@{$userAuth.username||'—'}</span></div>
          <div class="row"><span class="rl">Email</span><span class="rv">{$userAuth.email||'—'}</span></div>
          <div class="row"><span class="rl">Phone</span><span class="rv">{$userAuth.phone||'—'}</span></div>
          <div class="row"><span class="rl">Role</span><span class="rv cap">{$userAuth.role}</span></div>
          <div class="row"><span class="rl">Region</span><span class="rv">{$userAuth.region?.name||$userAuth.villageDisplayName||'—'}</span></div>
          <div class="row"><span class="rl">Auth</span><span class="rv cap">{$userAuth.authMethod}</span></div>
          <div class="row secret-row"><span class="rl">Village Key</span><span class="rv">Sent to your email 📧</span></div>
        </div>
        <div class="field" style="margin-top:14px">
          <label class="fl">Language (saved automatically)</label>
          <select bind:value={editLang} class="fsel" onchange={saveLang}>
            {#each LANGUAGES as l}<option value={l.code}>{l.native} — {l.label}</option>{/each}
          </select>
        </div>
        {#if settingsSaved}<p class="saved">✓ Language saved</p>{/if}
        <button class="btn-p" style="margin-top:10px" onclick={saveSettings}>Save Changes</button>

      {:else if settingsTab === 'security'}
        <div class="rows">
          <div class="row"><span class="rl">Session expires</span><span class="rv">{$userAuth.sessionExpiry ? new Date($userAuth.sessionExpiry).toLocaleDateString('en-NG') : '—'}</span></div>
          <div class="row"><span class="rl">Auth method</span><span class="rv cap">{$userAuth.authMethod}</span></div>
          <div class="row"><span class="rl">Encryption</span><span class="rv">HMAC-SHA256</span></div>
        </div>
        {#if !showLogoutConfirm}
          <button class="btn-danger" style="margin-top:14px" onclick={() => showLogoutConfirm=true}>Log Out</button>
        {:else}
          <div class="confirm">
            <p>Are you sure you want to log out?</p>
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="btn-danger" onclick={doLogout}>Yes, log out</button>
              <button class="btn-g" onclick={() => showLogoutConfirm=false}>Cancel</button>
            </div>
          </div>
        {/if}

      {:else if settingsTab === 'notifs'}
        <div class="rows">
          <div class="row"><span class="rl">SOS alerts</span><span class="rv green">Always on</span></div>
          <div class="row"><span class="rl">Mesh messages</span><span class="rv green">Always on</span></div>
          <div class="row"><span class="rl">GPS</span><span class="rv">{locGranted?'✅ Active':'❌ Denied'}</span></div>
          <div class="row"><span class="rl">Bluetooth</span><span class="rv">{meshCaps.ble?'✅ BLE':'❌ BLE'} · {meshCaps.webrtc?'✅ WebRTC':'❌ WebRTC'}</span></div>
          <div class="row"><span class="rl">Check-Ins</span><span class="rv">{checkInActive ? '✅ Active' : '❌ Off'}</span></div>
        </div>

      {:else if settingsTab === 'mesh'}
        <div class="caps-row">
          <span class="cap" class:on={meshCaps.webrtc}>🔗 WebRTC {meshCaps.webrtc ? '✓' : '✗'}</span>
          <span class="cap" class:on={meshCaps.ble}>📡 BLE {meshCaps.ble ? '✓' : '✗'}</span>
          <span class="cap" class:on={meshCaps.broadcast}>📶 Local {meshCaps.broadcast ? '✓' : '✗'}</span>
        </div>
        <div class="mesh-card">
          <div class="mr"><span class="ml">Transport</span><span class="mv" class:g={meshState.transport!=='none'&&meshState.transport!=='storage'}>{meshState.transport.toUpperCase()}</span></div>
          <div class="mr"><span class="ml">Peers</span><span class="mv" class:g={meshState.peers.length>0}>{meshState.peers.length}</span></div>
          <div class="mr"><span class="ml">BLE</span><span class="mv" class:g={meshState.bleStatus==='connected'} class:a={meshState.bleStatus==='connecting'} class:r={meshState.bleStatus==='error'}>{meshState.bleStatus.toUpperCase()}</span></div>
          <div class="mr"><span class="ml">WebRTC</span><span class="mv" class:g={meshState.rtcStatus==='connected'} class:a={meshState.rtcStatus==='signaling'}>{meshState.rtcStatus.toUpperCase()}</span></div>
        </div>
        {#if meshError}<p class="err-sm">⚠ {meshError}</p>{/if}
        <div class="mesh-btns">
          {#if meshCaps.webrtc}
            <button class="btn-p" onclick={connectWebRTC} disabled={meshState.rtcStatus==='signaling'}>
              {meshState.rtcStatus==='signaling' ? 'Signaling…' : '🔗 Join via WebRTC'}
            </button>
          {/if}
          {#if meshCaps.ble}
            <button class="btn-p" onclick={connectBLE} disabled={meshState.bleStatus==='connecting'||meshState.bleStatus==='connected'}>
              {meshState.bleStatus==='connecting' ? 'Scanning…' : '📡 Scan for Devices'}
            </button>
          {/if}
          {#if meshState.connected}
            <button class="btn-g" onclick={disconnectMesh}>Disconnect all</button>
          {/if}
        </div>
        {#if !meshCaps.ble}
          <div class="info"><p style="font-size:.72rem;line-height:1.6">Use <strong>Chrome on Android</strong> for BLE mesh. WebRTC works on all browsers for LAN mesh.</p></div>
        {/if}
        {#if meshState.peers.length}
          <div class="peers">
            <p class="peers-t">Connected peers</p>
            {#each meshState.peers as p}
              <div class="peer"><span class="pdot"></span>{p.name}<span class="ptag">{p.transport}</span></div>
            {/each}
          </div>
        {/if}

      {:else if settingsTab === 'about'}
        <div class="about-hd">
          <svg width="36" height="36" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="3" fill="#29b6f6"/>
            <circle cx="14" cy="14" r="7.5" stroke="#29b6f6" stroke-width="1.5" fill="none"/>
            <circle cx="14" cy="14" r="12" stroke="#29b6f6" stroke-width=".7" fill="none" opacity=".3"/>
          </svg>
          <div><p class="an">P.I.N.G.</p><p class="af">Protection In Nigeria — v7.0.0</p></div>
        </div>
        <p class="adesc">Community safety mesh network for Nigeria. Works offline via Bluetooth & WebRTC. Groups you with nearby people automatically.</p>
        <div class="rows">
          <div class="row"><span class="rl">Version</span><span class="rv">v7.0.0</span></div>
          <div class="row"><span class="rl">Chat</span><span class="rv">BitChat Protocol</span></div>
          <div class="row"><span class="rl">Website</span><span class="rv"><a href="https://ping.com.ng" target="_blank" rel="noopener" style="color:#29b6f6">ping.com.ng</a></span></div>
          <div class="row"><span class="rl">Emergency (Police)</span><span class="rv"><a href="tel:199" style="color:#ff2d2d;font-weight:700">Call 199</a></span></div>
          <div class="row"><span class="rl">Emergency (GSM)</span><span class="rv"><a href="tel:112" style="color:#ff2d2d;font-weight:700">Call 112</a></span></div>
        </div>
      {/if}
    {/if}
  </main>
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
.sos-zone{display:flex;justify-content:center;padding:1.1rem 0 .7rem;flex-shrink:0;}
.sos{width:110px;height:110px;border-radius:50%;background:radial-gradient(circle,#c0392b,#96281b);border:3px solid rgba(255,45,45,.3);color:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;transition:all .15s;-webkit-tap-highlight-color:transparent;box-shadow:0 0 20px rgba(192,57,43,.25);}
.sos:active{box-shadow:0 0 0 16px rgba(192,57,43,.15),0 0 0 32px rgba(192,57,43,.06);transform:scale(1.05);}
.sos.fired{background:radial-gradient(circle,#e67e22,#d35400);animation:pulse 1s infinite;cursor:not-allowed;}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(230,126,34,.5)}50%{box-shadow:0 0 0 20px rgba(230,126,34,.1)}}
.sos-t{font-size:1.35rem;font-weight:900;letter-spacing:.08em;}
.sos-s{font-size:.52rem;opacity:.7;letter-spacing:.05em;}

/* ── Tabbar ── */
.tabbar{display:flex;background:#0d1117;border-top:1px solid rgba(255,255,255,.05);flex-shrink:0;padding-bottom:env(safe-area-inset-bottom,0px);}
.tb{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:.38rem .05rem;background:none;border:none;color:#3f5166;cursor:pointer;transition:color .15s;position:relative;-webkit-tap-highlight-color:transparent;min-width:0;}
.tb-icon{font-size:.95rem;}
.tb-lbl{font-size:.47rem;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap;}
.tb.on{color:#29b6f6;}
.badge{position:absolute;top:3px;right:calc(50% - 18px);background:#ff2d2d;color:#fff;font-size:.45rem;font-weight:700;padding:1px 4px;border-radius:6px;min-width:14px;text-align:center;}

/* ── Content ── */
.content{flex:1;overflow-y:auto;padding:.85rem;-webkit-overflow-scrolling:touch;}
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
.stabs{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;}
.stab{background:#111822;border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:.38rem .7rem;font-size:.68rem;color:#7a8fa8;cursor:pointer;transition:all .15s;}
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
</style>
