// 預約網頁和管理頁共用的小工具

// ---- 日期 ----
export const pad = n => String(n).padStart(2, '0');
export const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
export const wd = s => parse(s).getDay(); // 0=星期日 … 6=星期六
export const DAYC = '日一二三四五六';
export const md = s => { const d = parse(s); return (d.getMonth() + 1) + '/' + d.getDate(); };
export const mdw = s => md(s) + '（' + DAYC[wd(s)] + '）';
export const mondayOf = s => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
export const today = () => ymd(new Date());
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const termOf = (date, terms) => (terms || []).find(t => t.start <= date && date <= t.end) || null;
export const slotId = (date, period, room) => date + '_' + period + '_' + room;

export function slotsSummary(slots) {
  const g = {};
  slots.forEach(v => { const k = v.date + '|' + v.room; (g[k] = g[k] || []).push(Number(v.period)); });
  return Object.keys(g).sort().map(k => {
    const [date, room] = k.split('|');
    return '【' + room + '】' + mdw(date) + '第 ' + g[k].sort((a, b) => a - b).join('、') + ' 節';
  }).join('\n');
}

// ---- LINE 通知文字：仿照老師們平常在群組的寫法 ----
function whenText(date, periods) {
  const diff = Math.round((parse(date) - parse(today())) / 86400000);
  const rel = ['今天', '明天', '後天'][diff];
  const head = rel ? rel + '（' + md(date) + '）' : mdw(date);
  const ps = periods.slice().sort((a, b) => a - b), is = a => a.join() === ps.join();
  if (is([1, 2, 3, 4, 5, 6, 7])) return head + '整天';
  if (is([1, 2, 3, 4])) return head + '上午';
  if (is([5, 6, 7])) return head + '下午';
  const half = ps.every(p => p <= 4) ? '上午' : ps.every(p => p >= 5) ? '下午' : '';
  return head + half + '第 ' + ps.join('、') + ' 節';
}
function groupLines(slots, verb, klass) {
  const g = {};
  slots.forEach(v => { const k = v.date + '|' + v.room; (g[k] = g[k] || []).push(Number(v.period)); });
  return Object.keys(g).sort().map(k => {
    const [date, room] = k.split('|');
    return whenText(date, g[k]) + ' ' + klass + verb + room;
  }).join('\n');
}
export function bookMessage(klass, slots) {
  return groupLines(slots, '會使用', klass) + '\n如需要使用的班級  可以提出討論喔..\n感謝!!';
}
export function cancelMessage(list) {
  const ks = [...new Set(list.map(b => b.klass))];
  const lines = ks.map(k => groupLines(list.filter(b => b.klass === k), '使用', k)).join('\n');
  return (lines.includes('\n') ? '以下原訂的教室使用取消了：\n' + lines : '原訂 ' + lines + ' 取消了') + '\n需要的班級可以預約喔..\n感謝!!';
}

// ---- 課表簡稱：「六自」→「六甲自然」 ----
const SUBJECT = {'自':'自然','藝':'藝術','閩':'閩南語','英':'英文','社':'社會'};
export const expandLabel = s => (s.length === 2 && SUBJECT[s[1]]) ? s[0] + '甲' + SUBJECT[s[1]] : s;

// ---- 讀取從 Word 複製來的課表 ----
const DAYRE = /^(?:星期|週|周)?([一二三四五])$/;
const cleanCell = s => String(s || '').replace(/[\/\s"]/g, '');

// Word 複製時剪貼簿裡的 HTML 表格 → Tab 分隔文字（合併儲存格會展開）
export function htmlTableToTSV(html) {
  const table = new DOMParser().parseFromString(html, 'text/html').querySelector('table');
  if (!table) return null;
  const grid = [];
  [...table.rows].forEach((tr, i) => {
    grid[i] = grid[i] || [];
    let j = 0;
    [...tr.cells].forEach(td => {
      while (grid[i][j] !== undefined) j++;
      const text = td.textContent.replace(/\s+/g, '');
      const rs = td.rowSpan || 1, cs = td.colSpan || 1;
      for (let r = 0; r < rs; r++) for (let c = 0; c < cs; c++) {
        grid[i + r] = grid[i + r] || [];
        grid[i + r][j + c] = (r === 0 && c === 0) || DAYRE.test(text) ? text : '';
      }
      j += cs;
    });
  });
  return grid.map(r => [...r].map(c => c || '').join('\t')).join('\n');
}

function parseTSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim()));
}

export function parseTimetable(text) {
  const rows = parseTSV(text);
  let dayCol = -1, first = -1;
  rows.some((r, i) => { const j = r.findIndex(c => DAYRE.test(c)); if (j >= 0) { dayCol = j; first = i; return true; } });
  if (dayCol < 0) throw new Error('找不到「星期一」這類的文字，請確認有把整個表格複製進來');
  const header = rows.slice(0, first).reverse().find(r => r.filter(Boolean).length >= 2);
  if (!header) throw new Error('找不到教室名稱那一列，請把表格第一列也一起複製');
  const perCol = dayCol + 1;
  const rooms = header.map((c, j) => j > perCol ? cleanCell(c) : '');
  const entries = [], periods = new Set();
  let day = 0;
  rows.slice(first).forEach(r => {
    if (!DAYRE.test(r[dayCol] || '') && /^\d+$/.test(r[dayCol] || '') && r.length < header.length) r = [''].concat(r);
    const m = (r[dayCol] || '').match(DAYRE);
    if (m) day = DAYC.indexOf(m[1]);
    const p = parseInt(String(r[perCol] || '').replace(/[第節]/g, ''), 10);
    if (!day || !(p >= 1)) return;
    periods.add(p);
    rooms.forEach((room, j) => {
      const lb = cleanCell(r[j]);
      if (room && lb) entries.push({day, period: p, room, label: expandLabel(lb)});
    });
  });
  return {rooms: rooms.filter(Boolean), entries, periods: Math.max(0, ...periods)};
}
