/* ════════════════════════════════════════════════════════════
   Mon Budget — gestion financière personnelle
   PWA 100 % locale : HTML + CSS + JavaScript, données dans IndexedDB.
   Aucune requête réseau vers un tiers, aucun backend.
   ════════════════════════════════════════════════════════════ */
(() => {
'use strict';

/* ═══════════ Constantes ═══════════ */
const APP_ID = 'budget-ios';
const APP_VERSION = '1.0.0';
const SCHEMA = 1;
const DB_NAME = 'mon-budget';
const DB_VERSION = 1;
const STORES = { settings: 'key', buckets: 'id', subscriptions: 'id', investments: 'id', accounts: 'id', debts: 'id', snapshots: 'date' };
const COLLECTIONS = ['buckets', 'subscriptions', 'investments', 'accounts', 'debts', 'snapshots'];
const DEFAULT_SETTINGS = { salary: 0, theme: 'auto', currency: 'EUR', lastExport: null };
const CURRENCIES = { EUR: 'Euro (€)', USD: 'Dollar US ($)', GBP: 'Livre sterling (£)', CHF: 'Franc suisse (CHF)', CAD: 'Dollar canadien (CA$)' };
const COLORS = ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#30b0c7', '#ffcc00', '#5856d6'];
const KINDS = { needs: 'Besoins', wants: 'Envies', savings: 'Épargne' };
const KIND_COLORS = { needs: '#007aff', wants: '#ff9500', savings: '#34c759' };
const CYCLES = { weekly: 'Hebdomadaire', monthly: 'Mensuel', quarterly: 'Trimestriel', yearly: 'Annuel' };
const CYCLE_STEP = { weekly: 0, monthly: 1, quarterly: 3, yearly: 12 };
const SUB_CATS = ['Streaming', 'Musique', 'Logiciels & Cloud', 'Internet & Mobile', 'Logement', 'Assurance', 'Sport & Santé', 'Transport', 'Banque', 'Presse & Livres', 'Autre'];
const INV_TYPES = {
  etf: { label: 'ETF', icon: '📈' },
  stocks: { label: 'Actions', icon: '🏢' },
  pea: { label: 'PEA', icon: '📊' },
  life: { label: 'Assurance-vie', icon: '🛡️' },
  crypto: { label: 'Crypto', icon: '🪙' },
  saving: { label: 'Livret / Épargne', icon: '🐷' },
  realestate: { label: 'Immobilier / SCPI', icon: '🏠' },
  gold: { label: 'Or & métaux', icon: '🥇' },
  other: { label: 'Autre', icon: '💼' },
};
const ACCOUNT_TYPES = {
  checking: { label: 'Compte courant', icon: '💳' },
  savings: { label: 'Épargne disponible', icon: '🐷' },
  cash: { label: 'Espèces', icon: '💵' },
  other: { label: 'Autre', icon: '📦' },
};
const TEMPLATES = [
  { name: '50 / 30 / 20', desc: 'Équilibré', parts: [50, 30, 20] },
  { name: '60 / 20 / 20', desc: 'Budget serré', parts: [60, 20, 20] },
  { name: '70 / 20 / 10', desc: 'Charges élevées', parts: [70, 20, 10] },
];

/* ═══════════ Utilitaires ═══════════ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const round2 = n => Math.round((Number(n) || 0) * 100) / 100 + 0;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

const DAY = 864e5;
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => toISO(new Date());
const parseISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const startOfToday = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const daysBetween = (a, b) => Math.round((b - a) / DAY);

function parseNum(str) {
  if (str == null) return null;
  const s = String(str).replace(/[\s  ]/g, '').replace(',', '.');
  if (s === '' || s === '-' || s === '.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const numToInput = v => (v === '' || v == null ? '' : String(round2(v)).replace('.', ','));

/* ═══════════ Formats ═══════════ */
let nf0, nf2, nfPct, nfNum, dfShort, dfLong, dfFull;
function setupFormats() {
  const cur = state.settings.currency in CURRENCIES ? state.settings.currency : 'EUR';
  nf0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: 0 });
  nf2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  nfPct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
  nfNum = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  dfShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  dfLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  dfFull = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
function money(n, decimals = false) {
  const r = round2(n);
  return (Number.isInteger(r) && !decimals ? nf0 : nf2).format(r);
}
const signed = n => (n > 0.005 ? '+' : '') + money(n);
const pct = r => nfPct.format(r);
const pctS = r => (r > 0.00005 ? '+' : '') + nfPct.format(r);
function curSymbol() {
  const cur = state.settings.currency in CURRENCIES ? state.settings.currency : 'EUR';
  const part = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur }).formatToParts(0).find(p => p.type === 'currency');
  return part ? part.value : cur;
}

/* ═══════════ IndexedDB ═══════════ */
let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB indisponible'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Base de données bloquée'));
  });
  return dbPromise;
}
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
async function dbGetAll(store) { const db = await openDB(); return reqP(db.transaction(store, 'readonly').objectStore(store).getAll()); }
async function dbPut(store, value) { const db = await openDB(); const t = db.transaction(store, 'readwrite'); t.objectStore(store).put(value); return txDone(t); }
async function dbDelete(store, key) { const db = await openDB(); const t = db.transaction(store, 'readwrite'); t.objectStore(store).delete(key); return txDone(t); }
async function dbReplaceAll(data) {
  const db = await openDB();
  const names = Object.keys(STORES);
  const t = db.transaction(names, 'readwrite');
  for (const n of names) {
    const st = t.objectStore(n);
    st.clear();
    for (const rec of data[n] || []) st.put(rec);
  }
  return txDone(t);
}

/* ═══════════ État ═══════════ */
const state = { settings: { ...DEFAULT_SETTINGS }, buckets: [], subscriptions: [], investments: [], accounts: [], debts: [], snapshots: [] };
const runtime = { persisted: null };
const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0);

async function loadAll() {
  const out = {};
  for (const s of Object.keys(STORES)) out[s] = await dbGetAll(s);
  const settings = { ...DEFAULT_SETTINGS };
  for (const r of out.settings) if (r && r.key in DEFAULT_SETTINGS) settings[r.key] = r.value;
  state.settings = settings;
  state.buckets = out.buckets.sort(byOrder);
  state.subscriptions = out.subscriptions.sort(byOrder);
  state.investments = out.investments.sort(byOrder);
  state.accounts = out.accounts.sort(byOrder);
  state.debts = out.debts.sort(byOrder);
  state.snapshots = out.snapshots.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
async function saveSetting(key, value) {
  state.settings[key] = value;
  await dbPut('settings', { key, value });
}
async function saveItem(store, item) {
  await dbPut(store, item);
  const arr = state[store];
  const i = arr.findIndex(x => x.id === item.id);
  if (i >= 0) arr[i] = item; else arr.push(item);
  arr.sort(byOrder);
}
async function removeItem(store, id) {
  await dbDelete(store, id);
  state[store] = state[store].filter(x => x.id !== id);
}
const nextOrder = arr => (arr.length ? Math.max(...arr.map(x => x.order || 0)) + 1 : 0);

/* ═══════════ Calculs ═══════════ */
function monthlyEq(s) {
  switch (s.cycle) {
    case 'weekly': return s.amount * 52 / 12;
    case 'quarterly': return s.amount / 3;
    case 'yearly': return s.amount / 12;
    default: return s.amount;
  }
}
const addMonthsClamped = (anchor, n) => {
  const y = anchor.getFullYear(), m = anchor.getMonth() + n, day = anchor.getDate();
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, last));
};
function occurrenceAt(sub, k) {
  const a = parseISO(sub.nextDate);
  if (sub.cycle === 'weekly') return new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7 * k);
  return addMonthsClamped(a, k * (CYCLE_STEP[sub.cycle] || 1));
}
function firstIndex(sub, from) {
  const a = parseISO(sub.nextDate);
  if (sub.cycle === 'weekly') return Math.max(0, Math.ceil(daysBetween(a, from) / 7));
  const step = CYCLE_STEP[sub.cycle] || 1;
  const monthsDiff = (from.getFullYear() - a.getFullYear()) * 12 + from.getMonth() - a.getMonth();
  let k = Math.max(0, Math.floor(monthsDiff / step) - 1);
  while (occurrenceAt(sub, k) < from) k++;
  return k;
}
const nextOccurrence = (sub, from = startOfToday()) => occurrenceAt(sub, firstIndex(sub, from));
function occurrencesBetween(sub, from, to) {
  const out = [];
  for (let k = firstIndex(sub, from), n = 0; n < 200; k++, n++) {
    const d = occurrenceAt(sub, k);
    if (d > to) break;
    out.push(d);
  }
  return out;
}
function upcoming() {
  const today = startOfToday();
  return state.subscriptions.map(s => {
    const d = nextOccurrence(s, today);
    return { s, d, n: daysBetween(today, d) };
  }).sort((a, b) => a.d - b.d);
}
function dueIn30() {
  const today = startOfToday();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
  let total = 0, count = 0;
  for (const s of state.subscriptions.filter(x => x.active)) {
    const occ = occurrencesBetween(s, today, end);
    if (occ.length) { total += occ.length * s.amount; count++; }
  }
  return { total, count };
}

