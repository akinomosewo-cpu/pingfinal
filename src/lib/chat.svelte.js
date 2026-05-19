// chat.svelte.js v22 — instant load, reliable sync, fixed search
import { writable } from 'svelte/store';
import { supabase, isSupabaseReady } from './supabase.js';

const STORE_KEY = 'ping_chat_v6';
const BC_PREFIX = 'ping-chat';
const MAX_MSGS  = 200;

function makeStore() {
	const { subscribe, update, set } = writable({
		messages: [], privateChats: {}, activeDM: null,
		onlineCount: 0, typingUsers: [], transport: 'none',
		connected: false, error: '', loading: false, mode: 'community',
	});
	return { subscribe, update, set,
		get val() { let v; subscribe(s => v = s)(); return v; }
	};
}
export const chatStore = makeStore();

let realtimeChannel = null;
let broadcastCh     = null;
let currentVillage  = null;
let currentUser     = null;
let currentUserId   = null;
let typingTimer     = null;
let bleRelay        = null;

// ── Init — instant show, background sync ─────────────────────────
export async function initChat({ villageId, villageKey, username, userId }) {
	// Destroy any previous session cleanly
	destroyChat();

	// Ensure we always have a usable channel key
	// Priority: villageKey (district) → villageId → 'ng-general' global fallback
	currentVillage = villageKey?.trim() || villageId?.trim() || 'ng-general';
	console.log('[Chat] channel:', currentVillage, '| user:', username?.slice(0,12));
	// Normalise village key: remove whitespace
	currentVillage = currentVillage.trim();
	currentUser    = username?.trim() || 'User';
	currentUserId  = (userId && userId !== 'offline') ? userId : null;

	// INSTANT: show cached data immediately — zero wait
	loadHistoryFromStorage(currentVillage);
	loadDMHistory();
	_openBC(currentVillage);
	_listenLS(currentVillage);
	chatStore.update(s => ({ ...s, loading: false, error: '',
		transport: broadcastCh ? 'broadcast' : 'storage' }));

	// BACKGROUND: connect Supabase without blocking
	if (isSupabaseReady && supabase) {
		_connectSupabase(currentVillage, currentUser);
	}
}

// ── Supabase connection — called in background ────────────────────
async function _connectSupabase(villageKey, username) {
	if (!supabase) return;

	// Connect realtime channel FIRST (don't wait for history)
	if (realtimeChannel) try { realtimeChannel.unsubscribe(); } catch {}

	realtimeChannel = supabase.channel(`ping-chat-${villageKey}`, {
		config: { broadcast: { self: false }, presence: { key: username } }
	});

	realtimeChannel
		.on('postgres_changes', {
			event: 'INSERT', schema: 'public', table: 'ping_messages',
			filter: `village_id=eq.${villageKey}`,
		}, (payload) => {
			const row = payload.new;
			if (!row?.id || row.username === currentUser) return;
			const cur = chatStore.val;
			if (cur.messages.find(m => m.id === row.id)) return;
			pushMsg({ id: row.id, from: row.username, msg: row.message,
				ts: new Date(row.created_at).getTime(), self: false, status: 'delivered' });
		})
		.on('broadcast', { event: 'typing' }, ({ payload }) => {
			if (!payload || payload.user === currentUser) return;
			chatStore.update(s => {
				const already = s.typingUsers.includes(payload.user);
				if (payload.typing && !already) return { ...s, typingUsers: [...s.typingUsers, payload.user] };
				if (!payload.typing)            return { ...s, typingUsers: s.typingUsers.filter(u => u !== payload.user) };
				return s;
			});
			setTimeout(() => {
				chatStore.update(s => ({ ...s, typingUsers: s.typingUsers.filter(u => u !== payload.user) }));
			}, 4000);
		})
		.on('presence', { event: 'sync' }, () => {
			try { chatStore.update(s => ({ ...s, onlineCount: Object.keys(realtimeChannel.presenceState()).length })); } catch {}
		});

	// Load history in parallel — don't block channel subscription
	Promise.race([_loadHistory(villageKey), new Promise(r=>setTimeout(r,4000))]).catch(()=>{});
	realtimeChannel.subscribe(async (status) => {
		if (status === 'SUBSCRIBED') {
			chatStore.update(s => ({ ...s, connected: true, transport: 'supabase', error: '' }));
			await realtimeChannel.track({ username, online_at: new Date().toISOString() }).catch(() => {});
		} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
			chatStore.update(s => ({ ...s, connected: false,
				transport: broadcastCh ? 'broadcast' : 'storage',
				error: 'Live sync unavailable — offline mode active.' }));
		} else if (status === 'CLOSED') {
			chatStore.update(s => ({ ...s, connected: false }));
		}
	});
}

