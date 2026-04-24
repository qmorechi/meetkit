# MeetKit Rollout 路線圖

> 從「單檔實戰版」逐步擴充到「全公司工具」的漸進路線圖。
> 每次完成一個里程碑,就在這份文件上打勾並更新日期。

---

## 目前位置

✅ **Phase 2 + Phase 2.5 已完成**(2026-04-25)

Phase 1 已經遠超預期 — `index.html` 實戰版已經在多次真實會議中被使用,功能涵蓋提案收集、附件管理、錄音、Whisper 轉錄、Claude 摘要、歸檔。**Phase 2「錄音改造」** 和 **Phase 2.5「資安補強 + 邀請白名單」** 都在 2026-04-25 完成上線。

**Phase 2 的結案(2026-04-25):**
- ✅ Meeting 元件 UI 改造(引導 iPhone 語音備忘錄 + 紅色防呆 Modal)
- ✅ 音訊 pipeline(Web Audio API 解碼 + 自寫 WAV encoder + 5 分鐘等時切段 + 2 通道並行 Whisper)
- ✅ 技術路線變更:**放棄 ffmpeg.wasm,改用 Web Audio API**(Safari 穩定性顯著優於 WASM)

**Phase 2.5 的結案(2026-04-25):**
- ✅ Edge Function 代理(ai-proxy / whisper-proxy),API Key 從前端移除
- ✅ 4 張表 RLS + `project_members` 白名單 + `send-invite` 邀請信
- ✅ Home 分「🧑‍💼 我建立的」+「📨 我被邀請的」兩份清單
- ✅ 📬 與會者面板(加人 / 移除 / 重寄邀請信)
- ✅ 指定發送時間(Resend `scheduled_at`,支援週一早上 09:00 這類預設)
- ✅ 設定面板清理(移除公開網址 / Slack webhook / 複製開會通知 — 改走 email 認證 + 邀請清單流程)
- ✅ 正式網址定為 `meetkit.mx.design`(GitHub Pages CNAME 已綁定)

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

## Phase 2:錄音改造(已完成 ✅)

**完成日期:2026-04-25(音訊 pipeline 實作)**

**核心任務:** 在不動其他功能的前提下,把 Meeting 元件的錄音區塊改造成「引導使用者用 iPhone 錄音 + 會後上傳時做切段」。

### 任務 2.1:Meeting 元件的 UI 改造 ✅

- ✅ 移除 Meeting 元件的 MediaRecorder 程式碼
- ✅ 替換「全場錄音」UI
  - 換成「請打開 iPhone 語音備忘錄」引導卡
  - 加上「已確認開始錄音」按鈕
  - 加會議計時器(純計時,不錄音)
- ✅ 議程展開鎖定(未確認錄音前無法展開議程)
- ✅ 紅色覆蓋層防呆(獨立 `RecordingConfirmModal` 元件)
- ✅ QR code 指向 `open-voicememos.html`(2026-04-25 改 relative URL,跟隨當前 domain)

詳見 `docs/tasks/meeting-page-redesign.md`。

### 任務 2.2:音訊前置處理整合 ✅(技術路線換成 Web Audio API)

**決策變更:放棄 ffmpeg.wasm,改用瀏覽器原生 Web Audio API。**  
(實測 ffmpeg.wasm 在 Safari + 慢網路 + 長檔情境下載失敗率偏高,WASM 偶爾卡死要重新整理)

- ✅ 新增 `// ─── AUDIO PIPELINE ─────────` 區塊(index-dev.html ~605-780 行)
- ✅ Web Audio API 解碼(`decodeAudioBlob` — 16kHz mono AudioBuffer)
- ✅ 自己寫 WAV encoder(`encodeWavSegment` — 16-bit PCM 標頭 + samples)
- ✅ 等時切段(5 分鐘/段,單段約 9.6 MB,不做靜音偵測)
- ✅ 並行上傳(2 通道 worker 池,失敗重試 5 次,4xx 永久錯誤不重試)
- ✅ 逐字稿合併(按 index 排序,失敗段落分離到 `failedSegments`)

詳見 `docs/audio-pipeline.md`(文件仍寫 ffmpeg 方案,待下次對齊)。

