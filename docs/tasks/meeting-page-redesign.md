# 任務:Meeting 元件改造 — 錄音確認機制

**任務 ID:** `MEETKIT-002`
**建立日期:** 2026-04-11(初版基於 Next.js 假設)
**重寫日期:** 2026-04-11(對齊 index.html 實際架構)
**優先級:** 高(Phase 2 的第一個主要任務)
**預計工作量:** 一個完整 Claude Code session(2-3 小時)

---

## 前置閱讀(重要)

Claude Code 開工前**必須**依序讀完:

1. `CLAUDE.md` — 專案憲法
2. `docs/current-state-audit.md` — **index.html 的完整現況盤點**
3. `docs/audio-pipeline.md` — 音訊前置處理規格
4. 本文件

如果沒讀過 `current-state-audit.md`,會對 index.html 的架構有錯誤假設,導致程式改錯地方。

---

## ⚠️ 生產環境警告(第一條鐵律)

**MeetKit 已經部署在 GitHub Pages 上運作中:**

- 部署網址:`https://qmorechi.github.io/meetkit/`
- 每次 push 到 main branch,GitHub Pages 1-2 分鐘內自動更新
- **有同事正在使用中**,裡面有真實的客戶會議、SIPAI 等機密專案資料
- Supabase 裡存著所有專案、提案、附件、逐字稿

### 第一條鐵律:不動正式版 index.html

**Phase 2 所有改動都做在 `index-dev.html`,不動 `index.html`。**

### Claude Code 開工第一件事

```bash
# 檢查 index-dev.html 存在嗎
ls index-dev.html 2>/dev/null

# 如果不存在,從正式版複製一份
cp index.html index-dev.html
```

之後所有 str_replace 都對 `index-dev.html` 執行,`index.html` 完全不碰。

### 測試方式

開發過程中,qmore 要驗證新版時,打開:
```
https://qmorechi.github.io/meetkit/index-dev.html?p=TEST001
```

或在本機直接用瀏覽器打開 T7 硬碟上的 `index-dev.html`(不推薦,`file://` 協議會有限制)。

**建議 qmore 建立一個專用的測試專案**(例如代碼 `TEST001`),不要用真實客戶專案測試。

### 切換上線的時機

當 Phase 2 所有驗收標準都通過,qmore 明確說「可以正式切換」後:

```bash
# 用 dev 版覆蓋正式版
cp index-dev.html index.html

# 可選:保留 dev 版作為下次改造的起點
# 或刪掉:rm index-dev.html

# 收工時 finish.command 會 commit + push,GitHub Pages 自動更新
```

**在 qmore 明確說「可以切換」之前,Claude Code 絕對不能執行這個 `cp` 動作。**

### 為什麼這麼嚴格

- 同事開會中遇到半成品程式會影響實際工作
- 生產版的 bug 會立刻影響正在進行的會議
- `index-dev.html` 和 `index.html` 並存的成本極低(就是多一個檔案)
- 切換時機由 qmore 決定,Claude Code 不能自作主張

### Phase 2 完成後

Phase 3 開工時可以考慮更進階的工作流(git branch、測試環境等),但 Phase 2 就用最簡單的「兩個檔案並存」模式,降低複雜度。

---

## 1. 背景與觸發點

### 觸發事件
2026-04-11 實地會議測試發現:會議中與會者切到其他 app 查資料時,瀏覽器的 `MediaRecorder` 會被背景化而中斷錄音。這是瀏覽器和 iOS Safari 的底層限制,無法用程式繞過。

### 決策
- 放棄瀏覽器即時錄音
- 改為「會議中用 iPhone 語音備忘錄錄音,會議後上傳到 MeetKit」模式
- 詳見 `CLAUDE.md §5` 和 `docs/audio-pipeline.md`

### 為什麼是改 index.html 而不是 Next.js 重寫

原本的任務書假設 MeetKit 是 Next.js + TypeScript 架構,但實際上 MeetKit 是**單檔 `index.html`**(React 18 + Babel in-browser)。完整盤點見 `docs/current-state-audit.md`。

---

## 2. 設計意圖

### 核心哲學
**用心理承諾取代技術檢查。** 瀏覽器無法知道 iPhone 有沒有真的在錄音,所以改用「強制使用者做一個明確的確認動作」來達成目的。

### 三層防呆設計

1. **心理層** — 使用者必須主動按下「已確認開始錄音」按鈕,做出承諾
2. **功能層** — 確認前議程無法展開,使用者無法進入會議模式
3. **視覺層** — 紅色 Modal 覆蓋整頁,確認卡浮在最上層強迫注意

### 為什麼是紅色
- 紅色 = 警示、阻擋、未完成 — 符合平面設計語境
- multiply blend mode = 保留下層視覺輪廓但整體染紅 — qmore 是設計師,這個效果他熟悉
- Modal 攔截頁面 = 注意力強制集中在確認卡

---

## 3. 狀態機定義

```
┌─────────────────┐    按「已確認開始錄音」     ┌────────────────┐
│   unconfirmed   │ ─────────────────────────→ │   in_progress  │ ←──┐
│  (紅色 Modal)   │                              │   (計時中)      │    │
└─────────────────┘                              └────────┬───────┘    │
       ↑                                                   │            │
       │ 關掉瀏覽器                                         │ 按「結束這段」│
       │ 下次進來                                           ↓            │
       │                                          ┌─────────────────────┐│
       │                                          │ pending_pause_confirm││
       │                                          │   (綠色 Modal)       ││
       │                                          └────────┬────────────┘│
       │                                                   │            │
       │                                                   │ 按「已關閉錄音」
       │                                                   ↓            │
       │                                          ┌─────────────────┐  │
       │                                          │     paused      │  │
       │                                          │ (顯示兩個按鈕)    │  │
       │                                          └────┬────────────┘  │
       │                                               │               │
       │                              按「整場結束」     │ 按「續開新一段」 │
       │                                  │            └───→ 紅色 Modal─┘
       │                                  ↓
       │                          ┌────────────────┐
       └──────────────────────── │     ended      │
                                  │   (議程凍結)    │
                                  └────────────────┘
```

