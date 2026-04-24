# MX Meeting Kit — 專案憲法

> 這份文件是 MeetKit 的單一事實來源 (Single Source of Truth)。
> 每次 Claude Code session 開始時都應完整讀過一次。
> 如果這份文件和你的記憶或預設行為衝突,以這份文件為準。

---

## ⚠️ 第一鐵律:MeetKit 是正在運作的生產環境

**在做任何事之前,先讀這段。**

### 部署現況

- **正式網址:** `https://qmorechi.github.io/meetkit/`
- **部署方式:** GitHub Pages 自動從 `main` branch 部署
- **觸發條件:** 每次 `git push` 後,GitHub Pages 1-2 分鐘內自動更新
- **有同事正在使用中**,裡面有真實的客戶會議、SIPAI 等機密專案
- **Supabase** 存著所有專案、提案、附件、逐字稿

### 為什麼這件事重要

1. **Bug 會立刻影響同事** — 任何半成品 push 上去,同事下次開會就會踩到
2. **資料和介面分離** — 改 index.html **不會**動到 Supabase 資料,但介面變了同事會困惑
3. **GitHub Pages 沒有 staging** — 一 push 就是正式環境,沒有「測試完再上線」的緩衝

### 開發期的鐵律:用 index-dev.html 隔離

**所有改造動作都先做在 `index-dev.html`,不動 `index.html`。**

```bash
# Claude Code 開工第一件事
ls index-dev.html 2>/dev/null || cp index.html index-dev.html
```

之後所有 str_replace 都對 `index-dev.html` 執行。

### 測試方式

- 本機:用瀏覽器打開 `index-dev.html`(有 `file://` 限制)
- 部署:push 後開 `https://qmorechi.github.io/meetkit/index-dev.html?p=TEST001`
- **不要**用真實客戶專案測試,建一個測試專案(例如代碼 `TEST001`)

### 正式切換的流程

開發完成 → qmore 驗收 → **qmore 明確說「可以正式切換」** → 才能執行:

```bash
cp index-dev.html index.html
```

**Claude Code 絕對不能自作主張執行這個 `cp`**。切換時機由 qmore 決定。

### 資料安全保證

即使 Phase 2 全部改壞了,Supabase 裡的所有資料依然完整:

- 專案、提案、附件、逐字稿都存在雲端資料庫
- 改程式 = 換前端介面,就像換書架,書不會不見
- 唯一會弄丟資料的情況是手動進 Supabase dashboard 刪除

---

## 1. 專案定位

**MX Meeting Kit** 是 MX Design 內部會議管理工具的**公版**。

- **不是** SIPAI 專屬 — SIPAI 只是第一個使用案例
- **不是** 一般專案管理工具(Notion / Trello 的替代品)
- **是** 專門只做「會議」這件事,涵蓋:提案收集 → 會議進行 → 錄音上傳 → AI 整理 → 紀錄歸檔 → 自動發下次會議提案信 的完整閉環
- **目標**:長成**全公司任何 Team、任何專案都能使用**的會議工具

### 使用者特徵

- 主要使用者是**設計師和品牌顧問**,不是工程師
- 會議常長達 2-3 小時(客戶會議、腦力激盪),錄音檔動輒 50-100MB
- 全員使用 iPhone,錄音來源幾乎都是 iOS 語音備忘錄的 `.m4a`
- 與會者在會議中**一定會**跳出 app 查資料 — 這是不可抗力,系統設計必須容忍

---

## 2. 核心架構:三層資料結構(實際現況)

```
專案層 (projects)
  ├─ 提案層 (proposals)     ← 會前收集,可含附件
  └─ 日誌層 (journal)        ← 會後產出,含逐字稿和摘要
```

**重要:** 原本規劃的「Meeting 層」**目前沒有獨立存在** — 一個專案就是一場會議,`meeting_date` 和 `meeting_time` 直接存在 `projects` 表裡。