### 任務 2.3:PostMeeting 的 Whisper 呼叫改造 ✅

- ✅ 改寫 PostMeeting 的上傳流程,接上 `segmentAudioWebAudio` → `transcribeAllSegments` → `mergeTranscripts`
- ✅ Whisper 呼叫走 `whisper-proxy` Edge Function(Phase C 代理,不直連 OpenAI)
- ✅ Whisper prompt 專有名詞清單(Cosmoship / 宇宙小艇 / SIPAI / MX Design / Figma / Supabase / Anthropic / Claude / ComfyUI / Flux / MeetKit)
- ✅ 多階段 UI 進度顯示(切段進度 + 並行上傳進度)

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

- [x] qmore 可以上傳 3 小時 iPhone 語音備忘錄(Web Audio API 解碼,記憶體夠就不限長度)
- [x] 切段完成時間可接受(5 分鐘/段,序列解碼 + 2 通道並行上傳)
- [x] Whisper 轉錄品質比改造前更好(`whisper-proxy` + prompt 專有名詞清單)
- [x] 會議進行頁的紅色防呆 Modal 能正確阻擋互動(`RecordingConfirmModal`)
- [x] 原有的 Meeting、PostMeeting、Journal 功能都沒壞
- [x] 實地會議測試,至少一場完整流程跑過(2026-04-23 SIPAI 會議實戰驗證)

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

**決策:** 改為「iPhone 語音備忘錄 + 會後上傳」模式,原本規劃前端用 ffmpeg.wasm 壓縮和切段。

詳見 `docs/audio-pipeline.md`(文件仍寫 ffmpeg 方案,實作已改走 Web Audio API,見下一條)。

---

### 2026-04-25|音訊切段從 ffmpeg.wasm 改成 Web Audio API

**觸發點:** 實測 ffmpeg.wasm 在 Safari 長檔情境下 WASM 偶爾卡死、載入時間長、錯誤難診斷。

**決策:** 拋掉 ffmpeg.wasm,改用瀏覽器原生 `AudioContext.decodeAudioData` 解碼 + 自己寫 16-bit PCM WAV encoder。

**理由:**
- Web Audio API 是 iOS 14+ Safari 原生支援,不需下載 30MB WASM runtime
- 解碼穩定度比 ffmpeg.wasm 高(沒有 WebAssembly ABI / 記憶體對齊的未定義行為)
- 5 分鐘等時切段不需要靜音偵測,簡化邏輯
- WAV 雖然比 opus 大,但單段約 9.6 MB 在 2 通道並行 Whisper 上傳下不是瓶頸

**實作位置:** `index-dev.html` 的 `// ─── AUDIO PIPELINE ─────────` 區塊(~605-780 行)。

---

### 2026-04-25|指定發送時間 + 設定面板清理 + meetkit.mx.design 定為正式網址

**觸發點:**
1. PM 需要「週五不要寄邀請信,排到週一早上」的人性化排程
2. 與會者面板上線後,公開網址 / Slack webhook / 複製開會通知這些舊功能變成多餘
3. GitHub Pages 自訂網域 `meetkit.mx.design` CNAME 綁定完成

**決策與實作:**
- **指定發送時間** — Edge Function `send-invite` 多吃一個 `scheduledAt` 參數(UTC ISO 或自然語言),透過 Resend 原生 `scheduled_at` 排程,我們不自建 queue
- **預設時間快捷** — 明天 09:00 / 下週一 09:00 / 會議前兩天 09:00 三顆按鈕,降低 datetime-local 手動輸入負擔
- **設定面板清理** — 刪掉「公開網址」「Slack webhook」「複製開會通知」三個欄位,全面改走「email 認證 + 邀請清單」流程(點信裡的 URL 就進會議室)
- **QR code URL 改 relative** — `${window.location.origin}${pathname}open-voicememos.html`,跟隨當前 domain,不再寫死 qmorechi.github.io
- **正式網址定調** — CLAUDE.md §1 的生產網址從 `qmorechi.github.io/meetkit` 改成 `meetkit.mx.design`

