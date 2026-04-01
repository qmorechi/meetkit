# MeetKit ◈

## 專案概述
MeetKit 是一個小團隊會議管理系統，單一 HTML 檔案，可直接部署到 Netlify Drop。
主要檔案：`meetkit.html`（單一 HTML 檔，包含所有 CSS + React JSX + 邏輯）

## 技術架構
- 前端：React 18（CDN + Babel standalone，不需 build step）
- 資料庫：Supabase（PostgreSQL REST API + Storage）
- AI：OpenAI Whisper（語音轉文字） + Claude claude-sonnet-4-6 / GPT-4o（AI 摘要）
- 錄音：MediaRecorder Web API（32kbps 節省空間）
- 部署：Netlify Drop（拖曳 meetkit.html 即可）

## Supabase 設定
- Project URL：https://yrugcgzkomydmorgzwhb.supabase.co
- 資料表：`projects`（id, title, password, meeting_date, meeting_time）、`proposals`（id, project_id, author, title, content, file_url, file_name）
- Storage Bucket：`presentations`（PDF/PPT 附件）

## 多專案隔離
- URL `?p=PROJECT_ID` 切換專案（6 碼大寫代碼）
- 密碼保護存 sessionStorage，日誌存 localStorage

## 功能架構
1. **會前提案**（phase 0）—— 提交議程、上傳附件、設定開會時間、一鍵複製開會通知
2. **會議進行**（phase 1）—— 議程管理、全場錄音
3. **會後整理**（phase 2）—— Whisper 轉文字、Claude/GPT-4o 摘要、匯出 Markdown
4. **會議日誌**（phase 3）—— 歷史記錄搜尋

## 交接機制
如果 `.claude-handoff.md` 存在，請在對話開始時讀取它，了解上次的工作進度和未完成的任務，然後主動告知使用者目前狀態。

## 開發注意事項
- 使用者是設計師（非工程師），用繁體中文溝通
- 修改時用最小幅度的 Edit，不要重寫整個檔案
- 改完程式碼後提醒使用者把 meetkit.html 拖到 Netlify Production deploys 重新部署
