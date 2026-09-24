# 華南實驗國小｜科任教室預約系統

- 預約頁（給老師）：`index.html`，不用登入。可以查詢、預約、取消，並一鍵分享到 LINE 群組。
- 管理頁（給管理者）：`admin.html`，用帳號密碼登入後可以匯入新學期課表、管理教室和學期、查看或匯出預約紀錄。

## 架構

| 部分 | 服務 |
|---|---|
| 網頁 | GitHub Pages |
| 資料庫 | Firebase Cloud Firestore（專案 `hnes-room-booking`） |
| 管理者登入 | Firebase Authentication（Email＋密碼） |

`js/firebase.js` 裡的連線設定本來就是公開的，資料安全由 `firestore.rules` 控管：

- 任何人都可以看課表和預約、新增預約，也能用相同的姓名取消自己的預約。
- 同一格（日期＋節次＋教室）只能有一筆有效預約。
- 只有 Firestore `admins` 集合裡列出的使用者 UID 可以修改教室、學期、固定課表，並取消任何預約。

## 新增管理者

1. Firebase 主控台 → Authentication → 使用者 → 新增使用者，填 Email 和密碼。
2. 複製這個使用者的「使用者 UID」。
3. Firestore Database → `admins` 集合 → 新增文件，文件 ID 貼上 UID，欄位隨意，例如 `email: 管理者的 Email`。

## 修改安全規則

改好 `firestore.rules` 後，在這個資料夾執行 `firebase deploy --only firestore`。
