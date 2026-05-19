// src/lib/location.js — P.I.N.G. v20
// Abuja split into 8 sub-districts, all other major states split into 2+
// Village key = district code (e.g. FCT-GWA = Gwarimpa, Abuja)
// Community chat scoped to village key — location change triggers re-assignment

const DISTRICTS = [
  // ── ABUJA / FCT ── 8 districts
  { name:'Gwarimpa',       code:'FCT-GWA', region:'Abuja (FCT)', lat:[9.06,9.12],  lng:[7.38,7.48] },
  { name:'Wuse / Maitama', code:'FCT-WUS', region:'Abuja (FCT)', lat:[9.05,9.09],  lng:[7.46,7.52] },
  { name:'Garki / CBD',    code:'FCT-GAR', region:'Abuja (FCT)', lat:[9.01,9.06],  lng:[7.47,7.53] },
  { name:'Kubwa',          code:'FCT-KUB', region:'Abuja (FCT)', lat:[9.10,9.18],  lng:[7.30,7.40] },
  { name:'Asokoro',        code:'FCT-ASO', region:'Abuja (FCT)', lat:[9.02,9.07],  lng:[7.52,7.58] },
  { name:'Karu / Nyanya',  code:'FCT-KAR', region:'Abuja (FCT)', lat:[8.96,9.04],  lng:[7.54,7.62] },
  { name:'Lugbe / Airport',code:'FCT-LUG', region:'Abuja (FCT)', lat:[8.95,9.02],  lng:[7.40,7.50] },
  { name:'Bwari Area',     code:'FCT-BWA', region:'Abuja (FCT)', lat:[9.08,9.20],  lng:[7.24,7.38] },

  // ── LAGOS ── 6 districts
  { name:'Lagos Island',   code:'LAG-ISL', region:'Lagos',       lat:[6.42,6.50],  lng:[3.37,3.45] },
  { name:'Victoria Island',code:'LAG-VIS', region:'Lagos',       lat:[6.40,6.45],  lng:[3.40,3.48] },
  { name:'Ikeja / Surulere',code:'LAG-IKJ',region:'Lagos',       lat:[6.50,6.64],  lng:[3.30,3.40] },
  { name:'Lekki',          code:'LAG-LEK', region:'Lagos',       lat:[6.42,6.48],  lng:[3.47,3.68] },
  { name:'Alimosho / Agege',code:'LAG-ALI',region:'Lagos',       lat:[6.55,6.70],  lng:[3.25,3.35] },
  { name:'Ikorodu / Badagry',code:'LAG-IKO',region:'Lagos',      lat:[6.50,6.75],  lng:[3.48,3.75] },

  // ── KANO ── 3 districts
  { name:'Kano Central',   code:'KAN-CEN', region:'Kano',        lat:[11.96,12.05],lng:[8.49,8.56] },
  { name:'Kano North',     code:'KAN-NOR', region:'Kano',        lat:[12.05,12.15],lng:[8.46,8.55] },
  { name:'Kano South',     code:'KAN-SOU', region:'Kano',        lat:[11.85,11.96],lng:[8.47,8.56] },

  // ── RIVERS / PORT HARCOURT ── 3 districts
  { name:'Port Harcourt Central',code:'RIV-PHC',region:'Rivers', lat:[4.76,4.85],  lng:[6.98,7.07] },
  { name:'Obio-Akpor',     code:'RIV-OBI', region:'Rivers',      lat:[4.82,4.92],  lng:[6.97,7.06] },
  { name:'Rivers North',   code:'RIV-NOR', region:'Rivers',      lat:[4.92,5.10],  lng:[6.80,7.10] },

  // ── OYO / IBADAN ── 3 districts
  { name:'Ibadan Central', code:'OYO-IBC', region:'Oyo',         lat:[7.35,7.43],  lng:[3.86,3.95] },
  { name:'Ibadan North',   code:'OYO-IBN', region:'Oyo',         lat:[7.43,7.55],  lng:[3.88,3.97] },
  { name:'Oyo / Ogbomosho',code:'OYO-OYO', region:'Oyo',         lat:[7.60,7.95],  lng:[3.90,4.30] },

  // ── KADUNA ── 2 districts
  { name:'Kaduna North',   code:'KAD-NOR', region:'Kaduna',      lat:[10.55,10.70],lng:[7.40,7.55] },
  { name:'Kaduna South',   code:'KAD-SOU', region:'Kaduna',      lat:[10.38,10.55],lng:[7.38,7.52] },

  // ── ZAMFARA ── 2 districts
  { name:'Gusau',          code:'ZAM-GUS', region:'Zamfara',     lat:[12.10,12.25],lng:[6.60,6.75] },
  { name:'Zamfara Rural',  code:'ZAM-RUR', region:'Zamfara',     lat:[11.70,12.10],lng:[6.00,7.00] },

  // ── ENUGU ── 2 districts
  { name:'Enugu City',     code:'ENU-CIT', region:'Enugu',       lat:[6.40,6.50],  lng:[7.47,7.55] },
  { name:'Enugu East',     code:'ENU-EAS', region:'Enugu',       lat:[6.28,6.40],  lng:[7.45,7.65] },

  // ── ANAMBRA ── 2 districts
  { name:'Onitsha',        code:'ANA-ONI', region:'Anambra',     lat:[6.12,6.18],  lng:[6.77,6.84] },
  { name:'Awka',           code:'ANA-AWK', region:'Anambra',     lat:[6.18,6.26],  lng:[7.03,7.10] },
];

