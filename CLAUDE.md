# MX Meeting Kit — 專案憲法

> 這份文件是 MeetKit 的單一事實來源 (Single Source of Truth)。
> 每次 Claude Code session 開始時都應完整讀過一次。
> 如果這份文件和你的記憶或預設行為衝突,以這份文件為準。

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

## 2. 核心架構:四層資料結構

```
專案層 (Project)
  └─ 會議層 (Meeting)
      ├─ 提案層 (Proposal)     ← 會議前收集
      └─ 紀錄層 (Record)       ← 會議後產出
```

**欄位細節:**

| 層 | 欄位 |
|---|---|
| Project | id, name, type (IP開發/品牌設計/電商/客戶案/其他), owner_id, members[], created_at |
| Meeting | id, project_id, number, date, host_id, attendees[], type (提案/進度/決策/腦力激盪) |
| Proposal | id, meeting_id, author_id, title, description, goal, resources, priority, status (草稿/待討論/討論中/通過/擱置), references[] |
| Record | id, meeting_id, audio_file_url, transcript, summary, decisions[], action_items[] |

**關鍵規則 — 單一來源原則:**
Project 和 Meeting 層的欄位修改後,**所有歷史紀錄中引用的顯示值都要同步更新**。例如改了專案名,所有會議紀錄頁顯示的專案名也要跟著變。實作上用 foreign key 關聯,不要冗餘存字串。

---

## 3. 權限模型

**使用 Supabase RLS (Row Level Security) 實作。**

| 角色 | Project | Meeting | Proposal | Record |
|---|---|---|---|---|
| Owner | 全權(建/編/刪) | 全權 | 全權 | 全權 |
| Member | 唯讀 | 唯讀 | 填自己的 / 讀全部 | 唯讀 |

**前端實作:**
- 同一套 Component,用 `isOwner` Boolean 控制顯示
- Owner 看到的按鈕(編輯、刪除、管理),Member 完全隱藏
- **不要**做兩套 Component,也**不要**用 CSS `display:none` 來藏 — 直接 `{isOwner && <EditButton />}`

這個模式和 Cosmoship Cart Panel 的 Guest/Member 切換是同一個思路。

---

## 4. 技術棧(不可變動)

| 項目 | 版本 | 備註 |
|---|---|---|
| Framework | Next.js 16 | App Router,和 Cosmoship 同版本 |
| UI | React 19 | Functional components + hooks |
| Language | TypeScript | Strict mode |
| Styling | Tailwind CSS v4 | CSS variables via `@theme` |
| DB | Supabase | 和 Cosmoship 共用帳號,但**獨立 project** |
| Auth | NextAuth v5 | Google SSO 優先(全員 Google Workspace) |
| State | Zustand v5 | |
| AI 摘要 | Anthropic API | Claude Sonnet 4.6 |
| 語音轉文字 | OpenAI Whisper API | `whisper-1` 或 `gpt-4o-transcribe` |
| 音訊前置處理 | ffmpeg.wasm | **前端處理**,詳見 §5 |
| Email | Resend | 下次會議提案信 |
| 部署 | Vercel | |

**為什麼 Supabase 要獨立 project 不和 Cosmoship 共用:**
- 權限完全隔離,會議內容(特別是客戶會議、SIPAI)絕對不能和電商資料混在一起
- RLS 規則完全不同,獨立 project 更好維護
- 未來若 SIPAI 再額外隔離成第三個 project,架構上也順

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

- Vercel Serverless Function 有 10-60 秒執行上限、1GB 記憶體上限 — 處理 3 小時音檔會爆
- 前端處理 = 原檔不離開使用者電腦,只上傳壓縮後的片段 = SIPAI 機密會議更安全
- ffmpeg.wasm 首次載入約 30MB,會被瀏覽器快取,之後使用無延遲
- iOS 16+ Safari 對 ffmpeg.wasm 支援良好,全員 iPhone 的情境下風險很低

### 5.3 Whisper API 呼叫細節

**必帶參數:**
```ts
{
  file: <audio segment>,
  model: "whisper-1",
  language: "zh",  // 絕對不能省,會議一定中英混講
  prompt: "Cosmoship, 宇宙小艇, SIPAI, 偷瞄的X, MX Design, Figma, Supabase, Anthropic, Claude, Next.js"
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

**禁止**:一次輸出整個 component 檔案,即使只改一行。

**要求**:每次程式碼修改都用 `str_replace` 格式:

```
📄 File: src/components/upload/AudioUploader.tsx

🔴 Replace:
const MAX_SEGMENT_MINUTES = 10

🟢 With:
const MAX_SEGMENT_MINUTES = 15

💬 Why: 和 CLAUDE.md §5.1 對齊,目標段長 15 分鐘
```

如果多個地方要改,輸出多個 str_replace 區塊。**新檔案才能全文輸出**,且要標 `🆕 New File:`。

### 6.2 中文註解規範

- 程式碼註解用**繁體中文**,方便設計師 qmore 直接閱讀
- 變數名、函式名用英文(符合 JS/TS 慣例)
- 錯誤訊息給使用者看的一律繁體中文

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

目前位置:**Phase 1 後段 → Phase 2 前段**

- ✅ Phase 0:需求與架構確立
- ✅ Phase 1:UI prototype + GitHub/Vercel/Claude Code 基礎建設
- 🔄 Phase 2:音訊 pipeline 上線(當前重點)
- ⏭ Phase 3:多專案多 Owner 版
- ⏭ Phase 4:全公司 rollout + SIPAI 額外隔離

每一次 session 結束時,如果有里程碑變動,請更新 `docs/ROADMAP.md` 的狀態標記。

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
