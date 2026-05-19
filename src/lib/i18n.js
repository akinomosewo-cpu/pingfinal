// i18n.js v24 — Complete translations covering ALL text in the app
import { writable } from 'svelte/store';

const LANG_KEY = 'ping_lang_v3';

function _load() {
  if (typeof localStorage === 'undefined') return 'en';
  return localStorage.getItem(LANG_KEY) ?? 'en';
}

export const i18n = writable({ lang: _load() });

export function loadLang() {
  if (typeof localStorage === 'undefined') return;
  const saved = localStorage.getItem(LANG_KEY) ?? 'en';
  i18n.set({ lang: saved });
}

export async function setLang(code) {
  if (!code) return;
  i18n.set({ lang: code });
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(LANG_KEY, code); } catch {}
  }
  try {
    const { supabase, isSupabaseReady } = await import('./supabase.js');
    const { userAuth } = await import('./auth.svelte.js');
    let uid = null;
    userAuth.subscribe(a => uid = a.userId)();
    if (isSupabaseReady && supabase && uid) {
      await supabase.from('ping_users').update({ language: code }).eq('id', uid);
    }
  } catch {}
}

export function t(lang, key) {
  return translations[lang]?.[key] ?? translations['en']?.[key] ?? key;
}

const base = {
  // App
  appName: 'P.I.N.G.', appSub: 'Protection In Nigeria',
  // Auth
  signUp: 'Sign Up', logIn: 'Log In', joinPing: 'Join P.I.N.G.',
  welcomeBack: 'Welcome back', createAccount: 'Create account →',
  signIn: 'Sign in →', googleSignIn: 'Continue with Google',
  firstName: 'First name', lastName: 'Last name', email: 'Email address',
  password: 'Password', phone: 'Phone', role: 'Role',
  resident: 'Resident', vanguard: 'Community Vanguard',
  haveAccount: 'Have an account?', noAccount: 'No account?',
  min8chars: 'min 8 chars', createStrongPw: 'Create a strong password',
  yourPassword: 'Your password', passwordMin: 'Password must be at least 8 characters.',
  chooseLanguage: 'Choose your language',
  langDesc: "Select the language you'd like to use.",
  continue: 'Continue →', returnCalc: '← Return to calculator',
  // Location
  locationTitle: 'Your location',
  locationDesc: 'P.I.N.G. groups you with nearby people using your area.',
  allowLocation: '📍 Allow location access', gettingLocation: 'Getting location…',
  skipLocation: 'Skip (use Nigeria as region)',
  // Trust
  trustDevice: 'Trust this device?',
  trustDesc: 'Staying logged in keeps P.I.N.G. ready for emergencies.',
  alwaysTrust: 'Always trust', trustOnce: 'Trust once',
  // Dashboard
  protected: "You're protected!", loading: 'Loading dashboard…',
  // SOS
  holdSOS: 'Press to call 112', calling: 'Calling 112…',
  sosActivated: '🚨 SOS Activated', called112: 'Emergency called • Contacts notified',
  if112NoAnswer: '📞 If 112 doesn\'t answer, tap next:',
  notifyContacts: '💚 Notify your emergency contacts:',
  addContacts: '💡 Add emergency contacts in Safety → 🆘 Contacts',
  // Nav tabs
  alerts: 'Alerts', map: 'Map', chat: 'Chat', safety: 'Safety',
  // Alerts
  communityAlerts: 'Community Alerts', markRead: 'Mark read',
  noAlerts: 'No alerts — your area is safe',
  onlineInArea: 'Online in your area',
  // Map
  myLocation: '📍 My Location', safeZones: '🛡️ Safe Zones',
  gpsActive: 'GPS Active', accuracy: 'Accuracy',
  enableGPS: 'Enable GPS', gettingGPS: 'Getting GPS…',
  gpsRequired: 'Location Required',
  gpsDesc: 'P.I.N.G. needs your location to show nearby safe zones and group you with your community.',
  nearestSafeZones: 'Nearest Safe Zones',
  noZones: 'No safe zones found nearby.',
  away: 'away', walkMin: 'min walk',
  // Chat
  communityChat: 'Community', privateDMs: 'Private DMs',
  messageComm: 'Message your community…', messageDM: 'Message',
  noMessages: 'No messages yet — say hello.',
  noDMs: 'No private chats yet.',
  startDM: 'Tap + to search and DM someone by username.',
  online: 'online', typing: 'typing…',
  searchUsers: 'Search by name or @username…',
  peopleArea: 'People in your area', results: 'Results',
  noUsersFound: 'No users found.',
  typeToSearch: 'Type a name or @username to search',
  sending: 'sending', delivered: '✓✓', offline: '💾',
  // Safety tab sections
  safetyTools: 'Safety Tools', emergencyContacts: 'Emergency Contacts',
  profileSettings: 'Profile', meshNetwork: 'Mesh',
  // Fake call
  fakeCall: 'Fake Incoming Call',
  fakeCallDesc: 'Simulate a call to exit an uncomfortable situation',
  triggerNow: '📞 Trigger Now', customise: 'Customise…',
  callerName: 'Caller name', startFakeCall: '📞 Start Fake Call',
  cancel: 'Cancel',
  // Check-in
  checkIn: 'Check-In Reminders',
  checkInDesc: 'Periodic prompts to confirm you\'re safe',
  checkInEvery: 'Check-in every', startCheckIn: '✅ Start Check-Ins',
  stopCheckIn: 'Stop', active: 'Active', everyMin: 'min',
  lastCheckIn: 'Last',
  min15: '15 minutes', min30: '30 minutes', hr1: '1 hour', hr2: '2 hours',
  // Emergency numbers
  emergencyNumbers: 'Emergency Numbers',
  emergencyDesc: 'Nigeria emergency services — one tap',
  safetyGuide: '📋 Full Safety Guide →',
  installApp: '📲 Install P.I.N.G. →',
  // Contacts
  sosContactsInfo: 'When you press SOS, these people get a WhatsApp message with your location — free, instant.',
  noContacts: 'No contacts yet',
  addTrusted: 'Add someone trusted below',
  addContact: '+ Add Contact',
  fullName: 'Full name *',
  whatsappPhone: 'WhatsApp / Phone *',
  relationship: 'Relationship',
  notifyOnSOS: 'Notify when I press SOS',
  saveContact: '💾 Save Contact', saving: 'Saving…',
  relFamily: 'Family', relFriend: 'Friend', relPartner: 'Partner',
  relNeighbour: 'Neighbour', relColleague: 'Colleague', relOther: 'Other',
  howNotify: 'How notifications work',
  howNotifyBody: 'When you press SOS, P.I.N.G. automatically opens WhatsApp to your first contact with your GPS location.',
  // Profile
  yourChatUsername: 'YOUR CHAT USERNAME',
  shareUsername: 'Share this so others can DM you in chat',
  fullNameLabel: 'Name', emailLabel: 'Email', regionLabel: 'Region',
  villageKey: 'Village Key', villageKeyInfo: 'Sent to email 📧',
  language: 'Language',
  // Security
  session: 'Session', authMethod: 'Auth method', encryption: 'Encryption',
  logOut: 'Log Out', confirmLogout: 'Are you sure?',
  yesLogOut: 'Yes, log out',
  // Mesh
  transport: 'Transport', peers: 'Peers', ble: 'BLE', webrtc: 'WebRTC',
  rtcSection: '🔗 WebRTC', btSection: '📡 Bluetooth',
  connected: 'Connected', disconnect: 'Disconnect',
  announcePresence: '🔗 Announce Presence', waitingPeers: '📡 Waiting for peers…',
  scanDevices: '📡 Scan for Devices', scanning: 'Scanning…',
  scanAll: '🔍 Scan All Devices',
  // About
  version: 'Version', website: 'Website', police: 'Police',
  gsmEmergency: 'GSM Emergency', fire: 'Fire Service',
  // Settings
  saveChanges: 'Save changes', languageSaved: '✓ Language saved',

  // Missing keys added v24
  ifNoAnswer: '📞 If no answer, tap next:',
  callingNow: 'Calling now…',
  stop: 'Stop',
  start: 'Start',
  customiseCaller: 'Customise caller…',
  triggerRandom: '📞 Trigger Now (Random)',
  startFakeCallBtn: '📞 Start Fake Call',
  cancelBtn: 'Cancel',
  activeEvery: 'Active — every',
  lastCI: 'Last check-in:',
  checkInEveryLabel: 'Check-in every',
  min15Label: '15 minutes',
  min30Label: '30 minutes',
  hr1Label: '1 hour',
  hr2Label: '2 hours',
  startCheckInBtn: '✅ Start Check-Ins',
  stopCheckInBtn: 'Stop Check-Ins',
  emergencyNumbersTitle: 'Emergency Numbers',
  emergencyNumbersDesc: 'Nigeria emergency services — one tap',
  safetyGuideLink: '📋 Full Safety Guide →',
  installLink: '📲 Install P.I.N.G. →',
  noContactsYet: 'No contacts yet',
  addTrustedBelow: 'Add someone trusted below',
  addContactTitle: '+ Add Contact',
  fullNameStar: 'Full name *',
  waPhoneStar: 'WhatsApp / Phone *',
  relationshipLabel: 'Relationship',
  notifyOnSOSLabel: 'Notify when I press SOS',
  saveContactBtn: '💾 Save Contact',
  savingBtn: 'Saving…',
  howItWorksTitle: 'How notifications work',
  howItWorksBody: 'When you press SOS, P.I.N.G. automatically opens WhatsApp to your first contact with your GPS location.',
  yourChatUsernameLabel: 'YOUR CHAT USERNAME',
  shareUsernameHint: 'Share this so others can DM you in chat',
  nameLabel: 'Name',
  emailLabel2: 'Email',
  regionLabel2: 'Region',
  villageKeyLabel: 'Village Key',
  villageKeyInfo: 'Sent to email 📧',
  languageLabel: 'Language',
  sessionLabel: 'Session',
  authMethodLabel: 'Auth method',
  encryptionLabel: 'Encryption',
  logOutBtn: 'Log Out',
  areYouSure: 'Are you sure?',
  yesLogOutBtn: 'Yes, log out',
  transportLabel: 'Transport',
  peersLabel: 'Peers',
  bleLabel: 'BLE',
  webrtcLabel: 'WebRTC',
  rtcSectionTitle: '🔗 WebRTC',
  btSectionTitle: '📡 Bluetooth',
  connectedLabel: '✓ Connected',
  disconnectBtn: 'Disconnect',
  announceBtn: '🔗 Announce Presence',
  waitingPeersBtn: '📡 Waiting for peers…',
  scanDevicesBtn: '📡 Scan for Devices',
  scanningBtn: 'Scanning…',
  scanAllBtn: '🔍 Scan All Devices',
  versionLabel: 'Version',
  websiteLabel: 'Website',
  policeLabel: 'Police',
  gsmLabel: 'GSM Emergency',
  fireLabel: 'Fire Service',
  onlineInAreaLabel: '🟢 Online in your area',
  communityAlertsTitle: 'Community Alerts',
  markReadBtn: 'Mark read',
  noAlertsMsg: 'No alerts — your area is safe',
  noDMsMsg: 'No private chats yet.',
  startDMHint: 'Tap + to search and DM someone.',
  noMsgsMsg: 'No messages yet — say hello.',
  peopleInArea: 'People in your area',
  searchResults: 'Results',
  noUsersFoundMsg: 'No users found.',
  typeToSearchHint: 'Type a name or @username to search',
  messageCommPlaceholder: 'Message your community…',
  messageDMPlaceholder: 'Message',
  safetyToolsTitle: 'Safety Tools',
  fakeCallTitle: 'Fake Incoming Call',
  fakeCallSubtitle: 'Simulate a call to exit an uncomfortable situation',
  checkInTitle: 'Check-In Reminders',
  checkInSubtitle: 'Periodic prompts to confirm you\'re safe',
  meshNetworkTitle: 'Mesh Network',
  profileTitle: 'Profile',
  contactsTitle: 'Emergency Contacts',
  sosContactsHint: 'When you press SOS, these people get a WhatsApp message with your location — free, instant.',
  // General
  back: '←', search: 'Search', send: '↑',
  nameRequired: 'Name and phone are required.',
  contactSaved: '✓ Contact saved',
};

