# 音訊前置處理管線 — 技術文件

> 這份文件是 MeetKit 音訊處理的完整技術規格。
> Claude Code 在 index.html 內部實作音訊相關功能時,應以此文件為準。

---

## 背景與決策

### 為什麼要做前置處理

OpenAI Whisper API 有兩個硬限制:
- 單檔上限 **25 MB**
- 處理時間隨檔案大小線性增加

iPhone 語音備忘錄的 `.m4a` 實際大小:
- 1 小時 ≈ 28 MB(已超標)
- 2 小時 ≈ 56 MB
- 3 小時 ≈ 84 MB
- 4 小時 ≈ 112 MB

qmore 的客戶會議經常長達 2-3 小時,**沒有前置處理就無法使用**。

### 為什麼選前端 ffmpeg.wasm 而非後端

**這個問題對 MeetKit 來說根本不是選擇題** — MeetKit 是單檔 `index.html`,**完全沒有後端可以用**。所有邏輯都必須在瀏覽器端執行。

不過即使有後端可選,前端處理也有優勢:

- 原檔不離開使用者電腦 = SIPAI 機密會議更安全
- 沒有 serverless function 的執行時間上限
- 不浪費頻寬上傳原檔
- 符合 index.html 的「零後端、零 build」哲學
- iOS 16+ Safari 對 ffmpeg.wasm 支援良好,全員 iPhone 的情境下風險很低

### 為什麼不拆檔案

雖然理論上 ffmpeg.wasm 整合、壓縮、切段、上傳等邏輯應該拆成獨立 JS 檔案,但這會破壞 index.html「一個檔案就是全部」的優勢。

**現階段策略:** 所有新增邏輯都寫在 index.html 內部,用 `// ─── AUDIO PIPELINE ─────────────` 這種註解區塊清楚標示,未來要拆出來重構很容易。

---

## 整合到 index.html 的方式

### 1. 從 CDN 載入 ffmpeg.wasm

在 `<head>` 區塊的 script 載入部分(約 index.html 第 7-13 行附近),新增:

```html
<script src="https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js"></script>
<script src="https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js"></script>
```

**注意:** 版本號寫死,避免 CDN 自動升級時破壞相容性。

### 2. 在 `<script type="text/babel">` 內新增區塊

緊接在 `// ─── 附件文字抽取 ───────` 區塊之後(約 index.html 第 78 行附近),新增:

```javascript
// ─── AUDIO PIPELINE ─────────────────────────────────────────────────────────
// 整個音訊前置處理流程:壓縮 → 切段 → 並行上傳 → 合併
// 依賴:ffmpeg.wasm(從 CDN 載入)
// 決策文件:docs/audio-pipeline.md
// ──────────────────────────────────────────────────────────────────────────

const AUDIO_CONFIG = {
  // 壓縮
  sampleRate: 16000,
  channels: 1,
  bitrate: '24k',
  codec: 'libopus',
  // 切段
  targetSegmentMinutes: 15,
  minSegmentMinutes: 5,
  maxSegmentMinutes: 20,
  searchWindowMinutes: 2,
  silenceThresholdDb: -40,
  minSilenceSec: 0.8,
  fallbackSilenceSec: 0.5,
  // 上傳
  parallelChannels: 4,
  retryAttempts: 3,
  retryDelayMs: 2000,
  // 檔案限制
  maxFileSizeMB: 500,
  whisperMaxSizeMB: 25,
  whisperLanguage: 'zh',
  whisperPrompt: 'Cosmoship, 宇宙小艇, SIPAI, 偷瞄的X, MX Design, Figma, Supabase, Anthropic, Claude, ComfyUI, Flux, MeetKit',
};

// ffmpeg 全域 instance(懶載入)
let ffmpegInstance = null;
const getFFmpeg = async () => {
  if (ffmpegInstance) return ffmpegInstance;
  const { FFmpeg } = FFmpegWASM;
  ffmpegInstance = new FFmpeg();
  await ffmpegInstance.load({
    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
  });
  return ffmpegInstance;
};

// 後面依序實作:compress, segment, upload, merge
// 詳細實作見下方各段落
```

