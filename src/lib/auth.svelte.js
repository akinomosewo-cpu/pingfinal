// src/lib/auth.svelte.js — P.I.N.G. Auth v5
// Uses writable stores instead of $state for SSR safety

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// ── Stores ──────────────────────────────────────────────────────
export const userAuth = writable({
	isVerified: false,
	userId: null,
	email: '',
	username: '',
	firstName: '',
	lastName: '',
	phone: '',
	role: 'resident',
	villageId: null,
	villageKey: '',
	villageDisplayName: '',
	region: null,
	language: 'en',
	authMethod: 'none',
	sessionExpiry: null,
});

// Helper to get current value without subscribing
let _auth = {};
userAuth.subscribe(v => _auth = v);

export const LANGUAGES = [
	{ code: 'en',  label: 'English',   native: 'English'      },
	{ code: 'pcm', label: 'Pidgin',    native: 'Naija Pidgin' },
	{ code: 'ha',  label: 'Hausa',     native: 'Hausa'        },
	{ code: 'ig',  label: 'Igbo',      native: 'Igbo'         },
	{ code: 'yo',  label: 'Yoruba',    native: 'Yorùbá'       },
	{ code: 'ful', label: 'Fulfulde',  native: 'Fulfulde'     },
	{ code: 'tiv', label: 'Tiv',       native: 'Tiv'          },
	{ code: 'ijo', label: 'Ijaw',      native: 'Ịjọ'          },
];

const HMAC_SECRET = 'ping-protection-nigeria-v5';
const TOKEN_KEY   = 'ping_auth_v5';
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

// ── Session restore ─────────────────────────────────────────────
export async function checkOfflineAuth() {
	if (!browser) return;
	// Try Supabase first
	try {
		const { supabase } = await import('./supabase.js');
		if (supabase) {
			const { data: { session } } = await supabase.auth.getSession();
			if (session?.user) {
				await _hydrateFromSupabase(session.user);
				return;
			}
		}
	} catch { }
	// Fall back to localStorage token
	await _hydrateFromLocalStorage();
}

// ── Village key from location ────────────────────────────────────
export function deriveVillageFromLocation(lat, lng, userId) {
	const { getRegionFromCoords, generateVillageKey } = _getLocationUtils();
	const region = getRegionFromCoords(lat, lng);
	const key = generateVillageKey(region, userId ?? Date.now());
	return { region, key, villageName: region.name };
}

function _getLocationUtils() {
	// Inline to avoid circular imports
	const REGIONS = [
		{ name: 'Lagos',       key: 'LAG', lat: [6.3,  6.8],  lng: [2.7,  3.8]  },
		{ name: 'Abuja (FCT)', key: 'FCT', lat: [8.8,  9.3],  lng: [7.0,  7.6]  },
		{ name: 'Kano',        key: 'KAN', lat: [11.8, 12.3], lng: [8.3,  8.8]  },
		{ name: 'Kaduna',      key: 'KAD', lat: [10.3, 10.7], lng: [7.3,  7.7]  },
		{ name: 'Rivers',      key: 'RIV', lat: [4.6,  5.1],  lng: [6.8,  7.3]  },
		{ name: 'Oyo',         key: 'OYO', lat: [7.3,  7.9],  lng: [3.8,  4.3]  },
		{ name: 'Delta',       key: 'DEL', lat: [5.2,  6.0],  lng: [5.8,  6.8]  },
		{ name: 'Zamfara',     key: 'ZAM', lat: [11.7, 12.7], lng: [6.0,  7.0]  },
	];
	return {
		getRegionFromCoords(lat, lng) {
			for (const r of REGIONS) {
				if (lat >= r.lat[0] && lat <= r.lat[1] && lng >= r.lng[0] && lng <= r.lng[1])
					return { name: r.name, key: r.key };
			}
			return { name: 'Nigeria', key: 'NG' };
		},
		generateVillageKey(region, userId) {
			const p = (region?.key ?? 'NG').slice(0, 3).toUpperCase();
			const s = String(userId ?? Date.now()).slice(-4);
			return `${p}${s}`;
		}
	};
}