// Build all languages from base (English) with overrides
const yo_overrides = {
  appSub:'Aabo ni Naijiria', signUp:'Forí sílẹ̀', logIn:'Wọlé',
  joinPing:'Darapọ̀ mọ́ P.I.N.G.', welcomeBack:'E padà wá',
  createAccount:'Ṣẹ̀dá àkáǹtì →', signIn:'Wọlé →',
  googleSignIn:'Lo Google wọlé', firstName:'Orúkọ', lastName:'Orúkọ ìdílé',
  email:'Ímeèlì', password:'Ọ̀rọ̀ aṣínà', phone:'Fóònù',
  role:'Ipò', resident:'Olùgbé', vanguard:'Aṣáájú àdúgbò',
  haveAccount:'Ní àkáǹtì tẹ́lẹ̀?', noAccount:'Kò ní àkáǹtì?',
  holdSOS:'Tẹ láti pe 112', calling:'Ń pe 112…',
  alerts:'Ìkìlọ̀', map:'Maapu', chat:'Ìbánisọ̀rọ̀', safety:'Ààbò',
  noAlerts:'Kò sí ìkìlọ̀ — àgbègbè ní àlàáfíà',
  communityChat:'Àdúgbò', privateDMs:'Àkọsílẹ̀ Àdáni',
  messageComm:'Kọ ìfiranṣẹ́ sí àdúgbò…',
  logOut:'Jáde', language:'Ède', saveChanges:'Fi pamọ́',
  languageSaved:'✓ Ède ti fipamọ', cancel:'Fagilé',
  searching:'Ń wá…', noUsersFound:'Kò sí olùmúlò.',
};

