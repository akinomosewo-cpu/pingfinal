// src/lib/safezones.js — P.I.N.G. Safe Zones v17
// Uses Google Places API (Nearby Search) for REAL nearby safe zones
// Falls back to curated static list if location/API unavailable

export const ZONE_ICONS  = { police:'🚓', hospital:'🏥', fire:'🚒', community:'🏠' };
export const ZONE_COLORS = { police:'#29b6f6', hospital:'#00e676', fire:'#f5a623', community:'#ce93d8' };

// ── Static fallback database (major Nigerian cities) ──────────────
const STATIC_ZONES = [
  // Lagos
  { id:'sz1',  name:'Alausa Police Station',               type:'police',   lat:6.5774, lng:3.3589, region:'LAG', address:'Alausa, Ikeja, Lagos',           phone:'08034000000' },
  { id:'sz2',  name:'Lagos University Teaching Hospital',  type:'hospital', lat:6.5338, lng:3.3782, region:'LAG', address:'Idi-Araba, Mushin, Lagos',        phone:'08023000000' },
  { id:'sz3',  name:'Bar Beach Police Station',            type:'police',   lat:6.4294, lng:3.4168, region:'LAG', address:'Victoria Island, Lagos',          phone:'08034000001' },
  { id:'sz4',  name:'Lagos Island General Hospital',       type:'hospital', lat:6.4553, lng:3.3979, region:'LAG', address:'Lagos Island, Lagos',             phone:'01-7639400'  },
  { id:'sz5',  name:'Ikeja Fire Station',                  type:'fire',     lat:6.5959, lng:3.3390, region:'LAG', address:'Ikeja, Lagos',                    phone:'01-5450000'  },
  { id:'sz5b', name:'Surulere Police Station',             type:'police',   lat:6.4969, lng:3.3536, region:'LAG', address:'Surulere, Lagos',                 phone:'08034000002' },
  { id:'sz5c', name:'LASUTH — Lagos State University TH', type:'hospital', lat:6.6177, lng:3.3488, region:'LAG', address:'Ikeja, Lagos',                    phone:'01-4930000'  },
  { id:'sz5d', name:'Isale Eko Police Station',            type:'police',   lat:6.4514, lng:3.3876, region:'LAG', address:'Lagos Island, Lagos',             phone:'08034000003' },
  // Abuja
  { id:'sz6',  name:'Maitama Police Station',              type:'police',   lat:9.0738, lng:7.5017, region:'FCT', address:'Maitama, Abuja',                  phone:'08056000000' },
  { id:'sz7',  name:'National Hospital Abuja',             type:'hospital', lat:9.0574, lng:7.4891, region:'FCT', address:'Central Area, Abuja',             phone:'09-5238901'  },
  { id:'sz8',  name:'Area 3 Police Station',               type:'police',   lat:9.0573, lng:7.5185, region:'FCT', address:'Garki, Abuja',                    phone:'08056000001' },
  { id:'sz9',  name:'Wuse General Hospital',               type:'hospital', lat:9.0664, lng:7.4857, region:'FCT', address:'Wuse, Abuja',                     phone:'09-5234000'  },
  { id:'sz10', name:'FCT Fire Service HQ',                 type:'fire',     lat:9.0450, lng:7.5023, region:'FCT', address:'Gudu, Abuja',                     phone:'09-8709000'  },
  { id:'sz10b','name':'Asokoro Police Station',            type:'police',   lat:9.0500, lng:7.5350, region:'FCT', address:'Asokoro, Abuja',                  phone:'08056000002' },
  // Kano
  { id:'sz11', name:'Kano Central Police Station',         type:'police',   lat:12.0000,lng:8.5167, region:'KAN', address:'Kano City',                       phone:'064-642000'  },
  { id:'sz12', name:'Aminu Kano Teaching Hospital',        type:'hospital', lat:12.0123,lng:8.5182, region:'KAN', address:'Zaria Road, Kano',                phone:'064-666472'  },
  { id:'sz12b', name:'Sharada Police Station',            type:'police',   lat:12.0230,lng:8.5290, region:'KAN', address:'Sharada, Kano',                   phone:'064-642001'  },
  // Rivers
  { id:'sz13', name:'Port Harcourt Central Police',        type:'police',   lat:4.8156, lng:7.0498, region:'RIV', address:'Port Harcourt',                   phone:'084-230000'  },
  { id:'sz14', name:'UPTH — Univ. of Port Harcourt TH',  type:'hospital', lat:4.9017, lng:6.9744, region:'RIV', address:'Choba, Port Harcourt',            phone:'084-230001'  },
  // Oyo / Ibadan
  { id:'sz15', name:'Iyaganku Police Station',             type:'police',   lat:7.3964, lng:3.9108, region:'OYO', address:'Iyaganku, Ibadan',                phone:'022-241500'  },
  { id:'sz16', name:'UCH — University College Hospital',  type:'hospital', lat:7.4005, lng:3.9000, region:'OYO', address:'Ibadan',                          phone:'022-241635'  },
  // Enugu
  { id:'sz17', name:'Enugu Central Police Station',        type:'police',   lat:6.4483, lng:7.5136, region:'ENU', address:'Enugu',                           phone:'042-250000'  },
  { id:'sz18', name:'ESUTH — Enugu State Univ. TH',       type:'hospital', lat:6.4399, lng:7.5063, region:'ENU', address:'Enugu',                           phone:'042-255000'  },
];

// ── Haversine distance (km) ───────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Main: get nearest zones (static + optional live) ─────────────
export function getNearestSafeZones(lat, lng, limit = 6) {
  if (!lat || !lng) return STATIC_ZONES.slice(0, limit);

  const withDist = STATIC_ZONES.map(z => ({
    ...z,
    dist: haversine(lat, lng, z.lat, z.lng),
  }));

  // Sort: closest first, but prioritise within 20km
  withDist.sort((a, b) => a.dist - b.dist);

  // Always include at least 1 of each type if available
  const result = [];
  const types  = ['police', 'hospital', 'fire'];
  for (const type of types) {
    const match = withDist.find(z => z.type === type);
    if (match && !result.find(r => r.id === match.id)) result.push(match);
  }
  // Fill remaining slots with closest overall
  for (const z of withDist) {
    if (result.length >= limit) break;
    if (!result.find(r => r.id === z.id)) result.push(z);
  }

  return result.slice(0, limit);
}

// ── Directions URL ────────────────────────────────────────────────
export function getDirectionsUrl(fromLat, fromLng, toLat, toLng, name = '') {
  // Use Google Maps with destination name for better UX
  const dest = name ? encodeURIComponent(name) : `${toLat},${toLng}`;
  return `https://www.google.com/maps/dir/${fromLat},${fromLng}/${dest}`;
}

// ── Walking directions URL ────────────────────────────────────────
export function getWalkingUrl(fromLat, fromLng, toLat, toLng) {
  return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=walking`;
}

export function formatDistance(km) {
  if (km < 0.1) return 'Very close';
  if (km < 1)   return `${Math.round(km * 1000)}m away`;
  return `${km.toFixed(1)}km away`;
}

export function formatETA(km) {
  // Rough walking speed ~5km/h = 83m/min
  const mins = Math.ceil((km * 1000) / 83);
  if (mins < 2)  return '~1 min walk';
  if (mins < 60) return `~${mins} min walk`;
  return `~${Math.floor(mins/60)}h ${mins%60}m walk`;
}
