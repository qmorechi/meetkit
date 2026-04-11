# MeetKit Rollout 路線圖

> 從「單檔實戰版」逐步擴充到「全公司工具」的漸進路線圖。
> 每次完成一個里程碑,就在這份文件上打勾並更新日期。

---

## 目前位置

🔄 **Phase 2 準備開工**(2026-04-11)

Phase 1 已經遠超預期 — `index.html` 實戰版已經在多次真實會議中被使用,功能涵蓋提案收集、附件管理、錄音、Whisper 轉錄、Claude 摘要、歸檔。問題只出在**瀏覽器錄音會被跳出分頁中斷**,這是 Phase 2 的唯一核心任務。

**今天(2026-04-11)的重大認知修正:**

原本規劃 Phase 2 = 「Next.js + Supabase 重寫」,但盤點 `index.html` 後發現:
- 現有架構已經完整可用,沒必要重寫
- 所有 API 整合(Supabase、Whisper、Claude、GPT-4o、附件抽文)已經做完
- 只需要修掉「錄音會斷」這個唯一問題
- **Next.js 重寫**從 Phase 2 移除,延後到真正需要時再考慮(可能是 Phase 4 之後)

---

## Phase 0:需求與架構(已完成 ✅)

**完成日期:2026-03-27 附近**

- ✅ 定位確立:MX Design 公版會議工具
- ✅ 三模組結構:提案收集 / 錄音整理 / 提案看板
- ✅ 資料結構:projects + proposals + journal(三層簡化版)
- ✅ 權限模型:6 碼代碼 + 可選密碼保護(輕量路線)
- ✅ 技術棧選定:React + Babel in-browser 單檔架構

---

## Phase 1:index.html 實戰版(已完成 ✅)

**完成日期:2026-04-10 附近**

這個 Phase 產出了**真正能用的 MeetKit**,1719 行的 `index.html` 涵蓋所有核心功能。

### 已完成的功能

**基礎建設:**
- ✅ React 18 + Babel in-browser 架構
- ✅ Supabase REST API 直呼
- ✅ 6 碼專案代碼機制
- ✅ 可選密碼保護(PasswordGate 元件)
- ✅ 頂部 tab 導覽

**會前提案 (PreMeeting):**
- ✅ 文字填表
- ✅ 附件上傳到 Supabase Storage
- ✅ AI 輔助填寫
- ✅ 提案列表同步顯示

**會議進行 (Meeting):**
- ✅ 議程列表顯示
- ✅ 點選標記「討論中」
- ✅ 上次會議前情提要
- ✅ 附件預覽(FileViewerModal)
- ✅ 瀏覽器錄音(⚠️ 有中斷問題,Phase 2 要改掉)

**會後整理 (PostMeeting):**
- ✅ API Key 管理(localStorage)
- ✅ 音檔來源選擇(錄音 OR 上傳檔案)
- ✅ Whisper API 轉錄
- ✅ 音檔長度和費用計算
- ✅ Claude / GPT-4o 雙引擎 AI 摘要
- ✅ 附件文字抽取(PDF via pdf.js、DOCX via mammoth)
- ✅ Markdown 摘要匯出
- ✅ 歸檔到 Journal

**會議日誌 (Journal):**
- ✅ 歷史會議瀏覽

**跨裝置開發工作流:**
- ✅ start.command + finish.command + `.claude-handoff.md`
- ✅ 外接 T7 SSD + MacBook Air + Mac Studio 工作模式

### Phase 1 的實戰驗證

- ✅ 多場真實會議已使用 MeetKit
- ✅ 與會者操作沒有障礙
- ⚠️ **發現問題:** 會議中跳出分頁查資料,瀏覽器錄音會斷

---

## Phase 2:錄音改造(當前階段 🔄)

**目標完成日期:1-2 週內**

**核心任務:** 在不動其他功能的前提下,把 Meeting 元件的錄音區塊改造成「引導使用者用 iPhone 錄音 + 會後上傳時做壓縮切段」。

### 任務 2.1:Meeting 元件的 UI 改造

- ⏭ 移除 Meeting 元件的 MediaRecorder 程式碼(index.html 1018-1034 行)
- ⏭ 替換「全場錄音」UI(1105-1126 行)
  - 換成「請打開 iPhone 語音備忘錄」引導卡
  - 加上「已確認開始錄音」按鈕
  - 加會議計時器(純計時,不錄音)
- ⏭ 議程展開鎖定(未確認錄音前無法展開議程)
- ⏭ 紅色覆蓋層防呆(獨立 Modal 元件)

詳見 `docs/tasks/meeting-page-redesign.md`。

### 任務 2.2:音訊前置處理整合

- ⏭ 從 CDN 載入 ffmpeg.wasm
- ⏭ 新增 `// ─── AUDIO PIPELINE ─────────` 區塊
- ⏭ 壓縮函式(16kHz mono opus 24kbps)
- ⏭ 靜音偵測切段(15 分鐘目標)
- ⏭ 並行上傳(4 通道,失敗重試 3 次)
- ⏭ 逐字稿合併

