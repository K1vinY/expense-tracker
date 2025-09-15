# 💰 像素記帳本

一個具有像素風格的美觀記帳網站，使用 Firebase 作為後端資料庫，可以部署到 GitHub Pages。

## ✨ 功能特色

- 🎮 **像素風格設計** - 復古遊戲風格的 UI 介面
- 💾 **雲端資料庫** - 使用 Firebase Firestore 儲存資料
- 👥 **多人共享** - 支援多人群組記帳，即時同步
- 📁 **群組管理** - 可創建多個群組分類不同用途
- 📱 **響應式設計** - 支援手機、平板、電腦各種裝置
- 📊 **統計功能** - 自動計算總收入、總支出、餘額
- 🏷️ **分類管理** - 支援餐飲、交通、購物等分類
- 🔍 **篩選功能** - 可依分類篩選記帳記錄
- 💰 **收入支出** - 支援收入與支出兩種記錄類型

## 🚀 快速開始

### 1. 設定 Firebase

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 建立新專案或選擇現有專案
3. 啟用 Firestore Database
4. 在專案設定中取得 Web 應用程式設定
5. 將設定複製到 `firebase-config.js` 檔案中

### 2. 更新 Firebase 設定

編輯 `index.html` 檔案，找到以下部分：

```javascript
const firebaseConfig = {
    // 這裡會放入你的 Firebase 設定
};
```

替換為你的實際 Firebase 設定：

```javascript
const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id"
};
```

### 3. 設定 Firestore 安全規則

在 Firebase Console 的 Firestore Database > 規則中，設定以下規則：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /groups/{document} {
      allow read, write: if true; // 公開讀寫，適合朋友間使用
    }
  }
}
```

### 4. 部署到 GitHub Pages

1. 將程式碼推送到 GitHub 儲存庫
2. 在儲存庫設定中啟用 GitHub Pages
3. 選擇來源分支（通常是 main 或 master）
4. 等待部署完成，你的網站就可以使用了！

## 📁 專案結構

```
pixel-expense-tracker/
├── index.html          # 主要 HTML 檔案
├── styles.css          # 像素風格 CSS 樣式
├── firebase-config.js  # Firebase 設定檔案
└── README.md          # 說明文件
```

## 🎨 自訂樣式

你可以修改 `styles.css` 檔案來自訂外觀：

- 修改顏色主題
- 調整像素風格效果
- 改變字體大小
- 自訂動畫效果

## 🔧 技術規格

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **後端**: Firebase Firestore
- **部署**: GitHub Pages
- **字體**: Press Start 2P (Google Fonts)

## 📱 支援的瀏覽器

- Chrome (推薦)
- Firefox
- Safari
- Edge

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📄 授權

MIT License

## 🆘 常見問題

### Q: 為什麼我的資料沒有儲存？
A: 請檢查 Firebase 設定是否正確，以及 Firestore 安全規則是否允許讀寫。

### Q: 可以多人同時使用嗎？
A: 可以！所有使用者會共享同一個資料庫，適合朋友間一起記帳。

### Q: 如何備份資料？
A: 在 Firebase Console 中可以匯出資料，或使用 Firebase CLI 工具。

### Q: 可以自訂分類嗎？
A: 目前分類是固定的，但你可以修改 HTML 和 JavaScript 來新增自訂分類。

---

🎮 享受你的像素記帳體驗！
