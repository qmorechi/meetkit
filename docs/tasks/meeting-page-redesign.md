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
┌─────────────────┐      按下「已確認」      ┌────────────────┐
│   unconfirmed   │ ────────────────────→  │   in_progress  │
│  (紅色 Modal)   │                        │   (計時中)      │
└─────────────────┘                        └────────────────┘
       ↑                                             │
       │ 關掉瀏覽器                                  │
       │ 下次進來                                    │ 按下「結束會議」
       │                                             ↓
       │                                    ┌────────────────┐
       └─────────────────────────────────── │     ended      │
                                             │   (唯讀模式)    │
                                             └────────────────┘
```

### State 1: `unconfirmed`(未確認)
- 紅色 BlockingModal 顯示,蓋住整個會議進行頁
- 確認卡露出,含「✓ 已確認開始錄音」按鈕 + 「← 取消,不開這場會議」小字連結
- 議程項目被 Modal 蓋住,物理上點不到

### State 2: `in_progress`(會議進行中)
- Modal 淡出消失(300ms)
- 議程解鎖,可以點擊展開、可以標記「討論中」
- 右側原本的錄音區域變成會議計時器(HH:MM:SS)
- 計時器下方「⏹ 結束會議」按鈕
- `recording_started_at` 寫入 Supabase(如果有加這個欄位)

### State 3: `ended`(已結束)
- 計時器停止但保留最終時長顯示
- 議程凍結 — 視覺上可以看、但點擊無法改變「討論中」狀態
- 右側變成「✅ 會議已結束」卡片,顯示總時長 + 「前往會後整理 →」按鈕
- `recording_ended_at` 和 `duration_seconds` 寫入 Supabase

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
1. ✅ 新增 BlockingModal 元件
2. ✅ 新增 RecordingConfirmModal 元件
3. ✅ 新增 MeetingTimer 元件
4. ✅ Meeting 元件加入 `recordingState` state
5. ✅ 移除舊的 MediaRecorder 邏輯
6. ✅ 實作 `confirmRecording`、`endMeeting`、`cancelMeeting`(先用 localStorage,不連 Supabase)
7. ✅ 替換右側區塊的渲染
8. ✅ 在 return 最外層加入 Modal
9. ✅ 議程點擊的凍結邏輯
10. ✅ 本地測試三個狀態切換正常

**第一階段不做的事:**
- ❌ Supabase 欄位寫入(先用 localStorage)
- ❌ 中途離開恢復邏輯
- ❌ 動畫細節
- ❌ 最終色號調整

### Phase B:Supabase 整合(等 qmore 加完欄位)
11. ✅ qmore 在 Supabase dashboard 加 4 個欄位
12. ✅ 把 localStorage 改成 Supabase 寫入
13. ✅ 實作中途離開恢復邏輯
14. ✅ 驗證「開會到一半關掉再打開」會回到 unconfirmed

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
- [ ] 按下「結束會議」→ 計時器停止,顯示總時長 + 「前往會後整理」
- [ ] 點已結束狀態下的議程項目 → 可以看但不能改「討論中」

### 邊界情況
- [ ] 未確認時按「取消,不開這場會議」→ 跳回首頁,專案保留
- [ ] (Phase B 之後)會議進行中關掉瀏覽器,重新打開 → 回到未確認狀態
- [ ] (Phase B 之後)會議已結束後重新打開 → 看到結束狀態,不是未確認

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

1. 在 `.claude-handoff.md` 紀錄這次的完成狀態
2. 截圖或 localhost URL 給 qmore 驗收
3. 等 qmore 確認全部驗收通過
4. 提醒 qmore 雙擊 `finish.command` 收工

---

_這份任務書是 MeetKit 任務書制度的第一份正式文件,也是把原本基於 Next.js 假設的任務書,重寫成對齊 index.html 實際架構的版本。_
