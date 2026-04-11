# MeetKit 現況盤點報告

> 盤點時間:2026-04-11
> 盤點對象:`/Volumes/T7/Cosmoship/Anthropic_Claude_Project/meetkit/index.html`
> 盤點方法:完整閱讀 1719 行原始碼

---

## 1. 第一印象與重大修正

### 1.1 修正之前對 MeetKit 的錯誤假設

在這次盤點前,我以為:
- MeetKit 還在 Figma 設計階段
- 只有 HTML prototype,沒有實際運作版本
- Phase 2 要從 Next.js + Supabase 整合開始

**實際情況:**
- `index.html` 是**完整可運作的 MeetKit 實戰版**
- 已經接上 Supabase、Whisper API、Anthropic API
- 已經在真實會議中使用過
- 架構遠比預期成熟

**這個修正非常重要** — 今天之前寫的 `CLAUDE.md` §5、`docs/audio-pipeline.md`、`docs/tasks/meeting-page-redesign.md` 都是基於「從零開始做 Next.js」的假設。實際上我們應該要「在既有的 index.html 上做最小改動」。

### 1.2 為什麼這個架構選擇是對的

雖然這個檔案沒有 Next.js 那種工程化的 file structure,但對目前階段的實際使用**完全足夠**:

- **無後端負擔** — 直接從瀏覽器呼叫 Supabase REST API,不需要 serverless functions
- **零 build 時間** — 改完檔案直接重新整理就生效,沒有 webpack 的等待
- **部署超簡單** — 一個檔案就是全部,丟到任何靜態伺服器都能跑
- **沒有依賴管理** — 所有函式庫都從 CDN 載入,沒有 `node_modules` 地獄
- **和設計師工作流完全對齊** — qmore 不用裝 Node.js、不用跑 `npm install`

這個架構唯一的問題是:**無法做到 Phase 4 全公司 rollout 需要的複雜功能**(例如跨使用者的 NextAuth 登入、server-side rendering、複雜的 SEO)。但那些是未來的事,現在先專注讓 MeetKit 在實戰中持續可用。

---

## 2. 技術棧

| 類別 | 技術 | 載入方式 |
|---|---|---|
| UI 框架 | React 18 | CDN: `unpkg.com/react@18` |
| 編譯 | Babel Standalone | CDN: `@babel/standalone` |
| Markdown | marked.js | CDN |
| PDF 解析 | pdf.js v3.11.174 | CDN(用於抽取 PDF 附件文字) |
| Word 解析 | mammoth.js v1.6.0 | CDN(用於抽取 .docx 附件文字) |
| 字型 | Noto Sans TC | Google Fonts |
| 資料庫 | Supabase(REST API 直接呼叫) | `SB_URL` 和 `SB_KEY` 寫死在檔案開頭 |
| 語音轉文字 | OpenAI Whisper API | 使用者輸入 API Key |
| AI 摘要 | Anthropic Claude(主)/ OpenAI GPT-4o(備) | 使用者輸入 API Key |

**Supabase 配置:**
- URL: `https://yrugcgzkomydmorgzwhb.supabase.co`
- Anon Key 已寫死在 index.html 第 63-64 行

---

## 3. React 元件結構

```
App (1615)                      ← 路由和全域狀態
├── Home (161)                  ← 建立/加入專案入口
├── PasswordGate (1536)         ← 密碼保護外殼
│   └── PasswordGateInner (1569)
├── Header (296)                ← 頂部導覽(phase 切換)
├── PreMeeting (383)            ← 會前提案(466 行,元件最大)
│   ├── FileViewerModal (849)
│   └── FileAttachments (937)
├── Meeting (965)               ← ⭐ 會議進行 + 錄音(173 行)
├── PostMeeting (1137)          ← 會後整理 + Whisper + AI 摘要(267 行)
└── Journal (1404)              ← 會議日誌歸檔
```

**每個元件的職責:**

