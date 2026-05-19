// mesh.js v24 — Production BLE + WebRTC
// BLE: connects to ANY nearby device, auto-discovers services
// WebRTC: auto-connects via Supabase presence channel — no button press needed
// Offline: BroadcastChannel + localStorage fallback always active

const isBrowser = typeof window !== 'undefined';
export const isBLESupported   = () => isBrowser && !!navigator.bluetooth;
export const isWebRTCSupported = () => isBrowser && !!(window.RTCPeerConnection);

export const meshState = {
  transport:'none', peers:[], connected:false,
  bleStatus:'offline', rtcStatus:'idle', error:'', log:[],
};

let _onPacket=null, _username='', _villageKey='';
let _bleDevice=null, _bleChar=null, _bleNotify=null;
const _rtcPeers = new Map();
let _supabase=null, _sigSub=null, _bc=null, _sigBC=null;
let _announceInterval=null;
const _myId = Math.random().toString(36).slice(2,10);

const ALL_SERVICES = [
  '0000f00d-1212-efde-1523-785fef13d123', // BitChat
  '0000ff00-0000-1000-8000-00805f9b34fb', // PING
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10
];

const enc = new TextEncoder(), dec = new TextDecoder();

function _log(t,m){ meshState.log=[{type:t,msg:m,ts:Date.now()},...meshState.log.slice(0,49)]; }
function _updateTransport(){
  if(_bleDevice?.gatt?.connected){meshState.transport='ble';return;}
  if(_rtcPeers.size>0){meshState.transport='webrtc';return;}
  if(_bc){meshState.transport='broadcast';return;}
  meshState.transport='storage';
}
function _deliver(pkt){
  if(!_onPacket||pkt?.from===_username) return;
  _onPacket(pkt);
  _bcSend({...pkt,_relayed:true}); // relay to other transports
}

// ── BLE ──────────────────────────────────────────────────────────
export async function bleConnect(scanAll=false){
  if(!isBLESupported()) return {ok:false,error:'Web Bluetooth requires Chrome on Android or Chrome desktop.'};
  meshState.bleStatus='connecting'; meshState.error='';
  try {
    let device;
    if(scanAll){
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices:true, optionalServices:ALL_SERVICES
      });
    } else {
      try {
        device = await navigator.bluetooth.requestDevice({
          filters:[
            {services:['0000f00d-1212-efde-1523-785fef13d123']},
            {services:['0000ff00-0000-1000-8000-00805f9b34fb']},
            {namePrefix:'PING'},{namePrefix:'BitChat'},
          ],
          optionalServices:ALL_SERVICES,
        });
      } catch(fe){
        if(fe.name==='NotFoundError'){
          device = await navigator.bluetooth.requestDevice({
            acceptAllDevices:true, optionalServices:ALL_SERVICES
          });
        } else throw fe;
      }
    }
    _bleDevice=device;
    const peerName=(device.name?.trim())||`BLE-${device.id.slice(-4)}`;
    device.addEventListener('gattserverdisconnected',()=>{
      meshState.bleStatus='offline'; meshState.connected=false;
      meshState.peers=meshState.peers.filter(p=>p.transport!=='ble');
      _bleChar=null; _bleNotify=null; _updateTransport();
    });
    const server=await device.gatt.connect();
    let services=[];
    try{ services=await server.getPrimaryServices(); }catch{}
    if(!services.length){
      for(const u of ALL_SERVICES){ try{ services.push(await server.getPrimaryService(u)); }catch{} }
    }
    let foundW=false,foundN=false;
    for(const svc of services){
      if(foundW&&foundN) break;
      let chars=[]; try{ chars=await svc.getCharacteristics(); }catch{}
      for(const char of chars){
        const p=char.properties;
        if(!foundN&&(p.notify||p.indicate)){
          try{
            await char.startNotifications();
            char.addEventListener('characteristicvaluechanged',e=>{
              try{
                const txt=dec.decode(e.target.value);
                try{ _deliver(JSON.parse(txt)); }
                catch{ _deliver({type:'MSG',from:peerName,msg:txt,ts:Date.now(),village:_villageKey}); }
              }catch{}
            });
            _bleNotify=char; foundN=true;
          }catch{}
        }
        if(!foundW&&(p.write||p.writeWithoutResponse)){ _bleChar=char; foundW=true; }
      }
    }
    meshState.bleStatus='connected'; meshState.connected=true;
    meshState.peers=[...meshState.peers,{id:device.id,name:peerName,transport:'ble',hasMesh:foundW||foundN}];
    _log('SYS',`BLE: ${peerName}`); _updateTransport();
    return {ok:true,deviceName:peerName};
  } catch(e){
    meshState.bleStatus='error';
    if(e.name==='NotFoundError'||e.message?.includes('cancel')){
      meshState.error='No device selected.'; return {ok:false,error:meshState.error};
    }
    meshState.error=e.message??'BLE failed';
    return {ok:false,error:meshState.error};
  }
}
export function bleDisconnect(){
  if(_bleDevice?.gatt?.connected) _bleDevice.gatt.disconnect();
  _bleDevice=null; _bleChar=null; _bleNotify=null;
  meshState.bleStatus='offline'; meshState.peers=meshState.peers.filter(p=>p.transport!=='ble');
  _updateTransport();
}
async function _bleSend(pkt){
  if(!_bleChar) return;
  try{
    const b=enc.encode(JSON.stringify(pkt));
    try{ await _bleChar.writeValueWithResponse(b.slice(0,182)); }
    catch{ await _bleChar.writeValueWithoutResponse(b.slice(0,182)); }
  }catch{}
}

