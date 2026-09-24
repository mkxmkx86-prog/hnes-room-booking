// 老師用的預約網頁
import { db } from './firebase.js';
import {
  doc, getDoc, collection, query, where, onSnapshot, getDocs, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  ymd, addDays, wd, DAYC, md, mdw, mondayOf, today, esc, termOf, slotId, slotsSummary, bookMessage, cancelMessage,
} from './shared.js';

// ====== 資料 ======
const cfg = { rooms: [], periods: 7, terms: [] };
const timetables = {}; // 學期名稱 → [{day, period, room, label}]
let bookings = [];
let unsubWeek = null;

async function loadTimetable(term) {
  if (!timetables[term]) {
    const snap = await getDoc(doc(db, 'timetables', term));
    timetables[term] = snap.exists() ? (snap.data().entries || []) : [];
  }
  return timetables[term];
}

function fixedAt(date, period, room) {
  const t = termOf(date, cfg.terms);
  if (!t) return null;
  const day = wd(date);
  return (timetables[t.name] || []).find(e => e.day === day && e.period === period && e.room === room) || null;
}

const toBooking = s => ({ id: s.id, ...s.data() });

// ====== 畫面狀態 ======
const NAME_KEY = 'hnes-room-name', KLASS_KEY = 'hnes-room-klass';
const getPref = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

function defaultWeek() {
  const t = today(), w = wd(t);
  return mondayOf(w === 6 ? addDays(t, 2) : w === 0 ? addDays(t, 1) : t);
}
const S = { view: 'room', room: null, day: null, week: defaultWeek(), sel: new Map(), ready: false };
const $ = id => document.getElementById(id);
const dlg = $('dlg'), dlgBody = $('dlgBody');

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}
function showError(msg) {
  $('grid').innerHTML = '<p style="padding:20px;color:var(--danger)">' + esc(msg) + '</p>';
  $('grid').classList.remove('loading');
}

// 設定（教室、學期）有變動時自動更新
onSnapshot(doc(db, 'config', 'main'), snap => {
  const d = snap.data() || {};
  cfg.rooms = (d.rooms || []).filter(r => r.open !== false).map(r => r.name);
  cfg.periods = Number(d.periods) || 7;
  cfg.terms = d.terms || [];
  Object.keys(timetables).forEach(k => delete timetables[k]);
  if (!cfg.rooms.includes(S.room)) S.room = cfg.rooms[0];
  loadWeek();
}, err => showError('讀取設定失敗：' + err.message));

// 這一週的預約：別人一預約，畫面就會自動更新
async function loadWeek() {
  $('grid').classList.add('loading');
  const end = addDays(S.week, 4);
  $('weekLbl').textContent = md(S.week) + ' – ' + md(end);
  try {
    const terms = new Set([0, 1, 2, 3, 4].map(i => termOf(addDays(S.week, i), cfg.terms)).filter(Boolean).map(t => t.name));
    await Promise.all([...terms].map(loadTimetable));
  } catch (e) { return showError('讀取課表失敗：' + e.message); }
  if (unsubWeek) unsubWeek();
  const q = query(collection(db, 'bookings'), where('date', '>=', S.week), where('date', '<=', end));
  unsubWeek = onSnapshot(q, snap => {
    bookings = snap.docs.map(toBooking).filter(b => b.status === '有效');
    S.ready = true;
    render();
    $('grid').classList.remove('loading');
  }, err => showError('讀取預約失敗：' + err.message));
}