async function _loadHistory(villageKey) {
	if (!supabase) return;
	const { data, error } = await supabase
		.from('ping_messages')
		.select('id, username, message, created_at')
		.eq('village_id', villageKey)
		.order('created_at', { ascending: false })
		.limit(50);
	if (error) {
		console.warn('[Chat] loadHistory error:', error.message, '| code:', error.code, '| village:', villageKey);
		// If table doesn't exist or RLS blocks — still continue, just no history
		return;
	}
	if (!data?.length) return;
	for (const row of data.reverse()) {
		pushMsg({ id: row.id, from: row.username, msg: row.message,
			ts: new Date(row.created_at).getTime(),
			self: row.username === currentUser, status: 'delivered' });
	}
	// Save to localStorage for next instant load
	persistToStorage();
}

// ── Send community message ────────────────────────────────────────
export async function sendMessage(text) {
	const msg = text.trim();
	if (!msg || !currentUser) return;
	const localId = `loc-${Date.now()}`;
	const ts = Date.now();
	pushMsg({ id: localId, from: currentUser, msg, ts, self: true, status: 'sending' });
	stopTyping();

	if (isSupabaseReady && supabase) {
		try {
			// village_id is the community channel key — must match for realtime to work
			const insert = { village_id: currentVillage, username: currentUser, message: msg, type: 'MSG' };
			if (currentUserId) insert.user_id = currentUserId;
			const { data, error } = await supabase
				.from('ping_messages').insert(insert).select('id, created_at').single();
			if (!error && data) {
				_syncId(localId, data.id, new Date(data.created_at).getTime(), 'delivered');
				_bcSend({ id: data.id, from: currentUser, msg, ts: new Date(data.created_at).getTime(), self: false });
				persistToStorage(); // always persist after confirmed delivery
			} else {
				console.warn('[Chat] send failed:', error?.message, '| code:', error?.code, '| village:', currentVillage);
				_syncStatus(localId, 'offline');
				persistToStorage();
			}
		} catch(e) { _syncStatus(localId, 'offline'); persistToStorage(); }
	} else {
		_syncStatus(localId, 'offline');
		_bcSend({ id: localId, from: currentUser, msg, ts, self: false });
		_lsFlash({ id: localId, from: currentUser, msg, ts, self: false });
		persistToStorage();
		if (bleRelay) try { await bleRelay({ username: currentUser, message: msg }); } catch {}
	}
}

// ── Send DM ───────────────────────────────────────────────────────
export async function sendDM(toUsername, text) {
	const msg = text.trim();
	if (!msg || !currentUser || !toUsername) return;
	const localId = `dm-${Date.now()}`;
	const ts = Date.now();
	const dmKey = [currentUser, toUsername].sort().join('_DM_');
	_pushDM(toUsername, { id: localId, from: currentUser, to: toUsername, msg, ts, self: true, status: 'sending' });
	if (isSupabaseReady && supabase) {
		try {
			const ins = { from_username: currentUser, to_username: toUsername, message: msg };
			if (currentUserId) ins.from_user_id = currentUserId;
			const { data, error } = await supabase.from('ping_direct_messages').insert(ins).select('id').single();
			if (!error && data) {
				_syncDM(toUsername, localId, 'delivered');
				supabase.channel(`ping-dm-${dmKey}`)
					.send({ type: 'broadcast', event: 'dm', payload: { id: data.id, from: currentUser, to: toUsername, msg, ts } })
					.catch(() => {});
			} else { _syncDM(toUsername, localId, 'offline'); }
		} catch { _syncDM(toUsername, localId, 'offline'); }
	} else { _syncDM(toUsername, localId, 'offline'); }
	saveDMHistory();
}

export function openDM(username) {
	chatStore.update(s => ({ ...s, activeDM: username, mode: 'private',
		privateChats: { ...s.privateChats, [username]: s.privateChats[username] ?? [] } }));
	if (isSupabaseReady && supabase) {
		_loadDMHistory(username);
		const dmKey = [currentUser, username].sort().join('_DM_');
		const ch = supabase.channel(`ping-dm-${dmKey}`);
		ch.on('broadcast', { event: 'dm' }, ({ payload }) => {
			if (!payload || payload.from === currentUser) return;
			_pushDM(username, { id: payload.id, from: payload.from, to: payload.to,
				msg: payload.msg, ts: payload.ts, self: false, status: 'delivered' });
			saveDMHistory();
		}).subscribe();
	}
}
export function closeDM() { chatStore.update(s => ({ ...s, activeDM: null, mode: 'community' })); }

async function _loadDMHistory(otherUser) {
	if (!supabase || !currentUser) return;
	try {
		const { data } = await supabase.from('ping_direct_messages')
			.select('id, from_username, to_username, message, created_at')
			.or(`and(from_username.eq.${currentUser},to_username.eq.${otherUser}),and(from_username.eq.${otherUser},to_username.eq.${currentUser})`)
			.order('created_at', { ascending: true }).limit(50);
		if (!data) return;
		chatStore.update(s => ({
			...s, privateChats: { ...s.privateChats,
				[otherUser]: data.map(r => ({ id: r.id, from: r.from_username, to: r.to_username,
					msg: r.message, ts: new Date(r.created_at).getTime(),
					self: r.from_username === currentUser, status: 'delivered' }))
			}
		}));
	} catch {}
}