function calc() {
  const st = state;
  const salary = st.settings.salary || 0;
  const alloc = st.buckets.map(b => ({ ...b, amount: b.mode === 'percent' ? salary * b.value / 100 : b.value }));
  const allocated = sum(alloc, b => b.amount);
  const byKind = { needs: 0, wants: 0, savings: 0 };
  alloc.forEach(b => { byKind[b.kind] = (byKind[b.kind] || 0) + b.amount; });
  const activeSubs = st.subscriptions.filter(s => s.active);
  const subsMonthly = sum(activeSubs, monthlyEq);
  const debtsMonthly = sum(st.debts, d => d.monthly);
  const invValue = sum(st.investments, i => i.value);
  const invInvested = sum(st.investments, i => i.invested);
  const accountsTotal = sum(st.accounts, a => a.balance);
  const debtsTotal = sum(st.debts, d => d.remaining);
  return {
    salary, alloc, allocated, remaining: salary - allocated, byKind,
    savingsPlanned: byKind.savings,
    activeSubs, subsMonthly, subsYearly: subsMonthly * 12,
    debtsMonthly, debtsTotal, recurring: subsMonthly + debtsMonthly,
    invValue, invInvested, invGain: invValue - invInvested,
    invPerf: invInvested > 0 ? (invValue - invInvested) / invInvested : null,
    accountsTotal, netWorth: accountsTotal + invValue - debtsTotal,
  };
}

async function recordSnapshot() {
  if (!state.accounts.length && !state.investments.length && !state.debts.length) return;
  const c = calc();
  const date = todayISO();
  const net = round2(c.netWorth);
  const last = state.snapshots[state.snapshots.length - 1];
  if (last && last.date === date && last.netWorth === net) return;
  const snap = { date, netWorth: net, accounts: round2(c.accountsTotal), investments: round2(c.invValue), debts: round2(c.debtsTotal) };
  await dbPut('snapshots', snap);
  if (last && last.date === date) state.snapshots[state.snapshots.length - 1] = snap; else state.snapshots.push(snap);
}
function netDelta() {
  const snaps = state.snapshots;
  if (snaps.length < 2) return null;
  const latest = snaps[snaps.length - 1];
  const limit = toISO(new Date(Date.now() - 30 * DAY));
  let ref = snaps[0];
  for (const s of snaps) { if (s.date <= limit) ref = s; else break; }
  if (ref.date === latest.date) return null;
  return { diff: latest.netWorth - ref.netWorth, since: ref.date };
}
function pushHistory(inv, value, date) {
  const i = inv.history.findIndex(p => p.date === date);
  if (i >= 0) inv.history[i].value = round2(value); else inv.history.push({ date, value: round2(value) });
  inv.history.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (inv.history.length > 400) inv.history = inv.history.slice(-400);
}

