// emergency-contacts.js — P.I.N.G. Final
// WhatsApp-first emergency notifications — 100% free, no API keys needed
// Strategy:
//   1. WhatsApp deep link (wa.me) — opens WhatsApp with pre-written message + location
//   2. Direct tel: call button for each contact
//   3. Supabase realtime broadcast — notifies contacts who also use PING
//   4. localStorage + Supabase persistence

import { writable } from 'svelte/store';
import { supabase, isSupabaseReady } from './supabase.js';

export const contactsStore = writable({ contacts: [], loading: false, error: '' });

// ── Load ──────────────────────────────────────────────────────────
export async function loadContacts(userId) {
	if (!userId) { _loadLocal(); return; }
	contactsStore.update(s => ({ ...s, loading: true, error: '' }));
	try {
		if (isSupabaseReady && supabase) {
			const { data, error } = await supabase
				.from('ping_emergency_contacts')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: true });
			if (!error && data) {
				contactsStore.update(s => ({ ...s, contacts: data, loading: false }));
				_saveLocal(data);
				return;
			}
		}
		_loadLocal();
	} catch { _loadLocal(); }
	contactsStore.update(s => ({ ...s, loading: false }));
}

// ── Add ───────────────────────────────────────────────────────────
export async function addContact(userId, { name, phone, email, relation, notify_sos }) {
	const c = {
		name:       name.trim(),
		phone:      _normalisePhone(phone.trim()),
		email:      (email ?? '').trim() || null,
		relation:   relation ?? 'Family',
		notify_sos: notify_sos ?? true,
	};
	if (!c.name || !c.phone) return { ok: false, error: 'Name and phone number are required.' };

	if (isSupabaseReady && supabase && userId) {
		try {
			const { data, error } = await supabase
				.from('ping_emergency_contacts')
				.insert({ ...c, user_id: userId })
				.select().single();
			if (error) throw error;
			contactsStore.update(s => { const contacts = [...s.contacts, data]; _saveLocal(contacts); return { ...s, contacts }; });
			return { ok: true };
		} catch(e) { return { ok: false, error: e.message }; }
	}
	// Offline
	const local = { id: `local-${Date.now()}`, ...c, user_id: userId ?? 'offline', created_at: new Date().toISOString() };
	contactsStore.update(s => { const contacts = [...s.contacts, local]; _saveLocal(contacts); return { ...s, contacts }; });
	return { ok: true };
}

// ── Delete ────────────────────────────────────────────────────────
export async function deleteContact(userId, contactId) {
	if (isSupabaseReady && supabase && userId && !String(contactId).startsWith('local-')) {
		const { error } = await supabase
			.from('ping_emergency_contacts')
			.delete().eq('id', contactId).eq('user_id', userId);
		if (error) return { ok: false, error: error.message };
	}
	contactsStore.update(s => { const contacts = s.contacts.filter(c => c.id !== contactId); _saveLocal(contacts); return { ...s, contacts }; });
	return { ok: true };
}

// ── Notify via WhatsApp ───────────────────────────────────────────
// Returns an array of { name, phone, whatsappUrl, callUrl } for the UI to show
export function buildEmergencyActions(user, location) {
	let cs = [];
	contactsStore.subscribe(s => cs = s.contacts)();
	const name    = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username || 'A P.I.N.G. user';
	const mapsUrl = location?.lat ? `https://maps.google.com/?q=${location.lat},${location.lng}` : null;

	// WhatsApp message — concise, clear, with location
	const waMsg = encodeURIComponent(
		`🚨 *EMERGENCY ALERT*\n\n*${name}* has activated an SOS on the P.I.N.G. safety app and may be in danger.\n\n` +
		(mapsUrl ? `📍 Last known location:\n${mapsUrl}\n\n` : '') +
		`Please call them immediately or contact *199* (Nigeria Police).\n\n_Sent by P.I.N.G. — Protection In Nigeria_`
	);

	return cs
		.filter(c => c.notify_sos)
		.map(c => ({
			id:           c.id,
			name:         c.name,
			relation:     c.relation,
			phone:        c.phone,
			whatsappUrl:  `https://wa.me/${_waPhone(c.phone)}?text=${waMsg}`,
			callUrl:      `tel:${c.phone}`,
		}));
}

// Auto-open WhatsApp for first contact, return rest for UI buttons
export async function notifyEmergencyContacts(user, location) {
	const actions = buildEmergencyActions(user, location);
	if (!actions.length) return actions;

	// Open WhatsApp for first contact automatically
	if (typeof window !== 'undefined' && actions[0]?.whatsappUrl) {
		window.open(actions[0].whatsappUrl, '_blank');
	}

	// Broadcast to PING users in-app
	if (isSupabaseReady && supabase) {
		for (const a of actions) {
			try {
				await supabase.channel(`ping-ec-${_waPhone(a.phone)}`)
					.send({ type: 'broadcast', event: 'sos-alert', payload: {
						from: user.username ?? user.firstName, name: `${user.firstName} ${user.lastName}`,
						lat: location?.lat, lng: location?.lng, ts: Date.now()
					}}).catch(() => {});
			} catch {}
		}
	}
	return actions;
}

// ── Phone helpers ─────────────────────────────────────────────────
function _normalisePhone(p) {
	// Store in E.164-ish format for WhatsApp
	const digits = p.replace(/\D/g, '');
	if (digits.startsWith('234')) return `+${digits}`;
	if (digits.startsWith('0'))   return `+234${digits.slice(1)}`;
	if (digits.length >= 10)      return `+234${digits}`;
	return p;
}
function _waPhone(p) {
	// WhatsApp wants digits only, no +
	return p.replace(/\D/g, '');
}
function _saveLocal(contacts) {
	try { if (typeof localStorage !== 'undefined') localStorage.setItem('ping_ec_v2', JSON.stringify(contacts)); } catch {}
}
function _loadLocal() {
	try {
		const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('ping_ec_v2') : null;
		if (raw) contactsStore.update(s => ({ ...s, contacts: JSON.parse(raw) }));
	} catch {}
}