// ── Username ─────────────────────────────────────────────────────
export function generateUsername(firstName, lastName, userId) {
	const base = ((firstName ?? '').slice(0, 3) + (lastName ?? '').slice(0, 3))
		.toLowerCase().replace(/[^a-z]/g, '') || 'user';
	// Use last 4 chars of userId for uniqueness, fallback to random
	const uid4 = userId ? String(userId).replace(/-/g,'').slice(-4) : Math.floor(1000 + Math.random() * 9000);
	return `${base}${uid4}`;
}

// Ensure every existing user who has no username gets one generated and saved
export async function ensureUsername(user, meta, existingUsername) {
	if (existingUsername && existingUsername.trim() && existingUsername !== 'Not set') {
		return existingUsername;
	}
	const firstName = meta.first_name ?? meta.firstName ?? '';
	const lastName  = meta.last_name  ?? meta.lastName  ?? '';
	const generated = generateUsername(firstName, lastName, user.id);
	// Persist to Supabase if possible
	try {
		const { supabase } = await import('./supabase.js');
		if (supabase) {
			await supabase.from('ping_users')
				.update({ username: generated })
				.eq('id', user.id);
			// Also update auth metadata
			await supabase.auth.updateUser({ data: { username: generated } });
		}
	} catch {}
	// Persist to localStorage token
	if (typeof localStorage !== 'undefined') {
		try {
			const raw = localStorage.getItem('ping_auth_v5');
			if (raw) {
				const { payload, sig } = JSON.parse(raw);
				const data = JSON.parse(atob(payload));
				data.username = generated;
				localStorage.setItem('ping_auth_v5', JSON.stringify({ payload: btoa(JSON.stringify(data)), sig }));
			}
		} catch {}
	}
	return generated;
}

// ── Sign Up ───────────────────────────────────────────────────────
export async function signUpEmail({ email, password, firstName, lastName, phone, role, region, language }) {
	const username = generateUsername(firstName, lastName);
	const utils    = _getLocationUtils();
	const key      = utils.generateVillageKey(region ?? { key: 'NG', name: 'Nigeria' }, Date.now());

	if (!browser) return { ok: false, error: 'Browser only' };

	try {
		const { supabase } = await import('./supabase.js');
		if (!supabase) {
			_setAuth({ firstName, lastName, email, phone, role, username, villageKey: key, villageDisplayName: region?.name ?? 'Nigeria', villageId: 'offline', region, language, authMethod: 'offline' });
			await _saveToken();
			return { ok: true, needsConfirm: false, username, villageKey: key };
		}

		const { data, error } = await supabase.auth.signUp({
			email: email.trim().toLowerCase(),
			password,
			options: {
				data: { first_name: firstName, last_name: lastName, username, village_key: key, village_name: region?.name ?? 'Nigeria' },
				emailRedirectTo: `${window.location.origin}/auth/callback`,
				// If email confirmation is disabled in Supabase, this is ignored
				// To disable: Supabase → Auth → Settings → Confirm email: OFF
			}
		});
		if (error) return { ok: false, error: error.message };

		const uid  = data.user?.id;
		const finalKey = uid ? utils.generateVillageKey(region ?? { key: 'NG' }, uid) : key;

		if (uid) await _upsertProfile(uid, { firstName, lastName, email: email.trim().toLowerCase(), phone, role, username, villageKey: finalKey, villageName: region?.name ?? 'Nigeria', language });

		_setAuth({ userId: uid, email: email.trim().toLowerCase(), firstName, lastName, phone, role, username, villageKey: finalKey, villageDisplayName: region?.name ?? 'Nigeria', villageId: uid ? `v_${uid.slice(0,8)}` : null, region, language, authMethod: 'email' });
		await _saveToken();

		// needsConfirm = true means email sent, user must click link
		// needsConfirm = false means session created immediately — go to dashboard
		return { ok: true, needsConfirm: !data.session, username, villageKey: finalKey, session: data.session };
	} catch (e) {
		return { ok: false, error: e.message ?? 'Sign-up failed' };
	}
}

