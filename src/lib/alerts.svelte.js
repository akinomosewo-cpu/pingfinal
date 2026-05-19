// alerts.svelte.js v22
// Supabase realtime subscription for SOS events scoped to village
// All users in the same region see each other's alerts in real time

import { writable } from 'svelte/store';

export const alertStore = writable({ alerts: [], unreadCount: 0, onlineUsers: [] });

let _realtimeChannel = null;
let _presenceChannel = null;
let _currentVillage  = null;
let _currentUsername = null;

// ── Subscribe to region alerts via Supabase Realtime ─────────────
export async function subscribeToRegionAlerts(villageKey, username) {
	if (!villageKey || !username) return;
	_currentVillage  = villageKey;
	_currentUsername = username;

	try {
		const { supabase, isSupabaseReady } = await import('./supabase.js');
		if (!isSupabaseReady || !supabase) return;

		// Unsubscribe from any previous channel
		if (_realtimeChannel) { try { _realtimeChannel.unsubscribe(); } catch {} }
		if (_presenceChannel) { try { _presenceChannel.unsubscribe(); } catch {} }

		// 1. Listen to new SOS events for this village
		_realtimeChannel = supabase.channel(`ping-alerts-${villageKey}`);

		_realtimeChannel
			// New SOS row inserted anywhere in the village
			.on('postgres_changes', {
				event: 'INSERT',
				schema: 'public',
				table: 'ping_sos_events',
				filter: `village_id=eq.${villageKey}`,
			}, (payload) => {
				const row = payload.new;
				if (!row) return;
				// Don't re-add own SOS
				if (row.username === username) return;
				addAlert({
					type:    'SOS',
					from:    row.username,
					msg:     `🚨 SOS activated — ${row.username} needs help`,
					lat:     row.lat,
					lng:     row.lng,
					ts:      new Date(row.created_at).getTime(),
					village: villageKey,
				});
			})
			// Also listen to broadcast SOS (from mesh/offline users)
			.on('broadcast', { event: 'sos' }, ({ payload }) => {
				if (!payload || payload.from === username) return;
				addAlert({
					type:    'SOS',
					from:    payload.from,
					msg:     payload.msg ?? `🚨 SOS — ${payload.from}`,
					lat:     payload.lat,
					lng:     payload.lng,
					ts:      payload.ts ?? Date.now(),
					village: villageKey,
				});
			})
			// Listen to community announcements
			.on('broadcast', { event: 'alert' }, ({ payload }) => {
				if (!payload || payload.from === username) return;
				addAlert({
					type:    payload.type ?? 'INFO',
					from:    payload.from,
					msg:     payload.msg,
					ts:      payload.ts ?? Date.now(),
					village: villageKey,
				});
			});

		_realtimeChannel.subscribe();

		// 2. Presence channel — track who's online in this village
		_presenceChannel = supabase.channel(`ping-presence-${villageKey}`, {
			config: { presence: { key: username } }
		});

		_presenceChannel
			.on('presence', { event: 'sync' }, () => {
				const state = _presenceChannel.presenceState();
				const users = Object.values(state).flat().map((u) => u.username ?? u).filter(Boolean);
				alertStore.update(s => ({ ...s, onlineUsers: users }));
			})
			.on('presence', { event: 'join' }, ({ key }) => {
				if (key !== username) {
					addAlert({ type: 'JOIN', from: key, msg: `${key} is now online in your area`, ts: Date.now(), village: villageKey, silent: true });
				}
			});

		_presenceChannel.subscribe(async (status) => {
			if (status === 'SUBSCRIBED') {
				await _presenceChannel.track({ username, village: villageKey, online_at: new Date().toISOString() });
			}
		});

		// 3. Load recent SOS events from DB (last 24h)
		const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		const { data } = await supabase
			.from('ping_sos_events')
			.select('id, username, lat, lng, created_at, status')
			.eq('village_id', villageKey)
			.eq('status', 'active')
			.gte('created_at', since)
			.order('created_at', { ascending: false })
			.limit(20);

		if (data?.length) {
			for (const row of data) {
				addAlert({
					type:    'SOS',
					from:    row.username,
					msg:     `🚨 SOS activated — ${row.username} needs help`,
					lat:     row.lat,
					lng:     row.lng,
					ts:      new Date(row.created_at).getTime(),
					village: villageKey,
					fromDB:  true,
				});
			}
		}

	} catch(e) {
		console.warn('[Alerts] subscribeToRegionAlerts error:', e.message);
	}
}

// Broadcast an SOS to entire village via Supabase
export async function broadcastSOS(username, villageKey, lat, lng) {
	try {
		const { supabase, isSupabaseReady } = await import('./supabase.js');
		if (!isSupabaseReady || !supabase) return;
		// Insert SOS event into DB — realtime subscription picks it up for all users
		await supabase.from('ping_sos_events').insert({
			username,
			village_id: villageKey,
			lat: lat ?? null,
			lng: lng ?? null,
			status: 'active',
		});
		// Also broadcast directly for instant delivery
		if (_realtimeChannel) {
			_realtimeChannel.send({
				type: 'broadcast', event: 'sos',
				payload: { from: username, msg: `🚨 SOS — ${username}`, lat, lng, ts: Date.now() }
			}).catch(() => {});
		}
	} catch(e) {
		console.warn('[Alerts] broadcastSOS error:', e.message);
	}
}

export function unsubscribeAlerts() {
	try { _realtimeChannel?.unsubscribe(); } catch {}
	try { _presenceChannel?.unsubscribe(); } catch {}
	_realtimeChannel = null; _presenceChannel = null;
}

export function addAlert(alert) {
	if (alert.silent) {
		// Silent alerts just update state, no vibration
		alertStore.update(s => {
			const a = { ...alert, id: `a_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, read: true };
			return { ...s, alerts: [a, ...s.alerts].slice(0, 50) };
		});
		return;
	}
	alertStore.update(s => {
		const a = { ...alert, id: `a_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, read: false };
		const alerts = [a, ...s.alerts].slice(0, 50);
		_persist(alerts);
		if (typeof navigator !== 'undefined' && navigator.vibrate)
			navigator.vibrate(alert.type === 'SOS' ? [200,100,200,100,400] : [100]);
		return { alerts, unreadCount: s.unreadCount + 1 };
	});
}

export function markAllRead() {
	alertStore.update(s => {
		const alerts = s.alerts.map(a => ({ ...a, read: true }));
		_persist(alerts);
		return { alerts, unreadCount: 0 };
	});
}

export function loadPersistedAlerts() {
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem('ping_alerts');
		if (!raw) return;
		const alerts = JSON.parse(raw);
		alertStore.set({ alerts, unreadCount: alerts.filter(a => !a.read).length, onlineUsers: [] });
	} catch { try { localStorage.removeItem('ping_alerts'); } catch {} }
}

function _persist(alerts) {
	try {
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('ping_alerts', JSON.stringify(alerts.slice(0, 50)));
	} catch {}
}
