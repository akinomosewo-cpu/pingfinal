// src/lib/i18n.js — P.I.N.G. translations v16
// Language persists to localStorage AND user account, never resets on navigation

import { writable } from 'svelte/store';

const LANG_KEY = 'ping_lang_v2';

export const i18n = writable({ lang: 'en' });

export function loadLang() {
	if (typeof localStorage === 'undefined') return;
	try {
		const saved = localStorage.getItem(LANG_KEY);
		if (saved) i18n.set({ lang: saved });
	} catch {}
}

export function setLang(code) {
	if (!code) return;
	i18n.set({ lang: code });
	if (typeof localStorage !== 'undefined') {
		try { localStorage.setItem(LANG_KEY, code); } catch {}
	}
}

export function t(lang, key) {
	return translations[lang]?.[key] ?? translations['en']?.[key] ?? key;
}

export const translations = {
  en: {
    appSub: 'Protection In Nigeria',
    chooseLanguage: 'Choose your language',
    langDesc: "Select the language you'd like to use in P.I.N.G.",
    continue: 'Continue →',
    returnCalc: '← Return to calculator',
    signUp: 'Sign Up',
    logIn: 'Log In',
    joinPing: 'Join P.I.N.G.',
    welcomeBack: 'Welcome back',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email address',
    password: 'Password',
    phone: 'Phone',
    role: 'Role',
    resident: 'Resident',
    vanguard: 'Community Vanguard',
    createAccount: 'Create account →',
    signIn: 'Sign in →',
    googleSignIn: 'Continue with Google',
    locationTitle: 'Your location',
    locationDesc: 'P.I.N.G. groups you with nearby people and generates your Village Key from your area.',
    allowLocation: '📍 Allow location access',
    gettingLocation: 'Getting location…',
    skipLocation: 'Skip (use Nigeria as region)',
    trustDevice: 'Trust this device?',
    trustDesc: 'Staying logged in keeps P.I.N.G. ready for emergencies.',
    alwaysTrust: 'Always trust',
    trustOnce: 'Trust once',
    protected: "You're protected!",
    loading: 'Loading dashboard…',
    holdSOS: 'Hold to activate',
    releaseCancel: 'Release to cancel',
    calling: 'Calling 199…',
    alerts: 'Alerts', location: 'Location', chat: 'Chat', mesh: 'Mesh', settings: 'Settings',
    noAlerts: 'No alerts — your area is safe',
    typeMessage: 'Type a message…', send: '↑',
    scanPeers: '📡 Scan for peers', scanning: 'Scanning…',
    communityAlerts: 'Community Alerts', yourLocation: 'Your Location',
    communityChat: 'Community Chat', bluetoothMesh: 'Bluetooth Mesh',
    settingsTitle: 'Settings', markRead: 'Mark read',
    villageKeySent: 'Sent to your email 📧',
    saveChanges: 'Save changes', logOut: 'Log out',
    confirmLogout: 'Are you sure?', yesLogout: 'Yes, log out', cancel: 'Cancel',
    languageSaved: '✓ Language saved & applied',
  },
  pcm: {
    appSub: 'Protection For Nigeria',
    chooseLanguage: 'Pick your language',
    langDesc: 'Choose which language you wan use for P.I.N.G.',
    continue: 'Continue →', returnCalc: '← Go back',
    signUp: 'Sign Up', logIn: 'Log In', joinPing: 'Join P.I.N.G.',
    welcomeBack: 'Welcome back',
    firstName: 'First name', lastName: 'Last name', email: 'Email', password: 'Password',
    phone: 'Phone number', role: 'Role', resident: 'Person wey live there',
    vanguard: 'Community Vanguard', createAccount: 'Create account →', signIn: 'Sign in →',
    googleSignIn: 'Use Google to enter', locationTitle: 'Your location',
    locationDesc: 'P.I.N.G. go find people wey near you, use your area make Village Key.',
    allowLocation: '📍 Allow location', gettingLocation: 'Dey find location…',
    skipLocation: 'Skip am (use Nigeria)', trustDevice: 'You trust this phone?',
    trustDesc: 'If you stay login, P.I.N.G. go ready for emergency.',
    alwaysTrust: 'Always trust', trustOnce: 'Trust once',
    protected: 'You dey safe!', loading: 'Loading…',
    holdSOS: 'Hold to send SOS', releaseCancel: 'Leave to cancel', calling: 'Dey call 199…',
    alerts: 'Alerts', location: 'Location', chat: 'Chat', mesh: 'Mesh', settings: 'Settings',
    noAlerts: 'No alerts — area dey safe', typeMessage: 'Type message…', send: '↑',
    scanPeers: '📡 Find nearby people', scanning: 'Dey scan…',
    communityAlerts: 'Community Alerts', yourLocation: 'Your Location',
    communityChat: 'Community Chat', bluetoothMesh: 'Bluetooth Mesh',
    settingsTitle: 'Settings', markRead: 'Mark as read',
    villageKeySent: 'We send am to your email 📧',
    saveChanges: 'Save changes', logOut: 'Log out',
    confirmLogout: 'You sure?', yesLogout: 'Yes, log out', cancel: 'Cancel',
    languageSaved: '✓ Language saved',
  },
  ha: {
    appSub: 'Kare a Nijeriya', chooseLanguage: 'Zaɓi yare', langDesc: 'Zaɓi yaren da kake son amfani da shi.',
    continue: 'Ci gaba →', returnCalc: '← Koma baya', signUp: 'Rajista', logIn: 'Shiga',
    joinPing: 'Shiga P.I.N.G.', welcomeBack: 'Barka da dawowa',
    firstName: 'Suna', lastName: 'Sunan iyali', email: 'Email', password: 'Kalmar sirri',
    phone: 'Waya', role: 'Matsayi', resident: 'Mazaunin', vanguard: 'Jagoran Al\'umma',
    createAccount: 'Ƙirƙiro account →', signIn: 'Shiga →', googleSignIn: 'Shiga da Google',
    locationTitle: 'Wurin ka', locationDesc: 'P.I.N.G. zai haɗa ka da mutanen yankin ka.',
    allowLocation: '📍 Bari wurin', gettingLocation: 'Ana neman wuri…', skipLocation: 'Tsallake',
    trustDevice: 'Ka amince da wannan na\'ura?', trustDesc: 'Zama a shiga yana taimakawa a lokacin gaggawa.',
    alwaysTrust: 'Koyaushe amince', trustOnce: 'Amince sau ɗaya',
    protected: 'Kana cikin aminci!', loading: 'Ana lodawa…',
    holdSOS: 'Riƙe don SOS', releaseCancel: 'Saki don soke', calling: 'Ana kira 199…',
    alerts: 'Faɗakarwa', location: 'Wuri', chat: 'Hira', mesh: 'Mesh', settings: 'Saiti',
    noAlerts: 'Babu faɗakarwa — yankin yana lafiya', typeMessage: 'Rubuta saƙo…', send: '↑',
    scanPeers: '📡 Nemo mutane', scanning: 'Ana bincike…',
    communityAlerts: 'Faɗakarwa Al\'umma', yourLocation: 'Wurin Ka',
    communityChat: 'Hira Al\'umma', bluetoothMesh: 'Bluetooth Mesh',
    settingsTitle: 'Saiti', markRead: 'Alama an karanta',
    villageKeySent: 'An aika zuwa emailin ka 📧',
    saveChanges: 'Adana canje-canje', logOut: 'Fita',
    confirmLogout: 'Kana tabbata?', yesLogout: 'I, fita', cancel: 'Soke',
    languageSaved: '✓ An adana yare',
  },
  yo: {
    appSub: 'Aabo ni Naijiria', chooseLanguage: 'Yan ede rẹ', langDesc: 'Yan ede tí o fẹ́ lo nínú P.I.N.G.',
    continue: 'Tẹ̀síwájú →', returnCalc: '← Padà', signUp: 'Forí sílẹ̀', logIn: 'Wọlé',
    joinPing: 'Darapọ̀ mọ́ P.I.N.G.', welcomeBack: 'E padà wá',
    firstName: 'Orúkọ', lastName: 'Orúkọ ìdílé', email: 'Ímeèlì', password: 'Ọ̀rọ̀ aṣínà',
    phone: 'Fóònù', role: 'Ipò', resident: 'Olùgbé', vanguard: 'Aṣáájú àdúgbò',
    createAccount: 'Ṣẹ̀dá àkáǹtì →', signIn: 'Wọlé →', googleSignIn: 'Lo Google wọlé',
    locationTitle: 'Ibi tí o wà', locationDesc: 'P.I.N.G. yóò so ọ pọ̀ mọ́ àwọn ènìyàn tímọ́tímọ́.',
    allowLocation: '📍 Gbà ibi', gettingLocation: 'Ń wá ibi…', skipLocation: 'Fojú fo (lo Naijiria)',
    trustDevice: 'Ṣé o gbẹ́kẹ̀lé ẹ̀rọ yìí?', trustDesc: 'Ìdúróṣinṣin sínú ṣọ́ ẹ láìsí àdójútì.',
    alwaysTrust: 'Gbẹ́kẹ̀lé nígbà gbogbo', trustOnce: 'Gbẹ́kẹ̀lé ẹẹ̀kan',
    protected: 'O wà ní ààbò!', loading: 'Ń kó…',
    holdSOS: 'Di mú fún SOS', releaseCancel: 'Jẹ́ kí o pari', calling: 'Ń pe 199…',
    alerts: 'Ìkìlọ̀', location: 'Ibi', chat: 'Ìbánisọ̀rọ̀', mesh: 'Mesh', settings: 'Ètò',
    noAlerts: 'Kò sí ìkìlọ̀ — àgbègbè ní àlàáfíà', typeMessage: 'Kọ ìfiranṣẹ́…', send: '↑',
    scanPeers: '📡 Wá àwọn ènìyàn', scanning: 'Ń ṣàyẹ̀wò…',
    communityAlerts: 'Ìkìlọ̀ Àdúgbò', yourLocation: 'Ibi Tí O Wà',
    communityChat: 'Ìbánisọ̀rọ̀ Àdúgbò', bluetoothMesh: 'Bluetooth Mesh',
    settingsTitle: 'Ètò', markRead: 'Samisi pé a ti ka',
    villageKeySent: 'A ti fi ránṣẹ́ sí ímeèlì rẹ 📧',
    saveChanges: 'Fi àwọn ìyípadà pamọ́', logOut: 'Jáde',
    confirmLogout: 'Ṣé o dájú?', yesLogout: 'Bẹ́ẹ̀ni, jáde', cancel: 'Fagilé',
    languageSaved: '✓ Ede ti fipamọ',
  },
  ig: {
    appSub: 'Nchebe n\'Naịjịrịa', chooseLanguage: 'Họrọ asụsụ gị', langDesc: 'Họrọ asụsụ ị chọrọ iji na P.I.N.G.',
    continue: 'Gaa n\'ihu →', returnCalc: '← Laghachi', signUp: 'Debanye aha', logIn: 'Banye',
    joinPing: 'Sonye P.I.N.G.', welcomeBack: 'Nnọọ laghachi',
    firstName: 'Aha', lastName: 'Aha ezinụlọ', email: 'Email', password: 'Okwu nzuzo',
    phone: 'Ekwentị', role: 'Ọrụ', resident: 'Onye bi ebe ahụ', vanguard: 'Onye ọchịchị obodo',
    createAccount: 'Mepụta akaụntụ →', signIn: 'Banye →', googleSignIn: 'Jiri Google banye',
    locationTitle: 'Ebe ị nọ', locationDesc: 'P.I.N.G. ga-ejikọ gị na ndị dị nso.',
    allowLocation: '📍 Kwe ka ebe a', gettingLocation: 'Na-achọ ebe…', skipLocation: 'Wụsaa (jiri Naịjịrịa)',
    trustDevice: 'Ị tụkwasịrị ngwaọrụ a obi?', trustDesc: 'Ịdụ banye na-enyere aka n\'ihe mberede.',
    alwaysTrust: 'Tụkwasị obi mgbe niile', trustOnce: 'Tụkwasị obi otu oge',
    protected: 'Ị dị nchebe!', loading: 'Na-ebugo…',
    holdSOS: 'Jide maka SOS', releaseCancel: 'Hapu ka ịhazigharịa', calling: 'Na-akpọ 199…',
    alerts: 'Ọchịchọ', location: 'Ebe', chat: 'Ikwu okwu', mesh: 'Mesh', settings: 'Ntọala',
    noAlerts: 'Enweghị ọchịchọ — mpaghara ahụ na-edozi', typeMessage: 'Dee ozi…', send: '↑',
    scanPeers: '📡 Chọta ndị ọzọ', scanning: 'Na-achọ…',
    communityAlerts: 'Ọchịchọ Obodo', yourLocation: 'Ebe Ị Nọ',
    communityChat: 'Ikwu Okwu Obodo', bluetoothMesh: 'Bluetooth Mesh',
    settingsTitle: 'Ntọala', markRead: 'Tọọ ka agụọla',
    villageKeySent: 'Ezigara email gị 📧',
    saveChanges: 'Chekwaa mgbanwe', logOut: 'Pụọ',
    confirmLogout: 'Ị dị n\'obi?', yesLogout: 'Ee, pụọ', cancel: 'Kagbuo',
    languageSaved: '✓ Asụsụ echekwaa',
  },
};