// ── WebRTC — AUTO discovery, no simultaneous button press ─────────
// Uses Supabase presence channel scoped to village key.
// On init: announces presence immediately + every 20s.
// Any peer who sees the announce responds automatically.
// Peers with lower ID become initiator — prevents double-offer race.

async function _createPeer(peerId,peerName,initiator){
  if(_rtcPeers.has(peerId)) return _rtcPeers.get(peerId);
  const pc=new RTCPeerConnection({iceServers:[
    {urls:'stun:stun.l.google.com:19302'},
    {urls:'stun:stun1.l.google.com:19302'},
  ]});
  const entry={pc,dc:null,name:peerName??peerId};
  _rtcPeers.set(peerId,entry);
  pc.onicecandidate=e=>{ if(e.candidate) _signal({type:'ice',candidate:e.candidate,from:_myId,to:peerId}); };
  pc.onconnectionstatechange=()=>{
    if(pc.connectionState==='connected'){
      meshState.rtcStatus='connected'; meshState.connected=true;
      if(!meshState.peers.find(p=>p.id===peerId))
        meshState.peers=[...meshState.peers,{id:peerId,name:entry.name,transport:'webrtc'}];
      _log('SYS',`WebRTC: ${entry.name}`); _updateTransport();
    } else if(['failed','disconnected','closed'].includes(pc.connectionState)){
      _rtcPeers.delete(peerId);
      meshState.peers=meshState.peers.filter(p=>p.id!==peerId);
      if(_rtcPeers.size===0) meshState.rtcStatus='idle';
      _updateTransport();
    }
  };
  pc.oniceconnectionstatechange=()=>{ if(pc.iceConnectionState==='failed') try{pc.restartIce();}catch{} };
  const _attachDC=dc=>{
    entry.dc=dc;
    dc.onopen=()=>_log('SYS',`DC: ${entry.name}`);
    dc.onmessage=e=>{ try{_deliver(JSON.parse(e.data));}catch{} };
  };
  if(initiator){
    const dc=pc.createDataChannel('ping',{ordered:false,maxRetransmits:3});
    _attachDC(dc);
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    _signal({type:'offer',sdp:offer,from:_myId,fromName:_username,to:peerId,village:_villageKey});
  } else { pc.ondatachannel=e=>_attachDC(e.channel); }
  return entry;
}

async function _handleSignal(msg){
  if(!isWebRTCSupported()||msg.from===_myId) return;
  if(msg.to&&msg.to!=='*'&&msg.to!==_myId) return;
  if(msg.village&&msg.village!==_villageKey) return;
  try{
    if(msg.type==='announce'){
      // Auto-respond — no user action needed
      _signal({type:'announce-ack',from:_myId,fromName:_username,to:msg.from,village:_villageKey});
      // Lower ID initiates (prevents double-offer)
      if(!_rtcPeers.has(msg.from)&&_myId<msg.from){
        meshState.rtcStatus='signaling';
        await _createPeer(msg.from,msg.fromName,true);
      }
    } else if(msg.type==='announce-ack'){
      if(!_rtcPeers.has(msg.from)&&_myId<msg.from){
        meshState.rtcStatus='signaling';
        await _createPeer(msg.from,msg.fromName,true);
      }
    } else if(msg.type==='offer'){
      meshState.rtcStatus='signaling';
      const entry=await _createPeer(msg.from,msg.fromName,false);
      if(entry.pc.signalingState!=='stable') return;
      await entry.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const answer=await entry.pc.createAnswer();
      await entry.pc.setLocalDescription(answer);
      _signal({type:'answer',sdp:answer,from:_myId,fromName:_username,to:msg.from,village:_villageKey});
    } else if(msg.type==='answer'){
      const entry=_rtcPeers.get(msg.from);
      if(entry&&entry.pc.signalingState==='have-local-offer')
        await entry.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    } else if(msg.type==='ice'){
      const entry=_rtcPeers.get(msg.from);
      if(entry?.pc.remoteDescription) try{await entry.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));}catch{}
    }
  }catch(e){_log('ERR',`Signal: ${e.message}`);}
}

function _signal(msg){
  if(_sigBC) try{_sigBC.postMessage(msg);}catch{}
  if(_supabase&&_sigSub) _sigSub.send({type:'broadcast',event:'rtc-signal',payload:msg}).catch(()=>{});
}

function _startAutoAnnounce(){
  if(_announceInterval) clearInterval(_announceInterval);
  const announce=()=>_signal({type:'announce',from:_myId,fromName:_username,village:_villageKey,to:'*'});
  announce(); // immediate
  _announceInterval=setInterval(announce,20000); // every 20s
}