function render() {
  if (!S.ready) return;
  const t0 = today();
  const dates = [0, 1, 2, 3, 4].map(i => addDays(S.week, i));
  if (!dates.includes(S.day)) S.day = dates.includes(t0) ? t0 : dates[0];
  const term = dates.map(d => termOf(d, cfg.terms)).find(Boolean);
  $('termLbl').textContent = term ? term.name : '這週不在學期上課期間';

  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === S.view));
  $('chips').innerHTML = S.view === 'room'
    ? cfg.rooms.map(r => `<button type="button" class="chip" data-room="${esc(r)}" aria-pressed="${r === S.room}">${esc(r)}</button>`).join('')
    : dates.map(dt => `<button type="button" class="chip" data-day="${dt}" aria-pressed="${dt === S.day}">週${DAYC[wd(dt)]} ${md(dt)}</button>`).join('');

  const booked = {};
  bookings.forEach(b => booked[slotId(b.date, b.period, b.room)] = b);
  const cols = S.view === 'room'
    ? dates.map(dt => ({ date: dt, room: S.room, head: '週' + DAYC[wd(dt)], sub: md(dt), today: dt === t0 }))
    : cfg.rooms.map(r => ({ date: S.day, room: r, head: r, sub: '', today: false }));

  if (!cols.length || !cols[0].room) { $('grid').innerHTML = '<p class="empty">目前沒有開放預約的教室</p>'; return; }
  let h = '<table><thead><tr><th class="pcol" scope="col">節次</th>';
  cols.forEach(c => h += `<th scope="col" class="${c.today ? 'today' : ''}">${esc(c.head)}${c.sub ? '<small>' + c.sub + (c.today ? '・今天' : '') + '</small>' : ''}</th>`);
  h += '</tr></thead><tbody>';
  for (let p = 1; p <= cfg.periods; p++) {
    h += `<tr><th scope="row">第${p}節</th>`;
    cols.forEach(c => {
      const key = slotId(c.date, p, c.room);
      const f = fixedAt(c.date, p, c.room), b = booked[key];
      const where = `${c.room} ${md(c.date)} 第${p}節`;
      if (f) h += `<td><div class="cell fixed" title="${esc(where + '：' + f.label)}"><span class="lb">${esc(f.label)}</span></div></td>`;
      else if (b) h += `<td><button type="button" class="cell booked" data-id="${esc(b.id)}" aria-label="${esc(where + ' 已由 ' + b.klass + ' ' + b.name + ' 預約')}"><span class="lb">${esc(b.klass)}</span><span class="sm">${esc(b.name)}</span></button></td>`;
      else if (c.date < t0 || !termOf(c.date, cfg.terms)) h += `<td><div class="cell closed"></div></td>`;
      else {
        const on = S.sel.has(key);
        h += `<td><button type="button" class="cell free" data-k="${esc(key)}" aria-pressed="${on}" aria-label="${esc(where + ' 空堂')}"><span class="plus">${on ? '✓' : '+'}</span></button></td>`;
      }
    });
    h += '</tr>';
  }
  $('grid').innerHTML = h + '</tbody></table>';
  // 已經被別人訂走的格子，從選取中移除
  [...S.sel.keys()].forEach(k => { if (booked[k]) S.sel.delete(k); });
  updateSel();
}

function updateSel() {
  $('selN').textContent = S.sel.size;
  $('selbar').classList.toggle('show', S.sel.size > 0);
}