const ha_overrides = {
  appSub:'Kare a Nijeriya', signUp:'Rajista', logIn:'Shiga',
  joinPing:'Shiga P.I.N.G.', welcomeBack:'Barka da dawowa',
  createAccount:'Ƙirƙiro account →', signIn:'Shiga →',
  googleSignIn:'Shiga da Google', firstName:'Suna', lastName:'Sunan iyali',
  email:'Imel', password:"Kalmar sirri", phone:'Waya',
  role:'Matsayi', resident:'Mazaunin', vanguard:"Jagoran Al'umma",
  haveAccount:'Kana da account?', noAccount:'Ba ka da account?',
  holdSOS:'Danna don kira 112', calling:'Ana kira 112…',
  alerts:'Faɗakarwa', map:'Taswirar', chat:'Hira', safety:'Aminci',
  noAlerts:"Babu faɗakarwa — yankin yana lafiya",
  communityChat:"Al'umma", privateDMs:'Sirri',
  messageComm:'Rubuta saƙo zuwa al\'umma…',
  logOut:'Fita', language:'Yare', saveChanges:'Adana',
  languageSaved:'✓ An adana yare', cancel:'Soke',
  noUsersFound:'Ba a sami masu amfani ba.',
};

const ig_overrides = {
  appSub:"Nchebe n'Naịjịrịa", signUp:'Debanye aha', logIn:'Banye',
  joinPing:'Sonye P.I.N.G.', welcomeBack:'Nnọọ laghachi',
  createAccount:'Mepụta akaụntụ →', signIn:'Banye →',
  googleSignIn:'Jiri Google banye', firstName:'Aha', lastName:'Aha ezinụlọ',
  email:'Imeelu', password:'Okwu nzuzo', phone:'Ekwentị',
  role:'Ọrụ', resident:'Onye bi ebe ahụ', vanguard:'Onye ọchịchị obodo',
  haveAccount:'Ị nwere akaụntụ?', noAccount:'Ọ dịghị akaụntụ?',
  holdSOS:'Pịa ịkpọ 112', calling:'Na-akpọ 112…',
  alerts:'Ọchịchọ', map:'Maapụ', chat:'Ikwu okwu', safety:'Nchebe',
  noAlerts:'Enweghị ọchịchọ — mpaghara ahụ na-edozi',
  communityChat:'Obodo', privateDMs:'Nzuzo',
  messageComm:'Dee ozi na obodo…',
  logOut:'Pụọ', language:'Asụsụ', saveChanges:'Chekwaa',
  languageSaved:'✓ Asụsụ echekwaa', cancel:'Kagbuo',
  noUsersFound:'Enweghị ndị ọrụ.',
};