| 元件 | 行數 | 主要職責 |
|---|---|---|
| `App` | 1615-1718 | 全域狀態管理、phase 切換、Supabase 資料同步 |
| `Home` | 161-295 | 建立新專案(產生 6 碼代碼)、加入現有專案 |
| `PasswordGate` | 1536-1614 | 專案密碼保護層 |
| `Header` | 296-382 | 頂部 tab 導覽、sync 狀態、專案標題 |
| `PreMeeting` | 383-848 | 會前提案收集、附件上傳、AI 輔助 |
| `FileViewerModal` | 849-936 | 附件預覽(PDF/DOCX/圖片) |
| `FileAttachments` | 937-964 | 提案附件列表顯示 |
| **`Meeting`** | **965-1136** | **會議進行、議程追蹤、錄音(⭐核心改造對象)** |
| `PostMeeting` | 1137-1402 | Whisper 轉錄、Claude/GPT 摘要、歸檔 |
| `Journal` | 1404-1535 | 歷史會議紀錄瀏覽 |

---

## 4. 資料結構(Supabase 表)

從程式碼推斷,Supabase 裡至少有這些表:

### `projects` 表
- `id`: UUID(主鍵)
- `code`: 6 碼專案代碼(例如 `A3X9KP`)
- `title`: 專案名稱
- `password_hash`: 密碼保護(optional)
- `meeting_date`: 會議日期
- `meeting_time`: 會議時間

### `proposals` 表
- `id`: UUID
- `project_id`: FK → projects.id
- `title`: 提案標題
- `author`: 提案人
- `content`: 提案內容
- `file_url`: JSON 字串(附件 URL 陣列)
- `file_name`: JSON 字串(附件檔名陣列)

### `journal` 表(推測)
- 歸檔會議紀錄 + 摘要 + 逐字稿

### Supabase Storage
- Bucket: `presentations`(存放提案附件)
- 路徑結構:`{projectId}/{timestamp}_{random}.{ext}`

---

## 5. 錄音功能現況(⭐問題核心)

### 5.1 錄音邏輯位置

**檔案:** `index.html`
**元件:** `Meeting`
**行數:** 1018-1034(僅 17 行)

### 5.2 實作方式

```javascript
// 開始錄音
const startRec = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ['audio/webm;codecs=opus','audio/webm','audio/ogg','audio/mp4']
    .find(t => MediaRecorder.isTypeSupported(t)) || '';
  const mr = new MediaRecorder(stream, { 
    ...(mime ? { mimeType: mime } : {}), 
    audioBitsPerSecond: 32000 
  });
  mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
  mr.onstop = () => { 
    const blob = new Blob(chunksRef.current, { type: mr.mimeType }); 
    setAudioBlob(blob); 
    setAudioUrl(URL.createObjectURL(blob));
    stream.getTracks().forEach(t => t.stop()); 
  };
  mr.start(500); 
  // ...計時器邏輯
};
```

### 5.3 問題

這就是**會議中跳出分頁錄音會斷**的元兇:

- 使用瀏覽器原生 `MediaRecorder`
- 分頁切到背景時,iOS Safari 會掐斷 `getUserMedia` stream
- Desktop Chrome 雖然不會完全掐斷,但會嚴重節流 `dataavailable` 事件
- 32kbps 的 bitrate 已經很低了,但這不是問題核心

### 5.4 UI 現況

**檔案:** `index.html` 第 1105-1126 行(Meeting 元件的右欄)

```jsx
<div>🎙️ 全場錄音</div>
<div>
  <麥克風大圖示 (88x88) />
  {isRecording && <計時器 MM:SS />}
  <狀態文字>{錄音中 / 錄音完成 / 準備好後開始}</狀態文字>
  <按鈕>{停止錄音 / 重新錄音 / 開始錄音}</按鈕>
</div>
{audioUrl && (
  <音檔預覽 + 下載連結 />
)}
```

這就是你截圖看到、想要替換掉的那個區塊。

---

## 6. 會後整理現況(PostMeeting 元件)

### 6.1 重大發現:上傳檔案功能**早就存在**

**檔案:** `index.html` 第 1318-1338 行

```jsx
<div>🎵 音檔來源</div>
{audioBlob && (
  <card>✓ 已有錄音 來自「會議進行」的錄音</card>
)}
<label>{audioBlob ? '或改用上傳的音檔' : '上傳音檔'}</label>
<input 
  ref={fileRef} 
  type="file" 
  accept="audio/*,video/webm" 
  style={{ display: 'none' }} 
  onChange={e => setUploadFile(e.target.files[0])} 
/>
<button onClick={() => fileRef.current.click()}>📂 選擇音檔</button>
```

**關鍵邏輯:**