這個簡化是對的,因為:
- 目前的使用情境多半是「建一個專案 → 開一場會 → 歸檔」
- 不需要「一個專案開好幾場會」的複雜結構
- Phase 3 如果真的需要「一個專案多場會議」,再把 meeting 抽出來做獨立表

### 實際欄位(從 index.html 推斷)

**`projects` 表:**
- `id` (TEXT,6 碼專案代碼,例如 `A3X9KP` — 這就是專案代碼,**不是 UUID**,也**沒有**另外一個 `code` 欄位)
- `title` (專案名稱)
- `password_hash` (可選的密碼保護,Route C 邀請制啟用後已不使用,欄位保留但 UI 拿掉)
- `meeting_date`
- `meeting_time`
- `owner_email` (TEXT,2026-04-25 migration 加入,記錄建立者 email,用於 RLS)
- `notion_parent_page_id` (TEXT,可選。該專案歸檔要寫到哪個 Notion 頁底下;為 null 則寫 NOTION_DB_ID 預設資料庫)

**`proposals` 表:**
- `id` (UUID)
- `project_id` (FK)
- `title` (提案標題)
- `author` (提案人)
- `content` (提案內容)
- `file_url` (JSON 字串,附件 URL 陣列)
- `file_name` (JSON 字串,附件檔名陣列)

**`journal` 表:**
- 存歸檔的會議紀錄(逐字稿 + AI 摘要 + 決議)
- 結構待確認,等 Claude Code 讀 App 元件時補完

**Supabase Storage:**
- Bucket: `presentations`
- 路徑: `{projectId}/{timestamp}_{random}.{ext}`
- 用途: 存放提案附件(PDF、DOCX、圖片)

### 如果未來要擴展成「一個專案多場會議」

只需要:
1. 新增 `meetings` 表(id, project_id, date, time, number)
2. `proposals.project_id` 改成 `proposals.meeting_id`
3. 在 UI 上加「會議列表」頁面

**在那之前,三層結構就夠用,不要過度設計。**

---

## 3. 權限模型:邀請白名單(2026-04-25 起)

**MeetKit 走「邀請制 + magic-link 登入」,不再是「誰知道代碼誰就能進」。**

### 核心邏輯

```
發起者建專案(填一串 email 清單)
  ↓
專案寫進 projects,成員寫進 project_members
  ↓
Edge Function send-invite 用 Resend 寄 MeetKit 邀請信給每個 email
  ↓
被邀請者收信 → 點 MeetKit 連結 → 用自己的 email 登入(Supabase magic link)
  ↓
登入後 Home 自動顯示「📨 我被邀請的會議」清單,點進去就進會議室
```

**直到專案結束,同一個專案通知是延伸使用的** — 同一批成員在同一個 project code 下開多次會,不重發邀請。

**中途要加人的話**,owner 在專案設定頁(⚙)的「📬 與會者」區手動加 email,系統自動再寄一封邀請信。

### 實作層

| 層 | 機制 |
|---|---|
| 登入 | Supabase Auth `signInWithOtp` (email magic link) |
| 權限 | Supabase RLS,`auth.jwt()->>'email'` 比對 `owner_email` 或 `project_members.member_email` |
| 建立 | `projects.owner_email = 建立者 email`,`project_members` 存被邀請的 email |
| 邀請 | Edge Function `send-invite`(Resend + `meetkit@mx.design` 寄件) |
| UI | Home 分成「🧑‍💼 我建立的」+「📨 我被邀請的」兩份清單,**沒有**輸入 6 碼代碼的框 |

### RLS Policies 摘要

- `projects` SELECT: owner OR 我在 `project_members`
- `projects` INSERT/UPDATE/DELETE: owner only
- `proposals` / `journals` SELECT/INSERT/UPDATE: owner OR member
- `proposals` DELETE: owner OR member(協作刪除沒問題)
- `journals` DELETE: owner only(會議紀錄本身只有 owner 能刪)
- `project_members` SELECT: 自己或 owner;INSERT/DELETE: owner only