/* ═══════════ Graphiques SVG ═══════════ */
let gradId = 0;
function lineChart(points, { color = '#007aff', height = 90 } = {}) {
  const W = 300, H = 80, P = 5;
  const ts = points.map(p => p.t), vs = points.map(p => p.v);
  const minT = Math.min(...ts), maxT = Math.max(...ts), minV = Math.min(...vs), maxV = Math.max(...vs);
  const spanT = maxT - minT || 1, spanV = maxV - minV;
  const x = t => ((t - minT) / spanT) * W;
  const y = v => (spanV ? H - P - ((v - minV) / spanV) * (H - 2 * P) : H / 2);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const id = 'g' + (++gradId);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${height}px" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${color};stop-opacity:.28"/><stop offset="1" style="stop-color:${color};stop-opacity:0"/></linearGradient></defs>
    <path d="${line} L${W} ${H} L0 ${H} Z" fill="url(#${id})"/>
    <path d="${line}" fill="none" style="stroke:${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}
function donut(segments, { size = 190, stroke = 24 } = {}) {
  const r = (size - stroke) / 2, cx = size / 2, C = 2 * Math.PI * r;
  const segs = segments.filter(s => s.v > 0);
  const total = sum(segs, s => s.v);
  let out = `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${cx}" cy="${cx}" r="${r}" fill="none" style="stroke:var(--fill)" stroke-width="${stroke}"/>`;
  if (total > 0) {
    let offset = 0;
    const gap = segs.length > 1 ? 2.5 : 0;
    for (const s of segs) {
      const len = (s.v / total) * C;
      const dash = Math.max(len - gap, 0.5);
      out += `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" style="stroke:${s.c}" stroke-width="${stroke}" stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cx})"/>`;
      offset += len;
    }
  }
  return out + '</svg>';
}
const stackBar = items => `<div class="stack">${items.filter(i => i.v > 0).map(i => `<i style="flex:${i.v};background:${i.c}"></i>`).join('')}</div>`;
const legend = items => `<div class="legend">${items.map(i => `<span style="--c:${i.c}">${esc(i.label)}</span>`).join('')}</div>`;

/* ═══════════ Briques d'interface ═══════════ */
const CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

const emptyState = (emoji, title, text, action, label, secondary) => `<div class="empty"><div class="emoji">${emoji}</div><h3>${esc(title)}</h3><p>${esc(text)}</p><button class="btn" data-action="${action}">${esc(label)}</button>${secondary || ''}</div>`;
const addRow = (action, label) => `<div class="row tap add-row" data-action="${action}" role="button"><span class="plus">${PLUS}</span><span>${esc(label)}</span></div>`;
const tile = (label, num, sub, cls = '') => `<div class="tile"><div class="lbl">${esc(label)}</div><div class="num ${cls}">${num}</div><div class="s">${sub}</div></div>`;
const kv = (k, v) => `<div class="row"><span>${esc(k)}</span><span class="grow"></span><span class="kvv">${v}</span></div>`;
const hashColor = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const initial = s => { const ch = [...String(s).trim()][0]; return ch ? ch.toUpperCase() : '?'; };
const whenLabel = (n, d) => (n <= 0 ? 'Aujourd’hui' : n === 1 ? 'Demain' : n <= 14 ? `Dans ${n} j` : dfShort.format(d));
const optionsOf = o => (Array.isArray(o) ? o.map(x => [x, x]) : Object.entries(o));

/* ═══════════ Vues ═══════════ */
const TABS = [
  { id: 'home', title: 'Accueil', icon: '<path d="M3 11l9-7.5 9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>', add: null, render: viewHome },
  { id: 'salary', title: 'Salaire', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9h9"/>', add: ['add-bucket', 'Ajouter une enveloppe'], render: viewSalary },
  { id: 'subs', title: 'Abonnements', icon: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', add: ['add-sub', 'Ajouter un abonnement'], render: viewSubs },
  { id: 'invest', title: 'Placements', icon: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>', add: ['add-inv', 'Ajouter un placement'], render: viewInvest },
  { id: 'wealth', title: 'Patrimoine', icon: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 21h18"/>', add: ['add-wealth', 'Ajouter'], render: viewWealth },
];

function onboardingHTML() {
  const step = (icon, color, title, sub, action) => `<div class="row tap withico" data-action="${action}" role="button"><div class="ico" style="--c:${color}">${icon}</div><div class="grow"><div class="t">${title}</div><div class="s">${sub}</div></div>${CHEV}</div>`;
  return `<section class="hero welcome"><div class="emoji">👋</div><h2>Bienvenue</h2><p>Ton budget, simplement. Tout reste sur cet appareil : aucun compte, aucun serveur, aucune connexion bancaire.</p></section>
  <h2 class="sect">Pour commencer</h2>
  <div class="group">
    ${step('💶', '#34c759', 'Renseigner mon salaire', 'Puis le répartir en enveloppes', 'edit-salary')}
    ${step('🔁', '#ff9500', 'Ajouter un abonnement', 'Netflix, loyer, assurance…', 'add-sub')}
    ${step('📈', '#007aff', 'Ajouter un placement', 'ETF, PEA, assurance-vie, crypto…', 'add-inv')}
    ${step('🏦', '#5856d6', 'Ajouter un compte', 'Pour calculer ton patrimoine net', 'add-account')}
  </div>
  <h2 class="sect">Déjà une sauvegarde ?</h2>
  <div class="group"><div class="row tap blue" data-action="import" role="button">Importer un fichier JSON</div></div>`;
}

function subRow({ s, d, n }) {
  const sub = s.active ? `${whenLabel(n, d)} · ${CYCLES[s.cycle]}` : `En pause · ${CYCLES[s.cycle]}`;
  const eq = s.cycle === 'monthly' ? '' : `<div class="s">${money(monthlyEq(s), true)}/mois</div>`;
  return `<div class="row tap withico" data-action="edit-sub" data-id="${esc(s.id)}" role="button"><div class="ico" style="--c:${hashColor(s.name)}">${esc(initial(s.name))}</div><div class="grow"><div class="t">${esc(s.name)}</div><div class="s ${s.active ? '' : 'warn'}">${esc(sub)}</div></div><div class="val"><div class="v">${money(s.amount, true)}</div>${eq}</div>${CHEV}</div>`;
}

function viewHome(c) {
  let h = `<h1 class="large-title">Accueil</h1><p class="subtitle">${esc(cap(dfLong.format(new Date())))}</p>`;
  const hasAny = c.salary || ['buckets', 'subscriptions', 'investments', 'accounts', 'debts'].some(k => state[k].length);
  if (!hasAny) return h + onboardingHTML();

  const last = state.settings.lastExport;
  if (!last || daysBetween(new Date(last), new Date()) > 30) {
    h += `<div class="notice tap" data-action="export" role="button"><span>💾</span><div class="grow"><b>Pense à sauvegarder</b><div class="s">${last ? 'Dernière sauvegarde : ' + esc(dfFull.format(new Date(last))) : 'Aucune sauvegarde pour l’instant'} · Touche pour exporter</div></div>${CHEV}</div>`;
  }

  const delta = netDelta();
  const pts = state.snapshots.slice(-180).map(s => ({ t: parseISO(s.date).getTime(), v: s.netWorth }));
  h += `<section class="hero"><div class="eyebrow">Patrimoine net</div><div class="big">${money(c.netWorth)}</div>`;
  if (delta) h += `<div class="delta ${delta.diff >= 0 ? 'pos' : 'neg'}">${signed(delta.diff)} <span class="muted">depuis le ${esc(dfShort.format(parseISO(delta.since)))}</span></div>`;
  h += pts.length >= 2 ? lineChart(pts, { color: '#007aff' }) : `<p class="foot flush">La courbe d’évolution se construit au fil des jours.</p>`;
  h += `</section>`;

  const rate = c.salary > 0 ? c.savingsPlanned / c.salary : null;
  h += `<div class="tiles">
    ${tile('Épargne planifiée', rate != null ? pct(rate) : money(c.savingsPlanned), `${money(c.savingsPlanned)} / mois`, 'pos')}
    ${tile('Charges récurrentes', money(c.recurring), c.salary > 0 ? `${pct(c.recurring / c.salary)} du salaire` : 'par mois')}
  </div>`;

  if (c.salary > 0 && c.alloc.length) {
    const items = c.alloc.filter(b => b.amount > 0).map(b => ({ v: b.amount, c: b.color, label: `${b.name} · ${money(b.amount)}` }));
    if (c.remaining > 0.5) items.push({ v: c.remaining, c: 'var(--fill2)', label: `Non réparti · ${money(c.remaining)}` });
    h += `<h2 class="sect">Répartition du salaire</h2><div class="card tap" data-action="tab" data-tab="salary" role="button">${stackBar(items)}${legend(items)}</div>`;
  }

  const up = upcoming().filter(x => x.s.active && x.n <= 30);
  if (up.length) {
    const due = dueIn30();
    h += `<h2 class="sect">Prochains prélèvements</h2><div class="group">${up.slice(0, 5).map(subRow).join('')}</div>
      <p class="foot">${due.total > 0 ? `${money(due.total)} à prévoir d’ici 30 jours.` : ''}${up.length > 5 ? ` +${up.length - 5} autre(s) dans l’onglet Abonnements.` : ''}</p>`;
  }

  if (state.investments.length) {
    const cls = c.invGain >= 0 ? 'pos' : 'neg';
    h += `<h2 class="sect">Placements</h2><div class="card tap" data-action="tab" data-tab="invest" role="button">
      <div class="split"><div><div class="eyebrow">Valeur</div><div class="num">${money(c.invValue)}</div></div>
      <div class="right"><div class="eyebrow">Performance</div><div class="num ${cls}">${c.invPerf == null ? '—' : pctS(c.invPerf)}</div></div></div>
      <p class="foot flush">Investi ${money(c.invInvested)} · gain <span class="${cls}">${signed(c.invGain)}</span></p></div>`;
  }
  return h;
}

function viewSalary(c) {
  let h = `<h1 class="large-title">Salaire</h1>`;
  h += `<div class="group"><div class="row tap" data-action="edit-salary" role="button"><div class="grow"><div class="t">Salaire net mensuel</div></div><div class="val"><div class="v strong ${c.salary ? '' : 'blue'}">${c.salary ? money(c.salary, true) : 'À définir'}</div></div>${CHEV}</div></div>`;
  if (!state.buckets.length) {
    return h + emptyState('🥧', 'Répartis ton salaire', 'Crée des enveloppes (loyer, courses, épargne…) en pourcentage ou en montant fixe.', 'templates', 'Utiliser un modèle',
      `<button class="btn tinted" data-action="add-bucket">Créer une enveloppe</button>`);
  }

  const total = c.allocated;
  const over = c.salary > 0 && c.remaining < -0.005;
  const segs = c.alloc.map(b => ({ v: b.amount, c: b.color }));
  if (c.salary > 0 && c.remaining > 0.005) segs.push({ v: c.remaining, c: 'var(--fill2)' });
  const share = c.salary > 0 ? total / c.salary : null;
  h += `<section class="card"><div class="donut">${donut(segs)}<div class="donut-c"><div class="eyebrow">${over ? 'Dépassement' : 'Réparti'}</div><div class="big sm ${over ? 'neg' : ''}">${share == null ? money(total) : pct(share)}</div></div></div></section>`;

  const kindTiles = Object.keys(KINDS).map(k => tile(KINDS[k], c.salary > 0 ? pct(c.byKind[k] / c.salary) : money(c.byKind[k]), money(c.byKind[k]) + ' / mois')).join('');
  h += `<div class="tiles" style="grid-template-columns:repeat(3,1fr)">${kindTiles.replace(/class="num /g, 'class="num sm3 ')}</div>`;

  h += `<h2 class="sect">Enveloppes</h2><div class="group">`;
  h += c.alloc.map(b => {
    const sub = b.mode === 'percent' ? `${nfNum.format(b.value)} % du salaire` : 'Montant fixe';
    const right = b.mode === 'fixed' && c.salary > 0 ? `<div class="s">${pct(b.amount / c.salary)}</div>` : '';
    return `<div class="row tap withdot" data-action="edit-bucket" data-id="${esc(b.id)}" role="button"><span class="dotc" style="--c:${b.color}"></span><div class="grow"><div class="t">${esc(b.name)}</div><div class="s">${esc(sub)} · ${esc(KINDS[b.kind] || '')}</div></div><div class="val"><div class="v">${money(b.amount, true)}</div>${right}</div>${CHEV}</div>`;
  }).join('');
  if (c.salary > 0) {
    h += `<div class="row withdot"><span class="dotc" style="--c:var(--fill2)"></span><div class="grow"><div class="t">${over ? 'Dépassement' : 'Non réparti'}</div></div><div class="val"><div class="v strong ${over ? 'neg' : ''}">${money(Math.abs(c.remaining), true)}</div></div></div>`;
  }
  h += addRow('add-bucket', 'Ajouter une enveloppe') + `</div>`;
  h += `<p class="foot">Les montants sont calculés à partir de ton salaire net mensuel. Les pourcentages s’adaptent automatiquement si ton salaire change.</p>`;
  h += `<div class="group"><div class="row tap blue" data-action="templates" role="button">Appliquer un modèle…</div></div>`;
  return h;
}

function viewSubs(c) {
  let h = `<h1 class="large-title">Abonnements</h1>`;
  if (!state.subscriptions.length) {
    return h + emptyState('🔁', 'Aucun abonnement', 'Ajoute tes abonnements et dépenses récurrentes pour voir ce qu’ils pèsent chaque mois.', 'add-sub', 'Ajouter un abonnement');
  }
  const due = dueIn30();
  const paused = state.subscriptions.length - c.activeSubs.length;
  h += `<section class="hero"><div class="eyebrow">Total par mois</div><div class="big">${money(c.subsMonthly, true)}</div>
    <div class="delta muted" style="font-weight:400">${c.activeSubs.length} actif${c.activeSubs.length > 1 ? 's' : ''}${paused ? ` · ${paused} en pause` : ''}${c.salary > 0 ? ` · ${pct(c.subsMonthly / c.salary)} du salaire` : ''}</div></section>`;
  h += `<div class="tiles">${tile('Par an', money(c.subsYearly), 'estimation')}${tile('30 prochains jours', money(due.total), `${due.count} prélèvement${due.count > 1 ? 's' : ''}`)}</div>`;

  const cats = {};
  for (const s of c.activeSubs) cats[s.category] = (cats[s.category] || 0) + monthlyEq(s);
  const catList = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  if (catList.length >= 2) {
    const max = catList[0][1] || 1;
    h += `<h2 class="sect">Par catégorie</h2><div class="card">${catList.map(([name, v], i) => `<div class="bar-row"><div class="bar-top"><span>${esc(name)}</span><span>${money(v, true)}/mois</span></div><div class="bar"><i style="width:${Math.max(3, v / max * 100).toFixed(1)}%;background:${COLORS[i % COLORS.length]}"></i></div></div>`).join('')}</div>`;
  }

  const list = upcoming();
  const active = list.filter(x => x.s.active), inactive = list.filter(x => !x.s.active);
  h += `<h2 class="sect">Tous les abonnements</h2><div class="group">${[...active, ...inactive].map(subRow).join('')}${addRow('add-sub', 'Ajouter un abonnement')}</div>`;
  h += `<p class="foot">Les dates se mettent à jour toutes seules après chaque échéance. Touche un abonnement pour le modifier ou le mettre en pause.</p>`;
  return h;
}

function invRow(i) {
  const t = INV_TYPES[i.type] || INV_TYPES.other;
  const gain = i.value - i.invested;
  const perf = i.invested > 0 ? gain / i.invested : null;
  const age = daysBetween(parseISO(i.updatedAt), startOfToday());
  const upd = age <= 0 ? 'mis à jour aujourd’hui' : `il y a ${age} j`;
  return `<div class="row tap withico" data-action="open-inv" data-id="${esc(i.id)}" role="button"><div class="ico soft">${t.icon}</div><div class="grow"><div class="t">${esc(i.name)}</div><div class="s">${esc(t.label)} · ${upd}${age > 30 ? ' <span class="warn">· à actualiser</span>' : ''}</div></div><div class="val"><div class="v">${money(i.value, true)}</div><div class="s ${gain >= 0 ? 'pos' : 'neg'}">${perf == null ? signed(gain) : pctS(perf)}</div></div>${CHEV}</div>`;
}

function viewInvest(c) {
  let h = `<h1 class="large-title">Placements</h1>`;
  if (!state.investments.length) {
    return h + emptyState('📈', 'Aucun placement', 'Suis la valeur de tes ETF, actions, PEA, assurance-vie, crypto, livrets… Tu mets à jour les valeurs quand tu veux.', 'add-inv', 'Ajouter un placement');
  }
  const cls = c.invGain >= 0 ? 'pos' : 'neg';
  h += `<section class="hero"><div class="eyebrow">Valeur totale</div><div class="big">${money(c.invValue)}</div>
    <div class="delta ${cls}">${signed(c.invGain)}${c.invPerf == null ? '' : ` (${pctS(c.invPerf)})`} <span class="muted">sur ${money(c.invInvested)} investis</span></div></section>`;

  const types = {};
  for (const i of state.investments) types[i.type] = (types[i.type] || 0) + i.value;
  const typeList = Object.entries(types).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (typeList.length >= 2) {
    const items = typeList.map(([k, v], idx) => ({ v, c: COLORS[idx % COLORS.length], label: `${(INV_TYPES[k] || INV_TYPES.other).label} · ${pct(v / c.invValue)}` }));
    h += `<h2 class="sect">Répartition</h2><div class="card">${stackBar(items)}${legend(items)}</div>`;
  }
  const sorted = [...state.investments].sort((a, b) => b.value - a.value);
  h += `<h2 class="sect">Mes placements</h2><div class="group">${sorted.map(invRow).join('')}${addRow('add-inv', 'Ajouter un placement')}</div>`;
  h += `<p class="foot">Les valeurs sont saisies manuellement : rien n’est récupéré en ligne, ce qui garantit que tes données restent privées.</p>`;
  return h;
}

function viewWealth(c) {
  let h = `<h1 class="large-title">Patrimoine</h1>`;
  const pts = state.snapshots.slice(-180).map(s => ({ t: parseISO(s.date).getTime(), v: s.netWorth }));
  h += `<section class="hero"><div class="eyebrow">Patrimoine net</div><div class="big">${money(c.netWorth)}</div>`;
  h += pts.length >= 2 ? lineChart(pts) : `<p class="foot flush">Actifs moins dettes. L’historique se construit au fil des jours.</p>`;
  h += `</section>`;

  const assets = c.accountsTotal + c.invValue;
  h += `<div class="group">
    <div class="row withdot"><span class="dotc" style="--c:#34c759"></span><div class="grow">Comptes</div><div class="v">${money(c.accountsTotal)}</div></div>
    <div class="row tap withdot" data-action="tab" data-tab="invest" role="button"><span class="dotc" style="--c:#007aff"></span><div class="grow">Placements</div><div class="v">${money(c.invValue)}</div>${CHEV}</div>
    <div class="row withdot"><span class="dotc" style="--c:#ff3b30"></span><div class="grow">Dettes</div><div class="v ${c.debtsTotal > 0 ? 'neg' : ''}">${c.debtsTotal > 0 ? '−' : ''}${money(c.debtsTotal)}</div></div>
  </div>`;
  if (assets > 0) {
    const items = [{ v: c.accountsTotal, c: '#34c759', label: 'Comptes' }, { v: c.invValue, c: '#007aff', label: 'Placements' }];
    h += `<div class="card">${stackBar(items)}</div>`;
  }

  h += `<h2 class="sect">Comptes</h2><div class="group">`;
  h += state.accounts.map(a => {
    const t = ACCOUNT_TYPES[a.type] || ACCOUNT_TYPES.other;
    return `<div class="row tap withico" data-action="edit-account" data-id="${esc(a.id)}" role="button"><div class="ico soft">${t.icon}</div><div class="grow"><div class="t">${esc(a.name)}</div><div class="s">${esc(t.label)}</div></div><div class="val"><div class="v">${money(a.balance, true)}</div></div>${CHEV}</div>`;
  }).join('');
  h += addRow('add-account', 'Ajouter un compte') + `</div>`;

  h += `<h2 class="sect">Dettes et crédits</h2><div class="group">`;
  h += state.debts.map(d => `<div class="row tap withico" data-action="edit-debt" data-id="${esc(d.id)}" role="button"><div class="ico soft">🏦</div><div class="grow"><div class="t">${esc(d.name)}</div><div class="s">${d.monthly > 0 ? money(d.monthly, true) + ' / mois' : 'Sans mensualité'}</div></div><div class="val"><div class="v neg">${money(d.remaining, true)}</div><div class="s">restant dû</div></div>${CHEV}</div>`).join('');
  h += addRow('add-debt', 'Ajouter une dette') + `</div>`;
  if (c.debtsMonthly > 0) h += `<p class="foot">Mensualités totales : ${money(c.debtsMonthly, true)}${c.salary > 0 ? ` (${pct(c.debtsMonthly / c.salary)} du salaire)` : ''}.</p>`;
  return h;
}

/* ═══════════ Rendu principal ═══════════ */
let tab = 'home';
const scrollPos = {};
function renderTabbar() {
  $('#tabbar').innerHTML = TABS.map(t => `<button type="button" class="tab ${t.id === tab ? 'on' : ''}" data-action="tab" data-tab="${t.id}" aria-label="${esc(t.title)}" ${t.id === tab ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg><span>${esc(t.title)}</span></button>`).join('');
}
function render({ animate = false } = {}) {
  const y = window.scrollY;
  const t = TABS.find(x => x.id === tab) || TABS[0];
  const view = $('#view');
  view.innerHTML = t.render(calc());
  if (animate) { view.classList.remove('fade'); void view.offsetWidth; view.classList.add('fade'); }
  $('#nav-title').textContent = t.title;
  $('#nav-left').innerHTML = `<button type="button" class="nav-btn" data-action="settings" aria-label="Réglages">${GEAR}</button>`;
  $('#nav-right').innerHTML = t.add ? `<button type="button" class="nav-btn" data-action="${t.add[0]}" aria-label="${esc(t.add[1])}">${PLUS}</button>` : '';
  renderTabbar();
  if (!animate) window.scrollTo(0, y);
  updateNav();
  refreshOpenSheets();
}
function setTab(id) {
  if (id === tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  scrollPos[tab] = window.scrollY;
  tab = id;
  render({ animate: true });
  window.scrollTo(0, scrollPos[id] || 0);
}
function updateNav() { $('#navbar').classList.toggle('scrolled', window.scrollY > 36); }
async function afterChange() { await recordSnapshot(); render(); }

/* ═══════════ Feuilles, dialogues, toasts ═══════════ */
const sheets = [];
function openSheet({ title, left = 'Annuler', right = 'OK', body = '', onLeft, onRight, onMount, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="backdrop"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="sheet-head"><button type="button" class="sh-btn" data-sh="left">${esc(left)}</button><h2>${esc(title)}</h2>${right ? `<button type="button" class="sh-btn strong" data-sh="right">${esc(right)}</button>` : '<span></span>'}</header><div class="sheet-body"></div></section>`;
  const bodyEl = $('.sheet-body', wrap);
  bodyEl.innerHTML = body;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  const ctl = {
    wrap, body: bodyEl, alive: true,
    update(html) { bodyEl.innerHTML = html; },
    close() {
      if (!ctl.alive) return;
      ctl.alive = false;
      wrap.classList.remove('open');
      const i = sheets.indexOf(ctl); if (i >= 0) sheets.splice(i, 1);
      if (!sheets.length) document.body.classList.remove('no-scroll');
      setTimeout(() => wrap.remove(), 380);
      if (onClose) onClose();
    },
  };
  wrap.addEventListener('click', async e => {
    if (e.target.classList.contains('backdrop')) return ctl.close();
    const b = e.target.closest('[data-sh]');
    if (!b) return;
    if (b.dataset.sh === 'left') { if (onLeft) await onLeft(ctl); else ctl.close(); }
    else if (onRight) await onRight(ctl);
  });
  sheets.push(ctl);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  if (onMount) onMount(ctl);
  return ctl;
}

function actionSheet({ title, message, actions, cancel = 'Annuler' }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'as-wrap';
    const head = (title || message) ? `<div class="as-head">${title ? `<strong>${esc(title)}</strong>` : ''}${message ? `<span>${esc(message)}</span>` : ''}</div>` : '';
    wrap.innerHTML = `<div class="backdrop"></div><div class="as"><div class="as-group">${head}${actions.map((a, i) => `<button type="button" class="as-btn ${a.style || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div><button type="button" class="as-btn as-cancel" data-i="-1">${esc(cancel)}</button></div>`;
    document.body.appendChild(wrap);
    let done = false;
    const finish = i => {
      if (done) return; done = true;
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 400);
      resolve(i);
    };
    wrap.addEventListener('click', e => {
      if (e.target.classList.contains('backdrop')) return finish(-1);
      const b = e.target.closest('[data-i]');
      if (b) finish(Number(b.dataset.i));
    });
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  });
}
async function confirmDialog({ title, message, confirmLabel = 'Supprimer', destructive = true }) {
  return (await actionSheet({ title, message, actions: [{ label: confirmLabel, style: destructive ? 'destructive' : '' }] })) === 0;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
}

/* ═══════════ Formulaires ═══════════ */
function fieldHTML(f, v) {
  const id = 'f_' + f.name;
  const label = f.label ? `<span class="lbl">${esc(f.label)}</span>` : '';
  switch (f.type) {
    case 'text':
      return `<label class="row field" for="${id}">${label}<input id="${id}" name="${f.name}" class="inp" type="text" value="${esc(v ?? '')}" placeholder="${esc(f.placeholder || '')}" maxlength="${f.max || 60}" autocomplete="off" autocapitalize="sentences" enterkeyhint="done"></label>`;
    case 'num':
      return `<label class="row field" for="${id}">${label}<input id="${id}" name="${f.name}" class="inp" type="text" inputmode="decimal" value="${esc(numToInput(v))}" placeholder="0" autocomplete="off" enterkeyhint="done"><span class="suffix" data-suffix-for="${f.name}">${esc(f.suffix ?? '')}</span></label>`;
    case 'date':
      return `<label class="row field" for="${id}">${label}<input id="${id}" name="${f.name}" class="inp" type="date" value="${esc(v ?? '')}"></label>`;
    case 'select':
      return `<label class="row field" for="${id}">${label}<select id="${id}" name="${f.name}" class="inp">${optionsOf(f.options).map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    case 'toggle':
      return `<label class="row field" for="${id}">${label}<span class="grow"></span><span class="switch"><input id="${id}" name="${f.name}" type="checkbox" ${v ? 'checked' : ''}><i></i></span></label>`;
    case 'segmented':
      return `<div class="row"><div class="seg" data-pick="${f.name}">${optionsOf(f.options).map(([k, l]) => `<button type="button" data-val="${esc(k)}" class="${String(k) === String(v) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div><input type="hidden" name="${f.name}" value="${esc(v ?? '')}"></div>`;
    case 'color':
      return `<div class="row">${label}<div class="dots" data-pick="${f.name}">${COLORS.map(c => `<button type="button" class="dot ${c === v ? 'on' : ''}" style="--c:${c}" data-val="${c}" aria-label="Couleur ${c}"></button>`).join('')}</div><input type="hidden" name="${f.name}" value="${esc(v ?? '')}"></div>`;
    default:
      return '';
  }
}
function collect(root, fields) {
  const out = {};
  for (const f of fields) {
    const el = root.querySelector(`[name="${f.name}"]`);
    if (!el) continue;
    if (f.type === 'num') out[f.name] = parseNum(el.value);
    else if (f.type === 'toggle') out[f.name] = el.checked;
    else out[f.name] = String(el.value).trim();
  }
  return out;
}
function openForm({ title, groups, values = {}, onSave, onDelete, onChange, onMount, saveLabel = 'OK', deleteLabel = 'Supprimer', deleteMessage = 'Cette action est définitive.' }) {
  const fields = groups.flatMap(g => g.fields);
  const body = groups.map(g => `${g.header ? `<h3 class="sect">${esc(g.header)}</h3>` : ''}<div class="group">${g.fields.map(f => fieldHTML(f, values[f.name])).join('')}</div>${g.footer ? `<p class="foot">${esc(g.footer)}</p>` : ''}`).join('')
    + (onDelete ? `<div class="group"><div class="row tap danger center" data-del role="button">${esc(deleteLabel)}</div></div>` : '');
  let busy = false;
  return openSheet({
    title, right: saveLabel, body,
    onRight: async c => {
      if (busy) return;
      busy = true;
      try {
        const err = await onSave(collect(c.body, fields), c);
        if (typeof err === 'string') toast(err); else c.close();
      } catch (e) { console.error(e); toast('Enregistrement impossible'); }
      finally { busy = false; }
    },
    onMount: c => {
      c.body.addEventListener('click', async e => {
        const pick = e.target.closest('[data-val]');
        if (pick) {
          const holder = pick.closest('[data-pick]');
          const name = holder.dataset.pick;
          $$('[data-val]', holder).forEach(x => x.classList.toggle('on', x === pick));
          c.body.querySelector(`input[name="${name}"]`).value = pick.dataset.val;
          if (onChange) onChange(name, pick.dataset.val, c.body);
          return;
        }
        if (onDelete && e.target.closest('[data-del]')) {
          const ok = await confirmDialog({ title: deleteLabel + ' ?', message: deleteMessage, confirmLabel: deleteLabel });
          if (!ok) return;
          try { await onDelete(); c.close(); } catch (err) { console.error(err); toast('Suppression impossible'); }
        }
      });
      c.body.addEventListener('input', e => { if (e.target.name && onChange) onChange(e.target.name, e.target.value, c.body); });
      c.body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); e.target.blur(); } });
      if (onMount) onMount(c.body);
    },
  });
}

/* ───────── Formulaires métier ───────── */
function editSalary() {
  openForm({
    title: 'Salaire net',
    groups: [{ fields: [{ name: 'salary', type: 'num', label: 'Net mensuel', suffix: curSymbol() }], footer: 'Montant net perçu chaque mois, après impôts. Sert de base au calcul des enveloppes.' }],
    values: { salary: state.settings.salary || '' },
    onSave: async v => {
      if (v.salary == null || v.salary < 0) return 'Entre un montant valide';
      await saveSetting('salary', round2(v.salary));
      await afterChange();
    },
  });
}

function editBucket(id) {
  const b = id ? state.buckets.find(x => x.id === id) : null;
  const mode0 = b ? b.mode : 'percent';
  openForm({
    title: b ? 'Enveloppe' : 'Nouvelle enveloppe',
    groups: [
      { fields: [
        { name: 'name', type: 'text', label: 'Nom', placeholder: 'Loyer, Courses, Épargne…' },
        { name: 'kind', type: 'select', label: 'Type', options: KINDS },
      ] },
      { fields: [
        { name: 'mode', type: 'segmented', options: { percent: '% du salaire', fixed: 'Montant fixe' } },
        { name: 'value', type: 'num', label: 'Valeur', suffix: mode0 === 'percent' ? '%' : curSymbol() },
      ] },
      { fields: [{ name: 'color', type: 'color', label: 'Couleur' }] },
    ],
    values: { name: b?.name ?? '', kind: b?.kind ?? 'needs', mode: mode0, value: b?.value ?? '', color: b?.color ?? COLORS[state.buckets.length % COLORS.length] },
    onChange: (name, val, root) => {
      if (name === 'mode') root.querySelector('[data-suffix-for="value"]').textContent = val === 'percent' ? '%' : curSymbol();
    },
    onSave: async v => {
      if (!v.name) return 'Donne un nom à l’enveloppe';
      if (v.value == null || v.value <= 0) return 'Entre une valeur supérieure à 0';
      if (v.mode === 'percent' && v.value > 100) return 'Un pourcentage ne peut pas dépasser 100';
      await saveItem('buckets', { ...(b || { id: uid(), createdAt: Date.now(), order: nextOrder(state.buckets) }), name: v.name, kind: v.kind, mode: v.mode, value: round2(v.value), color: v.color });
      await afterChange();
    },
    onDelete: b ? async () => { await removeItem('buckets', b.id); await afterChange(); toast('Enveloppe supprimée'); } : null,
    deleteLabel: 'Supprimer l’enveloppe',
  });
}

async function openTemplates() {
  const i = await actionSheet({
    title: 'Modèles de répartition',
    message: state.buckets.length ? 'Remplace tes enveloppes actuelles (Besoins · Envies · Épargne).' : 'Besoins · Envies · Épargne',
    actions: TEMPLATES.map(t => ({ label: `${t.name} — ${t.desc}` })),
  });
  if (i < 0) return;
  if (state.buckets.length && !(await confirmDialog({ title: 'Remplacer tes enveloppes ?', message: 'Tes enveloppes actuelles seront supprimées.', confirmLabel: 'Remplacer' }))) return;
  for (const b of [...state.buckets]) await removeItem('buckets', b.id);
  const kinds = ['needs', 'wants', 'savings'];
  for (let k = 0; k < 3; k++) {
    await saveItem('buckets', { id: uid(), createdAt: Date.now() + k, order: k, name: KINDS[kinds[k]], kind: kinds[k], mode: 'percent', value: TEMPLATES[i].parts[k], color: KIND_COLORS[kinds[k]] });
  }
  await afterChange();
  toast('Modèle appliqué');
}

function editSub(id) {
  const s = id ? state.subscriptions.find(x => x.id === id) : null;
  const shown = s ? toISO(nextOccurrence(s)) : todayISO();
  openForm({
    title: s ? 'Abonnement' : 'Nouvel abonnement',
    groups: [
      { fields: [
        { name: 'name', type: 'text', label: 'Nom', placeholder: 'Netflix, Loyer, Assurance…' },
        { name: 'amount', type: 'num', label: 'Montant', suffix: curSymbol() },
        { name: 'cycle', type: 'select', label: 'Fréquence', options: CYCLES },
      ] },
      { fields: [
        { name: 'nextDate', type: 'date', label: 'Prochain prélèvement' },
        { name: 'category', type: 'select', label: 'Catégorie', options: SUB_CATS },
      ], footer: 'La date est recalculée automatiquement après chaque échéance.' },
      { fields: [{ name: 'active', type: 'toggle', label: 'Actif' }], footer: 'Désactive un abonnement en pause : il n’est plus compté dans tes totaux.' },
    ],
    values: { name: s?.name ?? '', amount: s?.amount ?? '', cycle: s?.cycle ?? 'monthly', nextDate: shown, category: s?.category ?? 'Autre', active: s ? s.active : true },
    onSave: async v => {
      if (!v.name) return 'Donne un nom à l’abonnement';
      if (v.amount == null || v.amount < 0) return 'Entre un montant valide';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.nextDate)) return 'Choisis une date';
      const nextDate = s && v.nextDate === shown ? s.nextDate : v.nextDate;
      await saveItem('subscriptions', { ...(s || { id: uid(), createdAt: Date.now(), order: nextOrder(state.subscriptions) }), name: v.name, amount: round2(v.amount), cycle: v.cycle, nextDate, category: v.category, active: v.active });
      await afterChange();
      toast(s ? 'Abonnement mis à jour' : 'Abonnement ajouté');
    },
    onDelete: s ? async () => { await removeItem('subscriptions', s.id); await afterChange(); toast('Abonnement supprimé'); } : null,
    deleteLabel: 'Supprimer l’abonnement',
  });
}

/* Placements */
let invCtl = null;
function invDetailHTML(i) {
  const t = INV_TYPES[i.type] || INV_TYPES.other;
  const gain = i.value - i.invested;
  const perf = i.invested > 0 ? gain / i.invested : null;
  const cls = gain >= 0 ? 'pos' : 'neg';
  const pts = i.history.map(p => ({ t: parseISO(p.date).getTime(), v: p.value }));
  return `<section class="hero flat"><div class="eyebrow">${t.icon} ${esc(t.label)}</div><div class="big">${money(i.value, true)}</div>
    <div class="delta ${cls}">${signed(gain)}${perf == null ? '' : ` (${pctS(perf)})`}</div>
    ${pts.length >= 2 ? lineChart(pts, { color: gain >= 0 ? '#34c759' : '#ff3b30' }) : '<p class="foot flush">La courbe apparaîtra après plusieurs mises à jour de la valeur.</p>'}</section>
  <div class="group">${kv('Investi', money(i.invested, true))}${kv('Valeur actuelle', money(i.value, true))}${kv('Dernière mise à jour', esc(dfFull.format(parseISO(i.updatedAt))))}</div>
  <div class="group">
    <div class="row tap blue" data-action="inv-update" data-id="${esc(i.id)}" role="button">Mettre à jour la valeur</div>
    <div class="row tap blue" data-action="inv-contrib" data-id="${esc(i.id)}" role="button">Ajouter un versement</div>
    <div class="row tap blue" data-action="inv-edit" data-id="${esc(i.id)}" role="button">Modifier</div>
  </div>
  <div class="group"><div class="row tap danger center" data-action="inv-delete" data-id="${esc(i.id)}" role="button">Supprimer ce placement</div></div>`;
}
function openInv(id) {
  const i = state.investments.find(x => x.id === id);
  if (!i) return;
  if (invCtl && invCtl.alive) invCtl.close();
  invCtl = openSheet({ title: i.name, left: 'Fermer', right: '', body: invDetailHTML(i) });
  invCtl.invId = id;
}
function refreshOpenSheets() {
  if (invCtl && invCtl.alive) {
    const i = state.investments.find(x => x.id === invCtl.invId);
    if (!i) invCtl.close(); else invCtl.update(invDetailHTML(i));
  }
  if (settingsCtl && settingsCtl.alive) settingsCtl.update(settingsHTML());
}
const invTypeOptions = () => Object.fromEntries(Object.entries(INV_TYPES).map(([k, v]) => [k, v.label]));

function editInv(id) {
  const inv = id ? state.investments.find(x => x.id === id) : null;
  openForm({
    title: inv ? 'Modifier le placement' : 'Nouveau placement',
    groups: [
      { fields: [
        { name: 'name', type: 'text', label: 'Nom', placeholder: 'ETF MSCI World, PEA…' },
        { name: 'type', type: 'select', label: 'Type', options: invTypeOptions() },
      ] },
      { fields: [
        { name: 'invested', type: 'num', label: 'Total investi', suffix: curSymbol() },
        { name: 'value', type: 'num', label: 'Valeur actuelle', suffix: curSymbol() },
      ], footer: 'Le total investi correspond à la somme de tes versements. La performance = (valeur − investi) ÷ investi.' },
    ],
    values: { name: inv?.name ?? '', type: inv?.type ?? 'etf', invested: inv?.invested ?? '', value: inv?.value ?? '' },
    onSave: async v => {
      if (!v.name) return 'Donne un nom au placement';
      if (v.invested == null || v.invested < 0) return 'Total investi invalide';
      if (v.value == null || v.value < 0) return 'Valeur actuelle invalide';
      const item = inv || { id: uid(), createdAt: Date.now(), order: nextOrder(state.investments), history: [], updatedAt: todayISO(), value: 0 };
      const valueChanged = !inv || round2(v.value) !== item.value;
      Object.assign(item, { name: v.name, type: v.type, invested: round2(v.invested), value: round2(v.value) });
      if (valueChanged) { item.updatedAt = todayISO(); pushHistory(item, item.value, item.updatedAt); }
      await saveItem('investments', item);
      await afterChange();
      toast(inv ? 'Placement mis à jour' : 'Placement ajouté');
    },
  });
}
function updateInvValue(id) {
  const inv = state.investments.find(x => x.id === id);
  if (!inv) return;
  openForm({
    title: 'Nouvelle valeur',
    groups: [{ fields: [
      { name: 'value', type: 'num', label: 'Valeur actuelle', suffix: curSymbol() },
      { name: 'date', type: 'date', label: 'Date' },
    ], footer: `${inv.name} — valeur précédente : ${money(inv.value, true)}.` }],
    values: { value: inv.value, date: todayISO() },
    onSave: async v => {
      if (v.value == null || v.value < 0) return 'Valeur invalide';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return 'Choisis une date';
      inv.value = round2(v.value);
      if (v.date >= inv.updatedAt) inv.updatedAt = v.date;
      pushHistory(inv, inv.value, v.date);
      await saveItem('investments', inv);
      await afterChange();
      toast('Valeur mise à jour');
    },
  });
}
function addContribution(id) {
  const inv = state.investments.find(x => x.id === id);
  if (!inv) return;
  openForm({
    title: 'Nouveau versement',
    groups: [{ fields: [
      { name: 'amount', type: 'num', label: 'Montant versé', suffix: curSymbol() },
      { name: 'date', type: 'date', label: 'Date' },
    ], footer: 'Le total investi et la valeur actuelle augmentent du même montant. Ajuste ensuite la valeur si besoin.' }],
    values: { amount: '', date: todayISO() },
    onSave: async v => {
      if (v.amount == null || v.amount <= 0) return 'Entre un montant supérieur à 0';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return 'Choisis une date';
      inv.invested = round2(inv.invested + v.amount);
      inv.value = round2(inv.value + v.amount);
      if (v.date >= inv.updatedAt) inv.updatedAt = v.date;
      pushHistory(inv, inv.value, v.date);
      await saveItem('investments', inv);
      await afterChange();
      toast('Versement ajouté');
    },
  });
}
async function deleteInv(id) {
  const inv = state.investments.find(x => x.id === id);
  if (!inv) return;
  if (!(await confirmDialog({ title: 'Supprimer ce placement ?', message: inv.name, confirmLabel: 'Supprimer' }))) return;
  await removeItem('investments', id);
  await afterChange();
  toast('Placement supprimé');
}

/* Comptes & dettes */
function editAccount(id) {
  const a = id ? state.accounts.find(x => x.id === id) : null;
  openForm({
    title: a ? 'Compte' : 'Nouveau compte',
    groups: [{ fields: [
      { name: 'name', type: 'text', label: 'Nom', placeholder: 'Compte courant, Livret A…' },
      { name: 'type', type: 'select', label: 'Type', options: Object.fromEntries(Object.entries(ACCOUNT_TYPES).map(([k, v]) => [k, v.label])) },
      { name: 'balance', type: 'num', label: 'Solde', suffix: curSymbol() },
    ] }],
    values: { name: a?.name ?? '', type: a?.type ?? 'checking', balance: a?.balance ?? '' },
    onSave: async v => {
      if (!v.name) return 'Donne un nom au compte';
      if (v.balance == null) return 'Entre un solde valide';
      await saveItem('accounts', { ...(a || { id: uid(), createdAt: Date.now(), order: nextOrder(state.accounts) }), name: v.name, type: v.type, balance: round2(v.balance) });
      await afterChange();
      toast(a ? 'Compte mis à jour' : 'Compte ajouté');
    },
    onDelete: a ? async () => { await removeItem('accounts', a.id); await afterChange(); toast('Compte supprimé'); } : null,
    deleteLabel: 'Supprimer le compte',
  });
}
function editDebt(id) {
  const d = id ? state.debts.find(x => x.id === id) : null;
  openForm({
    title: d ? 'Dette' : 'Nouvelle dette',
    groups: [{ fields: [
      { name: 'name', type: 'text', label: 'Nom', placeholder: 'Crédit auto, Prêt immo…' },
      { name: 'remaining', type: 'num', label: 'Restant dû', suffix: curSymbol() },
      { name: 'monthly', type: 'num', label: 'Mensualité', suffix: curSymbol() },
    ] }],
    values: { name: d?.name ?? '', remaining: d?.remaining ?? '', monthly: d?.monthly ?? '' },
    onSave: async v => {
      if (!v.name) return 'Donne un nom à la dette';
      if (v.remaining == null || v.remaining < 0) return 'Montant restant invalide';
      if (v.monthly != null && v.monthly < 0) return 'Mensualité invalide';
      await saveItem('debts', { ...(d || { id: uid(), createdAt: Date.now(), order: nextOrder(state.debts) }), name: v.name, remaining: round2(v.remaining), monthly: round2(v.monthly ?? 0) });
      await afterChange();
      toast(d ? 'Dette mise à jour' : 'Dette ajoutée');
    },
    onDelete: d ? async () => { await removeItem('debts', d.id); await afterChange(); toast('Dette supprimée'); } : null,
    deleteLabel: 'Supprimer la dette',
  });
}

/* ═══════════ Sauvegarde / restauration ═══════════ */
function buildExport() {
  const { salary, theme, currency } = state.settings;
  return {
    app: APP_ID, schema: SCHEMA, exportedAt: new Date().toISOString(),
    data: {
      settings: { salary, theme, currency },
      buckets: state.buckets, subscriptions: state.subscriptions, investments: state.investments,
      accounts: state.accounts, debts: state.debts, snapshots: state.snapshots,
    },
  };
}
async function exportData() {
  const json = JSON.stringify(buildExport(), null, 2);
  const name = `mon-budget-${todayISO()}.json`;
  let shared = false;
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      shared = true;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  if (!shared) {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  await saveSetting('lastExport', new Date().toISOString());
  render();
  toast('Sauvegarde exportée');
}

const S = {
  str: (v, max = 60) => String(v ?? '').slice(0, max).trim(),
  num: (v, def = 0) => { const n = Number(v); return Number.isFinite(n) ? n : def; },
  date: (v, def) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parseISO(v).getTime()) ? v : def),
  one: (v, list, def) => (list.includes(v) ? v : def),
  id: v => (typeof v === 'string' && v && v.length <= 64 ? v : uid()),
  ts: v => (Number.isFinite(Number(v)) && v !== null ? Number(v) : Date.now()),
  color: (v, i) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : COLORS[i % COLORS.length]),
};
function sanitizeImport(raw) {
  if (!raw || typeof raw !== 'object' || raw.app !== APP_ID || !raw.data || typeof raw.data !== 'object') throw new Error('Ce fichier n’est pas une sauvegarde Mon Budget.');
  if (Number(raw.schema) > SCHEMA) throw new Error('Sauvegarde créée par une version plus récente de l’application.');
  const d = raw.data;
  const list = k => (Array.isArray(d[k]) ? d[k].filter(x => x && typeof x === 'object') : []);
  const today = todayISO();
  const st = d.settings && typeof d.settings === 'object' ? d.settings : {};
  const out = {
    settings: {
      salary: Math.max(0, S.num(st.salary)),
      theme: S.one(st.theme, ['auto', 'light', 'dark'], 'auto'),
      currency: S.one(st.currency, Object.keys(CURRENCIES), 'EUR'),
      lastExport: typeof raw.exportedAt === 'string' && !Number.isNaN(Date.parse(raw.exportedAt)) ? raw.exportedAt : null,
    },
    buckets: list('buckets').map((b, i) => ({
      id: S.id(b.id), createdAt: S.ts(b.createdAt), order: S.num(b.order, i), name: S.str(b.name) || 'Enveloppe',
      kind: S.one(b.kind, Object.keys(KINDS), 'needs'), mode: S.one(b.mode, ['percent', 'fixed'], 'percent'),
      value: Math.max(0, S.num(b.value)), color: S.color(b.color, i),
    })),
    subscriptions: list('subscriptions').map((s, i) => ({
      id: S.id(s.id), createdAt: S.ts(s.createdAt), order: S.num(s.order, i), name: S.str(s.name) || 'Abonnement',
      amount: Math.max(0, S.num(s.amount)), cycle: S.one(s.cycle, Object.keys(CYCLES), 'monthly'),
      nextDate: S.date(s.nextDate, today), category: S.one(s.category, SUB_CATS, 'Autre'), active: s.active !== false,
    })),
    investments: list('investments').map((v, i) => {
      const updatedAt = S.date(v.updatedAt, today);
      const history = (Array.isArray(v.history) ? v.history : []).filter(p => p && S.date(p.date, null)).map(p => ({ date: p.date, value: Math.max(0, S.num(p.value)) })).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-400);
      return { id: S.id(v.id), createdAt: S.ts(v.createdAt), order: S.num(v.order, i), name: S.str(v.name) || 'Placement', type: S.one(v.type, Object.keys(INV_TYPES), 'other'), invested: Math.max(0, S.num(v.invested)), value: Math.max(0, S.num(v.value)), updatedAt, history };
    }),
    accounts: list('accounts').map((a, i) => ({ id: S.id(a.id), createdAt: S.ts(a.createdAt), order: S.num(a.order, i), name: S.str(a.name) || 'Compte', type: S.one(a.type, Object.keys(ACCOUNT_TYPES), 'checking'), balance: S.num(a.balance) })),
    debts: list('debts').map((x, i) => ({ id: S.id(x.id), createdAt: S.ts(x.createdAt), order: S.num(x.order, i), name: S.str(x.name) || 'Dette', remaining: Math.max(0, S.num(x.remaining)), monthly: Math.max(0, S.num(x.monthly)) })),
    snapshots: list('snapshots').filter(s => S.date(s.date, null)).map(s => ({ date: s.date, netWorth: S.num(s.netWorth), accounts: S.num(s.accounts), investments: S.num(s.investments), debts: S.num(s.debts) })),
  };
  return out;
}
const toRecords = clean => ({ ...clean, settings: Object.entries(clean.settings).map(([key, value]) => ({ key, value })) });