```javascript
const audioSrc = uploadFile || audioBlob;  // 上傳優先於錄音
```

這代表:**使用者已經可以上傳 iPhone 語音備忘錄的錄音檔**,只是:

1. UI 上這個選項被「錄音」蓋住主角光環,使用者可能沒注意
2. **沒有壓縮和切段** — 長會議會爆 Whisper 25MB 上限
3. **Whisper API 呼叫時沒有做 multi-part 處理**(第 1163-1168 行)

### 6.2 Whisper API 呼叫現況

**檔案:** `index.html` 第 1163-1168 行

```javascript
const fd = new FormData();
fd.append('file', audioSrc, uploadFile?.name || 'recording.webm');
fd.append('model', 'whisper-1'); 
fd.append('language', 'zh');
const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { 
  method: 'POST', 
  headers: { Authorization: `Bearer ${openaiKey.trim()}` }, 
  body: fd 
});
```

**缺的東西:**
- ❌ 沒有 `prompt` 參數(可以塞專有名詞清單提升辨識準確度)
- ❌ 沒有檔案大小檢查(超過 25MB 直接失敗)
- ❌ 沒有切段邏輯(長檔案整個丟進去)
- ❌ 沒有壓縮邏輯(原檔直接上傳,浪費頻寬)

### 6.3 成本計算已經做了

```javascript
setWhisperInfo({ mins, cost: (mins * 0.006).toFixed(3) });
```

使用者可以看到 Whisper 的分鐘數和 USD 費用,這是很貼心的設計。

### 6.4 AI 摘要的 Prompt 設計很完整

第 1192-1280 行有一份極為完整的 Prompt,產出:
- 📋 各提案分析(核心想法、Findings、可行性評估、結論)
- ✅ 待辦事項清單(markdown 表格)
- 其他結構化輸出

**這份 prompt 已經是生產級品質,不需要動。**

---

## 7. 現有架構的強項

### 7.1 設計得極好的地方

1. **API Key 儲存在 localStorage** — 隱私好、易用
2. **Supabase REST API 直呼** — 無需後端 proxy,簡潔
3. **附件抽取文字功能** — 用 pdf.js + mammoth 把 PDF/DOCX 內容一起丟給 AI 摘要
4. **6 碼專案代碼** — 不需要複雜帳號系統就能分享專案
5. **可選密碼保護** — 機密會議(例如 SIPAI)可以加密碼
6. **AI 摘要雙引擎** — 優先 Claude,fallback GPT-4o
7. **Markdown 匯出** — 會議紀錄可以直接下載成檔案
8. **即時同步** — Meeting 元件每 8 秒重新抓提案(第 1011 行)

### 7.2 和今天討論的四層資料結構對照

| 層 | 理論設計 | index.html 實現 | 對應關係 |
|---|---|---|---|
| 專案層 | `projects` 表 | ✅ `projects`(code, title, password) | 完全符合 |
| 會議層 | `meetings` 表 | ⚠️ 目前和 projects 合併(`meeting_date`, `meeting_time` 直接在 projects 裡) | 簡化版,一個專案一場會議 |
| 提案層 | `proposals` 表 | ✅ `proposals`(title, author, content, files) | 完全符合 |
| 紀錄層 | `records` 表 | ⚠️ `journal` 表(推測),逐字稿+摘要 | 結構可能稍有不同 |

**落差很小** — 未來要擴展成「一個專案多場會議」,只需要把 `meeting_date` 從 projects 抽出來變成獨立的 meetings 表。

---

## 8. 改造策略建議

### 8.1 正確的改造路線

基於這次盤點,**我強烈建議放棄「Next.js 重寫」這條路**,改為:

**路線:原地改 index.html,只改錄音相關的 17 行 + 加音訊前置處理**

理由:
- 所有其他功能都已經運作良好,沒必要重寫
- Whisper API、Claude API、附件處理、歸檔等全都已經做完
- Next.js 的好處(SSR、routing)對單頁工具沒意義
- 設計師獨立維護單一 HTML 檔案比維護 Next.js 專案容易太多

### 8.2 具體改造範圍(預估)