Helper functions `public.is_project_owner(pid)` 和 `public.is_project_member(pid)` 是 `SECURITY DEFINER`,避免 policy 跨表遞迴。

### 6 碼代碼還在嗎?

**還在,但角色變了。**
- 仍然是 `projects.id`(6 碼 TEXT 例如 `A3X9KP`)
- 仍然是邀請信連結裡的 `?p=ABC123`
- **但單純知道代碼進不去** — 不在白名單的 email 登入後連這個專案的 SELECT 都會被 RLS 擋
- 代碼從「通行密碼」變成「專案識別碼 + URL slug」

### 為什麼這樣改

舊的「代碼隨便分享」模型對設計師工作坊夠用,但 MeetKit 現在處理 SIPAI、客戶會議,資料敏感。原本「知道代碼就能進」= 任何共享連結的人都看得到機密內容,風險過高。

新模型的成本:
- 每個與會者第一次進都要收信點連結(多一步)
- 要維護 Resend domain + API key(mx.design 已驗證完畢)

換到的好處:
- RLS 從資料庫層就擋掉未授權存取 — 就算前端有 bug 漏洞,資料也不會外流
- 每個動作都綁 email,審計能追到人
- 可以完全移除密碼保護那個過時機制

### Phase 4 時的擴展

全公司 rollout 要加的:
- SSO(mx.design domain 白名單)
- 角色區分(viewer / editor / owner)
- 邀請有效期 + 撤銷
- 專案歸屬變更(owner transfer)

但**現階段的 owner + member 兩層就夠用**,別過度工程化。

---

## 4. 技術棧(實際現況)

**重要:** MeetKit **不是**一個需要 build 的 Next.js 專案,而是**單一 HTML 檔案 `index.html`**,用 React + Babel in-browser 編譯。這個架構是刻意選擇的,適合設計師獨立維護、零 build 時間、部署極簡單。

詳見 `docs/current-state-audit.md` 的完整現況盤點。

### 核心技術棧

| 項目 | 技術 | 載入方式 |
|---|---|---|
| UI 框架 | React 18 | CDN: `unpkg.com/react@18` |
| 編譯 | Babel Standalone | CDN: `@babel/standalone` |
| Markdown | marked.js | CDN |
| PDF 解析 | pdf.js v3.11.174 | CDN(附件文字抽取) |
| Word 解析 | mammoth.js v1.6.0 | CDN(附件文字抽取) |
| 字型 | Noto Sans TC | Google Fonts |
| DB | Supabase REST API | 直接 fetch,無 SDK |
| Storage | Supabase Storage | 直接 fetch,bucket 名 `presentations` |
| 語音轉文字 | OpenAI Whisper API | 使用者輸入 API Key(存 localStorage) |
| AI 摘要 | Anthropic Claude(主)/ OpenAI GPT-4o(備) | 使用者輸入 API Key |
| 音訊前置處理 | ffmpeg.wasm(Phase 2 待整合) | CDN: `@ffmpeg/ffmpeg` |
| 登入 | Supabase Auth(magic link) | `@supabase/supabase-js@2` CDN |
| 邀請信 | Resend(domain `mx.design` 已驗證) | Edge Function `send-invite` |

**Supabase 配置:**
- URL: `https://yrugcgzkomydmorgzwhb.supabase.co`
- Anon Key 寫死在 index.html 第 63-64 行

**刻意不用的東西:**
- ❌ **Next.js / React Router** — 單頁 SPA,不需要
- ❌ **TypeScript** — 純 JavaScript + JSX,降低設計師理解門檻
- ❌ **Zustand / Redux** — React 的 `useState` + props drilling 已經夠用
- ❌ **Tailwind / styled-components** — 用原生 CSS-in-JS 物件(`S.panel`、`btn()` 等 helper)
- ❌ **NextAuth** — 用 6 碼專案代碼 + 可選密碼保護,不需要完整帳號系統
- ❌ **npm / package.json / node_modules** — 所有函式庫從 CDN 載入
- ❌ **build 流程** — 改完檔案直接重新整理