export async function rtcAnnounce(){
  if(!isWebRTCSupported()) return {ok:false};
  _signal({type:'announce',from:_myId,fromName:_username,village:_villageKey,to:'*'});
  return {ok:true};
}
export function rtcDisconnect(){
  if(_announceInterval){ clearInterval(_announceInterval); _announceInterval=null; }
  for(const[,e] of _rtcPeers){try{e.dc?.close();e.pc?.close();}catch{}}
  _rtcPeers.clear(); meshState.rtcStatus='idle';
  meshState.peers=meshState.peers.filter(p=>p.transport!=='webrtc');
  _updateTransport();
}
async function _rtcSend(pkt){
  const data=JSON.stringify(pkt);
  for(const[,e] of _rtcPeers) if(e.dc?.readyState==='open') try{e.dc.send(data);}catch{}
}

// ── BroadcastChannel + localStorage ──────────────────────────────
function _initBC(villageKey){
  if(typeof BroadcastChannel==='undefined') return;
  try{
    _bc=new BroadcastChannel(`ping_mesh_${villageKey}`);
    _bc.onmessage=({data})=>{ if(data?._rtcSig) _handleSignal(data); else _deliver(data); };
    _sigBC=new BroadcastChannel(`ping_rtc_sig_${villageKey}`);
    _sigBC.onmessage=({data})=>_handleSignal(data);
  }catch{}
}
function _bcSend(pkt){ if(_bc) try{_bc.postMessage(pkt);}catch{} }
function _lsSend(pkt){
  if(typeof localStorage==='undefined') return;
  try{localStorage.setItem('ping_mesh_flash',JSON.stringify({...pkt,_ts:Date.now()}));}catch{}
}
function _initLS(){
  if(typeof window==='undefined') return;
  window.addEventListener('storage',e=>{
    if(e.key!=='ping_mesh_flash') return;
    try{
      const pkt=JSON.parse(e.newValue??'');
      if(Date.now()-(pkt._ts??0)>10000) return;
      _deliver(pkt);
    }catch{}
  });
}

async function _initSupabase(villageKey){
  try{
    const {supabase,isSupabaseReady}=await import('./supabase.js');
    if(!isSupabaseReady||!supabase) return;
    _supabase=supabase;
    _sigSub=supabase.channel(`ping-rtc-${villageKey}`);
    _sigSub.on('broadcast',{event:'rtc-signal'},({payload})=>_handleSignal(payload));
    _sigSub.subscribe(status=>{
      if(status==='SUBSCRIBED'){
        _log('SYS','Supabase signaling ready');
        _startAutoAnnounce(); // Start auto-announcing when channel is live
      }
    });
  }catch{}
}

// ── Public API ────────────────────────────────────────────────────
export async function meshInit(username,villageKey,onPacket){
  _username=username; _villageKey=villageKey; _onPacket=onPacket;
  _initBC(villageKey); _initLS();
  // Start offline announce immediately (for same-device/LAN peers)
  if(_sigBC) _sigBC.postMessage({type:'announce',from:_myId,fromName:username,village:villageKey,to:'*'});
  await _initSupabase(villageKey);
  _updateTransport();
  _log('SYS',`Mesh: ${username} @ ${villageKey}`);
}
export async function meshSend(pkt){
  const full={...pkt,from:_username,village:_villageKey,ts:pkt.ts??Date.now()};
  await _bleSend(full); await _rtcSend(full); _bcSend(full); _lsSend(full);
}
export function meshDestroy(){
  bleDisconnect(); rtcDisconnect();
  if(_announceInterval){clearInterval(_announceInterval);_announceInterval=null;}
  try{_bc?.close();}catch{} try{_sigBC?.close();}catch{}
  try{_sigSub?.unsubscribe();}catch{}
  _bc=null;_sigBC=null;_sigSub=null;_supabase=null;_onPacket=null;
  meshState.transport='none';meshState.connected=false;meshState.peers=[];
}
export function buildSOSPacket(user,location){
  return{type:'SOS',from:user.username??user.firstName,name:`${user.firstName} ${user.lastName}`,
    lat:location?.lat??null,lng:location?.lng??null,msg:'🚨 SOS activated',ts:Date.now(),village:user.villageKey};
}
export function getMeshCapabilities(){
  return{ble:isBLESupported(),webrtc:isWebRTCSupported(),
    broadcast:typeof BroadcastChannel!=='undefined',storage:typeof localStorage!=='undefined'};
}

export function getCurrentLocation(){
  return new Promise(resolve=>{
    if(!isBrowser||!navigator.geolocation){resolve(null);return;}
    navigator.geolocation.getCurrentPosition(
      p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy}),
      ()=>resolve(null),{enableHighAccuracy:true,timeout:8000,maximumAge:0}
    );
  });
}
export function dialEmergency(){ if(isBrowser){const a=document.createElement('a');a.href='tel:112';a.click();} }

export function buildMsgPacket(user,text){
  return{type:'MSG',from:user.username??user.firstName,msg:text,ts:Date.now(),village:user.villageKey};
}