---

## 第一階段:音質壓縮

### 目標規格

| 參數 | 值 | 理由 |
|---|---|---|
| 取樣率 | **16 kHz** | Whisper 內部就是用 16 kHz 運算,再高無意義 |
| 聲道 | **Mono** | 會議錄音無立體聲價值,直接減半 |
| 編碼 | **Opus** | 同品質下檔案比 mp3 小 50% |
| Bitrate | **24 kbps** | 人聲在此 bitrate 下 Whisper 辨識率幾乎無損失 |

### 實作(放在 AUDIO PIPELINE 區塊)

```javascript
// 壓縮音檔:input Blob → output Blob (.opus)
const compressAudio = async (inputBlob, onProgress) => {
  const ffmpeg = await getFFmpeg();
  const inputName = 'input.m4a';
  const outputName = 'output.opus';

  // 寫入 input
  const inputData = new Uint8Array(await inputBlob.arrayBuffer());
  await ffmpeg.writeFile(inputName, inputData);

  // 進度監聽
  ffmpeg.on('progress', ({ progress }) => {
    if (onProgress) onProgress(Math.min(progress, 1));
  });

  // 執行壓縮
  await ffmpeg.exec([
    '-i', inputName,
    '-ar', String(AUDIO_CONFIG.sampleRate),
    '-ac', String(AUDIO_CONFIG.channels),
    '-c:a', AUDIO_CONFIG.codec,
    '-b:a', AUDIO_CONFIG.bitrate,
    outputName,
  ]);

  // 讀出結果
  const outputData = await ffmpeg.readFile(outputName);

  // 清理
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return new Blob([outputData.buffer], { type: 'audio/opus' });
};
```

### 預期壓縮效果

| 原檔 | 壓縮後 | 壓縮比 |
|---|---|---|
| 1 小時 (28 MB) | ~10 MB | 36% |
| 2 小時 (56 MB) | ~20 MB | 36% |
| 3 小時 (84 MB) | ~30 MB | 36% |
| 4 小時 (112 MB) | ~40 MB | 36% |

**壓縮階段處理時間:** 在 M1 Mac / iPhone 14 Pro 上約 **實際時長的 10-15%**(1 小時音檔約 6-9 秒)。

---

## 第二階段:靜音偵測切段

### 為什麼不用固定時間切

固定時間切會切在句子中間,導致:
- 每段開頭和結尾各有半句殘話
- Whisper 對斷章取義的語音上下文判斷變差
- 兩段的邊界詞被重複或遺漏

### 切段策略

目標 15 分鐘/段,在 ±2 分鐘範圍內找超過 0.8 秒的靜音當切點。找不到就放寬到 0.5 秒,再找不到就強制切。

### 實作

