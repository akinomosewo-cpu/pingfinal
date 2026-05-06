import { createClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL  ?? '';
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseReady = !!(SUPA_URL && SUPA_KEY);

export const supabase = (isSupabaseReady && browser)
	? createClient(SUPA_URL, SUPA_KEY, {
		auth: {
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: true,
			flowType: 'pkce'
		},
		realtime: { timeout: 10000 }
	})
	: null;

export async function validateVillageKeyRemote(key) {
	if (!supabase) return { valid: false };
	try {
		const { data, error } = await supabase
			.from('village_keys')
			.select('village_id, village_name')
			.eq('key', key.toUpperCase().trim())
			.single();
		if (error || !data) return { valid: false };
		return { valid: true, villageId: data.village_id, villageName: data.village_name };
	} catch { return { valid: false }; }
}
