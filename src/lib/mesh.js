// src/lib/mesh.js — P.I.N.G. Mesh v16
// BLE now uses BitChat-compatible UUIDs + acceptAllDevices fallback
// Real device names shown (no more "unknown")
// WebRTC signaling via Supabase Realtime cross-device
// BroadcastChannel local-tab fallback always ready

const isBrowser = typeof window !== 'undefined';

export function isBLESupported() {
	return isBrowser && !!navigator.bluetooth;
}
export function isWebRTCSupported() {
	return isBrowser && !!(window.RTCPeerConnection);
}

export const meshState = {
	transport: 'none',
	peers: [],
	connected: false,
	bleStatus: 'offline',
	rtcStatus: 'idle',
	error: '',
	log: [],
};

let _onPacket   = null;
let _username   = '';
let _villageKey = '';
let _bleDevice  = null;
let _bleChar    = null;
const _rtcPeers = new Map();
let _sigChannel = null;
let _supabase   = null;
let _sigSub     = null;
let _bc         = null;

// BitChat uses these UUIDs (from official spec)
const BITCHAT_SERVICE  = '0000f00d-1212-efde-1523-785fef13d123';
const BITCHAT_CHAR_TX  = '0000feed-1212-efde-1523-785fef13d123';
const BITCHAT_CHAR_RX  = '0000fea1-1212-efde-1523-785fef13d123';

// P.I.N.G. native service UUIDs (for PING<->PING)
const PING_SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb';
const PING_CHAR_UUID    = '0000ff01-0000-1000-8000-00805f9b34fb';

const enc = new TextEncoder();
const dec = new TextDecoder();

function _log(type, msg) {
	meshState.log = [{ type, msg, ts: Date.now() }, ...meshState.log.slice(0, 49)];
}
function _updateTransport() {
	if (_bleDevice?.gatt?.connected) { meshState.transport = 'ble'; return; }
	if (_rtcPeers.size > 0)          { meshState.transport = 'webrtc'; return; }
	if (_bc)                          { meshState.transport = 'broadcast'; return; }
	meshState.transport = 'storage';
}
function _deliver(pkt) {
	if (!_onPacket) return;
	if (pkt.from === _username) return;
	_onPacket(pkt);
}

// ── BLE: tries BitChat first, falls back to PING UUIDs, then presence-only ──
export async function bleConnect() {
	if (!isBLESupported()) {
		return { ok: false, error: 'Web Bluetooth not supported. Use Chrome on Android.' };
	}
	meshState.bleStatus = 'connecting';
	meshState.error = '';

	try {
		// Request ANY device — shows real device names to the user
		const device = await navigator.bluetooth.requestDevice({
			acceptAllDevices: true,
			optionalServices: [BITCHAT_SERVICE, PING_SERVICE_UUID],
		});

		_bleDevice = device;
		device.addEventListener('gattserverdisconnected', () => {
			meshState.bleStatus = 'offline';
			meshState.connected = false;
			meshState.peers = meshState.peers.filter(p => p.transport !== 'ble');
			_bleChar = null;
			_log('SYS', `${device.name ?? 'BLE peer'} disconnected`);
			_updateTransport();
		});

		const server = await device.gatt.connect();
		let charFound = false;

		// Try BitChat service first
		try {
			const svc = await server.getPrimaryService(BITCHAT_SERVICE);
			const charTx = await svc.getCharacteristic(BITCHAT_CHAR_TX);
			_bleChar = await svc.getCharacteristic(BITCHAT_CHAR_RX).catch(() => charTx);
			await _bleChar.startNotifications().catch(() => {});
			_bleChar.addEventListener('characteristicvaluechanged', e => {
				try { _deliver(JSON.parse(dec.decode(e.target.value))); } catch {}
			});
			charFound = true;
			_log('SYS', 'BitChat service found');
		} catch {}

		// Try PING service next
		if (!charFound) {
			try {
				const svc = await server.getPrimaryService(PING_SERVICE_UUID);
				_bleChar = await svc.getCharacteristic(PING_CHAR_UUID);
				await _bleChar.startNotifications().catch(() => {});
				_bleChar.addEventListener('characteristicvaluechanged', e => {
					try { _deliver(JSON.parse(dec.decode(e.target.value))); } catch {}
				});
				charFound = true;
				_log('SYS', 'PING service found');
			} catch {}
		}

		const peerName = device.name && device.name.trim() ? device.name : `BLE-${device.id.slice(-4)}`;

		meshState.bleStatus = 'connected';
		meshState.connected = true;
		meshState.peers = [...meshState.peers, {
			id: device.id,
			name: peerName,
			transport: 'ble',
			hasMesh: charFound,
		}];
		_log('SYS', `BLE connected: ${peerName}${charFound ? '' : ' (presence only)'}`);
		_updateTransport();
		return { ok: true, deviceName: peerName };
	} catch (e) {
		meshState.bleStatus = 'error';
		if (e.name === 'NotFoundError' || e.message?.includes('cancelled')) {
			meshState.error = 'No device selected — tap "Scan BLE" and pick a device.';
		} else if (e.name === 'SecurityError') {
			meshState.error = 'Bluetooth permission denied. Check browser settings.';
		} else {
			meshState.error = e.message ?? 'BLE connection failed';
		}
		return { ok: false, error: meshState.error };
	}
}