// ── Sign In ───────────────────────────────────────────────────────
export async function signInEmail({ email, password }) {
	if (!browser) return { ok: false, error: 'Browser only' };
	try {
		const { supabase } = await import('./supabase.js');
		if (!supabase) return { ok: false, error: 'No network.' };
		const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
		if (error) return { ok: false, error: error.message };
		await _hydrateFromSupabase(data.user);
		// Guarantee isVerified is set — _hydrateFromSupabase may bail if no DB profile yet
		// Always ensure user is verified after successful auth
		if (!_auth.isVerified || !_auth.username) {
			const meta2 = data.user.user_metadata ?? {};
			const u2 = await ensureUsername(data.user, meta2, meta2.username ?? '');
			_setAuth({
				userId:    data.user.id,
				email:     data.user.email ?? email,
				firstName: meta2.first_name ?? '',
				lastName:  meta2.last_name  ?? '',
				username:  u2,
				villageKey: meta2.village_key ?? '',
				authMethod: 'email',
			});
		}
		await _saveToken();
		return { ok: true, redirect: '/dashboard' };
	} catch (e) {
		return { ok: false, error: e.message ?? 'Sign-in failed' };
	}
}

// ── Google ────────────────────────────────────────────────────────
export async function signInWithGoogle() {
	if (!browser) return { ok: false, error: 'Browser only' };
	try {
		const { supabase } = await import('./supabase.js');
		if (!supabase) return { ok: false, error: 'No network.' };
		// redirectTo must match EXACTLY what's registered in:
		// Supabase Dashboard → Auth → URL Configuration → Redirect URLs
		// Add BOTH: https://pingfinalng.vercel.app/auth/callback
		//       AND: https://ping.com.ng/auth/callback
		const siteOrigin = import.meta.env.VITE_SITE_URL?.replace(/\/$/, '') || window.location.origin;
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${siteOrigin}/auth/callback`,
				queryParams: { prompt: 'select_account', access_type: 'offline' }
			}
		});
		if (error) return { ok: false, error: error.message };
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e.message };
	}
}

// ── Logout ────────────────────────────────────────────────────────
export async function logout() {
	if (!browser) return;
	try {
		const { supabase } = await import('./supabase.js');
		if (supabase) await supabase.auth.signOut();
	} catch { }
	userAuth.set({ isVerified: false, userId: null, email: '', username: '', firstName: '', lastName: '', phone: '', role: 'resident', villageId: null, villageKey: '', villageDisplayName: '', region: null, language: 'en', authMethod: 'none', sessionExpiry: null });
	try { ['ping_auth_v5','ping_auth_v4','ping_auth_v3'].forEach(k => localStorage.removeItem(k)); } catch { }
}

// ── Phone helpers ─────────────────────────────────────────────────
export function normalisePhone(raw) {
	const d = raw.replace(/\D/g, '');
	if (d.startsWith('234')) return '+' + d;
	if (d.startsWith('0') && d.length === 11) return '+234' + d.slice(1);
	return raw;
}
export function validateNigerianPhone(raw) {
	const d = raw.replace(/\D/g, '');
	return /^0[7-9][01]\d{8}$/.test(d) || /^234[7-9][01]\d{8}$/.test(d);
}

// ── Internals ─────────────────────────────────────────────────────
function _setAuth(data) {
	userAuth.update(s => ({
		...s,
		isVerified:         true,
		userId:             data.userId              ?? s.userId,
		email:              data.email               ?? s.email,
		username:           data.username            ?? s.username,
		firstName:          data.firstName           ?? s.firstName,
		lastName:           data.lastName            ?? s.lastName,
		phone:              data.phone               ?? s.phone,
		role:               data.role                ?? s.role,
		villageId:          data.villageId           ?? s.villageId,
		villageKey:         data.villageKey          ?? s.villageKey,
		villageDisplayName: data.villageDisplayName  ?? s.villageDisplayName,
		region:             data.region              ?? s.region,
		language:           data.language            ?? s.language,
		authMethod:         data.authMethod          ?? 'offline',
		sessionExpiry:      Date.now() + SESSION_TTL,
	}));
}

async function _upsertProfile(uid, d) {
	try {
		const { supabase } = await import('./supabase.js');
		if (!supabase) return;
		await supabase.from('ping_users').upsert({
			id: uid, first_name: d.firstName?.trim(), last_name: d.lastName?.trim(),
			email: d.email, phone: d.phone, role: d.role, username: d.username,
			village_key: d.villageKey, village_name: d.villageName,
			language: d.language, last_seen: new Date().toISOString()
		}, { onConflict: 'id' });
	} catch (e) { console.warn('[Auth] upsert:', e.message); }
}

async function _hydrateFromSupabase(user) {
	try {
		const { supabase } = await import('./supabase.js');
		if (!supabase) return;
		const { data: p } = await supabase.from('ping_users').select('*').eq('id', user.id).single();
		// Always authenticate — use DB profile if available, fall back to Supabase user metadata
		const meta = user.user_metadata ?? {};
		const rawUsername = p?.username ?? meta.username ?? '';
		const username = await ensureUsername(user, meta, rawUsername);
		_setAuth({
			userId:             user.id,
			email:              p?.email              ?? user.email        ?? '',
			username,
			firstName:          p?.first_name         ?? meta.first_name   ?? '',
			lastName:           p?.last_name          ?? meta.last_name    ?? '',
			phone:              p?.phone              ?? '',
			role:               p?.role               ?? 'resident',
			villageId:          p?.village_id         ?? `v_${user.id.slice(0, 8)}`,
			villageKey:         p?.village_key        ?? meta.village_key  ?? '',
			villageDisplayName: p?.village_name       ?? meta.village_name ?? 'Nigeria',
			language:           p?.language           ?? 'en',
			authMethod:         user.phone ? 'sms' : 'email',
		});
	} catch(e) {
		// Table may not exist yet — still mark as verified so user can use the app
		const meta = user.user_metadata ?? {};
		_setAuth({
			userId: user.id, email: user.email ?? '',
			username: meta.username || generateUsername(meta.first_name??'', meta.last_name??'', user.id),
			firstName: meta.first_name ?? '', lastName: meta.last_name ?? '',
			villageKey: meta.village_key ?? '', villageDisplayName: meta.village_name ?? 'Nigeria',
			authMethod: 'email', role: meta.role ?? 'resident',
		});
	}
}

async function _hydrateFromLocalStorage() {
	if (!browser) return;
	try {
		const raw = localStorage.getItem(TOKEN_KEY);
		if (!raw) return;
		const { payload, sig } = JSON.parse(raw);
		if (!(await _hmacVerify(payload, sig))) { localStorage.removeItem(TOKEN_KEY); return; }
		const data = JSON.parse(atob(payload));
		if (Date.now() > data.expiry) { localStorage.removeItem(TOKEN_KEY); return; }
		_setAuth({ ...data, authMethod: data.authMethod ?? 'offline' });
	} catch { try { localStorage.removeItem(TOKEN_KEY); } catch { } }
}

async function _saveToken() {
	if (!browser) return;
	try {
		const cur = _auth;
		const data = { userId: cur.userId, email: cur.email, username: cur.username, firstName: cur.firstName, lastName: cur.lastName, phone: cur.phone, role: cur.role, villageId: cur.villageId, villageKey: cur.villageKey, villageDisplayName: cur.villageDisplayName, region: cur.region, language: cur.language, authMethod: cur.authMethod, expiry: Date.now() + SESSION_TTL };
		const payload = btoa(JSON.stringify(data));
		const sig = await _hmacSign(payload);
		localStorage.setItem(TOKEN_KEY, JSON.stringify({ payload, sig }));
	} catch { }
}

async function _hmacSign(data) {
	if (!browser || !crypto?.subtle) return btoa(data);
	const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(HMAC_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data));
	return Array.from(new Uint8Array(s)).map(b => b.toString(16).padStart(2,'0')).join('');
}
async function _hmacVerify(data, sig) { return (await _hmacSign(data)) === sig; }

// ── Search users ──────────────────────────────────────────────────
export async function searchUsers(query) {
	if (!browser) return [];
	const q = (query ?? '').trim().replace(/^@+/, '').toLowerCase();
	try {
		const { supabase } = await import('./supabase.js');
		if (!supabase) return [];

		// Empty query = load all users (for suggestions panel)
		if (!q) {
			const { data } = await supabase
				.from('ping_users')
				.select('id, username, first_name, last_name, village_key, village_name')
				.not('username', 'is', null)
				.order('created_at', { ascending: false })
				.limit(30);
			return data ?? [];
		}

		// Try the fast SQL function first
		const { data: rpcData, error: rpcErr } = await supabase
			.rpc('search_ping_users', { q });
		if (!rpcErr && rpcData) return rpcData;

		// Fallback: direct OR query
		const { data, error } = await supabase
			.from('ping_users')
			.select('id, username, first_name, last_name, village_key, village_name')
			.or(`username.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
			.order('username', { ascending: true })
			.limit(30);
		if (error) { console.warn('[Search]', error.message); return []; }
		return data ?? [];
	} catch(e) {
		console.warn('[Search] exception:', e.message);
		return [];
	}
}