**「📬 通知所有與會者」(開會時間通知)保留到 Phase 3:**
- 舊的「複製開會通知」按鈕是複製 + 貼 Slack 的手動流程,已隨清理刪除
- 但「第二次以後的會議需要通知會議時間」這個需求仍存在,Phase 3 會做新的 `send-meeting-notice` Edge Function,繼承今天建好的排程機制

**理由:**
「發什麼信」和「什麼時候發」是兩個獨立維度。今天做完的是「什麼時候發」這一軸(邀請信 × 立即/排程);「發什麼信」那一軸(邀請信 vs 開會通知)留到 Phase 3 處理。

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

### 2026-04-25|Route C 邀請白名單 + 成員管理 UI 上線(原 Phase 4 的一部分提前到 Phase 2.5)

**觸發點:**
MeetKit 開始處理 SIPAI 等客戶敏感資料,「知道 6 碼代碼就能進」的共享模型風險過高。
配合 2026/04/22 API key 外洩事件的後續,順勢把 Phase 4 規劃的「使用者系統 + 權限」提前落地。

**決策:** 改成「邀請白名單 + Supabase magic-link + RLS」三層防護。
6 碼代碼從「通行密碼」變成「專案識別碼 + URL slug」,實際進出由 `project_members` 白名單控制。

**這一輪已完成(Phase 2.5 的範圍):**
- ✅ Supabase Auth magic link(`signInWithOtp`)
- ✅ `projects.owner_email` 欄位 + `project_members` 白名單表
- ✅ 四張表 RLS policies(owner OR member;`SECURITY DEFINER` helper 避免 policy 遞迴)
- ✅ Edge Function `send-invite`(Resend + `meetkit@mx.design`,domain 已驗證)
- ✅ Home 分「🧑‍💼 我建立的」+「📨 我被邀請的」兩份清單
- ✅ 專案設定 ⚙ 的「📬 與會者」面板:加人 + 移除 + **重寄邀請信**(2026-04-25 補)
- ✅ SIPAI_開發日誌(`MTRF1H`)backfill + `notion_parent_page_id` 綁定

**Phase 4 仍未處理的部分(真的擴到全公司再做):**
- ⏭ SSO(mx.design domain 白名單)
- ⏭ 角色區分(viewer / editor / owner)
- ⏭ 邀請有效期 + 撤銷
- ⏭ 專案歸屬變更(owner transfer)

**理由:**
現階段「owner + member 兩層」就夠 SIPAI / MX 內部會議用,不必一步到位做完整 RBAC。
「重寄邀請信」原本規劃到 Phase 4,但因同事下週開始加入名單,提前一週做完這顆按鈕。

詳見 CLAUDE.md §3、`supabase/migrations/20260425_project_members.sql`、
`supabase/functions/send-invite/index.ts`。

---

## 待解決的根本性問題(Phase 3 必須面對)

### 議題:MeetKit 的「專案 / 會議」語義模糊

**發現日期:** 2026-04-11(Phase B 開發過程中)

**發現脈絡:** qmore 在規劃 Phase B 上線時提出疑問:「程式持續優化,但會議資料也持續累積,舊會議用新介面要怎麼繼續用?」

**問題本質:**

MeetKit 目前的隱含設計是「**一個 6 碼專案 = 一場會議**」,但實際使用情境是「**一個議題/客戶會被反覆討論很多次**」。例如 MTRF1H 是一個客戶專案,可能會開:
- 1 月的 kick-off 會議
- 4 月的進度檢討會議
- 7 月的最終驗收會議

目前的架構讓這三場會議混在同一個專案的同一組欄位裡,後一次會覆蓋前一次的資料。**這在 Phase 1 時可以接受,但隨著 MeetKit 演化,會變成嚴重的設計債務**。

**這個問題影響的範圍:**

1. **資料模型** — 是否要新增 `meetings` 表(目前 schema 沒有)
2. **6 碼代碼的語義** — 是「專案 ID」還是「會議 ID」?
3. **提案的歸屬** — 提案是「跨會議」還是「單場會議」的?
4. **逐字稿和摘要** — 一個專案多場會議,是否各自獨立記錄?
5. **Journal tab 的呈現** — 如何顯示「同一個專案的多場會議」?
6. **新版相容舊資料** — Phase A/B 上線後,舊版建立的會議資料怎麼被新版正確讀取和顯示?
7. **「開新會議」的入口** — 進入 Meeting tab 是「開新會議」還是「回訪舊會議」?(實戰中發現的問題:Phase B 的紅色 Modal 會擋住「我只是想回去看舊紀錄」的使用者)

