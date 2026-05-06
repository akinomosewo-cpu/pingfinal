// src/lib/bluetooth.js — compatibility shim
// Mesh logic moved to mesh.js (BLE + WebRTC + BroadcastChannel + localStorage).
// This file re-exports the original surface so existing imports still compile.

export {
	isBLESupported as isBluetoothSupported,
	buildSOSPacket,
	buildMsgPacket,
	getCurrentLocation,
	dialEmergency,
	meshState,
} from './mesh.js';

export const PING_SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb';
export const PING_CHAR_UUID    = '0000ff01-0000-1000-8000-00805f9b34fb';

export function broadcastPacket(packet) {
	if (typeof BroadcastChannel !== 'undefined') {
		try { new BroadcastChannel('ping_mesh').postMessage(packet); } catch { }
	}
}
export function listenBroadcast(onPacket) {
	if (typeof BroadcastChannel === 'undefined') return () => {};
	const bc = new BroadcastChannel('ping_mesh');
	bc.onmessage = e => onPacket(e.data);
	return () => bc.close();
}
export function drainOfflineQueue(onPacket) {
	try {
		const q = JSON.parse(localStorage.getItem('ping_mesh_queue') ?? '[]');
		q.forEach(onPacket);
		localStorage.removeItem('ping_mesh_queue');
	} catch { }
}