const pcm_overrides = {
  appSub:'Protection For Nigeria', signUp:'Sign Up', logIn:'Log In',
  joinPing:'Join P.I.N.G.', welcomeBack:'Welcome back',
  haveAccount:'You get account?', noAccount:'No account?',
  holdSOS:'Press to call 112', calling:'Dey call 112…',
  alerts:'Alerts', map:'Map', chat:'Chat', safety:'Safety',
  noAlerts:'No alerts — area dey safe',
  communityChat:'Community', privateDMs:'Private DMs',
  messageComm:'Type message to community…',
  logOut:'Log out', language:'Language', saveChanges:'Save',
  languageSaved:'✓ Language saved', cancel:'Cancel',
  noUsersFound:'No users found.',
};

export const translations = {
  en:  base,
  yo:  { ...base, ...yo_overrides },
  ha:  { ...base, ...ha_overrides },
  ig:  { ...base, ...ig_overrides },
  pcm: { ...base, ...pcm_overrides },
};

export const LANGUAGE_LIST = [
  { code:'en',  label:'English',        native:'English'   },
  { code:'pcm', label:'Nigerian Pidgin', native:'Pidgin'    },
  { code:'ha',  label:'Hausa',           native:'Hausa'     },
  { code:'yo',  label:'Yoruba',          native:'Yorùbá'    },
  { code:'ig',  label:'Igbo',            native:'Igbo'      },
];