async function importFile(file) {
  let clean;
  try {
    clean = sanitizeImport(JSON.parse(await file.text()));
  } catch (e) {
    toast(e instanceof SyntaxError ? 'Fichier illisible (JSON invalide)' : e.message || 'Import impossible');
    return;
  }
  const n = k => clean[k].length;
  const ok = await confirmDialog({
    title: 'Remplacer les données ?',
    message: `${n('buckets')} enveloppes, ${n('subscriptions')} abonnements, ${n('investments')} placements, ${n('accounts')} comptes, ${n('debts')} dettes. Les données actuelles seront remplacées.`,
    confirmLabel: 'Importer', destructive: true,
  });
  if (!ok) return;
  try {
    await dbReplaceAll(toRecords(clean));
    await loadAll();
    setupFormats(); applyTheme(); render();
    toast('Sauvegarde importée');
  } catch (e) { console.error(e); toast('Import impossible'); }
}

async function wipeAll() {
  if (!(await confirmDialog({ title: 'Tout effacer ?', message: 'Toutes les données de cet appareil seront supprimées. Pense à exporter une sauvegarde avant.', confirmLabel: 'Tout effacer' }))) return;
  await dbReplaceAll({});
  await loadAll();
  setupFormats(); applyTheme(); render();
  toast('Données effacées');
}