### State 1: `unconfirmed`(未確認開始錄音)
- 紅色 BlockingModal 蓋住整個 Meeting 頁
- 確認卡含「✓ 已確認開始錄音」+ 「← 取消,不開這場會議」
- 議程被 Modal 物理擋住

### State 2: `in_progress`(會議進行中)
- Modal 淡出
- 議程解鎖
- 右側顯示計時器(累積時長 = 之前段落 + 當前段落)
- 計時器卡片下方按鈕「⏹ 結束這段」(注意:不是「結束會議」)
- 第一次進入時 PATCH Supabase:`recording_confirmed=true`、`recording_started_at=now`
- 續開時**不再寫** Supabase(已經是 true)

### State 3: `pending_pause_confirm`(等待確認 iPhone 已停止錄音)
- 綠色 BlockingModal 蓋住整個 Meeting 頁
- 確認卡含「✓ 已關閉錄音」+ 「← 還沒,讓我去按一下」
- 顯示「這段時長 X 分鐘」(只算當前段落,不是累積)
- **不寫 Supabase**(過渡狀態)
- 卡片內副文案:「會議完全結束了嗎?還是只是暫停?稍後可以續開」

### State 4: `paused`(已暫停,可續開)⭐ 階段 A 新增
- 議程**仍然解鎖**(因為使用者可能還想看、補筆記)
- 右側計時器卡片變成「⏸ 已暫停 · 已累積 HH:MM:SS」
- 卡片下方有**兩個按鈕**:
  - 主按鈕(綠色):「↻ 繼續開新一段」→ 觸發紅色 Modal 確認新一段錄音
  - 次按鈕(灰色):「✅ 整場會議完全結束」→ 直接進 ended,不再經過綠色 Modal
- 卡片提示:「💡 如果還有事情要討論,點續開可以開新的錄音段。會後上傳時記得上傳所有段的音檔」
- **完全不寫 Supabase**

### State 5: `ended`(會議完全結束)
- 計時器停止,顯示**最終總時長**(所有段加總)
- 議程凍結 — 視覺可見但點擊無法改變「討論中」
- 右側變成「✅ 會議已結束」卡片 + 「前往會後整理 →」按鈕
- PATCH Supabase:`recording_ended_at=now`、`duration_seconds=所有段加總`
- 從 paused 進來時,**不需要再經過綠色 Modal**(因為剛剛已經確認過 iPhone 停了)

### 段落資料結構(階段 A 暫存在 React state)

```javascript
const [segments, setSegments] = useState([]);
// 結構:[{ startedAt: Date, endedAt: Date, durationSeconds: number }, ...]

const [currentSegmentStart, setCurrentSegmentStart] = useState(null);
// 當前正在進行的段落的開始時間,結束時 push 到 segments

const accumulatedSeconds = segments.reduce((sum, s) => sum + s.durationSeconds, 0);
// 歷史段落的累積秒數,計時器顯示用
```

**重要:這些 state 在 React 裡,重新整理頁面會消失。** 階段 A 接受這個限制(因為一場會議通常不會跨頁面 reload),階段 B 才會把 segments 持久化到 Supabase。

---

## 4. 重要決策紀錄(不可更動)

### 決策 1:議程凍結策略
**按下「結束會議」後,議程標記完全凍結,不可補標記。**

理由:會議現場的標記就是真實紀錄,事後補標記會讓資料失真。

### 決策 2:中途離開恢復策略
**使用者中途關掉瀏覽器,下次進來一律回到 `unconfirmed` 狀態。**

理由:無法確認中間發生了什麼事,強制重新確認是最安全的做法。

實作細節:
- 進入 Meeting 元件時,檢查 `recording_confirmed` 欄位
- 如果 `true` 但 `recording_ended_at` 是 `null`,代表中途關掉 → **重置為 unconfirmed**
- 同時把之前的 `recording_started_at` 清空
- **不**提示使用者「上次沒結束」 — 直接靜默重置

### 決策 3:取消會議出口
**在確認卡左下角提供「← 取消,不開這場會議」小字連結。**

按下去跳回 Home 頁(不是 PreMeeting),這個 project 保留但狀態維持 `recording_confirmed: false`。

### 決策 4:BlockingModal 的獨立元件設計(關鍵架構決策)

**不挖空遮罩,而是把確認卡當成「攔截 Modal」。**

結構概念:
```
<div fixed inset-0 z-[1000] flex items-center justify-center>
  <div absolute inset-0 紅色 multiply />  ← 背景層
  <div relative z-10>確認卡</div>          ← 內容層,自然浮在背景之上
</div>
```

這和 macOS 原生對話框同一個思路 — Modal 和頁面內容本來就在不同 layer,不需要 clip-path 挖空。

### 決策 5:紅色覆蓋層的顏色
**暫定規格,最終值由 qmore 在使用時看情況調:**

| 參數 | 暫定值 |
|---|---|
| 顏色 | `#DC2626` |
| Alpha | `0.45` |
| Blend mode | `multiply` |
| 淡入淡出時長 | `300ms ease-out` |

### 決策 6:結束每段錄音要二次確認(關鍵防呆)

**按「⏹ 結束這段」不會立刻進入暫停,會跳出綠色 Modal 確認「iPhone 已停止錄音」。**

**設計目的:**
MeetKit 無法控制 iPhone 的錄音狀態。如果使用者按了結束就立刻進入暫停或會後整理,很可能忘記去 iPhone 按停止錄音。後果:
- 音檔多出空白(可能是 5 分鐘到數小時)
- ffmpeg.wasm 壓縮時間變長
- Whisper API 費用變多
- 同事等待逐字稿和摘要的時間更久

**這個 Modal 是「結束端」對應「開始端紅色 Modal」的對稱防呆**。和決策 8「會議可以分段」共同構成完整的錄音節奏管理。

**規格:**