// ====== 寫入 ======
async function book({ name, klass, purpose, slots }) {
  name = name.trim().slice(0, 20); klass = klass.trim().slice(0, 10); purpose = purpose.trim().slice(0, 30);
  if (!name) throw new Error('請填寫預約老師姓名');
  if (!klass) throw new Error('請填寫使用班級');
  const t0 = today(), bad = [];
  const snaps = await Promise.all(slots.map(v => getDoc(doc(db, 'bookings', slotId(v.date, v.period, v.room)))));
  slots.forEach((v, i) => {
    const where = slotsSummary([v]);
    if (v.date < t0) bad.push(where + ' 已經過去了');
    else if (!termOf(v.date, cfg.terms)) bad.push(where + ' 不在學期上課期間');
    else if (!cfg.rooms.includes(v.room)) bad.push(where + ' 目前不開放預約');
    const f = fixedAt(v.date, v.period, v.room);
    if (f) bad.push(where + ' 已排「' + f.label + '」');
    const b = snaps[i].exists() && snaps[i].data();
    if (b && b.status === '有效') bad.push(where + ' 已被 ' + b.klass + '（' + b.name + '）預約');
  });
  if (bad.length) throw new Error('以下時段無法預約：\n' + bad.join('\n'));

  const batch = writeBatch(db), batchId = Math.random().toString(36).slice(2, 10);
  slots.forEach(v => {
    batch.set(doc(db, 'bookings', slotId(v.date, v.period, v.room)),
      { date: v.date, period: v.period, room: v.room, name, klass, purpose, batch: batchId, status: '有效', createdAt: serverTimestamp() });
    batch.set(doc(collection(db, 'logs')),
      { action: '預約', date: v.date, period: v.period, room: v.room, name, klass, purpose, at: serverTimestamp() });
  });
  try { await batch.commit(); }
  catch (e) { throw new Error(e.code === 'permission-denied' ? '有時段剛剛被別人預約走了，請看一下課表再選一次' : '預約失敗：' + e.message); }
  return { message: bookMessage(klass, purpose, slots) };
}

async function myBookings(name) {
  name = name.trim();
  if (!name) throw new Error('請輸入姓名');
  const snap = await getDocs(query(collection(db, 'bookings'), where('name', '==', name)));
  const t0 = today();
  return snap.docs.map(toBooking).filter(b => b.status === '有效' && b.date >= t0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.room.localeCompare(b.room) || a.period - b.period);
}

async function cancel(ids, name) {
  name = name.trim();
  if (!name) throw new Error('請輸入預約老師姓名');
  const snaps = await Promise.all(ids.map(id => getDoc(doc(db, 'bookings', id))));
  const list = snaps.map(s => s.exists() ? toBooking(s) : null);
  if (list.some(b => !b || b.status !== '有效')) throw new Error('有預約找不到（可能已經取消了），請重新整理再試');
  if (list.some(b => b.name !== name)) throw new Error('姓名不符，只有預約老師本人可以取消');
  if (list.some(b => b.date < today())) throw new Error('已經過去的預約不能取消');
  const batch = writeBatch(db);
  list.forEach(b => {
    batch.update(doc(db, 'bookings', b.id), { status: '已取消', cancelledAt: serverTimestamp(), cancelName: name });
    batch.set(doc(collection(db, 'logs')),
      { action: '取消', date: b.date, period: b.period, room: b.room, name, klass: b.klass, purpose: b.purpose || '', at: serverTimestamp() });
  });
  try { await batch.commit(); }
  catch (e) { throw new Error('取消失敗：' + (e.code === 'permission-denied' ? '請重新整理再試' : e.message)); }
  return { message: cancelMessage(list) };
}

// ====== 事件 ======
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { S.view = b.dataset.view; render(); });
$('prev').onclick = () => { S.week = addDays(S.week, -7); loadWeek(); };
$('next').onclick = () => { S.week = addDays(S.week, 7); loadWeek(); };
$('thisWeek').onclick = () => { S.week = defaultWeek(); loadWeek(); };
$('mineBtn').onclick = () => openMine();
$('chips').onclick = e => {
  const b = e.target.closest('.chip'); if (!b) return;
  if (b.dataset.room) S.room = b.dataset.room; else S.day = b.dataset.day;
  render();
};
$('grid').onclick = e => {
  const free = e.target.closest('.free');
  if (free) {
    const k = free.dataset.k, [date, period, ...rest] = k.split('_'), room = rest.join('_');
    if (S.sel.has(k)) S.sel.delete(k); else S.sel.set(k, { date, room, period: Number(period) });
    const on = S.sel.has(k);
    free.setAttribute('aria-pressed', on); free.querySelector('.plus').textContent = on ? '✓' : '+';
    updateSel(); return;
  }
  const bk = e.target.closest('.booked');
  if (bk) openDetail(bookings.find(b => b.id === bk.dataset.id));
};
$('selClear').onclick = () => { S.sel.clear(); render(); };
$('selGo').onclick = openBook;

