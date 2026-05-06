<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { userAuth, searchUsers } from '$lib/auth.svelte.js';
	import { isSupabaseReady } from '$lib/supabase.js';
	import {
		chatState, initChat, destroyChat,
		sendMessage, sendDM, openDM, closeDM,
		startTyping, stopTyping
	} from '$lib/chat.svelte.js';

	let inputEl    = $state(null);
	let logEl      = $state(null);
	let text       = $state('');
	let sending    = $state(false);
	let activeTab  = $state('community'); // 'community' | 'private'

	// User search for DM
	let showSearch    = $state(false);
	let searchQuery   = $state('');
	let searchResults = $state([]);
	let searchLoading = $state(false);
	let searchTimer   = null;

	$effect(() => {
		if (!showSearch) { searchQuery = ''; searchResults = []; }
	});

	async function onSearchInput() {
		clearTimeout(searchTimer);
		const q = searchQuery.trim();
		if (!q) { searchResults = []; return; }
		searchTimer = setTimeout(async () => {
			searchLoading = true;
			searchResults = await searchUsers(q);
			searchLoading = false;
		}, 320);
	}

	function mentionUser(username) {
		if (activeTab === 'community') {
			text = text + '@' + username + ' ';
			showSearch = false;
			inputEl?.focus();
		} else {
			startPrivateChat(username);
		}
	}

	function startPrivateChat(username) {
		if (username === $userAuth.username) return;
		openDM(username);
		activeTab = 'private';
		showSearch = false;
		searchQuery = '';
		searchResults = [];
	}

	onMount(async () => {
		if (!$userAuth.isVerified) { goto('/'); return; }
		const uname = $userAuth.username || ($userAuth.firstName + ' ' + $userAuth.lastName).trim() || 'User';
		await initChat({
			villageId: $userAuth.villageId ?? 'default',
			username:  uname,
			userId:    $userAuth.userId ?? null,
		});
		await tick();
		scrollBottom('instant');
	});

	onDestroy(destroyChat);

	$effect(() => {
		if (chatState.messages.length) tick().then(() => scrollBottom('smooth'));
	});

	$effect(() => {
		if (chatState.privateChats) tick().then(() => scrollBottom('smooth'));
	});

	function scrollBottom(behavior = 'smooth') {
		logEl?.scrollTo({ top: logEl.scrollHeight, behavior });
	}

	async function submit() {
		const msg = text.trim();
		if (!msg || sending) return;
		sending = true;
		text = '';
		if (activeTab === 'private' && chatState.activeDM) {
			await sendDM(chatState.activeDM, msg);
		} else {
			await sendMessage(msg);
		}
		sending = false;
		inputEl?.focus();
	}

	function onKey(e) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); return; }
		startTyping();
	}

	function fmt(ts) {
		return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function fmtDate(ts) {
		return new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
	}

	const activeMessages = $derived(() => {
		if (activeTab === 'private' && chatState.activeDM) {
			return chatState.privateChats[chatState.activeDM] ?? [];
		}
		return chatState.messages;
	});

	const groups = $derived(() => {
		const out = [];
		for (const m of activeMessages()) {
			const last = out[out.length - 1];
			if (last && last.from === m.from && m.ts - last.msgs[last.msgs.length-1].ts < 90000) {
				last.msgs.push(m);
			} else {
				out.push({ from: m.from, self: m.self, msgs: [m] });
			}
		}
		return out;
	});

	const dayGroups = $derived(() => {
		const sections = [];
		let lastDay = null;
		for (const g of groups()) {
			const day = new Date(g.msgs[0].ts).toDateString();
			if (day !== lastDay) {
				sections.push({ type: 'divider', label: fmtDate(g.msgs[0].ts) });
				lastDay = day;
			}
			sections.push({ type: 'group', ...g });
		}
		return sections;
	});

	const transportLabel = $derived(() => ({
		supabase:  { icon: '🌐', text: 'Live',    cls: 'live'    },
		bluetooth: { icon: '📡', text: 'BLE',     cls: 'ble'     },
		broadcast: { icon: '📶', text: 'Local',   cls: 'local'   },
		storage:   { icon: '💾', text: 'Offline', cls: 'offline' },
		none:      { icon: '⏳', text: '…',       cls: 'none'    },
	}[chatState.transport] ?? { icon: '⏳', text: '…', cls: 'none' }));

	function statusIcon(status) {
		if (status === 'delivered') return '✓✓';
		if (status === 'offline')   return '💾';
		if (status === 'sending')   return '⏳';
		return '✓';
	}

	// DM conversations list
	const dmConversations = $derived(() => {
		return Object.entries(chatState.privateChats).map(([user, msgs]) => ({
			user,
			lastMsg: msgs[msgs.length - 1],
			unread: msgs.filter(m => !m.self && !m.read).length,
		})).sort((a,b) => (b.lastMsg?.ts ?? 0) - (a.lastMsg?.ts ?? 0));
	});

	const chatTitle = $derived(() => {
		if (activeTab === 'private' && chatState.activeDM) return `@${chatState.activeDM}`;
		return `${$userAuth.villageDisplayName || $userAuth.villageId || 'Community'} Chat`;
	});
</script>

<svelte:head><title>P.I.N.G. – Chat</title></svelte:head>

<div class="page">

	<!-- Top bar -->
	<header class="topbar">
		<button class="back" onclick={() => goto('/dashboard')} aria-label="Back">
			<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
				<path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
			</svg>
		</button>

		<div class="head-mid">
			<span class="head-title">{chatTitle()}</span>
			<span class="head-village">
				{#if $userAuth.username}<span class="head-user">@{$userAuth.username}</span>{/if}
				{#if activeTab === 'community' && chatState.onlineCount > 0}
					<span class="online-pill">
						<span class="green-dot"></span>{chatState.onlineCount} online
					</span>
				{/if}
			</span>
		</div>

		<div class="head-right">
			<button class="icon-btn" onclick={() => showSearch = !showSearch} aria-label="New DM / Search"
				class:active={showSearch}>
				{#if activeTab === 'private'}
					<svg width="15" height="15" viewBox="0 0 20 20" fill="none">
						<path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
					</svg>
				{:else}
					<svg width="15" height="15" viewBox="0 0 20 20" fill="none">
						<circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.9"/>
						<path d="M13 13l4 4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
					</svg>
				{/if}
			</button>
			<span class="transport-pill {transportLabel().cls}">{transportLabel().icon} {transportLabel().text}</span>
		</div>
	</header>

	<!-- Tab switcher -->
	<div class="chat-tabs">
		<button class="ctab" class:on={activeTab==='community'} onclick={() => { activeTab = 'community'; closeDM(); }}>
			🌐 Community
		</button>
		<button class="ctab" class:on={activeTab==='private'} onclick={() => activeTab = 'private'}>
			🔒 Private DMs
			{#if dmConversations().length > 0}<span class="dm-badge">{dmConversations().length}</span>{/if}
		</button>
	</div>

	<!-- Search / New DM panel -->
	{#if showSearch}
		<div class="search-panel">
			<div class="search-row">
				<svg class="search-ico" width="13" height="13" viewBox="0 0 20 20" fill="none">
					<circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.9"/>
					<path d="M13 13l4 4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
				</svg>
				<!-- svelte-ignore a11y_autofocus -->
				<input class="search-input" bind:value={searchQuery} oninput={onSearchInput}
					placeholder={activeTab === 'private' ? 'Find user to DM…' : 'Search @username to mention…'}
					autofocus />
				{#if searchQuery}
					<button class="clear-btn" onclick={() => { searchQuery = ''; searchResults = []; }}>✕</button>
				{/if}
			</div>
			{#if searchLoading}
				<div class="search-status">Searching…</div>
			{:else if searchQuery.trim() && searchResults.length === 0}
				<div class="search-status">No users found.</div>
			{:else if searchResults.length > 0}
				<div class="search-results">
					{#each searchResults as u}
						<button class="result-row" onclick={() => mentionUser(u.username)}>
							<div class="result-avatar">{(u.username ?? u.first_name ?? '?')[0].toUpperCase()}</div>
							<div class="result-info">
								<span class="result-name">@{u.username}</span>
								<span class="result-sub">{u.first_name} {u.last_name} · {u.village_name ?? ''}</span>
							</div>
							{#if activeTab === 'private'}
								<span class="dm-start-badge">DM →</span>
							{:else}
								<span class="result-key">{u.village_key ?? ''}</span>
							{/if}
						</button>
					{/each}
				</div>
			{:else}
				<div class="search-hint">
					{activeTab === 'private' ? 'Search by name or @username to start a private chat.' : 'Search for community members to @mention them.'}
				</div>
			{/if}
		</div>
	{/if}

	{#if !isSupabaseReady}
		<div class="setup-banner">
			<strong>⚡ Offline mode</strong> — add Supabase keys to <code>.env</code> for live sync
		</div>
	{/if}

	{#if chatState.error}
		<div class="err-banner">{chatState.error}</div>
	{/if}

	<!-- PRIVATE: DM list or active DM -->
	{#if activeTab === 'private' && !chatState.activeDM}
		<div class="log dm-list">
			{#if dmConversations().length === 0}
				<div class="empty">
					<div class="empty-ico">🔒</div>
					<p>No private chats yet.</p>
					<p class="empty-sub">Tap <strong>+</strong> to search and DM someone by username.</p>
				</div>
			{:else}
				{#each dmConversations() as conv}
					<button class="dm-conv" onclick={() => startPrivateChat(conv.user)}>
						<div class="dm-avatar">{conv.user[0]?.toUpperCase()}</div>
						<div class="dm-info">
							<span class="dm-name">@{conv.user}</span>
							{#if conv.lastMsg}
								<span class="dm-preview">{conv.lastMsg.self ? 'You: ' : ''}{conv.lastMsg.msg}</span>
							{/if}
						</div>
						<div class="dm-meta">
							{#if conv.lastMsg}<span class="dm-time">{fmt(conv.lastMsg.ts)}</span>{/if}
							{#if conv.unread > 0}<span class="dm-unread">{conv.unread}</span>{/if}
						</div>
					</button>
				{/each}
			{/if}
		</div>

	{:else}
		<!-- Message log (community or active DM) -->
		<div class="log" bind:this={logEl}>
			{#if chatState.loading}
				<div class="loading-wrap">
					<div class="spinner"></div>
					<span class="loading-txt">Loading messages…</span>
				</div>
			{:else if activeMessages().length === 0}
				<div class="empty">
					<div class="empty-ico">{activeTab === 'private' ? '🔒' : '💬'}</div>
					<p>{activeTab === 'private' ? `Start a private chat with @${chatState.activeDM}` : 'No messages yet — say hello.'}</p>
				</div>
			{:else}
				{#each dayGroups() as item}
					{#if item.type === 'divider'}
						<div class="date-divider">{item.label}</div>
					{:else}
						<div class="group {item.self ? 'self' : 'other'}">
							{#if !item.self}
								<div class="avatar">{item.from[0]?.toUpperCase()}</div>
							{/if}
							<div class="bubble-col">
								{#if !item.self}
									<span class="sender">@{item.from}</span>
								{/if}
								{#each item.msgs as m, i}
									<div class="bubble {item.self ? 'self' : 'other'} {i === item.msgs.length-1 ? 'last' : ''} {m.status === 'sending' ? 'pending' : ''}">
										<p class="btext">{m.msg}</p>
										{#if i === item.msgs.length - 1}
											<div class="bmeta">
												<span class="btime">{fmt(m.ts)}</span>
												{#if item.self}
													<span class="bstatus" class:delivered={m.status === 'delivered'}>{statusIcon(m.status)}</span>
												{/if}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/each}

				{#if chatState.typingUsers.length > 0 && activeTab === 'community'}
					<div class="group other">
						<div class="avatar typing-avatar">···</div>
						<div class="bubble-col">
							<span class="sender">{chatState.typingUsers.join(', ')} typing…</span>
							<div class="bubble other typing-bubble">
								<span class="typing-dot"></span>
								<span class="typing-dot"></span>
								<span class="typing-dot"></span>
							</div>
						</div>
					</div>
				{/if}
			{/if}
			<div class="scroll-anchor"></div>
		</div>

		<!-- Composer -->
		<form class="composer" onsubmit={(e) => { e.preventDefault(); submit(); }}>
			{#if activeTab === 'private' && chatState.activeDM}
				<button type="button" class="back-dm" onclick={closeDM}>←</button>
			{/if}
			<textarea
				bind:this={inputEl}
				bind:value={text}
				onkeydown={onKey}
				onblur={stopTyping}
				placeholder={activeTab === 'private' ? `Message @${chatState.activeDM}…` : 'Message your community…'}
				rows="1"
				maxlength="500"
				class="composer-input"
			></textarea>
			<button class="send-btn" type="submit" disabled={!text.trim() || sending} aria-label="Send">
				{#if sending}
					<div class="send-spinner"></div>
				{:else}
					<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
						<path d="M2 10l16-8-8 16V10H2z" fill="currentColor"/>
					</svg>
				{/if}
			</button>
		</form>
	{/if}

</div>

<style>
	.page {
		display: flex; flex-direction: column;
		height: 100svh; width: 100%; max-width: 480px; margin: 0 auto;
		background: var(--bg-primary); overflow: hidden;
	}
	.topbar {
		display: flex; align-items: center; gap: .6rem;
		padding: .6rem .9rem;
		padding-top: calc(.6rem + env(safe-area-inset-top));
		background: var(--bg-secondary); border-bottom: 1px solid var(--border); flex-shrink: 0;
	}
	.back {
		background: none; border: none; color: var(--text-secondary); cursor: pointer;
		padding: 4px; display: flex; align-items: center; border-radius: 6px; flex-shrink: 0;
	}
	.back:hover { background: var(--bg-hover); color: var(--text-primary); }
	.icon-btn {
		background: none; border: none; color: var(--text-muted); cursor: pointer;
		padding: 5px; display: flex; align-items: center; border-radius: 6px; flex-shrink: 0;
		transition: background .12s, color .12s;
	}
	.icon-btn:hover, .icon-btn.active { background: var(--bg-hover); color: var(--red); }
	.head-mid { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
	.head-title { font-family: var(--font-display); font-size: .9rem; font-weight: 700; color: var(--text-primary); }
	.head-village { font-size: .62rem; color: var(--text-muted); display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; }
	.head-user { color: var(--red); font-weight: 600; }
	.head-right { display: flex; align-items: center; gap: .4rem; flex-shrink: 0; }
	.online-pill {
		display: flex; align-items: center; gap: 4px; font-size: .62rem; color: var(--green);
		background: rgba(0,230,118,.1); border: 1px solid rgba(0,230,118,.2); border-radius: 20px; padding: 2px 7px;
	}
	.green-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--green); animation: blink 1.5s infinite; }
	.transport-pill {
		font-size: .58rem; padding: 2px 7px; border-radius: 20px;
		border: 1px solid var(--border); background: var(--bg-card); color: var(--text-muted); white-space: nowrap;
	}
	.transport-pill.live    { color: var(--blue);  border-color: rgba(41,182,246,.3); background: rgba(41,182,246,.08); }
	.transport-pill.ble     { color: var(--green); border-color: rgba(0,230,118,.3);  background: rgba(0,230,118,.08); }
	.transport-pill.local   { color: var(--amber); border-color: rgba(245,166,35,.3); background: rgba(245,166,35,.08); }

	/* ── Chat tabs ── */
	.chat-tabs {
		display: flex; background: var(--bg-secondary); border-bottom: 1px solid var(--border); flex-shrink: 0;
	}
	.ctab {
		flex: 1; padding: .55rem .5rem; background: none; border: none; font-size: .72rem;
		color: var(--text-muted); cursor: pointer; transition: color .15s; position: relative;
		display: flex; align-items: center; justify-content: center; gap: 5px;
	}
	.ctab.on { color: var(--blue); border-bottom: 2px solid var(--blue); }
	.dm-badge {
		background: var(--red); color: #fff; font-size: .5rem; font-weight: 700;
		padding: 1px 5px; border-radius: 10px; line-height: 1.6;
	}

	/* ── Search panel ── */
	.search-panel {
		flex-shrink: 0; background: var(--bg-secondary); border-bottom: 1px solid var(--border);
		padding: .5rem .85rem .65rem; max-height: 300px; overflow-y: auto;
	}
	.search-row {
		display: flex; align-items: center; gap: .4rem;
		background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; padding: .42rem .9rem;
	}
	.search-ico { color: var(--text-muted); flex-shrink: 0; }
	.search-input { flex: 1; background: none; border: none; outline: none; color: var(--text-primary); font-family: var(--font-body); font-size: .82rem; }
	.search-input::placeholder { color: var(--text-muted); }
	.clear-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: .68rem; padding: 0 2px; }
	.search-status, .search-hint { font-size: .72rem; color: var(--text-muted); padding: .5rem .2rem; text-align: center; }
	.search-hint { font-style: italic; }
	.search-results { display: flex; flex-direction: column; gap: 2px; margin-top: .4rem; }
	.result-row {
		display: flex; align-items: center; gap: .6rem; background: none; border: none; border-radius: 10px;
		padding: .4rem .5rem; cursor: pointer; text-align: left; width: 100%; transition: background .1s;
	}
	.result-row:hover { background: var(--bg-hover); }
	.result-avatar {
		width: 30px; height: 30px; border-radius: 50%; background: var(--bg-hover); border: 1px solid var(--border);
		display: flex; align-items: center; justify-content: center; font-size: .7rem; font-weight: 700; color: var(--text-secondary); flex-shrink: 0;
	}
	.result-info { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
	.result-name { font-size: .8rem; font-weight: 600; color: var(--text-primary); }
	.result-sub { font-size: .62rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.result-key { font-size: .6rem; font-family: monospace; color: var(--red); background: rgba(255,45,45,.08); border-radius: 4px; padding: 1px 5px; flex-shrink: 0; }
	.dm-start-badge { font-size: .65rem; color: var(--blue); font-weight: 600; flex-shrink: 0; }

	/* ── Banners ── */
	.setup-banner { background: rgba(41,182,246,.08); border-bottom: 1px solid rgba(41,182,246,.2); padding: .55rem 1rem; font-size: .7rem; color: var(--blue); flex-shrink: 0; }
	.setup-banner code { background: rgba(41,182,246,.15); border-radius: 3px; padding: 1px 4px; font-size: .68rem; }
	.err-banner { background: rgba(255,45,45,.08); border-bottom: 1px solid rgba(255,45,45,.2); padding: .45rem 1rem; font-size: .7rem; color: var(--red); flex-shrink: 0; }

	/* ── DM list ── */
	.dm-list { display: flex; flex-direction: column; gap: 0; }
	.dm-conv {
		display: flex; align-items: center; gap: .75rem; padding: .85rem 1rem;
		background: none; border: none; border-bottom: 1px solid var(--border);
		cursor: pointer; text-align: left; width: 100%; transition: background .12s; -webkit-tap-highlight-color: transparent;
	}
	.dm-conv:hover { background: var(--bg-hover); }
	.dm-avatar {
		width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #0057b8, #29b6f6);
		display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 700; color: #fff; flex-shrink: 0;
	}
	.dm-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.dm-name { font-size: .85rem; font-weight: 600; color: var(--text-primary); }
	.dm-preview { font-size: .72rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.dm-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
	.dm-time { font-size: .6rem; color: var(--text-muted); }
	.dm-unread { background: var(--red); color: #fff; font-size: .55rem; font-weight: 700; padding: 1px 6px; border-radius: 10px; }

	/* ── Loading ── */
	.loading-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .75rem; }
	.spinner { width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--border); border-top-color: var(--red); animation: spin .7s linear infinite; }
	.loading-txt { font-size: .72rem; color: var(--text-muted); }
	@keyframes spin { to { transform: rotate(360deg); } }

	/* ── Log ── */
	.log { flex: 1; overflow-y: auto; padding: .75rem .85rem 1rem; display: flex; flex-direction: column; gap: .15rem; scroll-behavior: smooth; }
	.empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: .4rem; color: var(--text-muted); padding: 2rem; font-size: .82rem; }
	.empty-ico { font-size: 2.5rem; margin-bottom: .25rem; }
	.empty-sub { font-size: .72rem; opacity: .7; }
	.date-divider { text-align: center; font-size: .62rem; color: var(--text-muted); margin: .5rem 0 .75rem; position: relative; }
	.date-divider::before, .date-divider::after { content: ''; position: absolute; top: 50%; width: 30%; height: 1px; background: var(--border); }
	.date-divider::before { left: 0; }
	.date-divider::after  { right: 0; }
	.group { display: flex; gap: .5rem; margin-bottom: .5rem; align-items: flex-end; }
	.group.self { flex-direction: row-reverse; }
	.avatar {
		width: 28px; height: 28px; border-radius: 50%; background: var(--bg-hover); border: 1px solid var(--border);
		font-size: .65rem; font-weight: 700; color: var(--text-secondary);
		display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: var(--font-display);
	}
	.bubble-col { display: flex; flex-direction: column; gap: 2px; max-width: min(75%, 320px); }
	.group.self .bubble-col { align-items: flex-end; }
	.sender { font-size: .62rem; color: var(--red); font-weight: 600; padding: 0 .4rem; margin-bottom: 1px; }
	.bubble { padding: .5rem .75rem; border-radius: 16px; line-height: 1.5; }
	.bubble.other { background: var(--bg-card); border: 1px solid var(--border); border-bottom-left-radius: 4px; color: var(--text-primary); }
	.bubble.self { background: var(--red); border-bottom-right-radius: 4px; color: #fff; }
	.bubble.pending { opacity: 0.6; }
	.btext { font-size: .83rem; margin: 0; word-break: break-word; white-space: pre-wrap; }
	.bmeta { display: flex; align-items: center; gap: .3rem; justify-content: flex-end; margin-top: 2px; }
	.btime { font-size: .58rem; opacity: .65; }
	.bstatus { font-size: .6rem; opacity: .55; }
	.bstatus.delivered { opacity: .85; }
	.typing-avatar { font-size: .7rem; letter-spacing: 1px; }
	.typing-bubble { display: flex; align-items: center; gap: 4px; padding: .55rem .75rem; min-width: 50px; }
	.typing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); animation: bounce .9s infinite; }
	.typing-dot:nth-child(2) { animation-delay: .15s; }
	.typing-dot:nth-child(3) { animation-delay: .30s; }
	@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
	.scroll-anchor { height: 1px; flex-shrink: 0; }

	/* ── Composer ── */
	.composer {
		display: flex; align-items: flex-end; gap: .5rem;
		padding: .65rem .85rem; background: var(--bg-secondary); border-top: 1px solid var(--border); flex-shrink: 0;
		padding-bottom: max(.65rem, env(safe-area-inset-bottom));
	}
	.back-dm {
		background: none; border: 1px solid var(--border); border-radius: 10px; color: var(--text-secondary);
		padding: .5rem .6rem; cursor: pointer; font-size: .9rem; flex-shrink: 0;
	}
	.composer-input {
		flex: 1; background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px;
		padding: .6rem 1rem; color: var(--text-primary); font-family: var(--font-body); font-size: .85rem;
		line-height: 1.5; outline: none; resize: none; max-height: 120px; overflow-y: auto; transition: border-color .15s;
	}
	.composer-input:focus { border-color: rgba(255,45,45,.35); }
	.composer-input::placeholder { color: var(--text-muted); }
	.send-btn {
		width: 38px; height: 38px; border-radius: 50%; background: var(--red); border: none; color: #fff; cursor: pointer;
		display: flex; align-items: center; justify-content: center; flex-shrink: 0;
		box-shadow: 0 0 12px var(--red-glow); transition: background .12s, transform .08s;
	}
	.send-btn:hover:not(:disabled) { background: var(--red-dim); }
	.send-btn:active:not(:disabled) { transform: scale(.92); }
	.send-btn:disabled { opacity: .35; cursor: not-allowed; box-shadow: none; }
	.send-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; animation: spin .6s linear infinite; }
	@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
</style>
