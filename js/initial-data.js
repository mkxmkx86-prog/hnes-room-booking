// 第一次使用時，由管理頁寫進資料庫的初始資料（115 學年度上學期總課表）
import { expandLabel } from './shared.js';

export const INITIAL_TERM = { name: '115學年度上學期', start: '2026-08-01', end: '2027-01-31' };
export const INITIAL_ROOMS = ['想法放大室', '共讀站', '多媒體教室', '電腦教室', '山野教室']; // 依使用率排序

const RAW = { // 格式：星期-節次:課程簡稱
  '電腦教室': '3-5:樂高社 3-6:樂高社 3-7:樂高社',
  '共讀站': '2-3:二閩 2-4:五閩 2-5:六閩 2-7:一閩 3-5:歡唱250社 3-6:歡唱250社 3-7:歡唱250社 4-2:三閩 4-3:四閩',
  '多媒體教室': '1-2:六自 1-3:六自 1-6:三自 2-1:五自 2-2:五自 2-3:三社 2-4:四社 2-6:五社 2-7:五社 3-1:四自 3-2:四自 3-3:三英 3-4:六自 3-5:棋藝社 3-6:棋藝社 3-7:棋藝社 4-1:四自 4-2:五自 4-3:五英 4-4:五英 4-5:四英 5-1:三社 5-2:四社 5-3:四英 5-4:三英 5-6:三自 5-7:三自',
  '想法放大室': '1-3:三藝 1-4:三藝 1-5:四藝 1-6:四藝 2-3:六社 2-4:六社 2-6:六英 3-3:六英 3-4:五英 4-3:六藝 4-4:六藝 5-3:六社 5-5:五藝 5-6:五藝',
};

export const INITIAL_ENTRIES = [];
Object.keys(RAW).forEach(room => RAW[room].split(/\s+/).forEach(t => {
  const [dp, short] = t.split(':');
  const [day, period] = dp.split('-').map(Number);
  INITIAL_ENTRIES.push({ day, period, room, label: expandLabel(short) });
}));