export function bleDisconnect() {
	if (_bleDevice?.gatt?.connected) _bleDevice.gatt.disconnect();
	_bleDevice = null; _bleChar = null;
	meshState.bleStatus = 'offline';
	meshState.peers = meshState.peers.filter(p => p.transport !== 'ble');
	_updateTransport();
}

async function _bleSend(pkt) {
	if (!_bleChar) return;
	try {
		const bytes = enc.encode(JSON.stringify(pkt));
		try { await _bleChar.writeValueWithResponse(bytes); }
		catch { await _bleChar.writeValueWithoutResponse(bytes); }
	} catch {}
}

// ── WebRTC ────────────────────────────────────────────────────────
const _myRtcId = Math.random().toString(36).slice(2, 10);

function _rtcConfig() {
	return {
		iceServers: [
			{ urls: 'stun:stun.l.google.com:19302' },
			{ urls: 'stun:stun1.l.google.com:19302' },
		]
	};
}

async function _createPeer(peerId, peerName, initiator) {
	if (_rtcPeers.has(peerId)) return _rtcPeers.get(peerId);
	const pc    = new RTCPeerConnection(_rtcConfig());
	const entry = { pc, dc: null, name: peerName ?? peerId };
	_rtcPeers.set(peerId, entry);

	pc.onicecandidate = e => {
		if (e.candidate) _signal({ type: 'ice', candidate: e.candidate, from: _myRtcId, to: peerId });
	};
	pc.onconnectionstatechange = () => {
		if (pc.connectionState === 'connected') {
			meshState.rtcStatus = 'connected';
			meshState.connected = true;
			if (!meshState.peers.find(p => p.id === peerId))
				meshState.peers = [...meshState.peers, { id: peerId, name: entry.name, transport: 'webrtc' }];
			_log('SYS', `WebRTC: ${entry.name}`);
			_updateTransport();
		} else if (['failed','disconnected','closed'].includes(pc.connectionState)) {
			_rtcPeers.delete(peerId);
			meshState.peers = meshState.peers.filter(p => p.id !== peerId);
			if (_rtcPeers.size === 0) meshState.rtcStatus = 'idle';
			_updateTransport();
		}
	};
	function _attachDC(dc) {
		entry.dc = dc;
		dc.onmessage = e => { try { _deliver(JSON.parse(e.data)); } catch {} };
	}
	if (initiator) {
		const dc = pc.createDataChannel('ping', { ordered: false, maxRetransmits: 2 });
		_attachDC(dc);
		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);
		_signal({ type: 'offer', sdp: offer, from: _myRtcId, fromName: _username, to: '*' });
	} else {
		pc.ondatachannel = e => _attachDC(e.channel);
	}
	return entry;
}