詳見 `docs/audio-pipeline.md`。

### 任務 2.3:PostMeeting 的 Whisper 呼叫改造

- ⏭ 改寫 PostMeeting 的 `run` 函式(index.html 1157-1172 行)
- ⏭ 接上前置處理 pipeline
- ⏭ 加 Whisper prompt 專有名詞清單
- ⏭ 六階段 UI 進度顯示

### 任務 2.4:Supabase 欄位微調(非必要,但建議)

- ⏭ `projects` 表加 `recording_confirmed` boolean
- ⏭ `projects` 表加 `recording_started_at`、`recording_ended_at` timestamp
- ⏭ `journal` 表加 `duration_seconds` integer

**這些欄位是選配** — 先不加也能運作,只是少了會議時長的 metadata。

### 刻意不做的事(Phase 2 scope control)

- ❌ 不做 Next.js 遷移
- ❌ 不動 PreMeeting 的提案收集邏輯
- ❌ 不動 Journal 的歷史瀏覽
- ❌ 不改 Supabase 表結構(只加欄位不改既有欄位)
- ❌ 不引入 TypeScript、Tailwind、任何新框架
- ❌ 不引入 npm / package.json
- ❌ 不拆檔案(所有新功能都寫在 index.html 內部)

### 驗收標準

- [ ] qmore 可以上傳 3 小時 iPhone 語音備忘錄
- [ ] 壓縮 + 切段在 2 分鐘內完成
- [ ] Whisper 轉錄品質比改造前更好(因為有 prompt 專有名詞)
- [ ] 會議進行頁的紅色防呆 Modal 能正確阻擋互動
- [ ] 原有的 Meeting、PostMeeting、Journal 功能都沒壞
- [ ] 實地會議測試,至少一場完整流程跑過

---

## Phase 3:多專案管理優化(未來 🔜)

**預計時間:** Phase 2 結束 1 個月後

**前提假設:** MeetKit 被更多同事使用,開始需要管理多個專案。

### 可能的任務

- ⏭ 專案列表頁(所有參與過的專案)
- ⏭ 跨專案搜尋(找「那次關於包裝的會議在哪個專案」)
- ⏭ 提案範本系統(常用的提案格式可以套用)
- ⏭ 會議紀錄的進階篩選
- ⏭ 附件全文搜尋(從抽取的文字中找)
- ⏭ 會議提醒通知

### 架構決策點

**到這個 Phase 時,要重新評估:**
- `index.html` 是否還在可維護範圍(目標 < 3000 行)
- 是否需要把某些功能拆成獨立 JS 檔案(仍不引入 build)
- 權限機制是否需要從「6 碼代碼」升級

---

## Phase 4:全公司 Rollout(長期 🎯)

**預計時間:** Phase 3 穩定後再推進

**觸發條件:** 至少 3 個同事(不只 qmore)定期使用 MeetKit,且表達希望「更正式的系統」。

### 這個 Phase 的決策點

**是否要重寫成 Next.js?** 答案取決於以下任一條件是否成立:

- 需要真正的使用者系統(不只是 6 碼代碼)
- 需要複雜的權限(跨專案 RLS、角色管理)
- 需要 PWA 離線功能
- 需要更嚴格的資料保護
- `index.html` 超過 3000 行,單檔架構開始痛苦

**如果決定重寫成 Next.js:**
1. ⏭ 建立 Next.js 專案
2. ⏭ 把每個 React 元件移植過去
3. ⏭ 整合 NextAuth + Google SSO
4. ⏭ Supabase RLS 細緻權限
5. ⏭ 自訂網域(`meetkit.mxdesign.com.tw`)

**如果決定繼續用 index.html:**
1. ⏭ 拆成多個 JS 檔案(PreMeeting.js、Meeting.js 等)
2. ⏭ `index.html` 只剩 script 載入和 React root
3. ⏭ 加輕量登入機制(Supabase Auth)
4. ⏭ 其餘功能逐步加上

---

## 決策記錄(重要架構轉折)

### 2026-04-11|放棄瀏覽器即時錄音,改為上傳模式

**觸發點:** 實地會議測試發現 MediaRecorder 在背景分頁會斷。

**決策:** 改為「iPhone 語音備忘錄 + 會後上傳」模式,前端用 ffmpeg.wasm 壓縮和切段。

詳見 `docs/audio-pipeline.md`。

---

### 2026-04-11|Next.js 重寫從 Phase 2 延後到 Phase 4

**觸發點:** 完整盤點 `index.html` 後發現現有架構已完整可用,重寫沒有明確收益。

**決策:** 保留 index.html 作為主體,Phase 2-3 都在這個單檔架構上擴充,Next.js 重寫延後到必要時才做。

**理由:**
- index.html 已經涵蓋所有核心功能
- 設計師能獨立維護單檔 HTML,維護 Next.js 成本太高
- 零 build、零 npm、零部署複雜度 — 符合設計師工作流
- 保留 Next.js 作為未來選項,不現在就承諾

詳見 `docs/current-state-audit.md`。

---

_這份路線圖會隨開發進展持續更新。_