**為什麼保持這個架構:**
- 設計師(qmore)能獨立維護,不需要前端工程師支援
- 零 build 時間,改完立刻看到效果
- 部署只要一個 HTML 檔丟到靜態伺服器
- SIPAI 機密會議情境下,沒有 node_modules 的供應鏈攻擊風險
- 這套架構在實際會議中已經驗證可用

### 何時該考慮 Next.js 重寫

**等到以下任一情況出現再考慮:**
- 需要真正的多使用者登入系統(跨專案帳號管理)
- 需要複雜的權限系統(跨專案 RLS + middleware)
- `index.html` 超過 3000 行,維護變困難
- 需要 SSR / Server Components
- 要做 PWA(離線使用)
- 全公司 rollout 的安全性要求提升(例如 SSO + domain 白名單)

**在那之前,`index.html` 就是對的架構。**

### 資料表結構(Supabase)

- `projects` — id, code(6 碼), title, password_hash, meeting_date, meeting_time
- `proposals` — id, project_id, title, author, content, file_url (JSON), file_name (JSON)
- `journal` — 會議歸檔(逐字稿、摘要)
- Storage bucket `presentations` — 提案附件,路徑 `{projectId}/{timestamp}_{random}.{ext}`

---

## 5. 音訊前置處理管線(MeetKit 的核心技術決策)

**重要背景:**
原本規劃「瀏覽器即時錄音」,實地測試後發現會議中與會者跳出 app 查資料時,MediaRecorder 會在背景分頁被瀏覽器掐斷。這是**無法對抗的瀏覽器限制**,不是 bug。

**決策:放棄瀏覽器即時錄音,改為「上傳錄音檔」模式。**

- 會議時:與會者自己用 iPhone 語音備忘錄錄(系統層級錄音,不會被任何事情打斷)
- 會議後:主持人拖檔上傳到 MeetKit

### 5.1 前置處理流程

```
使用者拖入 .m4a (50-200MB)
    ↓
[1] ffmpeg.wasm 壓縮
    16kHz mono opus 24kbps → 壓縮後約原檔 35%
    ↓
[2] 靜音偵測切段
    目標 15 分鐘/段,最短 5 分鐘,最長 20 分鐘
    切點:目標時間點 ±2 分鐘範圍內找 >0.8 秒的靜音
    ↓
[3] 並行上傳到 Whisper API
    4 條並行通道,rate limit 安全範圍
    失敗自動重試 3 次,間隔 2 秒
    ↓
[4] 按時間順序合併逐字稿
    ↓
[5] Anthropic API 分兩階段產出
    第一階段:結構化議程紀錄(議題/決議/Action Items)
    第二階段:一句話標題 + 三句摘要
    ↓
[6] 存進 Supabase + Resend 寄信通知與會者
```

### 5.2 為什麼用 ffmpeg.wasm 前端處理

- 完全沒有後端 — 整個 MeetKit 就是 `index.html`,從來沒有 serverless function 可以用
- 前端處理 = 原檔不離開使用者電腦,只上傳壓縮後的片段 = SIPAI 機密會議更安全
- ffmpeg.wasm 首次載入約 30MB,會被瀏覽器快取,之後使用無延遲
- iOS 16+ Safari 對 ffmpeg.wasm 支援良好,全員 iPhone 的情境下風險很低
- 從 CDN 載入 ffmpeg.wasm,延續 index.html「無 build、無 npm」的架構哲學

### 5.2.5 實作位置(重要)

所有音訊 pipeline 邏輯都寫在 `index.html` **內部**,不拆檔案。