// State-level fallback bounding boxes
const STATE_BOUNDS = [
  { region:'Lagos',       key:'LAG', lat:[6.3,6.8],   lng:[2.7,3.8]  },
  { region:'Abuja (FCT)', key:'FCT', lat:[8.8,9.3],   lng:[7.0,7.6]  },
  { region:'Kano',        key:'KAN', lat:[11.8,12.3], lng:[8.3,8.8]  },
  { region:'Kaduna',      key:'KAD', lat:[10.3,10.7], lng:[7.3,7.7]  },
  { region:'Rivers',      key:'RIV', lat:[4.6,5.1],   lng:[6.8,7.3]  },
  { region:'Oyo',         key:'OYO', lat:[7.3,7.9],   lng:[3.8,4.3]  },
  { region:'Anambra',     key:'ANA', lat:[5.9,6.4],   lng:[6.7,7.2]  },
  { region:'Enugu',       key:'ENU', lat:[6.3,6.8],   lng:[7.3,7.8]  },
  { region:'Zamfara',     key:'ZAM', lat:[11.7,12.7], lng:[6.0,7.0]  },
  { region:'Borno',       key:'BOR', lat:[11.0,13.9], lng:[12.0,15.0]},
  { region:'Delta',       key:'DEL', lat:[5.2,6.0],   lng:[5.8,6.8]  },
  { region:'Sokoto',      key:'SOK', lat:[12.5,13.5], lng:[4.8,6.0]  },
  { region:'Ogun',        key:'OGU', lat:[6.6,7.4],   lng:[2.9,3.9]  },
  { region:'Imo',         key:'IMO', lat:[5.2,5.8],   lng:[6.9,7.4]  },
  { region:'Katsina',     key:'KAT', lat:[12.0,13.5], lng:[7.0,9.0]  },
];

export function getDistrictFromCoords(lat, lng) {
  // Try precise district first
  for (const d of DISTRICTS) {
    if (lat >= d.lat[0] && lat <= d.lat[1] && lng >= d.lng[0] && lng <= d.lng[1]) {
      return { name: d.name, code: d.code, region: d.region };
    }
  }
  // Fall back to state
  for (const s of STATE_BOUNDS) {
    if (lat >= s.lat[0] && lat <= s.lat[1] && lng >= s.lng[0] && lng <= s.lng[1]) {
      return { name: s.region, code: s.key, region: s.region };
    }
  }
  // Absolute fallback — grid cell
  const gl = Math.floor(lat * 2) / 2;
  const gg = Math.floor(lng * 2) / 2;
  const code = `NG${Math.abs(gl).toFixed(0)}${Math.abs(gg).toFixed(0)}`;
  return { name: `Nigeria ${gl}°N`, code, region: 'Nigeria' };
}

// Keep backward compat
export function getRegionFromCoords(lat, lng) {
  const d = getDistrictFromCoords(lat, lng);
  return { name: d.region, key: d.code };
}

export function generateVillageKey(region, userId) {
  const prefix = (region?.key ?? region?.code ?? 'NG').slice(0, 7).toUpperCase();
  const suffix = String(userId ?? Date.now()).replace(/-/g,'').slice(-4);
  return `${prefix}${suffix}`;
}

// Village display label
export function getVillageLabel(districtCode) {
  const d = DISTRICTS.find(x => x.code === districtCode);
  if (d) return `${d.name}, ${d.region}`;
  const s = STATE_BOUNDS.find(x => x.key === districtCode);
  if (s) return s.region;
  return districtCode;
}

let watchId = null;

export function startLocationWatch(onUpdate) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onUpdate?.({ lat:null, lng:null, accuracy:null, district:null, region:null, error:'Geolocation not supported', lastUpdated:null });
    return;
  }
  const opts = { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 };
  const handle = (pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const district = getDistrictFromCoords(lat, lng);
    onUpdate?.({ lat, lng, accuracy: Math.round(pos.coords.accuracy), district, region: { name: district.region, key: district.code }, error: null, lastUpdated: new Date() });
  };
  const err = (e) => onUpdate?.({ lat:null, lng:null, accuracy:null, district:null, region:null, error:e.message, lastUpdated:null });
  navigator.geolocation.getCurrentPosition(handle, err, opts);
  watchId = navigator.geolocation.watchPosition(handle, err, opts);
}

export function stopLocationWatch() {
  if (watchId !== null && typeof navigator !== 'undefined') {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

export function formatCoord(val, isLat) {
  if (val === null || val === undefined) return '—';
  const abs = Math.abs(val).toFixed(6);
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${abs}° ${dir}`;
}
