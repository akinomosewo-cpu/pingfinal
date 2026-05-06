// src/lib/fakecall.js — Fake Call & Voice Check-in system

import { writable } from 'svelte/store';

export const fakeCallState = writable({
  active: false,
  phase: 'idle', // idle | ringing | active | ended
  callerName: '',
  callerNumber: '',
  duration: 0,
});

const FAKE_CALLERS = [
  { name: 'Mum', number: '+234 803 XXX XXXX' },
  { name: 'Dad', number: '+234 806 XXX XXXX' },
  { name: 'Sister', number: '+234 081 XXX XXXX' },
  { name: 'Work', number: '+234 700 XXX XXXX' },
  { name: 'Chidi', number: '+234 070 XXX XXXX' },
  { name: 'Amina', number: '+234 090 XXX XXXX' },
];

let durationInterval = null;

export function triggerFakeCall(callerOverride = null) {
  const caller = callerOverride ?? FAKE_CALLERS[Math.floor(Math.random() * FAKE_CALLERS.length)];
  fakeCallState.set({
    active: true,
    phase: 'ringing',
    callerName: caller.name,
    callerNumber: caller.number,
    duration: 0,
  });
  // Vibrate like an incoming call
  if (navigator.vibrate) navigator.vibrate([300, 200, 300, 200, 300]);
}

export function answerFakeCall() {
  fakeCallState.update(s => ({ ...s, phase: 'active', duration: 0 }));
  durationInterval = setInterval(() => {
    fakeCallState.update(s => ({ ...s, duration: s.duration + 1 }));
  }, 1000);
}

export function endFakeCall() {
  clearInterval(durationInterval);
  fakeCallState.update(s => ({ ...s, phase: 'ended' }));
  setTimeout(() => {
    fakeCallState.set({ active: false, phase: 'idle', callerName: '', callerNumber: '', duration: 0 });
  }, 1500);
}

export function formatCallDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ── Voice Check-In ─────────────────────────────────────────────────
export const checkInState = writable({
  active: false,
  lastCheckIn: null,
  intervalMins: 30,
  missedCount: 0,
});

let checkInTimer = null;

export function startCheckInSchedule(intervalMins = 30, onMissed) {
  stopCheckInSchedule();
  checkInState.update(s => ({ ...s, active: true, intervalMins }));
  checkInTimer = setInterval(() => {
    checkInState.update(s => ({ ...s, missedCount: s.missedCount + 1 }));
    onMissed?.();
  }, intervalMins * 60 * 1000);
}

export function stopCheckInSchedule() {
  clearInterval(checkInTimer);
  checkInState.update(s => ({ ...s, active: false }));
}

export function confirmCheckIn() {
  checkInState.update(s => ({ ...s, lastCheckIn: Date.now(), missedCount: 0 }));
  // Reset the timer
  const cur = { intervalMins: 30 };
  checkInState.subscribe(v => Object.assign(cur, v))();
  // restart
  clearInterval(checkInTimer);
  checkInTimer = setInterval(() => {
    checkInState.update(s => ({ ...s, missedCount: s.missedCount + 1 }));
  }, cur.intervalMins * 60 * 1000);
}
