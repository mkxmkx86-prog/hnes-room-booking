// Firebase 連線設定（這些值本來就是公開的，資料安全靠 firestore.rules 保護）
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const app = initializeApp({
  apiKey: 'AIzaSyAUDUlnE42jMQjFL9a0lKtVoPmStNYYi0Y',
  authDomain: 'hnes-room-booking.firebaseapp.com',
  projectId: 'hnes-room-booking',
  storageBucket: 'hnes-room-booking.firebasestorage.app',
  messagingSenderId: '288962535298',
  appId: '1:288962535298:web:666ac20197e07cf2e9399b',
});
export const db = getFirestore(app);