| 參數 | 值 |
|---|---|
| 顏色 | `#22C55E`(綠色,完成感,對應紅色的警示感) |
| Alpha | `0.45` |
| Blend mode | `multiply` |
| 卡片標題 | `⏸ 這段結束` |
| 顯示資訊 | 這段時長(只算當前段落,不是累積) |
| 主要說明 | `📱 請打開 iPhone 停止語音備忘錄錄音` |
| 副文案 | `會議完全結束了嗎?還是只是暫停?稍後可以續開新一段` |
| 警告小字 | `⚠️ 沒關掉的話,這段音檔會多很多空白` |
| 主 CTA | `✓ 已關閉錄音` |
| 次要連結 | `← 還沒,讓我去按一下`(點擊不關閉 Modal,只 alert 提醒) |

**主 CTA 按鈕文字的重要性:**
按鈕只寫「✓ 已關閉錄音」,**不寫「→ 進入會後整理」也不寫「→ 結束會議」**。因為按下去的目的地是 `paused` 狀態,不是 `ended`。詳見決策 7「Tab 切換完全自由」和決策 8「會議可以分段」。

**按下確認後的行為:**
1. 把當前段落 push 到 `segments` 陣列(React state)
2. setRecordingState('paused')
3. 關閉綠色 Modal
4. **不寫 Supabase**(因為段落資訊還在 React state)
5. **不跳轉**,使用者看到右側區塊變成「⏸ 已暫停」狀態,有兩個選擇:續開或整場結束

**狀態機影響:** 
原本:`in_progress` →(按結束)→ `ended`
現在:`in_progress` →(按結束這段)→ `pending_pause_confirm` →(確認 iPhone 已停)→ `paused` →(續開或整場結束)

`pending_pause_confirm` 是過渡狀態,**不寫進 Supabase**。

### 決策 7:Tab 切換完全自由,絕對不自動跳轉(關鍵導航決策)

**頂部的四個 tab(會前提案 / 會議進行 / 會後整理 / 日誌)永遠都可以自由切換,任何狀態下都不可以自動把使用者「彈」到別的 tab。**

**問題情境(實戰中發現):**
原本的實作會在 `recordingState === 'ended'` 時自動 `setPhase('post')`,觸發以下死循環:
1. 使用者按「結束會議」→ 自動跳到「會後整理」
2. 使用者想點 tab 切回「會議進行」看議程或剛剛的決議
3. 切回 Meeting 元件 → useEffect 偵測到 `recordingState === 'ended'` → **再次自動跳回會後整理**
4. 使用者被困在會後整理頁,無法回頭

**設計原則:**
- `recordingState` 只該影響**當前頁面的渲染**(議程凍結、計時器顯示),**不該影響導航**
- 「會後整理」是一個**目的地**,不是**強制動線**
- 設計師熟悉的「目的地導航」模式 — 像 Notion、Figma,沒有任何頁面會強制把使用者彈到別的地方
- 進入會後整理的**唯一**方式是使用者主動點擊(不論是 tab、還是右側的「前往會後整理 →」按鈕)

**Claude Code 嚴格規則:**
- ❌ **絕對不可以**在任何 useEffect 裡寫 `setPhase('post')`
- ❌ **絕對不可以**在 endMeeting 或 confirmEndMeeting 函式裡寫 `setPhase('post')`
- ❌ **絕對不可以**根據 recordingState 自動切換 phase
- ✅ Tab 切換**只能**由使用者點 Header 的 tab 觸發
- ✅ 「前往會後整理 →」按鈕**只能**由使用者點擊觸發
- ✅ recordingState 影響的是渲染內容,不是 phase

**如果 Phase A 程式碼裡有自動跳轉邏輯,Phase B 第一件事就是把它移除。**

### 決策 8:會議可以分段,「結束」不是終點(關鍵節奏設計)

**真實會議的節奏不是線性的。** 大家會「結束」之後在電梯裡、走廊上、坐回位子時想到漏掉的事情。MeetKit 必須支援這個常態。

**設計核心:**
- 「結束這段」是**暫停**,不是終點
- 一場會議可以由 N 段組成,每段都有獨立的開始和結束時間
- 真正的終點是使用者主動按「整場會議完全結束」
- 每一段對應 iPhone 上的一個獨立音檔,會後上傳時依檔案建立時間排序

**為什麼不用「補充段」而用「分段」?**
- 「補充段」暗示有「主會議」和「次要補充」的階級 → 過度設計
- 「分段」是平等的 — 每段都是會議的一部分,沒有主次之分
- 對應使用者心智:「這段討論告一段落」而不是「主會議結束 + 補充」

**階段切分:**

#### 階段 A(今天 Phase B 範圍):純前端 segments

- 新增 `paused` 狀態
- segments 暫存在 React state(`useState([])`)
- 「續開新一段」回到 unconfirmed 紅色 Modal,確認後 in_progress
- 「整場會議完全結束」直接進 ended,寫 Supabase 的 ended_at 和 duration_seconds
- duration_seconds 計算 = segments 累積秒數總和
- **限制:** 重新整理頁面 segments 會掉(因為純 React state)

#### 階段 B(明天或之後):Supabase segments 持久化

- Supabase 加 `recording_segments` jsonb 欄位
- 每次「結束這段」就 PATCH 寫入新的 segment
- 中途離開恢復邏輯支援 segments 還原
- 重新整理頁面不掉資料

#### 階段 C(Phase 2 音訊 pipeline 階段):多檔案上傳

- PostMeeting 改成支援多檔案拖入
- 按 iPhone 上的檔案建立時間自動排序
- 各段獨立壓縮、切段、轉錄
- 逐字稿合併時加分隔符 `─── 第 N 段 ───`

**Claude Code 階段 A 的實作要點:**