**三個可能的設計哲學:**

#### 哲學 A:一個專案 = 一場會議(目前的隱含設計)
- 每次開新會議都建新專案
- 簡單但專案會越累越多
- 跨會議的議題追蹤困難

#### 哲學 B:一個專案 = 一個議題,可以開多場會議
- 需要新增 `meetings` 表
- 一個專案有 N 場會議,各自獨立
- 提案累積在專案層級
- 結構更接近真實工作

#### 哲學 C:混合模式
- 系統根據時間間隔自動判斷「同一場會議」vs「新一場會議」
- 例如「結束會議後 24 小時內的續開」算同一場
- 「結束會議後超過 24 小時」算新一場
- 半自動,降低使用者決策負擔

**為什麼這個問題必須在 Phase 3 解決:**

- Phase B 上線後,資料會繼續累積
- 累積得越多,未來重構的成本越高
- 如果 Phase 3 才決定要新增 `meetings` 表,所有 Phase 1-2 的資料都要 migrate
- 趁累積還少時,儘早決定架構

**Phase 3 開工前必須完成的事:**

1. ⏭ 三種設計哲學的詳細利弊分析
2. ⏭ 訪談現有 MeetKit 使用者(qmore + 同事),了解真實使用模式
3. ⏭ 決定哲學 A / B / C
4. ⏭ 如果選 B 或 C,設計 schema migration 計畫
5. ⏭ 設計「向後相容」策略:Phase 1 建立的資料怎麼在新架構下顯示

**這個議題的規模:**

這不是「修個 bug」或「加個功能」,**而是 MeetKit 核心架構的決定**。應該獨立成 Phase 3 的第一個任務,可能需要 1-2 週的設計討論才能定稿。

---

### 相關但較小的議題:Meeting tab 的「進入意圖」與 preparing 狀態

**發現日期:** 2026-04-11(Phase B 開發過程中的兩個獨立洞察)

**問題核心:** 
Phase B 的 `unconfirmed` 狀態預設「進入 Meeting tab 就立刻跳出紅色 Modal 要求確認錄音」,但實際使用情境裡,**「進 Meeting tab」≠「要立刻錄音」**。

**兩個真實情境(qmore 在實戰測試和規劃中都發現了):**

#### 情境 1:回訪舊會議(只是想看紀錄)
- 同事打開已結束的 MTRF1H 想看上次的議程
- 切到 Meeting tab → 紅色 Modal 跳出
- 同事:「???我只是想看而已,沒有要錄音」
- 結果:被 Modal 強制擋住,無法瀏覽

#### 情境 2:新會議的「準備階段」(qmore 補充的洞察)
- 開會前 5 分鐘進場,打開 MeetKit 想檢查附件
- 切到 Meeting tab → 紅色 Modal 跳出
- 「等等,我才剛打開,要先確認附件、檢查簡報」
- 為了看附件,被迫按「✓ 已確認開始錄音」(其實還沒開 iPhone 錄音)
- 接下來檢查附件、準備、聊天 5 分鐘
- 才正式開始講 → 突然想起來「我剛剛按確認時根本還沒開錄音」
- 結果:**起訖時間錯誤、計時器和實際錄音對不上、最糟糕的情況是整場會議完全沒錄到**

**這兩個情境的共同根源:** 
Meeting tab 的預設狀態不該是「強制錄音模式」,而應該是「準備瀏覽模式」。錄音是**使用者主動觸發**的動作,不是進入 tab 就自動發生的事。

#### 解決方案:新增 `preparing` 狀態

**狀態機更新(Phase B+ 範圍):**

```
preparing (預設 default,自由瀏覽,看議程、檢查附件)
    ↓ 使用者主動按「▶ 開始錄音」按鈕
unconfirmed (紅色 Modal 才出現)
    ↓ 確認
in_progress → pending_pause_confirm → paused → ended (後續和 Phase B 一樣)
```