```javascript
// 偵測靜音時間點
const detectSilence = async (audioBlob, silenceDurationSec) => {
  const ffmpeg = await getFFmpeg();
  const inputName = 'detect.opus';
  await ffmpeg.writeFile(inputName, new Uint8Array(await audioBlob.arrayBuffer()));

  const silenceMarks = [];
  ffmpeg.on('log', ({ message }) => {
    // ffmpeg silencedetect 輸出格式:
    // [silencedetect @ ...] silence_start: 123.45
    // [silencedetect @ ...] silence_end: 124.56 | silence_duration: 1.11
    const startMatch = message.match(/silence_start: ([\d.]+)/);
    const endMatch = message.match(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/);
    if (startMatch) silenceMarks.push({ type: 'start', time: parseFloat(startMatch[1]) });
    if (endMatch) silenceMarks.push({
      type: 'end',
      time: parseFloat(endMatch[1]),
      duration: parseFloat(endMatch[2]),
    });
  });

  await ffmpeg.exec([
    '-i', inputName,
    '-af', `silencedetect=noise=${AUDIO_CONFIG.silenceThresholdDb}dB:d=${silenceDurationSec}`,
    '-f', 'null', '-',
  ]);

  await ffmpeg.deleteFile(inputName);

  // 組成靜音段(開始到結束的中點作為切點)
  const silences = [];
  for (let i = 0; i < silenceMarks.length - 1; i++) {
    if (silenceMarks[i].type === 'start' && silenceMarks[i + 1].type === 'end') {
      const start = silenceMarks[i].time;
      const end = silenceMarks[i + 1].time;
      silences.push({ start, end, midpoint: (start + end) / 2 });
    }
  }
  return silences;
};

// 計算切段點
const calculateSegmentBoundaries = async (audioBlob, totalDurationSec) => {
  const targetSec = AUDIO_CONFIG.targetSegmentMinutes * 60;
  const windowSec = AUDIO_CONFIG.searchWindowMinutes * 60;
  const maxSec = AUDIO_CONFIG.maxSegmentMinutes * 60;

  // 先試嚴格靜音偵測
  let silences = await detectSilence(audioBlob, AUDIO_CONFIG.minSilenceSec);

  const boundaries = [0];
  let currentPos = 0;

  while (currentPos < totalDurationSec) {
    const idealNext = currentPos + targetSec;
    if (idealNext >= totalDurationSec) break;

    // 在 [idealNext - windowSec, idealNext + windowSec] 找最接近的切點
    const searchStart = idealNext - windowSec;
    const searchEnd = idealNext + windowSec;
    const candidates = silences.filter(s => s.midpoint >= searchStart && s.midpoint <= searchEnd);

    let cutPoint;
    if (candidates.length > 0) {
      // 選最接近 idealNext 的
      cutPoint = candidates.reduce((best, s) =>
        Math.abs(s.midpoint - idealNext) < Math.abs(best.midpoint - idealNext) ? s : best
      ).midpoint;
    } else if (currentPos + maxSec < totalDurationSec) {
      // 找不到靜音,強制切在最大長度
      cutPoint = currentPos + maxSec;
    } else {
      break;
    }

    boundaries.push(cutPoint);
    currentPos = cutPoint;
  }

  boundaries.push(totalDurationSec);
  return boundaries;
};

// 實際切段
const segmentAudio = async (compressedBlob, boundaries, onProgress) => {
  const ffmpeg = await getFFmpeg();
  const inputName = 'full.opus';
  await ffmpeg.writeFile(inputName, new Uint8Array(await compressedBlob.arrayBuffer()));

  const segments = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const duration = boundaries[i + 1] - boundaries[i];
    const outputName = `seg_${i}.opus`;

    await ffmpeg.exec([
      '-i', inputName,
      '-ss', String(start),
      '-t', String(duration),
      '-c', 'copy',
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    segments.push({
      index: i,
      blob: new Blob([data.buffer], { type: 'audio/opus' }),
      startSec: start,
      durationSec: duration,
    });
    await ffmpeg.deleteFile(outputName);

    if (onProgress) onProgress((i + 1) / (boundaries.length - 1));
  }

  await ffmpeg.deleteFile(inputName);
  return segments;
};
```

---

## 第三階段:並行上傳到 Whisper API

### 並行策略

- 4 條並行通道(不超過 OpenAI rate limit)
- 失敗重試 3 次,間隔 2 秒
- 失敗段明確標註,使用者可手動重傳

### 實作