function openBook() {
  const slots = [...S.sel.values()];
  dlgBody.innerHTML = `
    <h2>預約 ${slots.length} 節</h2>
    <ul class="slots">${slotsSummary(slots).split('\n').map(l => '<li>' + esc(l) + '</li>').join('')}</ul>
    <form id="f">
      <label for="fn">預約老師</label>
      <input id="fn" required maxlength="20" autocomplete="name" placeholder="例如：王小明" value="${esc(getPref(NAME_KEY))}">
      <label for="fk">使用班級</label>
      <input id="fk" required maxlength="10" list="klasses" placeholder="例如：五甲" value="${esc(getPref(KLASS_KEY))}">
      <datalist id="klasses">${['一甲','二甲','三甲','四甲','五甲','六甲'].map(k => '<option value="' + k + '">').join('')}</datalist>
      <label for="fp">用途（選填）</label>
      <input id="fp" maxlength="30" placeholder="例如：自然實驗">
      <div class="err" id="ferr"></div>
      <div class="actions">
        <button type="button" class="btn" id="fx">取消</button>
        <button type="submit" class="btn primary" id="fs">確定預約</button>
      </div>
    </form>`;
  dlg.showModal();
  $('fx').onclick = () => dlg.close();
  $('f').onsubmit = async e => {
    e.preventDefault();
    const name = $('fn').value.trim(), klass = $('fk').value.trim(); if (!name || !klass) return;
    $('fs').disabled = true; $('fs').textContent = '送出中…'; $('ferr').textContent = '';
    try {
      const r = await book({ name, klass, purpose: $('fp').value, slots });
      setPref(NAME_KEY, name); setPref(KLASS_KEY, klass); S.sel.clear();
      showResult('預約完成', r); render();
    } catch (err) {
      $('ferr').textContent = err.message;
      $('fs').disabled = false; $('fs').textContent = '確定預約';
    }
  };
}

function openDetail(b) {
  if (!b) return;
  const past = b.date < today();
  dlgBody.innerHTML = `
    <h2>預約內容</h2>
    <dl>
      <dt>教室</dt><dd>${esc(b.room)}</dd>
      <dt>時間</dt><dd>${mdw(b.date)}第 ${b.period} 節</dd>
      <dt>使用班級</dt><dd>${esc(b.klass)}</dd>
      <dt>預約老師</dt><dd>${esc(b.name)}</dd>
      <dt>用途</dt><dd>${esc(b.purpose || '—')}</dd>
    </dl>
    ${past ? '<div class="actions"><button type="button" class="btn" id="cx">關閉</button></div>' : `<form id="c">
      <label for="cn">要取消這一節，請輸入預約老師姓名</label>
      <input id="cn" required maxlength="20" value="${esc(getPref(NAME_KEY))}">
      <div class="err" id="cerr"></div>
      <div class="actions">
        <button type="button" class="link-btn" id="cm" style="margin-right:auto">一次取消多節…</button>
        <button type="button" class="btn" id="cx">關閉</button>
        <button type="submit" class="btn danger" id="cs">取消這一節</button>
      </div></form>`}`;
  dlg.showModal();
  $('cx').onclick = () => dlg.close();
  if (past) return;
  $('cm').onclick = () => openMine(b.name);
  $('c').onsubmit = async e => {
    e.preventDefault();
    $('cs').disabled = true; $('cerr').textContent = '';
    try { showResult('已取消預約', await cancel([b.id], $('cn').value)); }
    catch (err) { $('cerr').textContent = err.message; $('cs').disabled = false; }
  };
}