export function startTyping() {
	if (!realtimeChannel) return;
	clearTimeout(typingTimer);
	realtimeChannel.send({ type: 'broadcast', event: 'typing', payload: { user: currentUser, typing: true } }).catch(() => {});
	typingTimer = setTimeout(stopTyping, 3000);
}
export function stopTyping() {
	clearTimeout(typingTimer);
	if (!realtimeChannel) return;
	realtimeChannel.send({ type: 'broadcast', event: 'typing', payload: { user: currentUser, typing: false } }).catch(() => {});
}
export function setBLERelay(fn) { bleRelay = fn; }
export function clearBLERelay() { bleRelay = null; }
export function receiveBLEMessage(pkt) {
	if (!pkt?.msg || pkt.from === currentUser) return;
	pushMsg({ id: `ble-${Date.now()}`, from: pkt.from ?? 'Mesh', msg: pkt.msg, ts: pkt.ts ?? Date.now(), self: false, status: 'delivered' });
}

export function destroyChat() {
	stopTyping();
	try { realtimeChannel?.unsubscribe(); } catch {}
	try { broadcastCh?.close(); } catch {}
	realtimeChannel = null; broadcastCh = null;
}

// ── BroadcastChannel (offline / same device) ─────────────────────
function _openBC(villageKey) {
	if (typeof BroadcastChannel === 'undefined') return;
	try {
		broadcastCh = new BroadcastChannel(`${BC_PREFIX}-${villageKey}`);
		broadcastCh.onmessage = ({ data: pkt }) => {
			if (!pkt?.msg) return;
			if (chatStore.val.messages.find(m => m.id === pkt.id)) return;
			pushMsg({ ...pkt, self: false });
		};
	} catch {}
}
function _bcSend(pkt) { try { broadcastCh?.postMessage(pkt); } catch {} }
function _lsFlash(pkt) {
	if (typeof localStorage === 'undefined') return;
	try { localStorage.setItem(`${STORE_KEY}-flash`, JSON.stringify({ ...pkt, villageId: currentVillage })); } catch {}
}
function _listenLS(villageKey) {
	if (typeof window === 'undefined') return;
	window.addEventListener('storage', e => {
		if (e.key !== `${STORE_KEY}-flash`) return;
		try {
			const pkt = JSON.parse(e.newValue ?? '');
			if (pkt.from === currentUser || pkt.villageId !== villageKey) return;
			if (chatStore.val.messages.find(m => m.id === pkt.id)) return;
			pushMsg({ ...pkt, self: false });
		} catch {}
	});
}

// ── Persistence ───────────────────────────────────────────────────
function loadHistoryFromStorage(villageKey) {
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem(`${STORE_KEY}-${villageKey}`);
		if (!raw) return;
		for (const m of JSON.parse(raw).slice(-MAX_MSGS)) pushMsg(m);
	} catch { try { localStorage.removeItem(`${STORE_KEY}-${villageKey}`); } catch {} }
}
function persistToStorage() {
	if (typeof localStorage === 'undefined' || !currentVillage) return;
	try {
		localStorage.setItem(`${STORE_KEY}-${currentVillage}`,
			JSON.stringify(chatStore.val.messages.slice(-MAX_MSGS).map(m => ({ ...m, self: false }))));
	} catch {}
}
function loadDMHistory() {
	if (typeof localStorage === 'undefined' || !currentUser) return;
	try {
		const raw = localStorage.getItem(`ping_dm_v3_${currentUser}`);
		if (raw) chatStore.update(s => ({ ...s, privateChats: JSON.parse(raw) }));
	} catch {}
}
function saveDMHistory() {
	if (typeof localStorage === 'undefined' || !currentUser) return;
	try { localStorage.setItem(`ping_dm_v3_${currentUser}`, JSON.stringify(chatStore.val.privateChats)); } catch {}
}

// ── Helpers ───────────────────────────────────────────────────────
function pushMsg(msg) {
	chatStore.update(s => {
		if (s.messages.find(m => m.id === msg.id)) return s;
		return { ...s, messages: [...s.messages, msg].sort((a,b) => a.ts - b.ts).slice(-MAX_MSGS) };
	});
}
function _pushDM(other, msg) {
	chatStore.update(s => {
		const existing = s.privateChats[other] ?? [];
		if (existing.find(m => m.id === msg.id)) return s;
		return { ...s, privateChats: { ...s.privateChats, [other]: [...existing, msg].sort((a,b) => a.ts - b.ts) } };
	});
}
function _syncStatus(id, status) {
	chatStore.update(s => ({ ...s, messages: s.messages.map(m => m.id === id ? { ...m, status } : m) }));
}
function _syncDM(other, id, status) {
	chatStore.update(s => ({
		...s, privateChats: { ...s.privateChats,
			[other]: (s.privateChats[other] ?? []).map(m => m.id === id ? { ...m, status } : m) }
	}));
}
function _syncId(oldId, newId, newTs, status) {
	chatStore.update(s => ({
		...s, messages: s.messages.map(m => m.id === oldId ? { ...m, id: newId, ts: newTs ?? m.ts, status } : m)
	}));
}