async function _handleSignal(msg) {
	if (!isWebRTCSupported()) return;
	if (msg.from === _myRtcId) return;
	if (msg.to && msg.to !== '*' && msg.to !== _myRtcId) return;

	if (msg.type === 'offer') {
		meshState.rtcStatus = 'signaling';
		const entry = await _createPeer(msg.from, msg.fromName, false);
		await entry.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
		const answer = await entry.pc.createAnswer();
		await entry.pc.setLocalDescription(answer);
		_signal({ type: 'answer', sdp: answer, from: _myRtcId, fromName: _username, to: msg.from });
	} else if (msg.type === 'answer') {
		const entry = _rtcPeers.get(msg.from);
		if (entry && entry.pc.signalingState !== 'stable')
			await entry.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
	} else if (msg.type === 'ice') {
		const entry = _rtcPeers.get(msg.from);
		if (entry) try { await entry.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch {}
	} else if (msg.type === 'announce') {
		if (!_rtcPeers.has(msg.from) && _myRtcId < msg.from) {
			meshState.rtcStatus = 'signaling';
			await _createPeer(msg.from, msg.fromName, true);
		}
	}
}

function _signal(msg) {
	if (_sigChannel) try { _sigChannel.postMessage(msg); } catch {}
	if (_supabase && _sigSub) {
		_sigSub.send({ type: 'broadcast', event: 'rtc-signal', payload: msg }).catch(() => {});
	}
}

export async function rtcAnnounce() {
	if (!isWebRTCSupported()) return { ok: false, error: 'WebRTC not supported' };
	_signal({ type: 'announce', from: _myRtcId, fromName: _username, village: _villageKey });
	return { ok: true };
}

export function rtcDisconnect() {
	for (const [, entry] of _rtcPeers) {
		try { entry.dc?.close(); entry.pc?.close(); } catch {}
	}
	_rtcPeers.clear();
	meshState.rtcStatus = 'idle';
	meshState.peers = meshState.peers.filter(p => p.transport !== 'webrtc');
	_updateTransport();
}

async function _rtcSend(pkt) {
	const data = JSON.stringify(pkt);
	for (const [, entry] of _rtcPeers) {
		if (entry.dc?.readyState === 'open') try { entry.dc.send(data); } catch {}
	}
}

// ── BroadcastChannel ─────────────────────────────────────────────
function _initBC(villageKey) {
	if (typeof BroadcastChannel === 'undefined') return;
	try {
		_bc = new BroadcastChannel(`ping_mesh_${villageKey}`);
		_bc.onmessage = ({ data }) => {
			if (data?._rtc) { _handleSignal(data); return; }
			_deliver(data);
		};
	} catch {}
}

function _bcSend(pkt) {
	if (_bc) try { _bc.postMessage(pkt); } catch {}
}

function _initSigChannel() {
	if (typeof BroadcastChannel === 'undefined') return;
	try {
		_sigChannel = new BroadcastChannel(`ping_rtc_sig_${_villageKey}`);
		_sigChannel.onmessage = ({ data }) => _handleSignal(data);
	} catch {}
}

// ── localStorage flash ────────────────────────────────────────────
function _lsSend(pkt) {
	if (typeof localStorage === 'undefined') return;
	try { localStorage.setItem('ping_mesh_flash', JSON.stringify({ ...pkt, _ts: Date.now() })); } catch {}
}

function _initLS() {
	if (typeof window === 'undefined') return;
	window.addEventListener('storage', e => {
		if (e.key !== 'ping_mesh_flash') return;
		try {
			const pkt = JSON.parse(e.newValue ?? '');
			if (Date.now() - (pkt._ts ?? 0) > 10000) return;
			_deliver(pkt);
		} catch {}
	});
}

// ── Supabase signaling ────────────────────────────────────────────
async function _initSupabaseSignaling(villageKey) {
	try {
		const { supabase, isSupabaseReady } = await import('./supabase.js');
		if (!isSupabaseReady || !supabase) return;
		_supabase = supabase;
		_sigSub = supabase.channel(`ping-rtc-${villageKey}`);
		_sigSub.on('broadcast', { event: 'rtc-signal' }, ({ payload }) => _handleSignal(payload));
		_sigSub.subscribe();
	} catch {}
}

// ── Main API ──────────────────────────────────────────────────────
export async function meshInit(username, villageKey, onPacket) {
	_username   = username;
	_villageKey = villageKey;
	_onPacket   = onPacket;
	_initBC(villageKey);
	_initSigChannel();
	_initLS();
	await _initSupabaseSignaling(villageKey);
	_updateTransport();
	_log('SYS', 'Mesh initialized');
}

export async function meshSend(pkt) {
	const full = { ...pkt, from: _username, village: _villageKey, ts: pkt.ts ?? Date.now() };
	await _bleSend(full);
	await _rtcSend(full);
	_bcSend(full);
	_lsSend(full);
}

export function meshDestroy() {
	bleDisconnect();
	rtcDisconnect();
	try { _bc?.close(); } catch {}
	try { _sigChannel?.close(); } catch {}
	try { _sigSub?.unsubscribe(); } catch {}
	_bc = null; _sigChannel = null; _sigSub = null; _supabase = null; _onPacket = null;
	meshState.transport = 'none'; meshState.connected = false;
	meshState.peers = []; meshState.log = [];
}

export function buildSOSPacket(user, location) {
	return {
		type: 'SOS',
		from: user.username ?? user.firstName,
		name: `${user.firstName} ${user.lastName}`,
		lat:  location?.lat ?? null,
		lng:  location?.lng ?? null,
		msg:  '🚨 EMERGENCY — SOS activated',
		ts:   Date.now(),
		village: user.villageKey
	};
}

export function buildMsgPacket(user, text) {
	return { type: 'MSG', from: user.username ?? user.firstName, msg: text, ts: Date.now(), village: user.villageKey };
}

export function getCurrentLocation() {
	return new Promise(resolve => {
		if (!isBrowser || !navigator.geolocation) { resolve(null); return; }
		navigator.geolocation.getCurrentPosition(
			p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
			() => resolve(null),
			{ enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
		);
	});
}

export function dialEmergency() {
	if (isBrowser) window.open('tel:199');
}

export function getMeshCapabilities() {
	return {
		ble:       isBLESupported(),
		webrtc:    isWebRTCSupported(),
		broadcast: typeof BroadcastChannel !== 'undefined',
		storage:   typeof localStorage !== 'undefined',
	};
}