- ffmpeg.wasm 從 CDN `unpkg.com/@ffmpeg/ffmpeg` 載入
- 在 `<script type="text/babel">` 區塊內新增一個 `// ─── AUDIO PIPELINE ─────────────` 註解區塊,所有相關函式寫在這裡
- `PostMeeting` 元件現有的 Whisper API 呼叫邏輯(1163-1168 行)要改寫,接上前置處理

**現有 index.html 已經有的:**
- ✅ 上傳音檔的 UI(1318-1338 行)
- ✅ Whisper API 呼叫(1163-1168 行)
- ✅ 成本計算(1169-1171 行)
- ✅ Anthropic/GPT 雙引擎摘要(1192-1280 行的 prompt)

**需要新增的:**
- ❌ ffmpeg.wasm 載入和初始化
- ❌ 壓縮函式(16kHz mono opus 24kbps)
- ❌ 靜音偵測切段
- ❌ 並行上傳邏輯
- ❌ 逐字稿合併
- ❌ 六階段 UI 進度顯示

### 5.3 Whisper API 呼叫細節

**必帶參數:**
```js
{
  file: <audio segment blob>,
  model: "whisper-1",
  language: "zh",  // 絕對不能省,會議一定中英混講
  prompt: "Cosmoship, 宇宙小艇, SIPAI, 偷瞄的X, MX Design, Figma, Supabase, Anthropic, Claude, ComfyUI, Flux, MeetKit"
  // prompt 塞專有名詞清單,Whisper 會對這些詞特別準確
}
```

**不做講者辨識 (diarization):**
- Whisper API 本身不支援
- pyannote.audio 要在後端跑,和前端架構不符
- 替代方案:會議中請與會者「發言前報名字」,Whisper 會把名字轉出來,AI 摘要時 Claude 會自動對應

詳細技術文件見 `docs/audio-pipeline.md`。

---

## 6. 開發紀律(給 Claude Code 的嚴格規則)

### 6.1 絕對規則:只輸出修改部分,不全文重寫

**禁止**:一次輸出整個 `index.html`(或其中一個 React 元件的完整程式碼),即使只改一行。

**要求**:每次程式碼修改都用 `str_replace` 格式:

```
📄 File: index.html
📍 Location: Meeting 元件 (~1018 行,startRec 函式)

🔴 Replace:
const startRec = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

🟢 With:
const startRec = async () => {
  alert('會議進行中請打開 iPhone 語音備忘錄錄音,會後回到這裡上傳檔案');
  return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

💬 Why: 暫時停用瀏覽器錄音,引導使用者改用 iPhone。完整改造見任務書
```

**找行數的方式:** 先用 `grep -n "function 元件名"` 或類似方式確認實際行號,因為 index.html 會隨改動增長,絕對行號會漂移。用「元件名 + 函式名」定位比行號更穩定。

如果多個地方要改,輸出多個 str_replace 區塊。**新檔案才能全文輸出**,且要標 `🆕 New File:`。

### 6.2 中文註解規範

- 程式碼註解用**繁體中文**,方便設計師 qmore 直接閱讀
- 變數名、函式名用英文(符合 JavaScript 慣例)
- 錯誤訊息給使用者看的一律繁體中文
- 大段功能區塊用 `// ─── 區塊名稱 ─────────────` 分隔,和現有 index.html 的風格一致

### 6.3 Commit 訊息規範

- 格式:`<type>: <說明>`,type 用英文,說明用中文
- type 選項:`feat`、`fix`、`refactor`、`docs`、`chore`
- 範例:`feat: 加入音訊切段進度顯示`、`fix: iPhone Safari 上傳失敗重試邏輯`

### 6.4 SIPAI 和客戶會議的特殊處理

- 任何和 SIPAI 相關的資料、提案標題、會議紀錄,**在 log 或錯誤訊息裡都不要 print 完整內容**
- 客戶會議的逐字稿和摘要,資料庫存放時考慮加密(Phase 4 的任務,現在先用 RLS 隔離)
- Claude Code 在開發過程中若需要測試資料,**不要用真實 SIPAI 或客戶內容**,用假資料