**preparing 狀態的特性:**
- 議程**完全解鎖**,可以點開、看附件、看簡報
- **沒有任何 Modal**,使用者可以自由操作
- 右側區塊顯示「準備區」:
  - 標題:「⏸ 準備中」或「📋 會議準備」
  - 提示文字:「檢查附件、確認簡報,準備好後按下方按鈕開始錄音」
  - 主 CTA:「▶ 開始錄音」(綠色按鈕,點下去才觸發 unconfirmed 紅色 Modal)
- Tab 切換完全自由(延續決策 7)

**使用者真實流程:**

```
14:00  打開「會議進行」tab → preparing 狀態,看到議程和「▶ 開始錄音」按鈕
14:00-14:05  自由檢查附件、跟與會者聊天、整理思緒
14:05  「好,要開始了」→ 按「▶ 開始錄音」
14:05  紅色 Modal 跳出 → 同事打開 iPhone 錄音 → 按「✓ 已確認開始錄音」
14:06  進入 in_progress,計時器開始,議程鎖定到「討論中」狀態
```

**這個設計同時解決了兩個情境:**

| 情境 | preparing 狀態如何處理 |
|---|---|
| 新會議 — 剛打開,還在準備 | 自由瀏覽,按「▶ 開始錄音」才正式進入 |
| 新會議 — 已經準備好要開始 | 直接按「▶ 開始錄音」(多一個點擊,可接受) |
| 舊會議 — 只是想看紀錄 | 自由瀏覽,看完離開,完全不會被擋 |
| 舊會議 — 想開新一場接續 | 按「▶ 開始錄音」(會建立新的 segment 或新會議,看 Phase 3 怎麼設計) |

**狀態機的判斷邏輯:**

```
進入 Meeting 元件時:
- 如果 recording_confirmed = false 且 recording_ended_at = null
  → preparing(全新會議,還沒開始)
- 如果 recording_confirmed = true 且 recording_ended_at = null
  → 觸發中途離開恢復(回到 preparing,或回到 paused 看 segments 狀態)
- 如果 recording_ended_at 有值
  → ended(已結束的會議,顯示總時長和議程,加「開新一場」按鈕)
```

**Phase B+ 的工作量:**

預估 30-60 分鐘的 Claude Code session,包括:
- 新增 `preparing` 狀態到狀態機
- 把 default 從 `unconfirmed` 改成 `preparing`
- 新增 PreparingPanel 元件(右側區塊)
- 「▶ 開始錄音」按鈕觸發 `setRecordingState('unconfirmed')`(紅色 Modal 才會出現)
- ended 狀態加「開新一場」按鈕,點了回到 preparing
- 議程解鎖邏輯擴充:preparing 狀態議程也是解鎖的

**為什麼留到 Phase B+:**

- Phase B 已經包含很多任務(分段、對稱防呆、Supabase 寫入、中途離開恢復)
- preparing 狀態是 Phase B 完成後的優化,不是核心
- 設計細節需要清醒的腦袋(按鈕文字、視覺提示、右側區塊樣式)
- Phase B 上線時可以告訴同事「下版會修這個」,過渡期短

---

### 議題:會議的資訊架構與檢索系統(整套規劃)

**發現日期:** 2026-04-11(Phase B 開發過程中)

**發現脈絡:** qmore 在思考 MeetKit 長期演化時,一次提出了完整的資訊架構需求,包含:
- 會議的「臨時 vs 持續」事後判定
- 標籤系統(Badge)
- 多維度檢索(關鍵字 + 期間 + 標籤)
- 批次改名與向後追溯

**這個議題的本質:** MeetKit 從「單場會議工具」演化到「會議生命週期管理系統」必經的路。當會議數量從 16 個變成 200+ 個時,沒有這套系統就無法使用。

#### 子議題 1:會議分類不應該強制,事後可以歸納

**洞察:** 開會前不知道這個會議會不會再開,所以「臨時會議」和「系列會議」的區分是事後才能判斷的。設計上**不應該在建立時就強制分類**,而是讓使用者自然累積後,系統幫忙歸納。

