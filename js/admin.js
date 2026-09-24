// 管理頁：用帳號密碼登入後才能用
import { app, db } from './firebase.js';
import {
  getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { addDays, today, wd, DAYC, mdw, esc, parseTimetable, htmlTableToTSV } from './shared.js';
import { INITIAL_TERM, INITIAL_ROOMS, INITIAL_ENTRIES } from './initial-data.js';

const auth = getAuth(app);
const $ = id => document.getElementById(id);
const CONFIG = doc(db, 'config', 'main');
let cfg = { rooms: [], periods: 7, terms: [] };

// ====== 登入 ======
const LOGIN_ERRORS = {
  'auth/invalid-credential': '帳號或密碼錯誤',
  'auth/invalid-email': 'Email 格式不對',
  'auth/too-many-requests': '嘗試太多次了，請過幾分鐘再試',
};
$('loginForm').onsubmit = async e => {
  e.preventDefault();
  $('loginErr').textContent = '';
  $('loginBtn').disabled = true;
  try { await signInWithEmailAndPassword(auth, $('loginEmail').value.trim(), $('loginPw').value); }
  catch (err) { $('loginErr').textContent = '登入失敗：' + (LOGIN_ERRORS[err.code] || err.message); }
  $('loginBtn').disabled = false;
};
$('forgot').onclick = async () => {
  const email = $('loginEmail').value.trim();
  if (!email) { $('loginErr').textContent = '請先在上面填入帳號（Email），再按「忘記密碼」'; return; }
  try {
    await sendPasswordResetEmail(auth, email);
    $('loginErr').textContent = '如果這是管理者帳號，重設密碼的信已寄到 ' + email + '，請去收信。';
  } catch (err) { $('loginErr').textContent = '寄送失敗：' + (LOGIN_ERRORS[err.code] || err.message); }
};

onAuthStateChanged(auth, async user => {
  $('who').innerHTML = '';
  $('main').hidden = true;
  $('login').hidden = !!user;
  if (!user) return;
  try {
    const me = await getDoc(doc(db, 'admins', user.uid));
    if (!me.exists()) throw new Error();
  } catch (e) {
    await signOut(auth);
    $('loginErr').textContent = '「' + user.email + '」沒有管理權限。';
    return;
  }
  $('who').innerHTML = `<span>${esc(user.email)}</span><button class="btn sm" id="logout">登出</button>`;
  $('logout').onclick = () => signOut(auth);
  $('loginPw').value = '';
  $('main').hidden = false;
  await loadConfig();
  loadRecords();
});

async function loadConfig() {
  const snap = await getDoc(CONFIG);
  $('setup').hidden = snap.exists();
  cfg = Object.assign({ rooms: [], periods: 7, terms: [] }, snap.data());
  renderSettings();
}

// 第一次使用：寫入 5 間教室和 115 上學期課表
$('setupBtn').onclick = async () => {
  $('setupBtn').disabled = true;
  try {
    const batch = writeBatch(db);
    batch.set(CONFIG, { rooms: INITIAL_ROOMS.map(name => ({ name, open: true })), periods: 7, terms: [INITIAL_TERM] });
    batch.set(doc(db, 'timetables', INITIAL_TERM.name), { entries: INITIAL_ENTRIES, updatedAt: serverTimestamp() });
    await batch.commit();
    await loadConfig();
  } catch (e) {
    $('setupErr').textContent = '建立失敗：' + e.message;
    $('setupBtn').disabled = false;
  }
};

// ====== 分頁 ======
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
  document.querySelectorAll('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== b.dataset.tab);
});

// ====== 預約紀錄 ======
$('rFrom').value = addDays(today(), -7);
$('rTo').value = addDays(today(), 30);
let records = [];

