// src/lib/chat.svelte.js — P.I.N.G. Chat v16
// Two modes: 'community' (village-scoped) and 'private' (DM by username)
// Supabase → BroadcastChannel → localStorage offline stack
// Language preference persisted to user account (not reset on nav)

import { supabase, isSupabaseReady } from './supabase.js';

const STORE_KEY    = 'ping_chat_v4';
const BC_PREFIX    = 'ping-chat';
const MAX_MSGS     = 150;
const HISTORY_LIMIT = 60;

export const chatState = $state({
	messages:      [],
	privateChats:  {},   // { [otherUsername]: Message[] }
	activeDM:      null, // username of active DM
	onlineCount:   0,
	typingUsers:   [],
	transport:     'none',
	connected:     false,
	error:         '',
	loading:       false,
	mode:          'community', // 'community' | 'private'
});

let realtimeChannel = null;
let broadcastCh     = null;
let currentVillage  = null;
let currentUser     = null;
let currentUserId   = null;
let typingTimer     = null;
let bleRelay        = null;

export async function initChat({ villageId, username, userId }) {
	currentVillage = villageId;
	currentUser    = username;
	currentUserId  = userId ?? null;
	chatState.error   = '';
	chatState.loading = true;

	openBroadcastChannel(villageId);
	listenStorageEvent(villageId);

	if (isSupabaseReady && supabase) {
		await loadHistoryFromDB(villageId);
		await connectSupabase(villageId, username);
	} else {
		loadHistoryFromStorage(villageId);
		chatState.transport = broadcastCh ? 'broadcast' : 'storage';
	}

	// Load DM history from localStorage
	loadDMHistory();

	chatState.loading = false;
}

export function setBLERelay(fn) {
	bleRelay = fn;
	if (chatState.transport !== 'supabase') chatState.transport = 'bluetooth';
}
export function clearBLERelay() {
	bleRelay = null;
	if (chatState.transport === 'bluetooth')
		chatState.transport = broadcastCh ? 'broadcast' : 'storage';
}
export function receiveBLEMessage(pkt) {
	if (!pkt?.msg || pkt.from === currentUser) return;
	pushMsg({ id: `ble-${Date.now()}`, from: pkt.from ?? 'Mesh', msg: pkt.msg, ts: pkt.ts ?? Date.now(), self: false, status: 'delivered' });
}