**設計方向:**
- 建立會議時不強制分類
- 累積到一定程度後,系統提示「這幾個專案的命名很像,要不要打成同一個標籤?」
- 使用者確認後建立 tag 並關聯

#### 子議題 2:標籤系統(Badge / Tag)

**設計方向:**
- 用 tag 而不是 folder(避免「一個會議只能屬於一個分類」的限制)
- 大類(月會 / 客戶會議 / 內部腦力 / 一次性)
- 副標(具體名字:MX 月會、Cosmoship 進度、SIPAI 週會...)
- 點 Badge 可以看到所有同類會議

**資料模型(初步構想):**
```sql
CREATE TABLE tags (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  parent_tag_id uuid REFERENCES tags(id),  -- 大類/副標的階層
  color text  -- 視覺辨識
);

CREATE TABLE project_tags (
  project_id text REFERENCES projects(id),
  tag_id uuid REFERENCES tags(id),
  PRIMARY KEY (project_id, tag_id)
);
```

#### 子議題 3:多維度檢索系統

**設計方向:**
- 關鍵字搜尋(會議名稱、提案內容、逐字稿全文)
- 期間檢索(2026/01-2026/04 的會議)
- 標籤過濾(只看「客戶會議」)
- 組合條件(關鍵字 + 期間 + 標籤)
- 在 Home 頁就能用,不用先進專案

**實作考量:**
- Supabase 支援 PostgreSQL 全文檢索(`tsvector`/`tsquery`)
- 不需要外部搜尋引擎(Elasticsearch、Algolia 等)
- 但需要建立 GIN 索引才會快

#### 子議題 4:批次改名與向後追溯

**問題:** 早期(Phase 1)的會議命名沒有規範,系統演化後想統一命名原則。如果不能改名,以後追溯不到。

**設計方向:**
- 批次改名功能(在管理介面)
- 預覽影響範圍(列出所有受影響的會議)
- 強制確認(避免誤改)
- 改名歷史追溯(保留舊名字作為「舊名稱別名」,搜尋舊名也能找到)

**資料模型(初步構想):**
```sql
ALTER TABLE projects 
  ADD COLUMN previous_titles jsonb;  -- 改名歷史 [{"title": "舊名", "renamed_at": "..."}]
```

#### 為什麼這個議題必須在 Phase 3 處理

- **Phase B 上線後,會議數量會持續累積**
- **每多累積一個會議,沒分類就多一筆債**
- **早期命名混亂的會議,越晚改越難追溯**
- **檢索能力如果不及早建立,系統的可用性會隨資料量下降而下降**

#### 與第一個根本議題的關係

「會議分類與檢索」和「專案/會議語義模糊」**是同一個問題的兩面**:

| 議題 | 視角 |
|---|---|
| 專案/會議語義 | 一個專案能不能有多場會議 |
| 資訊架構與檢索 | 多個專案/會議怎麼被找到和分類 |

**Phase 3 必須一起設計,不能分開做**。否則決定了「一個專案多場會議」之後,標籤要綁專案還是綁會議?搜尋是搜專案還是搜會議?這些都會卡住。

#### Phase 3 整合性的工作項目

把兩個議題合在一起,Phase 3 的內容是:

1. ⏭ 訪談 MeetKit 使用者(qmore + 同事),了解真實使用模式
2. ⏭ 決定「專案/會議語義」(哲學 A / B / C)
3. ⏭ 設計「標籤系統」(綁專案還是綁會議,取決於上一步)
4. ⏭ 設計「檢索系統」(資料表、索引、UI)
5. ⏭ 設計「批次改名與向後追溯」機制
6. ⏭ 設計「schema migration 計畫」(舊資料怎麼遷移到新架構)
7. ⏭ 設計「向後相容策略」(Phase 1-2 建立的資料怎麼在新架構下顯示)
8. ⏭ 開始實作

**這是 1-2 週的設計討論 + 2-4 週的實作 = 整個 Phase 3 的範圍。**

---

_這份路線圖會隨開發進展持續更新。_

## 摘要
完成 MeetKit 安全事件處理 Phase C。
- 前端三處 API 呼叫改走 Edge Function 代理
- API Key UI 拿掉
- 修正 whisper-proxy Content-Type bug
- OpenAI / Anthropic 設定花費上限
下次從 Phase D 開始(Supabase RLS 設定)。