async function loadRecords() {
  $('rMsg').className = 'msg'; $('rMsg').textContent = '';
  const from = $('rFrom').value, to = $('rTo').value;
  if (!from || !to || from > to) { $('rMsg').className = 'msg err'; $('rMsg').textContent = '日期範圍有誤'; return; }
  $('rTbl').innerHTML = '<p class="hint" style="padding:10px;margin:0">讀取中…</p>';
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), where('date', '>=', from), where('date', '<=', to)));
    records = snap.docs.map(s => ({ id: s.id, ...s.data() }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period || a.room.localeCompare(b.room));
    renderRecords();
  } catch (e) { $('rTbl').innerHTML = ''; $('rMsg').className = 'msg err'; $('rMsg').textContent = '讀取失敗：' + e.message; }
}

function renderRecords() {
  const list = records.filter(b => $('rAll').checked || b.status === '有效');
  if (!list.length) { $('rTbl').innerHTML = '<p class="hint" style="padding:10px;margin:0">這段期間沒有預約</p>'; return; }
  const t0 = today();
  $('rTbl').innerHTML = '<table><thead><tr><th>日期</th><th>節</th><th>教室</th><th>班級</th><th>預約老師</th><th>用途</th><th>狀態</th><th></th></tr></thead><tbody>' +
    list.map(b => `<tr class="${b.status === '有效' ? '' : 'off'}"><td>${mdw(b.date)}</td><td>${b.period}</td><td>${esc(b.room)}</td><td>${esc(b.klass)}</td><td>${esc(b.name)}</td><td>${esc(b.purpose || '')}</td><td>${esc(b.status)}</td>` +
      `<td>${b.status === '有效' && b.date >= t0 ? `<button class="btn sm danger" data-cancel="${esc(b.id)}">取消</button>` : ''}</td></tr>`).join('') +
    '</tbody></table>';
}

