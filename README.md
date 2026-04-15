<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/9baed211-b381-4c57-9bee-6f9e0ea66be9

## 🚀 專案啟動與設定指南

### 1. 安裝與啟動
**前置作業:** Node.js (建議 v20+)

在終端機執行以下指令：
```bash
# 安裝依賴套件
npm install

# 設定環境變數 (請將 .env.example 複製為 .env.local 並填入你的 Gemini API key)
cp .env.example .env.local

# 啟動本地開發伺服器
npm run dev
```
啟動後會提供一個本地端的網址 (例如 `http://localhost:3000`)，點擊即可預覽。

### 2. GitHub Action 自動部署
已經設定好 `.github/workflows/deploy.yml`。
只要將程式碼推送到 GitHub 儲存庫的 `main` 分支，GitHub Actions 就會自動觸發打包，並將靜態網頁部署到 **GitHub Pages** 上。
* **注意**：你需要到 GitHub 專案的 `Settings > Pages` 將來源設定為 `GitHub Actions`。

### 3. `.gitignore` 檔案設定
已經完整設定 `.gitignore`，主要忽略以下內容：
- `node_modules/` (套件暫存)
- `dist/`, `build/` (打包出來的資料夾)
- `.env`, `.env.local` 等環境變數檔案 (包含機密金鑰，**絕對不可上傳**)
- `.DS_Store` 及各類編輯器暫存檔 (如 `.vscode`) 

## 🔧 其他可用指令

- `npm run build`: 執行正式環境的打包處理，輸出至 `dist`
- `npm run preview`: 在本地預覽打包後的 `dist` 成果
- `npm run lint`: 執行 TypeScript 靜態型別檢查
