# MeetKit Rollout 路線圖

> 從「qmore 個人可用」到「全公司正式工具」的四階段路線圖。
> 每次完成一個里程碑,就在這份文件上打勾並更新日期。

---

## 目前位置

🔄 **Phase 2 開工前**(2026-04-11)

Phase 1 已完成,核心架構和跨裝置工作流都建好了。當前重點是把音訊 pipeline 接通,讓 MeetKit 真正能從頭到尾跑完一次會議流程。

---

## Phase 0:需求與架構(已完成 ✅)

**完成日期:2026-03-27 附近**

- ✅ 定位確立:MX Design 公版會議工具
- ✅ 三模組結構:提案收集 / 錄音整理 / 提案看板
- ✅ 四層資料結構:Project / Meeting / Proposal / Record
- ✅ 權限模型:`isOwner` Boolean 條件渲染
- ✅ 技術棧選定
- ✅ 放棄 Notion 錄音,改用 OpenAI Whisper API

---

## Phase 1:基礎建設與 UI Prototype(已完成 ✅)

**完成日期:2026-04-10 附近**

### 設計
- ✅ HTML prototype `meetkit.html`(暗色精準工作儀器風格)
- ✅ Owner / Member 視角切換
- ✅ Dashboard / Meetings / Proposals / New Proposal / Settings 五頁
- ✅ RWD(Mobile 375px + Desktop 1280px)
- 🔄 Figma 正式品牌版(微調中)

### 工程基礎
- ✅ GitHub repo 建立
- ✅ Vercel 專案連上
- ✅ 跨裝置工作流:`start.command` + `.claude-handoff.md`
- ✅ Claude Code 本地開發環境

### 實地測試
- ✅ 團隊成員操作介面沒問題
- ⚠️ **發現瀏覽器錄音會因為跳出分頁而中斷** — 觸發 Phase 2 的架構調整

---

## Phase 2:音訊 Pipeline 上線(當前階段 🔄)

**目標完成日期:2-3 週內**

**核心任務:** 放棄瀏覽器即時錄音,改為「上傳 iPhone 錄音檔」模式,並把前置處理、Whisper、Anthropic 摘要全部串起來。

### 基礎設施
- ⏭ Next.js 16 專案初始化(如果還沒)
- ⏭ 建立**獨立的** Supabase project(不和 Cosmoship 共用)
- ⏭ Supabase schema 設計與建表
  - `projects` 表
  - `meetings` 表
  - `proposals` 表
  - `records` 表
  - `audio_files` 表(存檔案 metadata + Supabase Storage URL)
- ⏭ 環境變數設定(`.env.local`)
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`

### 音訊 Pipeline(詳見 `docs/audio-pipeline.md`)
- ⏭ 整合 ffmpeg.wasm
- ⏭ 壓縮邏輯(16kHz mono opus 24kbps)
- ⏭ 靜音偵測切段(15 分鐘目標)
- ⏭ 並行上傳到 Whisper API(4 條通道 + 重試)
- ⏭ 逐字稿合併
- ⏭ Anthropic 兩階段摘要
- ⏭ 六階段 UI 進度顯示

### 驗收標準
- [ ] qmore 可以從頭到尾跑完一次會議流程
- [ ] 3 小時客戶會議錄音能在 3-4 分鐘內處理完
- [ ] iPhone Safari 上傳流程無障礙
- [ ] 失敗重試機制實際驗證過
- [ ] Anthropic 摘要品質符合實際使用

### 刻意不做的事(延後到 Phase 3)
- ❌ 多使用者(先只有 qmore 一人用)
- ❌ NextAuth 登入(先用 localhost 跑)
- ❌ Email 通知(Resend 整合)
- ❌ 權限系統(Supabase RLS)

---

## Phase 3:多使用者內部測試(🔜 約 1 個月後)

**目標完成日期:Phase 2 結束後 2-3 週**

### 認證與權限
- ⏭ NextAuth v5 + Google SSO
- ⏭ Supabase RLS 規則撰寫
- ⏭ Member 邀請流程(Owner 用 email 邀請)
- ⏭ 專案列表頁(使用者看到自己參與的所有專案)

### 通知系統
- ⏭ Resend 整合
- ⏭ 下次會議提案信的自動發送
- ⏭ AI 預填提案內容
- ⏭ 基本事件通知(有新提案、摘要完成)

### 第一個真實專案
- ⏭ 挑一個**非機密**的日常專案當白老鼠(例如 Cosmoship 相關會議)
- ⏭ 邀請 2-3 個同事當 Member
- ⏭ 跑 2-3 週,收集使用反饋

### 驗收標準
- [ ] 2-3 個同事順暢使用沒卡點
- [ ] Email 流程真正運作(與會者收到下次會議提案信)
- [ ] 歷史會議可以搜尋、過濾
- [ ] 權限真的隔離(Member 看不到其他專案)

---

## Phase 4:全公司 Rollout(🎯 約 2-3 個月後)

**目標完成日期:Phase 3 穩定後再推進**

### 公司級基礎設施
- ⏭ 自訂網域(例如 `meetkit.mxdesign.com.tw`)
- ⏭ Google Workspace SSO(domain 白名單,只有 `@mxdesign.com.tw` 能註冊)
- ⏭ 總管理員後台(qmore 看得到所有專案、可以停用帳號)
- ⏭ 使用說明文件 + 新手引導影片

### 成本與監控
- ⏭ OpenAI / Anthropic / Resend 的用量儀表板
- ⏭ 單月成本上限警示(避免被異常用量燒爆)
- ⏭ 錯誤追蹤系統(Sentry 或類似工具)

### 資料保護
- ⏭ Supabase 自動備份設定
- ⏭ SIPAI 和客戶會議的**額外隔離**
  - 選項 A:獨立第二個 Supabase project
  - 選項 B:同 project 但資料庫層 row-level encryption
  - Phase 4 開始時再做技術評估
- ⏭ 資料保存政策(多久自動歸檔、誰能永久刪除)

### 正式 rollout 儀式
- ⏭ 全公司說明會(30 分鐘,示範完整流程)
- ⏭ 第一週每日 office hour(qmore 在 Slack 開小時段答問)
- ⏭ 第一個月收集改進意見

### 驗收標準
- [ ] 全公司任何人都能建新專案
- [ ] SIPAI 這類機密內容有額外保護
- [ ] 每月使用成本在可控範圍(目標 < $100 USD)
- [ ] 連續一個月沒出現資料遺失或權限錯亂

---

## 決策記錄(重要架構調整)

### 2026-04-11|放棄瀏覽器即時錄音,改為上傳模式

**觸發點:** 實地會議測試中發現與會者跳出分頁查資料時,MediaRecorder 在背景會被瀏覽器限制而斷掉。

**決策:** 改為「會議中用 iPhone 語音備忘錄錄,會議後上傳」模式。

**連帶決策:**
- 前端 ffmpeg.wasm 做壓縮和切段(不走後端)
- 客戶會議常 2-3 小時,切段是必要機制
- 15 分鐘目標段長 + 靜音偵測切點
- 並行 4 條上傳 + 失敗重試

詳見 `docs/audio-pipeline.md`。

---

_這份路線圖會隨開發進展持續更新。
每次 Phase 轉換時,在「目前位置」那段寫清楚。_