$('rGo').onclick = loadRecords;
$('rAll').onchange = renderRecords;
$('rTbl').onclick = async e => {
  const id = e.target.dataset && e.target.dataset.cancel;
  if (!id) return;
  const b = records.find(x => x.id === id);
  if (!confirm(`確定要取消 ${mdw(b.date)}第 ${b.period} 節【${b.room}】${b.klass}（${b.name}）的預約嗎？\n取消後請記得通知這位老師。`)) return;
  const batch = writeBatch(db);
  batch.update(doc(db, 'bookings', id), { status: '已取消', cancelledAt: serverTimestamp(), cancelName: '管理者' });
  batch.set(doc(collection(db, 'logs')),
    { action: '管理者取消', date: b.date, period: b.period, room: b.room, name: b.name, klass: b.klass, purpose: b.purpose || '', at: serverTimestamp() });
  try { await batch.commit(); loadRecords(); }
  catch (err) { $('rMsg').className = 'msg err'; $('rMsg').textContent = '取消失敗：' + err.message; }
};
$('rCsv').onclick = () => {
  const list = records.filter(b => $('rAll').checked || b.status === '有效');
  const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['日期', '星期', '節次', '教室', '使用班級', '預約老師', '用途', '狀態']]
    .concat(list.map(b => [b.date, DAYC[wd(b.date)], b.period, b.room, b.klass, b.name, b.purpose || '', b.status]));
  const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `教室預約紀錄_${$('rFrom').value}_${$('rTo').value}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

// ====== 匯入課表 ======
let parsed = null;
function preview() {
  $('pmsg').className = 'msg'; $('pmsg').textContent = '';
  parsed = null;
  const text = $('tx').value;
  if (!text.trim()) { $('pv').innerHTML = '<p class="hint" style="padding:10px;margin:0">貼上課表後，這裡會顯示讀到的內容。</p>'; return check(); }
  try {
    parsed = parseTimetable(text);
    const map = {};
    parsed.entries.forEach(e => map[e.day + '|' + e.period + '|' + e.room] = e.label);
    let h = '<table><thead><tr><th>星期</th><th>節</th>' + parsed.rooms.map(r => '<th>' + esc(r) + '</th>').join('') + '</tr></thead><tbody>';
    for (let d = 1; d <= 5; d++) for (let p = 1; p <= parsed.periods; p++) {
      h += '<tr>' + (p === 1 ? '<th rowspan="' + parsed.periods + '">' + DAYC[d] + '</th>' : '') + '<th>' + p + '</th>';
      parsed.rooms.forEach(r => { const v = map[d + '|' + p + '|' + r]; h += '<td' + (v ? ' class="f"' : '') + '>' + esc(v || '') + '</td>'; });
      h += '</tr>';
    }
    $('pv').innerHTML = h + '</tbody></table>';
    $('pmsg').className = 'msg ok';
    $('pmsg').textContent = '讀到 ' + parsed.rooms.length + ' 間教室（' + parsed.rooms.join('、') + '），共 ' + parsed.entries.length + ' 節固定課。請對照下表確認。';
  } catch (e) {
    $('pv').innerHTML = '';
    $('pmsg').className = 'msg err'; $('pmsg').textContent = e.message;
  }
  check();
}
function check() {
  $('go').disabled = !(parsed && parsed.entries.length && $('tn').value.trim() && $('ts').value && $('te').value);
}
$('tx').addEventListener('paste', e => {
  const html = e.clipboardData && e.clipboardData.getData('text/html');
  const tsv = html && htmlTableToTSV(html);
  if (!tsv) return;
  e.preventDefault();
  $('tx').value = tsv;
  preview();
});
$('tx').addEventListener('input', preview);
['tn', 'ts', 'te'].forEach(id => $(id).addEventListener('input', check));

$('go').onclick = async () => {
  const name = $('tn').value.trim().replace(/\//g, '-').slice(0, 30), start = $('ts').value, end = $('te').value;
  const say = (cls, t) => { $('imsg').className = 'msg ' + cls; $('imsg').textContent = t; };
  if (start > end) return say('err', '開始日不能晚於結束日');
  $('go').disabled = true; $('go').textContent = '匯入中…';
  try {
    await loadConfig();
    const overlap = cfg.terms.find(t => t.name !== name && t.start <= end && start <= t.end);
    if (overlap) throw new Error(`日期和「${overlap.name}」（${overlap.start}～${overlap.end}）重疊了`);
    const terms = cfg.terms.filter(t => t.name !== name).concat([{ name, start, end }]).sort((a, b) => a.start.localeCompare(b.start));
    const known = cfg.rooms.map(r => r.name);
    const newRooms = parsed.rooms.filter(r => !known.includes(r));
    const rooms = cfg.rooms.concat(newRooms.map(r => ({ name: r, open: true })));
    const batch = writeBatch(db);
    batch.set(doc(db, 'timetables', name), { entries: parsed.entries, updatedAt: serverTimestamp() });
    batch.set(CONFIG, { rooms, terms, periods: Math.max(Number(cfg.periods) || 7, parsed.periods) });
    await batch.commit();
    await loadConfig();

    // 已經有人預約、但和新課表撞堂的時段
    const from = start > today() ? start : today();
    const snap = await getDocs(query(collection(db, 'bookings'), where('date', '>=', from), where('date', '<=', end)));
    const conflicts = snap.docs.map(s => s.data()).filter(b => b.status === '有效' &&
      parsed.entries.some(e => e.day === wd(b.date) && e.period === b.period && e.room === b.room))
      .map(b => `${mdw(b.date)}第 ${b.period} 節【${b.room}】${b.klass}（${b.name}）`);

    let t = `✅ 已匯入「${name}」共 ${parsed.entries.length} 節固定課。`;
    if (newRooms.length) t += '\n新增教室：' + newRooms.join('、') + '（不開放的話，到「教室與學期」取消勾選）';
    if (conflicts.length) say('warn', t + '\n\n⚠️ 以下已經有人預約的時段，和新課表撞堂了，請通知預約的老師：\n' + conflicts.join('\n'));
    else say('ok', t);
  } catch (e) { say('err', '匯入失敗：' + e.message); }
  $('go').textContent = '匯入這個學期'; check();
};

// ====== 教室與學期 ======
function renderSettings() {
  $('roomList').innerHTML = cfg.rooms.map((r, i) => `
    <div class="list-row">
      <label style="display:flex;gap:6px;align-items:center;color:var(--ink);font-size:14px" class="grow"><input type="checkbox" data-open="${i}" ${r.open !== false ? 'checked' : ''}>${esc(r.name)}</label>
      <span class="muted" style="font-size:12.5px">${r.open !== false ? '開放' : '暫停'}</span>
      <button class="btn sm danger" data-delroom="${i}">刪除</button>
    </div>`).join('') || '<p class="hint">還沒有教室</p>';
  $('periods').value = cfg.periods || 7;
  $('termList').innerHTML = cfg.terms.map((t, i) => `
    <div class="list-row">
      <span class="grow">${esc(t.name)}</span>
      <input type="date" data-tstart="${i}" value="${esc(t.start)}"> ～
      <input type="date" data-tend="${i}" value="${esc(t.end)}">
      <button class="btn sm danger" data-delterm="${i}">刪除</button>
    </div>`).join('') || '<p class="hint">還沒有學期，請到「匯入新學期課表」新增</p>';
}
let deletedTerms = [];
$('roomList').onclick = e => {
  const i = e.target.dataset.delroom;
  if (i === undefined) return;
  if (!confirm(`確定要刪除「${cfg.rooms[i].name}」嗎？（只想暫停的話，取消勾選就好）`)) return;
  cfg.rooms.splice(Number(i), 1); renderSettings();
};
$('roomList').onchange = e => {
  const i = e.target.dataset.open;
  if (i !== undefined) { cfg.rooms[i].open = e.target.checked; renderSettings(); }
};
$('addRoom').onclick = () => {
  const n = $('newRoom').value.trim().replace(/[\/_]/g, '');
  if (!n || cfg.rooms.some(r => r.name === n)) return;
  cfg.rooms.push({ name: n, open: true }); $('newRoom').value = ''; renderSettings();
};
$('termList').onchange = e => {
  const d = e.target.dataset;
  if (d.tstart !== undefined) cfg.terms[d.tstart].start = e.target.value;
  if (d.tend !== undefined) cfg.terms[d.tend].end = e.target.value;
};
$('termList').onclick = e => {
  const i = e.target.dataset.delterm;
  if (i === undefined) return;
  if (!confirm(`確定要刪除「${cfg.terms[i].name}」和它的固定課表嗎？`)) return;
  deletedTerms.push(cfg.terms[i].name);
  cfg.terms.splice(Number(i), 1); renderSettings();
};
$('saveSettings').onclick = async () => {
  const say = (cls, t) => { $('smsg').className = 'msg ' + cls; $('smsg').textContent = t; };
  const periods = Math.round(Number($('periods').value));
  if (!(periods >= 1 && periods <= 12)) return say('err', '每天節數要在 1～12 之間');
  const terms = cfg.terms.slice().sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < terms.length; i++) {
    if (!terms[i].start || !terms[i].end || terms[i].start > terms[i].end) return say('err', `「${terms[i].name}」的日期有誤`);
    if (i && terms[i].start <= terms[i - 1].end) return say('err', `「${terms[i - 1].name}」和「${terms[i].name}」的日期重疊了`);
  }
  try {
    await setDoc(CONFIG, { rooms: cfg.rooms, periods, terms });
    await Promise.all(deletedTerms.map(n => deleteDoc(doc(db, 'timetables', n))));
    deletedTerms = [];
    await loadConfig();
    say('ok', '✅ 已儲存，預約頁會自動更新');
  } catch (e) { say('err', '儲存失敗：' + e.message); }
};