// ── Community send ────────────────────────────────────────────────
export async function sendMessage(text) {
	const msg = text.trim();
	if (!msg || !currentUser) return;

	const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2,5)}`;
	const ts = Date.now();
	pushMsg({ id: localId, from: currentUser, msg, ts, self: true, status: 'sending' });
	stopTyping();

	if (isSupabaseReady && supabase && currentVillage) {
		try {
			const { data, error } = await supabase
				.from('ping_messages')
				.insert({ village_id: currentVillage, user_id: currentUserId ?? undefined, username: currentUser, message: msg, type: 'MSG' })
				.select('id, created_at').single();
			if (!error && data) {
				syncId(localId, data.id, new Date(data.created_at).getTime(), 'delivered');
				broadcastLocal({ id: data.id, from: currentUser, msg, ts: new Date(data.created_at).getTime(), self: false });
			} else {
				syncStatus(localId, 'offline'); persistToStorage();
			}
		} catch {
			syncStatus(localId, 'offline'); persistToStorage();
		}
		return;
	}

	syncStatus(localId, 'offline');
	broadcastLocal({ id: localId, from: currentUser, msg, ts, self: false });
	flashStorage({ id: localId, from: currentUser, msg, ts, self: false });
	persistToStorage();
	if (bleRelay) try { await bleRelay({ username: currentUser, message: msg }); } catch {}
}

// ── Private DM send ────────────────────────────────────────────────
export async function sendDM(toUsername, text) {
	const msg = text.trim();
	if (!msg || !currentUser || !toUsername) return;

	const localId = `dm-${Date.now()}-${Math.random().toString(36).slice(2,5)}`;
	const ts = Date.now();
	const dmKey = [currentUser, toUsername].sort().join('_DM_');

	pushDM(toUsername, { id: localId, from: currentUser, to: toUsername, msg, ts, self: true, status: 'sending' });

	if (isSupabaseReady && supabase) {
		try {
			const { data, error } = await supabase
				.from('ping_direct_messages')
				.insert({ from_username: currentUser, to_username: toUsername, from_user_id: currentUserId ?? undefined, message: msg })
				.select('id, created_at').single();
			if (!error && data) {
				syncDMStatus(toUsername, localId, 'delivered');
				// notify via realtime broadcast
				const ch = supabase.channel(`ping-dm-${dmKey}`);
				ch.send({ type: 'broadcast', event: 'dm', payload: { id: data.id, from: currentUser, to: toUsername, msg, ts } }).catch(() => {});
			} else {
				syncDMStatus(toUsername, localId, 'offline');
			}
		} catch {
			syncDMStatus(toUsername, localId, 'offline');
		}
	} else {
		syncDMStatus(toUsername, localId, 'offline');
		// BroadcastChannel DM (same device)
		if (typeof BroadcastChannel !== 'undefined') {
			try {
				const dmBc = new BroadcastChannel(`ping-dm-${dmKey}`);
				dmBc.postMessage({ id: localId, from: currentUser, to: toUsername, msg, ts, self: false });
				dmBc.close();
			} catch {}
		}
	}
	saveDMHistory();
}

export function openDM(username) {
	chatState.activeDM = username;
	chatState.mode = 'private';
	if (!chatState.privateChats[username]) chatState.privateChats[username] = [];
	// Subscribe to realtime DMs
	if (isSupabaseReady && supabase) {
		const dmKey = [currentUser, username].sort().join('_DM_');
		loadDMFromDB(username).then(() => {});
		const dmCh = supabase.channel(`ping-dm-${dmKey}`);
		dmCh.on('broadcast', { event: 'dm' }, ({ payload }) => {
			if (payload.from === currentUser) return;
			if (payload.to !== currentUser && payload.from !== currentUser) return;
			const other = payload.from === currentUser ? payload.to : payload.from;
			pushDM(other, { id: payload.id, from: payload.from, to: payload.to, msg: payload.msg, ts: payload.ts, self: false, status: 'delivered' });
			saveDMHistory();
		});
		dmCh.subscribe();
	}
}

export function closeDM() {
	chatState.activeDM = null;
	chatState.mode = 'community';
}

async function loadDMFromDB(otherUser) {
	if (!supabase || !currentUser) return;
	try {
		const { data } = await supabase
			.from('ping_direct_messages')
			.select('id, from_username, to_username, message, created_at')
			.or(`and(from_username.eq.${currentUser},to_username.eq.${otherUser}),and(from_username.eq.${otherUser},to_username.eq.${currentUser})`)
			.order('created_at', { ascending: true })
			.limit(50);
		if (!data) return;
		chatState.privateChats[otherUser] = data.map(r => ({
			id: r.id, from: r.from_username, to: r.to_username, msg: r.message,
			ts: new Date(r.created_at).getTime(),
			self: r.from_username === currentUser, status: 'delivered'
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

export function destroyChat() {
	stopTyping();
	try { realtimeChannel?.unsubscribe(); } catch {}
	try { broadcastCh?.close(); } catch {}
	realtimeChannel = null; broadcastCh = null;
}

// ── DB history ────────────────────────────────────────────────────
async function loadHistoryFromDB(villageId) {
	if (!supabase) return;
	try {
		const { data, error } = await supabase
			.from('ping_messages')
			.select('id, username, message, created_at, type')
			.eq('village_id', villageId)
			.eq('type', 'MSG')
			.order('created_at', { ascending: false })
			.limit(HISTORY_LIMIT);
		if (error || !data) return;
		for (const row of data.reverse()) {
			pushMsg({ id: row.id, from: row.username, msg: row.message, ts: new Date(row.created_at).getTime(), self: row.username === currentUser, status: 'delivered' });
		}
	} catch (e) { console.warn('[Chat] loadHistoryFromDB:', e.message); }
}

async function connectSupabase(villageId, username) {
	if (!supabase) return;
	realtimeChannel = supabase.channel(`ping-village-${villageId}`, {
		config: { broadcast: { self: false }, presence: { key: username } }
	});
	realtimeChannel
		.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ping_messages', filter: `village_id=eq.${villageId}` }, (payload) => {
			const row = payload.new;
			if (!row?.id || row.username === currentUser) return;
			if (chatState.messages.find(m => m.id === row.id)) return;
			pushMsg({ id: row.id, from: row.username, msg: row.message, ts: new Date(row.created_at).getTime(), self: false, status: 'delivered' });
		})
		.on('broadcast', { event: 'typing' }, ({ payload }) => {
			if (payload.user === currentUser) return;
			if (payload.typing) {
				if (!chatState.typingUsers.includes(payload.user))
					chatState.typingUsers = [...chatState.typingUsers, payload.user];
			} else {
				chatState.typingUsers = chatState.typingUsers.filter(u => u !== payload.user);
			}
			setTimeout(() => { chatState.typingUsers = chatState.typingUsers.filter(u => u !== payload.user); }, 4000);
		})
		.on('presence', { event: 'sync' }, () => { chatState.onlineCount = Object.keys(realtimeChannel.presenceState()).length; })
		.on('presence', { event: 'join' }, () => { chatState.onlineCount = Object.keys(realtimeChannel.presenceState()).length; })
		.on('presence', { event: 'leave' }, () => { chatState.onlineCount = Object.keys(realtimeChannel.presenceState()).length; });

	realtimeChannel.subscribe(async (status) => {
		if (status === 'SUBSCRIBED') {
			chatState.connected = true; chatState.transport = 'supabase'; chatState.error = '';
			await realtimeChannel.track({ username, online_at: new Date().toISOString() });
		} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
			chatState.connected = false;
			chatState.transport = broadcastCh ? 'broadcast' : 'storage';
			chatState.error = 'Cloud sync unavailable — offline mode active.';
		} else if (status === 'CLOSED') {
			chatState.connected = false;
		}
	});
}

function openBroadcastChannel(villageId) {
	if (typeof BroadcastChannel === 'undefined') return;
	try {
		broadcastCh = new BroadcastChannel(`${BC_PREFIX}-${villageId}`);
		broadcastCh.onmessage = ({ data: pkt }) => {
			if (!pkt?.msg) return;
			if (chatState.messages.find(m => m.id === pkt.id)) return;
			pushMsg({ ...pkt, self: false });
		};
		if (!isSupabaseReady) chatState.transport = 'broadcast';
	} catch {}
}

function broadcastLocal(pkt) { try { broadcastCh?.postMessage(pkt); } catch {} }

function listenStorageEvent(villageId) {
	if (typeof window === 'undefined') return;
	window.addEventListener('storage', e => {
		if (e.key !== `${STORE_KEY}-flash`) return;
		try {
			const pkt = JSON.parse(e.newValue ?? '');
			if (pkt.from === currentUser || pkt.villageId !== villageId) return;
			if (chatState.messages.find(m => m.id === pkt.id)) return;
			pushMsg({ ...pkt, self: false });
		} catch {}
	});
	if (!isSupabaseReady && !broadcastCh) chatState.transport = 'storage';
}

function flashStorage(pkt) {
	if (typeof localStorage === 'undefined') return;
	try { localStorage.setItem(`${STORE_KEY}-flash`, JSON.stringify({ ...pkt, villageId: currentVillage })); } catch {}
}

function loadHistoryFromStorage(villageId) {
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem(`${STORE_KEY}-${villageId}`);
		if (!raw) return;
		for (const m of JSON.parse(raw).slice(-MAX_MSGS)) pushMsg(m);
	} catch { try { localStorage.removeItem(`${STORE_KEY}-${villageId}`); } catch {} }
}

function persistToStorage() {
	if (typeof localStorage === 'undefined' || !currentVillage) return;
	try {
		localStorage.setItem(`${STORE_KEY}-${currentVillage}`, JSON.stringify(chatState.messages.slice(-MAX_MSGS).map(m => ({ ...m, self: false }))));
	} catch {}
}

function loadDMHistory() {
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem(`ping_dm_v1_${currentUser}`);
		if (raw) chatState.privateChats = JSON.parse(raw);
	} catch {}
}

function saveDMHistory() {
	if (typeof localStorage === 'undefined' || !currentUser) return;
	try { localStorage.setItem(`ping_dm_v1_${currentUser}`, JSON.stringify(chatState.privateChats)); } catch {}
}

// ── Helpers ───────────────────────────────────────────────────────
function pushMsg(msg) {
	if (chatState.messages.find(m => m.id === msg.id)) return;
	chatState.messages = [...chatState.messages, msg].sort((a, b) => a.ts - b.ts).slice(-MAX_MSGS);
}

function pushDM(otherUser, msg) {
	if (!chatState.privateChats[otherUser]) chatState.privateChats[otherUser] = [];
	if (chatState.privateChats[otherUser].find(m => m.id === msg.id)) return;
	chatState.privateChats = {
		...chatState.privateChats,
		[otherUser]: [...(chatState.privateChats[otherUser] ?? []), msg].sort((a, b) => a.ts - b.ts)
	};
}

function syncStatus(id, status) {
	chatState.messages = chatState.messages.map(m => m.id === id ? { ...m, status } : m);
}

function syncDMStatus(otherUser, id, status) {
	if (!chatState.privateChats[otherUser]) return;
	chatState.privateChats = {
		...chatState.privateChats,
		[otherUser]: chatState.privateChats[otherUser].map(m => m.id === id ? { ...m, status } : m)
	};
}

function syncId(oldId, newId, newTs, status) {
	chatState.messages = chatState.messages.map(m => m.id === oldId ? { ...m, id: newId, ts: newTs ?? m.ts, status } : m);
}
