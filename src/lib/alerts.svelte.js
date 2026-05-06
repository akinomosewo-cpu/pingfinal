// src/lib/alerts.svelte.js — uses writable store (SSR safe)
import { writable } from 'svelte/store';

export const alertStore = writable({ alerts: [], unreadCount: 0 });

export function addAlert(alert) {
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
		alertStore.set({ alerts, unreadCount: alerts.filter(a => !a.read).length });
	} catch { try { localStorage.removeItem('ping_alerts'); } catch { } }
}

function _persist(alerts) {
	try { if (typeof localStorage !== 'undefined') localStorage.setItem('ping_alerts', JSON.stringify(alerts)); } catch { }
}