```javascript
// 單段上傳
const transcribeSegment = async (segment, openaiKey, attempt = 1) => {
  try {
    const fd = new FormData();
    fd.append('file', segment.blob, `segment-${segment.index}.opus`);
    fd.append('model', 'whisper-1');
    fd.append('language', AUDIO_CONFIG.whisperLanguage);
    fd.append('prompt', AUDIO_CONFIG.whisperPrompt);
    fd.append('response_format', 'verbose_json');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: fd,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    return {
      index: segment.index,
      startSec: segment.startSec,
      durationSec: segment.durationSec,
      text: data.text,
      segments: data.segments || [],
    };
  } catch (err) {
    if (attempt >= AUDIO_CONFIG.retryAttempts) {
      throw new Error(`段 ${segment.index + 1} 上傳失敗(已重試 ${attempt} 次): ${err.message}`);
    }
    await new Promise(r => setTimeout(r, AUDIO_CONFIG.retryDelayMs));
    return transcribeSegment(segment, openaiKey, attempt + 1);
  }
};

// 並行池管理
const transcribeAllSegments = async (segments, openaiKey, onProgress) => {
  const results = new Array(segments.length);
  let completed = 0;
  const queue = [...segments];

  const worker = async () => {
    while (queue.length > 0) {
      const seg = queue.shift();
      if (!seg) break;
      try {
        results[seg.index] = await transcribeSegment(seg, openaiKey);
      } catch (err) {
        results[seg.index] = { index: seg.index, error: err.message };
      }
      completed++;
      if (onProgress) onProgress(completed / segments.length);
    }
  };

  // 啟動 N 條並行 worker
  const workers = Array(AUDIO_CONFIG.parallelChannels).fill(null).map(worker);
  await Promise.all(workers);

  return results;
};
```

---

## 第四階段:逐字稿合併

```javascript
const mergeTranscripts = (transcripts) => {
  // 按 index 排序,確保順序正確
  const sorted = transcripts.filter(t => !t.error).sort((a, b) => a.index - b.index);

  // 合併成連續文字,段與段之間用換行
  const fullText = sorted.map(t => t.text).join('\n\n');

  // 失敗段列表
  const failedSegments = transcripts.filter(t => t.error).map(t => ({
    index: t.index,
    error: t.error,
  }));

  return { fullText, failedSegments };
};
```

---

## 第五階段:AI 摘要

**重要:** index.html 的 PostMeeting 元件**已經有完整的 Claude + GPT-4o 雙引擎摘要邏輯**(1192-1280 行),**不需要改動**。

只要把 `mergeTranscripts` 的 `fullText` 塞給既有的 `setTranscript(fullText)`,後續 AI 摘要流程會自動接上。

---

## 整合到 PostMeeting 元件

### 修改位置:`run` 函式(index.html 約 1157 行)

原本的程式碼:

```javascript
const run = async () => {
  if (!openaiKey.trim()) { setErrMsg('請輸入 OpenAI API Key'); return; }
  if (!audioSrc) { setErrMsg('請先錄音或上傳音檔'); return; }
  setErrMsg(''); setStatus('transcribing');
  let txText = '';
  try {
    const fd = new FormData();
    fd.append('file', audioSrc, uploadFile?.name || 'recording.webm');
    fd.append('model', 'whisper-1');
    fd.append('language', 'zh');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey.trim()}` },
      body: fd
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `HTTP ${res.status}`); }
    txText = (await res.json()).text;
    setTranscript(txText);
    // ... 後續的 AI 摘要邏輯
  }
  // ...
};
```

改造後的流程(偽代碼):

```javascript
const run = async () => {
  if (!openaiKey.trim()) { setErrMsg('請輸入 OpenAI API Key'); return; }
  if (!audioSrc) { setErrMsg('請先上傳 iPhone 錄音檔'); return; }
  setErrMsg('');

  try {
    // 階段 1:壓縮
    setStatus('compressing');
    const compressed = await compressAudio(audioSrc, p => setCompressProgress(p));

    // 階段 2:切段
    setStatus('segmenting');
    const duration = await getAudioDuration(audioSrc);
    const boundaries = await calculateSegmentBoundaries(compressed, duration);
    const segments = await segmentAudio(compressed, boundaries, p => setSegmentProgress(p));

    // 階段 3:並行上傳
    setStatus('transcribing');
    const transcripts = await transcribeAllSegments(
      segments,
      openaiKey.trim(),
      p => setUploadProgress(p)
    );

    // 階段 4:合併
    const { fullText, failedSegments } = mergeTranscripts(transcripts);

    if (failedSegments.length > 0) {
      setErrMsg(`有 ${failedSegments.length} 段轉錄失敗,請重試`);
      setFailedSegments(failedSegments);
      return;
    }

    setTranscript(fullText);
    setWhisperInfo({
      mins: Math.ceil(duration / 60),
      cost: (Math.ceil(duration / 60) * 0.006).toFixed(3),
    });

    // 階段 5:AI 摘要(沿用既有邏輯)
    setStatus('summarizing');
    // ... 既有的 Claude / GPT-4o 摘要程式碼保持不變
  } catch (err) {
    setErrMsg('處理失敗:' + err.message);
    setStatus('error');
  }
};
```

---

## UI 流程:六階段顯示

需要在 PostMeeting 元件加新的 state:

```javascript
const [status, setStatus] = useState('idle');
// 新增:
const [compressProgress, setCompressProgress] = useState(0);
const [segmentProgress, setSegmentProgress] = useState(0);
const [uploadProgress, setUploadProgress] = useState(0);
const [segmentCount, setSegmentCount] = useState(0);
const [failedSegments, setFailedSegments] = useState([]);
```

六個狀態的 UI:

| status | 顯示 |
|---|---|
| `idle` | 原本的「選擇音檔」按鈕和開始按鈕 |
| `compressing` | ⚙️ 壓縮音訊中... + 進度條 |
| `segmenting` | ✂️ 切段中... + 進度條 |
| `transcribing` | ⏳ 轉錄中... + 段數進度(例如 4/12) |
| `summarizing` | 🤖 AI 摘要中...(沿用原有的 Spinner) |
| `done` | ✅ 完成(沿用原有的 transcript + summary 區塊) |
| `error` | ⚠️ 錯誤訊息 + 失敗段列表(如果有) |

---

## 測試建議(Phase 2 完成前必測)

| 測試情境 | 預期結果 |
|---|---|
| 30 分鐘短會議 | 切成 2 段,總處理 < 1 分鐘 |
| 2 小時標準會議 | 切成 8 段,總處理 < 2 分鐘 |
| 3 小時超長客戶會議 | 切成 12 段,總處理 < 3 分鐘 |
| iPhone 直接上傳(Safari) | ffmpeg.wasm 正常運作 |
| 上傳中網路斷掉 | 自動重試,失敗段明確標註 |
| 檔案超過 500 MB | 前端直接拒絕,友善錯誤訊息 |
| 空白錄音(全靜音) | 切段演算法不 crash,友善錯誤訊息 |
| 中英混講 + 專有名詞 | 辨識率 > 95%(有 prompt 加持) |

---

## 常見問題

### ffmpeg.wasm 第一次載入很慢?

正常 — 第一次載入 ffmpeg core 約 30MB,會被瀏覽器快取。之後再用就秒載入。

**解法:** 在 PostMeeting 元件 mount 時就開始載入(懶載入 + 預熱),等使用者真的要壓縮時,ffmpeg 已經 ready。

### 壓縮到一半記憶體爆掉?

可能發生在 iPhone Safari 處理超大檔案(> 300MB)時。

**解法:** 前端先檢查檔案大小,超過 300MB 建議使用者「先用 Mac 處理」或「分兩次錄音」。

### 某段轉錄品質特別差?

可能原因:
1. 這段開頭被切在半句話中間(切段演算法的 edge case)
2. 背景噪音太大,Whisper 聽不清
3. 專有名詞不在 `whisperPrompt` 清單裡

**解法:** 讓使用者手動編輯逐字稿(PostMeeting 的 `textarea value={transcript}` 已經支援)。

---

_最後更新:2026-04-11 — 基於 index.html 架構改寫_