```javascript
// 段落結構
const [segments, setSegments] = useState([]);
// [{ startedAt: Date, endedAt: Date, durationSeconds: number }, ...]

const [currentSegmentStart, setCurrentSegmentStart] = useState(null);

// 計時器顯示的累積秒數
const accumulatedFromPastSegments = segments.reduce(
  (sum, s) => sum + s.durationSeconds, 0
);

// 計時器 tick:已過秒數 + 當前段落經過的秒數
const elapsed = accumulatedFromPastSegments +
  (currentSegmentStart ? Math.floor((Date.now() - currentSegmentStart.getTime()) / 1000) : 0);
```

**confirmRecording 函式(第一次和續開都用同一個函式):**
```javascript
const confirmRecording = async () => {
  const now = new Date();
  setCurrentSegmentStart(now);
  setRecordingState('in_progress');
  
  // 只在第一次寫 Supabase
  if (segments.length === 0) {
    await db(`projects?id=eq.${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        recording_confirmed: true,
        recording_started_at: now.toISOString(),
      }),
    });
  }
};
```

**requestPause 函式(原本叫 endMeeting,改名):**
```javascript
const requestPause = () => {
  setRecordingState('pending_pause_confirm');
  // 不寫 Supabase
};
```

**confirmPause 函式(綠色 Modal 確認後執行):**
```javascript
const confirmPause = () => {
  const now = new Date();
  const newSegment = {
    startedAt: currentSegmentStart,
    endedAt: now,
    durationSeconds: Math.floor((now - currentSegmentStart) / 1000),
  };
  setSegments([...segments, newSegment]);
  setCurrentSegmentStart(null);
  setRecordingState('paused');
  // 不寫 Supabase
};
```

**continueRecording 函式(從 paused 點「續開新一段」):**
```javascript
const continueRecording = () => {
  setRecordingState('unconfirmed');
  // 進入紅色 Modal,使用者再次按「已確認開始錄音」會走 confirmRecording
};
```

**endMeetingForReal 函式(從 paused 點「整場會議完全結束」):**
```javascript
const endMeetingForReal = async () => {
  const now = new Date();
  const totalSeconds = segments.reduce((sum, s) => sum + s.durationSeconds, 0);
  
  await db(`projects?id=eq.${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      recording_ended_at: now.toISOString(),
      duration_seconds: totalSeconds,
    }),
  });
  
  setRecordingState('ended');
  // 不切 phase,讓使用者自己決定
};
```

---

## 5. 要改動的 index.html 區域

### 5.1 新增區塊:BlockingModal 和 RecordingConfirmCard 元件

**位置:** 在 `// ─── POST-MEETING ───` 之前(約 index.html 第 1136 行),新增:

```javascript
// ─── BLOCKING MODAL (通用攔截 Modal) ─────────────────────────────────────
// 未來任何頁面需要「阻擋使用者互動直到完成某個動作」都可以重用
// ──────────────────────────────────────────────────────────────────────

function BlockingModal({ show, children }) {
  if (!show) return null;
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: 'fadeIn 0.3s ease',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: '#DC2626',
        opacity: 0.45,
        mixBlendMode: 'multiply',
      }} />
      <div style={{ position: 'relative', zIndex: 10 }}>
        {children}
      </div>
    </div>
  );
}

// ─── RECORDING CONFIRM MODAL (會議錄音確認) ──────────────────────────────

function RecordingConfirmModal({ onConfirm, onCancel }) {
  return (
    <BlockingModal show={true}>
      <div style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '32px 36px',
        maxWidth: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>
          🎙 會議錄音
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.8, color: C.textSec, marginBottom: 24, textAlign: 'center' }}>
          📱 請打開 iPhone「語音備忘錄」開始錄音<br />
          <span style={{ fontSize: 12, color: C.textMut }}>
            (會議結束後回到這裡上傳錄音檔)
          </span>
        </div>
        <button
          style={{ ...btn('primary'), width: '100%', padding: 14, fontSize: 15 }}
          onClick={onConfirm}
        >
          ✓ 已確認開始錄音
        </button>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a
            onClick={onCancel}
            style={{ fontSize: 12, color: C.textMut, textDecoration: 'underline', cursor: 'pointer' }}
          >
            ← 取消,不開這場會議
          </a>
        </div>
      </div>
    </BlockingModal>
  );
}

// ─── MEETING TIMER (純顯示計時器) ────────────────────────────────────────

function MeetingTimer({ startedAt, onEnd }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const pad = n => String(n).padStart(2, '0');

  return (
    <div style={S.panel} className="fade-in">
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>⏱ 會議進行中</div>
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <div style={{
          fontSize: 42,
          fontWeight: 700,
          color: C.accent,
          marginBottom: 24,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.05em',
        }}>
          {pad(h)}:{pad(m)}:{pad(s)}
        </div>
        <div style={{ color: C.textSec, fontSize: 13, marginBottom: 20 }}>
          記得 iPhone 繼續錄音中
        </div>
        <button
          style={{ ...btn('danger'), width: '100%', padding: 13, fontSize: 15 }}
          onClick={onEnd}
        >
          ⏹ 結束會議
        </button>
      </div>
    </div>
  );
}

// ─── PAUSE CONFIRM MODAL (確認 iPhone 已停止錄音 - 暫停這段) ──────────────
// 結束每段錄音時的對稱防呆 — 確保使用者去 iPhone 按停止錄音再進入 paused 狀態
// 詳見任務書 §4 決策 6 和決策 8
// ──────────────────────────────────────────────────────────────────────

function PauseConfirmModal({ currentSegmentStart, onConfirm }) {
  const segmentSec = Math.floor((Date.now() - currentSegmentStart.getTime()) / 1000);
  const h = Math.floor(segmentSec / 3600);
  const m = Math.floor((segmentSec % 3600) / 60);
  const s = segmentSec % 60;
  const pad = n => String(n).padStart(2, '0');

  const handleNotYet = () => {
    alert('請打開 iPhone 的「語音備忘錄」按下停止錄音,完成後回到這裡按「✓ 已關閉錄音」');
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: 'fadeIn 0.3s ease',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: '#22C55E',  // 綠色,對應紅色 Modal 的對稱
        opacity: 0.45,
        mixBlendMode: 'multiply',
      }} />
      <div style={{
        position: 'relative',
        zIndex: 10,
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '32px 36px',
        maxWidth: 460,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>
          ⏸ 這段結束
        </div>
        <div style={{
          fontSize: 13,
          color: C.textMut,
          marginBottom: 6,
          textAlign: 'center',
        }}>
          這段時長
        </div>
        <div style={{
          fontSize: 32,
          fontWeight: 700,
          color: C.success,
          marginBottom: 24,
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {pad(h)}:{pad(m)}:{pad(s)}
        </div>
        <div style={{
          fontSize: 15,
          lineHeight: 1.8,
          color: C.textSec,
          marginBottom: 12,
          textAlign: 'center',
        }}>
          📱 請打開 iPhone「語音備忘錄」<br />
          按下停止錄音
        </div>
        <div style={{
          fontSize: 12,
          color: C.textMut,
          textAlign: 'center',
          marginBottom: 20,
          lineHeight: 1.6,
        }}>
          會議完全結束了嗎?還是只是暫停?<br />
          稍後可以續開新一段
        </div>
        <div style={{
          fontSize: 12,
          color: C.textMut,
          lineHeight: 1.6,
          marginBottom: 24,
          padding: '10px 14px',
          background: C.dangerBg,
          borderRadius: 6,
          border: `1px solid ${C.danger}33`,
        }}>
          ⚠️ 沒關掉的話,這段音檔會多很多空白
        </div>
        <button
          style={{ ...btn('primary'), width: '100%', padding: 14, fontSize: 15 }}
          onClick={onConfirm}
        >
          ✓ 已關閉錄音
        </button>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a
            onClick={handleNotYet}
            style={{
              fontSize: 12,
              color: C.textMut,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            ← 還沒,讓我去按一下
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── PAUSED PANEL (暫停狀態的右側面板) ────────────────────────────────────
// 顯示在 paused 狀態,讓使用者選擇「續開新一段」或「整場會議完全結束」
// 詳見任務書 §4 決策 8
// ──────────────────────────────────────────────────────────────────────

function PausedPanel({ accumulatedSeconds, segmentCount, onContinue, onEndForReal }) {
  const h = Math.floor(accumulatedSeconds / 3600);
  const m = Math.floor((accumulatedSeconds % 3600) / 60);
  const s = accumulatedSeconds % 60;
  const pad = n => String(n).padStart(2, '0');

  return (
    <div style={S.panel} className="fade-in">
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>
        ⏸ 已暫停
      </div>
      <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
        <div style={{ fontSize: 12, color: C.textMut, marginBottom: 4 }}>
          已累積({segmentCount} 段)
        </div>
        <div style={{
          fontSize: 36,
          fontWeight: 700,
          color: C.textSec,
          marginBottom: 24,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.05em',
        }}>
          {pad(h)}:{pad(m)}:{pad(s)}
        </div>
        <button
          style={{ ...btn('primary'), width: '100%', padding: 13, fontSize: 14, marginBottom: 10 }}
          onClick={onContinue}
        >
          ↻ 繼續開新一段
        </button>
        <button
          style={{ ...btn('ghost'), width: '100%', padding: 11, fontSize: 13 }}
          onClick={onEndForReal}
        >
          ✅ 整場會議完全結束
        </button>
      </div>
      <div style={{
        fontSize: 11,
        color: C.textMut,
        lineHeight: 1.6,
        marginTop: 4,
        padding: '10px 12px',
        background: C.textSec + '08',
        borderRadius: 6,
        border: `1px solid ${C.border}`,
      }}>
        💡 如果還有事情要討論,點「繼續開新一段」可以開新的錄音段。會後上傳時記得上傳所有段的音檔(系統會依檔案建立時間自動排序)。
      </div>
    </div>
  );
}
```

### 5.2 修改 Meeting 元件 — 新增狀態

**位置:** Meeting 元件的 state 定義區(約 index.html 第 966-974 行)

```javascript
// 🔴 Replace:
const [activeId, setActiveId] = useState(null);
const [expanded, setExpanded] = useState({});
const [briefingOpen, setBriefingOpen] = useState(false);
const [isRecording, setIsRecording] = useState(false);
const [elapsed, setElapsed] = useState(0);
const [audioUrl, setAudioUrl] = useState(null);
const [cardUploading, setCardUploading] = useState({});
const mrRef = useRef(null); const chunksRef = useRef([]); const timerRef = useRef(null);
const cardFileRefs = useRef({});

// 🟢 With:
const [activeId, setActiveId] = useState(null);
const [expanded, setExpanded] = useState({});
const [briefingOpen, setBriefingOpen] = useState(false);
const [cardUploading, setCardUploading] = useState({});
const cardFileRefs = useRef({});

// 錄音確認狀態機:unconfirmed / in_progress / ended
const [recordingState, setRecordingState] = useState('unconfirmed');
const [recordingStartedAt, setRecordingStartedAt] = useState(null);
const [recordingEndedAt, setRecordingEndedAt] = useState(null);
```

### 5.3 移除舊的錄音相關函式

**位置:** Meeting 元件的 `startRec` / `stopRec` / `pad` / `fmt` / 計時器 useEffect(約 index.html 第 1015-1034 行)

這些全部刪除:

```javascript
// 🔴 刪除以下全部:
const pad = n => String(n).padStart(2, '0');
const fmt = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

const startRec = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm;codecs=opus','audio/webm','audio/ogg','audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
    chunksRef.current = [];
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => { const blob = new Blob(chunksRef.current, { type: mr.mimeType }); setAudioBlob(blob); setAudioUrl(URL.createObjectURL(blob)); stream.getTracks().forEach(t => t.stop()); };
    mr.start(500); mrRef.current = mr; setIsRecording(true); setElapsed(0);
    onRecordingChange?.(true, 0, stopRec);
    timerRef.current = setInterval(() => setElapsed(t => { const n = t + 1; onRecordingChange?.(true, n, null); return n; }), 1000);
  } catch (err) { alert('無法取得麥克風:' + err.message); }
};

const stopRec = () => { if (mrRef.current?.state !== 'inactive') mrRef.current.stop(); setIsRecording(false); clearInterval(timerRef.current); onRecordingChange?.(false, 0, null); };
useEffect(() => () => clearInterval(timerRef.current), []);
useEffect(() => { onRegisterStart?.(startRec); }, []);
```

### 5.4 新增狀態轉換函式

**位置:** 在刪掉的地方原地新增:

```javascript
// 錄音狀態轉換 — 同時更新 Supabase(如果有相關欄位)
const confirmRecording = async () => {
  const now = new Date();
  setRecordingState('in_progress');
  setRecordingStartedAt(now);
  // 如果 Supabase projects 表有 recording_confirmed / recording_started_at 欄位,同步寫入
  try {
    await db(`projects?id=eq.${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        recording_confirmed: true,
        recording_started_at: now.toISOString(),
      }),
    });
  } catch {}
};