| 改動區塊 | 檔案位置 | 複雜度 |
|---|---|---|
| 移除 MediaRecorder 錄音 | Meeting 元件 1018-1034 行 | 🟢 刪除 17 行 |
| 新增「會議中提示用 iPhone 錄音」UI | Meeting 元件 1105-1126 行替換 | 🟡 替換 22 行 |
| 新增紅色覆蓋防呆層 | 新增獨立元件 | 🟡 新增 30 行左右 |
| 加會議計時器(純計時,不錄音) | 新增獨立元件 | 🟢 新增 20 行左右 |
| 整合 ffmpeg.wasm 壓縮 | 新增 utility 函式 | 🔴 新增 60-80 行 |
| 整合切段邏輯 | 新增 utility 函式 | 🔴 新增 40-60 行 |
| Whisper API 多段並行上傳 | PostMeeting 元件 1157-1172 行改寫 | 🔴 改寫 20 行 → 80 行 |
| 段落合併邏輯 | 新增 utility 函式 | 🟡 新增 30 行 |

**預估總改動:約 250-300 行**(刪掉 17 行 + 新增 280 行左右)

**最終 index.html 大小:** 從 1719 行 → 約 1980-2000 行(10% 增長)

### 8.3 為什麼不拆成多個檔案

雖然理論上應該把 ffmpeg.wasm、切段、上傳等邏輯拆成 `src/audio/*.js`,但這會破壞 `index.html` 「一個檔案就是全部」的優勢。

**折衷方案:** 所有新增的 utility 函式都用 `// ─── AUDIO PIPELINE ─────────────` 這種註解區塊清楚標示,未來要拆出來重構很容易,但現階段保持單檔案。

---

## 9. 需要修改的任務書

今天寫的 `docs/tasks/meeting-page-redesign.md` 是基於 Next.js + TypeScript + Zustand 的架構寫的,**幾乎全部不適用**:

| 任務書假設 | 實際情況 |
|---|---|
| `src/app/meeting/[id]/page.tsx` | `index.html` 第 965 行的 `Meeting` 函式 |
| Zustand `useMeetingStore` | React `useState` + props drilling |
| TypeScript interface | 純 JavaScript,無型別 |
| `src/components/overlay/BlockingModal.tsx` | 在 index.html 內部新增一個 React 函式元件 |
| Supabase migration SQL 檔案 | 需要在 Supabase dashboard 手動加欄位 |
| 獨立檔案的 str_replace | 在 index.html 內部的 str_replace |

**需要重寫任務書,對齊 index.html 的實際架構。**

---

## 10. 下一步建議

### 10.1 立刻要做的事

1. **保留這份盤點報告作為 source of truth**
2. **重寫 `docs/tasks/meeting-page-redesign.md`** → 改名為 `meeting-page-redesign-indexhtml.md`,完全基於 index.html 的實際結構
3. **更新 `CLAUDE.md` §5 音訊 pipeline 段落** → 改成「在 index.html 內部實作」的版本
4. **更新 `docs/ROADMAP.md`** → 把 Phase 2 從「Next.js 遷移」改成「index.html 錄音改造」,Next.js 移到 Phase 3 或更後面

### 10.2 未來的決策時機

**什麼時候該考慮 Next.js 重寫?**

當 index.html 遇到下列任一瓶頸時:

- 需要真正的多使用者登入系統(NextAuth 或類似)
- 需要複雜的權限系統(RLS 規則 + Middleware)
- 檔案超過 3000 行,維護變困難
- 需要 Server Components 或 SSR
- 要做 PWA(離線使用)
- 全公司 rollout 需要更嚴謹的安全性

**在那之前,index.html 就是對的架構。**

---

## 11. 給 Claude Code 的開工指引

下次開工時,Claude Code 應該:

1. **先讀這份 `current-state-audit.md`** 建立對 MeetKit 現況的準確認知
2. **然後讀 `CLAUDE.md`** 了解專案憲法(特別是開發紀律和機密處理)
3. **最後讀 `meeting-page-redesign-indexhtml.md`** 了解這次改造的具體任務
4. **不要**嘗試把 index.html 拆成多檔案 — 保持單檔架構
5. **不要**引入任何 npm 套件 — 所有新函式庫從 CDN 載入
6. **str_replace 的對象是 index.html 內部的字串**,不是獨立檔案

---

_這份盤點的意義:把今天早上基於錯誤假設寫的文件,全部校準回現實。_
_這是「設計師主導 AI 協作」的重要教訓:動手之前先盤點現況,不要從假設出發。_