## 下次從這裡開始
回 claude.ai 做 Phase D(SQL 設定 config/projects/proposals/journals 的 RLS)
## 2026/04/22 — MeetKit Supabase API key 外洩事件處理

### 觸發
Supabase 寄警告信,提到 MX Meeting Kit 的 table 在 public 且 RLS disabled。

### 根本原因(三重組合)
1. meetkit repo 是 public(GitHub Pages Free 帳號限制)
2. Supabase URL + anon key 寫死在 index.html 第 63-64 行
3. 一張 config 表存了 OpenAI + Anthropic API key,且 RLS 沒開
→ 任何人 curl 都能撈走 API key。

### 檢查結論
OpenAI 和 Anthropic 用量兩邊都沒異常,幸運沒被爬到。

### 戰果
**Phase A 止血**
- 舊 OpenAI key 作廢
- 舊 Anthropic key 判定為孤兒,放棄作廢(已驗證無盜刷)
- Supabase config 表 row 清空

**Phase B 架構升級**
- 產新 API key → Supabase Edge Function Secrets
- 部署 ai-proxy(處理 Anthropic / OpenAI chat)
- 部署 whisper-proxy(處理 OpenAI Whisper 音檔轉文字)

**Phase C 前端接上**
- index.html 三處 fetch 改走 Edge Function
- API Key UI 整個拿掉,順手清掉 config 表的自動載入邏輯
- OpenAI + Anthropic 設 $100 硬上限 + 警示

**額外 bug 修復(實戰才發現)**
- whisper-proxy Content-Type 轉發 bug(前端 fetch 不能手動設 Content-Type,
  否則 multipart boundary 壞掉)
- ffmpeg 輸出格式改 .ogg 容器(符合 Whisper 官方支援格式,修掉潛伏的 400 錯誤)

### 實戰驗證
音檔上傳 → 逐字稿 → 摘要 全流程端到端跑通。

### 重要學習
1. Supabase anon key 設計上就是可公開的,**真正的防護是 RLS**,不是藏 key
2. API key **絕對不能**存在 DB table 裡,即使 RLS 開著也不該,要放 Edge Function Secrets
3. GitHub Pages Free 帳號強制 repo public,基礎設施等級限制
4. 第三方 API key 三層防護:存在正確位置 + 前端不接觸 + 設定花費上限
5. fetch 送 multipart/form-data **絕對不要**手動設 Content-Type,讓瀏覽器自動帶 boundary
6. Whisper 支援容器格式清單要查清楚,ffmpeg 輸出要符合
7. 好的架構重構會順便暴露潛伏 bug
8. Claude Code 做中型架構改造時,Opus 比 Sonnet 穩,值得多花 NT$50

### Cosmoship 的含義
Cosmoship 上 production 時這整套經驗全部適用:
- 所有第三方 API(Shopline、Google Ads、Meta Pixel 等)key 走 Edge Function Secrets
- 不能存在前端,不能存在 DB 表,上 production 前開 RLS
- 花費上限一定要設好
- 重要流程要端到端實戰驗證,不能只做單元測試

### 待辦
- [x] ~~Phase D:Supabase RLS 設定(config / projects / proposals / journals)~~ → **2026-04-25 隨 Route C 一起完成**(4 張表 RLS 都開,policies 為 owner-or-member)
- [x] ~~ffmpeg 切段 15 秒 timeout 調整~~ → **2026-04-25 技術路線換成 Web Audio API,ffmpeg.wasm 整包移除**
- [ ] 清 localStorage 殘留 mk_openai_key / mk_anthropic_key(無害)
- [x] ~~Phase 2 音訊改造主體~~ → **2026-04-25 完成**(Meeting 元件重設計 + Web Audio API pipeline + 紅色防呆 Modal + 計時器)
- [ ] `docs/audio-pipeline.md` 仍描述 ffmpeg 方案,需改寫成 Web Audio API 現況
- [ ] `index.html` 與 `index-dev.html` 同步(qmorechi 驗收後手動 `cp index-dev.html index.html`)