---

## 7. Rollout 路線圖(詳見 `docs/ROADMAP.md`)

目前位置:**Phase 2 準備開工**(index.html 實戰版已有,錄音改造待做)

- ✅ Phase 0:需求與架構確立
- ✅ Phase 1:index.html 實戰版上線,多次真實會議驗證
- 🔄 Phase 2:錄音改造(放棄瀏覽器錄音 + 整合 ffmpeg.wasm + 切段上傳)← 當前
- ⏭ Phase 3:多專案管理介面優化 + 跨專案搜尋
- ⏭ Phase 4:全公司 rollout(可能的 Next.js 重寫時機)

每一次 session 結束時,如果有里程碑變動,請更新 `docs/ROADMAP.md` 的狀態標記。

**重要認知:** MeetKit 的 Phase 劃分**不是**「從零到 Next.js 正式版」的工程路線,而是「從單檔實戰版逐步擴充功能」的漸進路線。保留 index.html 作為主體,直到它不敷使用才考慮重寫。

---

## 8. 工作環境

### 8.1 跨裝置開發

qmore 在兩台機器之間切換工作:
- **Mac Studio**(主力工作站,設計 + Claude Code)
- **Windows + RTX 4080**(ComfyUI 專用,偶爾也會寫程式)

### 8.2 開工/收工儀式

- **開工**:雙擊 `start.command` → 自動 `git pull` → 顯示上次交接紀錄 → 啟動 Claude Code
- **收工**:雙擊 `finish.command` → 自動更新 `.claude-handoff.md` → `git commit` → `git push`

### 8.3 交接紀錄格式

每次 session 結束前,Claude Code **必須**更新 `.claude-handoff.md`,格式如下:

```markdown
## 摘要
(兩到三行,說明這次 session 做了什麼、下次從哪開始)

## 裝置
| 裝置 | Mac Studio / Windows |
| 時間 | YYYY-MM-DD HH:MM |

## 上次進度
- ✅ 已完成的項目
- 🔄 進行中但沒做完
- ⏭ 下一步要做的

## 注意事項
(踩過的坑、暫時的 workaround、後續要注意的)

## 下次從這裡開始
(具體到檔案路徑和函式名的下一步動作)
```

`start.command` 會自動解析 `## 摘要` 這一段,所以**格式不可隨意更動**。

### 8.4 觸發收工的關鍵字

使用者說「收工」、「幫我整理交接」、「結束 session」時,Claude Code 應該:

1. 更新 `.claude-handoff.md`(按上面的格式)
2. 提醒使用者「可以雙擊 finish.command 結束」
3. 不要自己去執行 git 指令 — 那是 `finish.command` 的工作

---

## 9. 何時該打斷 qmore 確認

qmore 是設計師不是工程師。以下情境**一定要停下來問**:

1. 要新增付費服務(OpenAI、Anthropic、Resend 的方案升級)
2. 要改動資料庫 schema(會影響既有資料)
3. 要引入新的 npm 套件(避免 bundle 變大、license 問題)
4. 遇到兩種合理的實作方式,後續很難再改
5. 出現錯誤訊息看不懂,與其猜測不如回報原文

**不用問直接做**的情境:

1. 修 bug
2. 重構既有函式(不改介面)
3. 加註解、改變數名讓更清楚
4. 照 Figma spec 調整樣式
5. 照這份 CLAUDE.md 的規則做事

---

## 10. 這份文件的維護

- 新增技術決策 → 更新對應章節,並在 commit 訊息標 `docs: 更新 CLAUDE.md`
- 章節順序不可變動(§1-§10 是固定的,避免閱讀習慣錯亂)
- 如果某個規則實作後發現不適用,**改文件不要改程式碼** — 把文件改對,下次 Claude Code 會照新規則做

---

_最後更新:2026-04-11 — Phase 2 音訊 pipeline 決策完成,準備開工_
