// src/lib/location.js — Real-time GPS + Nigerian region grouping (browser-only)

const NIGERIA_REGIONS = [
	{ name: 'Lagos',       key: 'LAG', lat: [6.3,  6.8],  lng: [2.7,  3.8]  },
	{ name: 'Abuja (FCT)', key: 'FCT', lat: [8.8,  9.3],  lng: [7.0,  7.6]  },
	{ name: 'Kano',        key: 'KAN', lat: [11.8, 12.3], lng: [8.3,  8.8]  },
	{ name: 'Kaduna',      key: 'KAD', lat: [10.3, 10.7], lng: [7.3,  7.7]  },
	{ name: 'Rivers',      key: 'RIV', lat: [4.6,  5.1],  lng: [6.8,  7.3]  },
	{ name: 'Oyo',         key: 'OYO', lat: [7.3,  7.9],  lng: [3.8,  4.3]  },
	{ name: 'Anambra',     key: 'ANA', lat: [5.9,  6.4],  lng: [6.7,  7.2]  },
	{ name: 'Enugu',       key: 'ENU', lat: [6.3,  6.8],  lng: [7.3,  7.8]  },
	{ name: 'Zamfara',     key: 'ZAM', lat: [11.7, 12.7], lng: [6.0,  7.0]  },
	{ name: 'Borno',       key: 'BOR', lat: [11.0, 13.9], lng: [12.0, 15.0] },
	{ name: 'Delta',       key: 'DEL', lat: [5.2,  6.0],  lng: [5.8,  6.8]  },
	{ name: 'Sokoto',      key: 'SOK', lat: [12.5, 13.5], lng: [4.8,  6.0]  },
	{ name: 'Ogun',        key: 'OGU', lat: [6.6,  7.4],  lng: [2.9,  3.9]  },
	{ name: 'Imo',         key: 'IMO', lat: [5.2,  5.8],  lng: [6.9,  7.4]  },
	{ name: 'Katsina',     key: 'KAT', lat: [12.0, 13.5], lng: [7.0,  9.0]  },
];

export function getRegionFromCoords(lat, lng) {
	for (const r of NIGERIA_REGIONS) {
		if (lat >= r.lat[0] && lat <= r.lat[1] && lng >= r.lng[0] && lng <= r.lng[1]) {
			return { name: r.name, key: r.key };
		}
	}
	const gl = Math.floor(lat * 2) / 2;
	const gg = Math.floor(lng * 2) / 2;
	return { name: `Region ${gl}°N ${gg}°E`, key: `R${Math.abs(gl)}${Math.abs(gg)}`.replace('.','') };
}

export function generateVillageKey(region, userId) {
	const prefix = (region?.key ?? 'NG').slice(0, 3).toUpperCase();
	const suffix = String(userId ?? Date.now()).slice(-4);
	return `${prefix}${suffix}`;
}

let watchId = null;

export function startLocationWatch(onUpdate) {
	if (typeof navigator === 'undefined' || !navigator.geolocation) {
		onUpdate?.({ lat: null, lng: null, accuracy: null, region: null, error: 'Geolocation not supported', lastUpdated: null });
		return;
	}
	navigator.geolocation.getCurrentPosition(
		pos => _handle(pos, onUpdate),
		err => onUpdate?.({ lat: null, lng: null, accuracy: null, region: null, error: err.message, lastUpdated: null }),
		{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
	);
	watchId = navigator.geolocation.watchPosition(
		pos => _handle(pos, onUpdate),
		err => onUpdate?.({ lat: null, lng: null, accuracy: null, region: null, error: err.message, lastUpdated: null }),
		{ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
	);
}

export function stopLocationWatch() {
	if (watchId !== null && typeof navigator !== 'undefined') {
		navigator.geolocation.clearWatch(watchId);
		watchId = null;
	}
}

function _handle(pos, onUpdate) {
	const lat = pos.coords.latitude;
	const lng = pos.coords.longitude;
	onUpdate?.({
		lat, lng,
		accuracy: Math.round(pos.coords.accuracy),
		region: getRegionFromCoords(lat, lng),
		error: null,
		lastUpdated: new Date()
	});
}

export function formatCoord(val, isLat) {
	if (val === null || val === undefined) return '—';
	const abs = Math.abs(val).toFixed(6);
	const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
	return `${abs}° ${dir}`;
}