const endMeeting = async () => {
  const now = new Date();
  setRecordingState('ended');
  setRecordingEndedAt(now);
  try {
    await db(`projects?id=eq.${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        recording_ended_at: now.toISOString(),
        duration_seconds: Math.floor((now - recordingStartedAt) / 1000),
      }),
    });
  } catch {}
};

const cancelMeeting = () => {
  // 跳回 Home(由父元件處理)
  // 實際做法待定,暫時 reload 頁面
  if (confirm('確定要取消這場會議嗎?已填的提案會保留。')) {
    window.location.reload();
  }
};
```

### 5.5 替換右側區塊的渲染

**位置:** Meeting 元件 return 的右側 div(約 index.html 第 1105-1126 行)

```javascript
// 🔴 Replace: 原本的「全場錄音」區塊
<div style={S.panel} className="fade-in">
  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>🎙️ 全場錄音</div>
  <div style={{ textAlign: 'center', padding: '16px 0' }}>
    <div style={{ width: 88, height: 88, borderRadius: '50%', margin: '0 auto 20px', background: isRecording ? C.dangerBg : C.bgCard, border: `2px solid ${isRecording ? C.danger : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, animation: isRecording ? 'pulse 1.5s infinite' : 'none', transition: 'all 0.3s' }}>🎤</div>
    {isRecording && <div style={{ fontSize: 28, fontWeight: 700, color: C.danger, marginBottom: 6, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em' }}>{fmt(elapsed)}</div>}
    <div style={{ color: C.textSec, fontSize: 13, marginBottom: 20 }}>{isRecording ? '錄音中,請勿關閉頁面' : audioUrl ? '✓ 錄音完成' : '準備好後開始錄音'}</div>
    <button style={{ ...btn(isRecording ? 'danger' : 'primary'), width: '100%', padding: 13, fontSize: 15 }} onClick={isRecording ? stopRec : startRec}>
      {isRecording ? '⏹ 停止錄音' : audioUrl ? '⏺ 重新錄音' : '⏺ 開始錄音'}
    </button>
  </div>
  {audioUrl && (
    /* ...預覽錄音區塊... */
  )}
</div>

// 🟢 With:
{recordingState === 'in_progress' && (
  <MeetingTimer startedAt={recordingStartedAt} onEnd={endMeeting} />
)}
{recordingState === 'ended' && (
  <div style={S.panel} className="fade-in">
    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>✅ 會議已結束</div>
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <div style={{ fontSize: 13, color: C.textSec, marginBottom: 8 }}>總時長</div>
      <div style={{
        fontSize: 32,
        fontWeight: 700,
        color: C.success,
        marginBottom: 24,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {(() => {
          const total = Math.floor((recordingEndedAt - recordingStartedAt) / 1000);
          const h = Math.floor(total / 3600);
          const m = Math.floor((total % 3600) / 60);
          const s = total % 60;
          const pad = n => String(n).padStart(2, '0');
          return `${pad(h)}:${pad(m)}:${pad(s)}`;
        })()}
      </div>
      <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>
        下一步:到「會後整理」上傳 iPhone 錄音檔
      </div>
    </div>
  </div>
)}
```

### 5.6 在 Meeting 元件 return 最外層加入 Modal

**位置:** Meeting 元件 return 的 root div 外層(最底部)

```javascript
// 在 Meeting 元件 return 的最外層,包一個 Fragment
return (
  <>
    {/* 原本的 div 內容 */}
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px' }}>
      {/* ... */}
    </div>

    {/* 加在這裡 */}
    {recordingState === 'unconfirmed' && (
      <RecordingConfirmModal
        onConfirm={confirmRecording}
        onCancel={cancelMeeting}
      />
    )}
  </>
);
```

### 5.7 議程凍結邏輯

**位置:** 議程點擊函式 `toggleActive`(約 index.html 第 1035 行)

```javascript
// 🔴 Replace:
const toggleActive = (id) => { setActiveId(prev => prev === id ? null : id); setExpanded(e => ({ ...e, [id]: !e[id] })); };

// 🟢 With:
const toggleActive = (id) => {
  if (recordingState === 'ended') return;  // 會議結束後凍結,不能改
  setActiveId(prev => prev === id ? null : id);
  setExpanded(e => ({ ...e, [id]: !e[id] }));
};
```

**注意:** `unconfirmed` 狀態不需要在這裡處理,因為 Modal 會在物理上阻擋使用者點到議程。

### 5.8 中途離開恢復邏輯

**位置:** Meeting 元件的 useEffect 區(約 index.html 第 1004 行)

```javascript
// 新增一個 useEffect(放在既有的 useEffect 之後)
useEffect(() => {
  if (!projectId) return;
  // 檢查 project 的錄音狀態
  const check = async () => {
    try {
      const res = await db(`projects?id=eq.${projectId}&select=recording_confirmed,recording_started_at,recording_ended_at`);
      if (!res.ok) return;
      const [project] = await res.json();
      if (!project) return;

      // 如果 recording_confirmed 但沒有 ended,代表中途離開 → 重置
      if (project.recording_confirmed && !project.recording_ended_at) {
        await db(`projects?id=eq.${projectId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            recording_confirmed: false,
            recording_started_at: null,
          }),
        });
        setRecordingState('unconfirmed');
      } else if (project.recording_ended_at) {
        // 會議已結束,顯示唯讀狀態
        setRecordingState('ended');
        setRecordingStartedAt(new Date(project.recording_started_at));
        setRecordingEndedAt(new Date(project.recording_ended_at));
      }
    } catch {}
  };
  check();
}, [projectId]);
```

---

## 6. Supabase 欄位變動(選配)

**重要:** 這些欄位是**選配**,先不加也能運作 — 只是會失去「跨 session 保存會議狀態」的能力。

### 要加的欄位

在 `projects` 表:

```sql
ALTER TABLE projects
  ADD COLUMN recording_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN recording_started_at TIMESTAMPTZ,
  ADD COLUMN recording_ended_at TIMESTAMPTZ,
  ADD COLUMN duration_seconds INTEGER;
```

**Claude Code:** 不要自動執行這段 SQL。告訴 qmore 需要在 Supabase dashboard 手動加欄位,等他確認後再開始依賴這些欄位。

### 如果先不加欄位怎麼辦

改用 localStorage 暫存狀態:

```javascript
// 替代方案:用 localStorage
const storageKey = `mk_recording_${projectId}`;

const confirmRecording = () => {
  const now = new Date();
  setRecordingState('in_progress');
  setRecordingStartedAt(now);
  localStorage.setItem(storageKey, JSON.stringify({
    state: 'in_progress',
    startedAt: now.toISOString(),
  }));
};
```

**缺點:** 換瀏覽器或裝置就失憶,但這個使用情境下問題不大(主持人通常在同一台機器操作)。

---

## 7. 實作順序(分階段交付)

### Phase A:基礎狀態機(優先)
1. ✅ **確認或建立 `index-dev.html`**(從 `index.html` cp 過來,所有後續改動都改這個檔案)
2. ✅ 新增 BlockingModal 元件
3. ✅ 新增 RecordingConfirmModal 元件
4. ✅ 新增 MeetingTimer 元件
5. ✅ Meeting 元件加入 `recordingState` state
6. ✅ 移除舊的 MediaRecorder 邏輯
7. ✅ 實作 `confirmRecording`、`endMeeting`、`cancelMeeting`(先用 localStorage,不連 Supabase)
8. ✅ 替換右側區塊的渲染
9. ✅ 在 return 最外層加入 Modal
10. ✅ 議程點擊的凍結邏輯
11. ✅ 本地測試三個狀態切換正常

**第一階段不做的事:**
- ❌ **絕對不動 `index.html`**(所有改動都在 `index-dev.html`)
- ❌ Supabase 欄位寫入(先用 localStorage)
- ❌ 中途離開恢復邏輯
- ❌ 動畫細節
- ❌ 最終色號調整

### Phase B:Supabase 整合 + 對稱防呆 + 會議分段(等 qmore 加完欄位)

**重要前提:** Phase B 第一件事是移除 Phase A 留下的自動跳轉邏輯(詳見決策 7)。

11. ✅ qmore 在 Supabase dashboard 加 4 個欄位
12. ✅ **移除任何 setPhase('post') 自動跳轉邏輯**(決策 7)
13. ✅ 把 confirmRecording 改成 PATCH Supabase(只在第一次寫,segments.length === 0 時)
14. ✅ 實作中途離開恢復邏輯(決策 2)
15. ✅ 驗證「開會到一半關掉再打開」會回到 unconfirmed
16. ✅ **新增 PauseConfirmModal 元件**(綠色 Modal,任務書 §5 有完整程式碼)
17. ✅ **新增 PausedPanel 元件**(暫停狀態的右側面板,任務書 §5 有完整程式碼)
18. ✅ **新增 segments state 和 currentSegmentStart state**
19. ✅ **改寫狀態機:in_progress → pending_pause_confirm → paused → (續開 in_progress 或 ended)**
20. ✅ **「⏹ 結束會議」按鈕改名「⏹ 結束這段」,onClick 改成 requestPause**
21. ✅ **實作 confirmPause(寫 segment 進 state,進入 paused)**
22. ✅ **實作 continueRecording(從 paused 回到 unconfirmed 紅色 Modal)**
23. ✅ **實作 endMeetingForReal(從 paused 直接到 ended,寫 Supabase)**
24. ✅ **計時器顯示邏輯改寫:accumulatedSeconds + 當前段落經過秒數**
25. ✅ 驗證完整的「開始 → 暫停 → 續開 → 暫停 → 整場結束」流程

### Phase C:動畫與細節打磨
15. ✅ Modal 進退場動畫(沿用既有的 `fadeIn` keyframes)
16. ✅ 計時器數字翻頁動畫(如果需要)
17. ✅ qmore 在真實會議中用看看,根據反饋調整色號和間距

---

## 8. 驗收標準

qmore 本地測試時,以下每一項都要通過:

### 基本流程
- [ ] 進入 Meeting 頁 → 看到紅色 Modal,確認卡露出
- [ ] 點議程列表或 Meeting 頁其他地方 → 無反應(被 Modal 擋住)
- [ ] 按下「已確認開始錄音」→ Modal 淡出,計時器開始跑
- [ ] 點議程項目 → 可以展開,可以標記「討論中」
- [ ] **按下「結束這段」→ 跳出綠色 Modal,顯示這段時長**
- [ ] **綠色 Modal 出現時,議程和 tab 都被擋住,點不到**
- [ ] **點「← 還沒,讓我去按一下」→ 跳出 alert 提醒,Modal 不關閉**
- [ ] **點「✓ 已關閉錄音」→ 進入 paused 狀態,顯示「已累積」和兩個按鈕**

### 分段流程(決策 8 核心驗證)
- [ ] **paused 狀態下,議程仍然解鎖,可以點擊**
- [ ] **點「↻ 繼續開新一段」→ 跳出紅色 Modal(unconfirmed)**
- [ ] **再次按「已確認開始錄音」→ 計時器接續累計(不是從 0 開始)**
- [ ] **計時器顯示「已累積 X 段 + 當前段」的總時長**
- [ ] **再次按「結束這段」→ 綠色 Modal → 確認 → paused 狀態**
- [ ] **paused 狀態的「已累積」秒數正確(所有結束的段加總)**
- [ ] **點「✅ 整場會議完全結束」→ 進入 ended 狀態(不再經過綠色 Modal)**
- [ ] **去 Supabase 看 duration_seconds → 應該等於所有段加總,不是「最後段時間 - 第一段開始」**

### Tab 切換自由(決策 7 核心驗證)
- [ ] **paused 狀態下,點 tab 切到「會後整理」→ 順利進入**
- [ ] **從「會後整理」點 tab 切回「會議進行」→ 看到 paused 狀態,不是被自動彈走**
- [ ] **ended 狀態下,點 tab 切到「會後整理」→ 順利進入**
- [ ] **從「會後整理」點 tab 切回「會議進行」→ 看到 ended 狀態,不是被自動彈走**
- [ ] **任何狀態下,可以自由在四個 tab 之間來回切換,不會被強制跳轉**
- [ ] 按右側「前往會後整理 →」按鈕 → 進入會後整理(這是「主動跳轉」路徑)

### 邊界情況
- [ ] 未確認時按「取消,不開這場會議」→ 跳回首頁,專案保留
- [ ] 會議進行中關掉瀏覽器,重新打開 → 回到未確認狀態(階段 A 限制:segments 會掉)
- [ ] 會議已結束(ended)後重新打開 → 看到結束狀態,不是未確認
- [ ] **paused 狀態下關掉瀏覽器,重新打開 → 回到未確認狀態(因為 segments 在 React state,會掉)**
- [ ] **在綠色 Modal 顯示時關掉瀏覽器,重新打開 → 回到未確認狀態**

### 階段 A 已知限制(階段 B 才會修)
- [ ] paused 狀態 segments 純前端,重新整理會掉(qmore 知道這個限制)
- [ ] PostMeeting 還是只支援單檔案上傳(階段 C 才會改)
- [ ] 一場會議多段錄音的多檔案上傳和合併,在階段 C 才實作

### 不動其他功能的驗證
- [ ] PreMeeting 頁面的提案收集功能沒壞
- [ ] PostMeeting 頁面的 Whisper 轉錄、AI 摘要沒壞
- [ ] Journal 頁面的歷史瀏覽沒壞
- [ ] 附件上傳、預覽、抽文功能沒壞
- [ ] 6 碼代碼、密碼保護機制沒壞

### 視覺驗證
- [ ] 紅色覆蓋層的顏色 qmore 看了覺得可以(或告訴你怎麼改)
- [ ] 300ms 淡入淡出順暢,不硬切
- [ ] Modal 在 Desktop 和 iPhone Safari 都正常
- [ ] 計時器數字清楚易讀

---

## 9. 刻意不做的事(避免 scope creep)

**Claude Code 在實作過程中,以下這些事情即使很合理也不要做:**

- ❌ 不做「會議進行到一半提醒錄音是否還在」的輪詢檢查(無法實作)
- ❌ 不做 iPhone 語音備忘錄的完整教學卡片(下一輪任務)
- ❌ 不動 PreMeeting、PostMeeting、Journal 元件
- ❌ 不動「上次會議前情提要」區塊
- ❌ 不做計時器的音效、震動、通知
- ❌ 不做「會議超過 3 小時自動提醒」
- ❌ 不改 index.html 的全域 CSS 或顏色常數
- ❌ 不引入任何新函式庫
- ❌ 不拆檔案,所有新元件都寫在 index.html 內部

**發現需要做上面這些事,表示 scope 長大了 — 停下來和 qmore 討論。**

---

## 10. 需要 qmore 最終決定的事

Claude Code 開工前,確認以下事項。如果任一項還沒決定,先停下來問:

- [ ] Phase B 的 Supabase 欄位,qmore 是否已經加好
- [ ] 紅色覆蓋層的最終色號(先用 `#DC2626`,之後可調)
- [ ] 「取消,不開這場會議」按下去跳到哪(Home 頁?PreMeeting?)
- [ ] 會議結束後是否立即自動跳轉到 PostMeeting,還是等使用者手動按

---

## 11. 完成後

### 步驟 1:驗收前準備
1. 在 `.claude-handoff.md` 紀錄這次的完成狀態
2. 把 `index-dev.html` 的改動整理成清單,給 qmore 看哪些地方改了什麼

### 步驟 2:qmore 驗收
3. qmore 打開 `https://qmorechi.github.io/meetkit/index-dev.html?p=TEST001` 測試
   (或本機打開 `index-dev.html`,但有些 `file://` 的限制)
4. 按 §8 驗收標準逐項確認
5. 所有驗收通過後,qmore **明確說「可以正式切換」**

### 步驟 3:正式切換(只有 qmore 說 OK 才能執行)

**Claude Code 絕對不能自作主張執行這步。**

```bash
# 用 dev 版覆蓋正式版
cp index-dev.html index.html

# 可選:保留 dev 版作為下次改造的起點
# 或刪掉讓 repo 乾淨:
# rm index-dev.html
```

### 步驟 4:提醒 qmore 收工
6. 提醒 qmore 雙擊 `finish.command` 收工
7. finish.command 會 commit + push
8. GitHub Pages 1-2 分鐘後自動部署
9. 提醒 qmore **告訴同事「MeetKit 有更新,請重新整理頁面,如果在進行會議請先錄音再切換」**

---

_這份任務書是 MeetKit 任務書制度的第一份正式文件,也是把原本基於 Next.js 假設的任務書,重寫成對齊 index.html 實際架構的版本。_