/* ═══════════ Réglages ═══════════ */
let settingsCtl = null;
function settingsHTML() {
  const s = state.settings;
  const last = s.lastExport ? dfFull.format(new Date(s.lastExport)) : 'jamais';
  const standalone = navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  const themeBtn = (v, l) => `<button type="button" class="${s.theme === v ? 'on' : ''}" data-action="set-theme" data-val="${v}">${l}</button>`;
  const info = (k, v) => `<div class="row"><span>${k}</span><span class="grow"></span><span class="kvv">${v}</span></div>`;
  return `
  <h3 class="sect">Apparence</h3>
  <div class="group">
    <div class="row"><div class="seg">${themeBtn('auto', 'Auto')}${themeBtn('light', 'Clair')}${themeBtn('dark', 'Sombre')}</div></div>
    <label class="row field"><span class="lbl">Devise</span><select class="inp" data-setting="currency">${Object.entries(CURRENCIES).map(([k, l]) => `<option value="${k}" ${k === s.currency ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
  </div>
  <h3 class="sect">Sauvegarde</h3>
  <div class="group">
    <div class="row tap blue" data-action="export" role="button">Exporter mes données</div>
    <div class="row tap blue" data-action="import" role="button">Importer une sauvegarde</div>
  </div>
  <p class="foot">Dernière sauvegarde : ${esc(last)}. Tes données ne sont stockées que sur cet appareil : exporte régulièrement le fichier JSON (Fichiers, iCloud Drive…) pour ne rien perdre.</p>
  ${standalone ? '' : `<h3 class="sect">Installation</h3><p class="foot" style="margin-top:6px">Dans Safari, touche <b>Partager</b> puis <b>Sur l’écran d’accueil</b> pour installer l’app. Elle fonctionnera hors ligne et iOS conservera mieux tes données.</p>`}
  <h3 class="sect">Confidentialité</h3>
  <div class="group">
    ${info('Données envoyées en ligne', 'Aucune')}
    ${info('Stockage persistant', runtime.persisted == null ? '—' : runtime.persisted ? 'Oui' : 'Non')}
    ${info('Mode hors ligne', navigator.serviceWorker && navigator.serviceWorker.controller ? 'Prêt' : 'Au prochain lancement')}
  </div>
  <p class="foot">Pas de serveur, pas de compte, pas de suivi, aucune connexion bancaire. Tout est calculé et conservé dans ton navigateur (IndexedDB).</p>
  <div class="group" style="margin-top:22px"><div class="row tap danger center" data-action="wipe" role="button">Effacer toutes les données</div></div>
  <p class="foot center">Mon Budget · version ${APP_VERSION}</p>`;
}
function openSettings() {
  if (settingsCtl && settingsCtl.alive) return;
  settingsCtl = openSheet({ title: 'Réglages', left: 'Fermer', right: '', body: settingsHTML() });
}
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  requestAnimationFrame(() => {
    const meta = $('meta[name="theme-color"]');
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (meta && bg) meta.setAttribute('content', bg);
  });
}

/* ═══════════ Actions & événements ═══════════ */
const ACTIONS = {
  tab: d => setTab(d.tab),
  settings: () => openSettings(),
  'edit-salary': () => editSalary(),
  'add-bucket': () => editBucket(),
  'edit-bucket': d => editBucket(d.id),
  templates: () => openTemplates(),
  'add-sub': () => editSub(),
  'edit-sub': d => editSub(d.id),
  'add-inv': () => editInv(),
  'open-inv': d => openInv(d.id),
  'inv-update': d => updateInvValue(d.id),
  'inv-contrib': d => addContribution(d.id),
  'inv-edit': d => editInv(d.id),
  'inv-delete': async d => { await deleteInv(d.id); },
  'add-account': () => editAccount(),
  'edit-account': d => editAccount(d.id),
  'add-debt': () => editDebt(),
  'edit-debt': d => editDebt(d.id),
  'add-wealth': async () => {
    const i = await actionSheet({ title: 'Ajouter', actions: [{ label: 'Un compte' }, { label: 'Une dette ou un crédit' }] });
    if (i === 0) editAccount(); else if (i === 1) editDebt();
  },
  export: () => exportData(),
  import: () => $('#import-file').click(),
  wipe: () => wipeAll(),
  'set-theme': async d => { await saveSetting('theme', d.val); applyTheme(); render(); },
};

function bindEvents() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    Promise.resolve(fn(el.dataset, el)).catch(err => { console.error(err); toast('Une erreur est survenue'); });
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t && t.dataset && t.dataset.setting === 'currency') {
      await saveSetting('currency', t.value);
      setupFormats(); render();
    }
  });
  $('#import-file').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) importFile(f);
  });
  window.addEventListener('scroll', updateNav, { passive: true });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sheets.length) sheets[sheets.length - 1].close();
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') { await recordSnapshot(); render(); }
  });
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme();
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }
}

/* ═══════════ Démarrage ═══════════ */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(err => console.warn('Service worker non enregistré', err));
  });
}
async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      runtime.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    }
  } catch { /* ignoré */ }
}

async function init() {
  setupFormats();
  bindEvents();
  try {
    await loadAll();
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="empty"><div class="emoji">⚠️</div><h3>Stockage indisponible</h3><p>Impossible d’ouvrir la base de données locale. Vérifie que la navigation privée est désactivée, puis recharge la page.</p></div>`;
    return;
  }
  setupFormats();
  applyTheme();
  await recordSnapshot();
  render();
  registerServiceWorker();
  requestPersistence().then(refreshOpenSheets);
}

init();
})();