function openMine(name) {
  name = name || getPref(NAME_KEY);
  dlgBody.innerHTML = `
    <h2>我的預約</h2>
    <form id="mq" class="mine-q">
      <div><label for="mn" style="margin-top:0">預約老師姓名</label>
      <input id="mn" required maxlength="20" value="${esc(name)}"></div>
      <button type="submit" class="btn primary">查詢</button>
    </form>
    <div class="mine-list" id="ml"></div>
    <div class="err" id="merr"></div>
    <div class="actions">
      <button type="button" class="btn" id="mx">關閉</button>
      <button type="button" class="btn danger" id="mc" disabled>取消勾選的預約</button>
    </div>`;
  if (!dlg.open) dlg.showModal();
  $('mx').onclick = () => dlg.close();
  let who = '';
  const count = () => {
    const n = $('ml').querySelectorAll('input:checked').length;
    $('mc').disabled = !n; $('mc').textContent = n ? `取消勾選的 ${n} 節` : '取消勾選的預約';
  };
  const run = async () => {
    who = $('mn').value.trim(); if (!who) return;
    $('ml').innerHTML = '<p class="empty">查詢中…</p>'; $('merr').textContent = '';
    try {
      const list = await myBookings(who);
      if (!list.length) { $('ml').innerHTML = `<p class="empty">「${esc(who)}」目前沒有還沒到的預約</p>`; count(); return; }
      let h = '', last = '';
      list.forEach(b => {
        if (b.date !== last) { h += `<div class="mine-day">${mdw(b.date)}</div>`; last = b.date; }
        h += `<label class="mine-item"><input type="checkbox" value="${esc(b.id)}">${esc(b.room)}　第 ${b.period} 節<small>${esc(b.klass)}${b.purpose ? '・' + esc(b.purpose) : ''}</small></label>`;
      });
      $('ml').innerHTML = `<div class="sel-tools"><span>共 ${list.length} 節，勾選要取消的</span><button type="button" class="link-btn" id="mall">全選</button></div><div style="margin-top:8px">${h}</div>`;
      $('mall').onclick = () => {
        const boxes = [...$('ml').querySelectorAll('input')], all = boxes.every(x => x.checked);
        boxes.forEach(x => x.checked = !all); count();
      };
      $('ml').onchange = count; count();
    } catch (err) { $('ml').innerHTML = ''; $('merr').textContent = err.message; }
  };
  $('mq').onsubmit = e => { e.preventDefault(); run(); };
  $('mc').onclick = async () => {
    const ids = [...$('ml').querySelectorAll('input:checked')].map(x => x.value);
    if (!ids.length) return;
    $('mc').disabled = true; $('merr').textContent = '';
    try {
      const r = await cancel(ids, who);
      setPref(NAME_KEY, who);
      showResult(`已取消 ${ids.length} 節`, r);
    } catch (err) { $('merr').textContent = err.message; count(); }
  };
  if (name) run();
}

function showResult(title, r) {
  const share = 'https://line.me/R/share?text=' + encodeURIComponent(r.message);
  dlgBody.innerHTML = `
    <h2>${esc(title)}</h2>
    <p class="status" style="margin-top:0">還差一步：把下面的訊息傳到老師 LINE 群組，讓大家知道。</p>
    <div class="line-preview"><div class="bubble">${esc(r.message)}</div></div>
    <a class="btn line" href="${share}" target="_blank" rel="noopener">分享到 LINE 群組</a>
    <div class="actions">
      <button type="button" class="btn" id="rc">複製訊息</button>
      <button type="button" class="btn" id="rx">完成</button>
    </div>`;
  if (!dlg.open) dlg.showModal();
  $('rx').onclick = () => dlg.close();
  $('rc').onclick = async () => {
    try { await navigator.clipboard.writeText(r.message); toast('已複製，可以到 LINE 群組貼上'); }
    catch (e) { toast('無法自動複製，請長按上面的訊息複製'); }
  };
}
