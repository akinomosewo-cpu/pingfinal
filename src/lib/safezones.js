// src/lib/safezones.js — P.I.N.G. Safe Zones Database

// Safe zones by Nigerian region (police stations, hospitals, fire stations, etc.)
export const SAFE_ZONES = [
  // Lagos
  { id:'sz1', name:'Alausa Police Station', type:'police', lat:6.5774, lng:3.3589, region:'LAG', address:'Alausa, Ikeja, Lagos' },
  { id:'sz2', name:'Lagos University Teaching Hospital', type:'hospital', lat:6.5338, lng:3.3782, region:'LAG', address:'Idi-Araba, Mushin, Lagos' },
  { id:'sz3', name:'Bar Beach Police Station', type:'police', lat:6.4294, lng:3.4168, region:'LAG', address:'Victoria Island, Lagos' },
  { id:'sz4', name:'Lagos Island General Hospital', type:'hospital', lat:6.4553, lng:3.3979, region:'LAG', address:'Lagos Island, Lagos' },
  { id:'sz5', name:'Ikeja Fire Station', type:'fire', lat:6.5959, lng:3.3390, region:'LAG', address:'Ikeja, Lagos' },
  // Abuja
  { id:'sz6', name:'Maitama Police Station', type:'police', lat:9.0738, lng:7.5017, region:'FCT', address:'Maitama, Abuja' },
  { id:'sz7', name:'National Hospital Abuja', type:'hospital', lat:9.0574, lng:7.4891, region:'FCT', address:'Central Area, Abuja' },
  { id:'sz8', name:'Area 3 Police Station', type:'police', lat:9.0573, lng:7.5185, region:'FCT', address:'Area 3, Garki, Abuja' },
  { id:'sz9', name:'Wuse General Hospital', type:'hospital', lat:9.0664, lng:7.4857, region:'FCT', address:'Wuse, Abuja' },
  { id:'sz10', name:'FCT Fire Service HQ', type:'fire', lat:9.0450, lng:7.5023, region:'FCT', address:'Gudu, Abuja' },
  // Kano
  { id:'sz11', name:'Kano Central Police Station', type:'police', lat:12.0000, lng:8.5167, region:'KAN', address:'Kano City, Kano' },
  { id:'sz12', name:'Aminu Kano Teaching Hospital', type:'hospital', lat:12.0123, lng:8.5182, region:'KAN', address:'Zaria Road, Kano' },
  // Rivers
  { id:'sz13', name:'Port Harcourt Central Police', type:'police', lat:4.8156, lng:7.0498, region:'RIV', address:'Port Harcourt, Rivers' },
  { id:'sz14', name:'University of Port Harcourt Teaching Hospital', type:'hospital', lat:4.9017, lng:6.9744, region:'RIV', address:'Choba, Port Harcourt' },
  // Generic fallbacks
  { id:'sz15', name:'Nearest Police Station', type:'police', lat:9.0820, lng:7.5058, region:'NG', address:'Nigeria' },
  { id:'sz16', name:'Nearest Hospital', type:'hospital', lat:9.0700, lng:7.4950, region:'NG', address:'Nigeria' },
];

export const ZONE_ICONS = {
  police: '🚓',
  hospital: '🏥',
  fire: '🚒',
  community: '🏠',
};

export const ZONE_COLORS = {
  police: '#29b6f6',
  hospital: '#00e676',
  fire: '#f5a623',
  community: '#ce93d8',
};

export function getNearestSafeZones(lat, lng, limit = 5) {
  if (!lat || !lng) return SAFE_ZONES.slice(0, limit);
  return SAFE_ZONES
    .map(z => ({ ...z, dist: haversine(lat, lng, z.lat, z.lng) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit);
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function getDirectionsUrl(fromLat, fromLng, toLat, toLng) {
  return `https://www.google.com/maps/dir/${fromLat},${fromLng}/${toLat},${toLng}`;
}

export function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}
