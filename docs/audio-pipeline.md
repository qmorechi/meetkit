# 音訊前置處理管線 — 技術文件

> 這份文件是 MeetKit 音訊處理的完整技術規格。
> Claude Code 在實作 `/src/lib/audio/` 相關程式碼時,應以此文件為準。

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

| 維度 | 前端 ffmpeg.wasm | 後端 Serverless |
|---|---|---|
| Vercel 執行時間上限 | ♾️ 不受影響 | ❌ 10-60 秒 |
| 記憶體上限 | 瀏覽器分頁(充足) | ❌ 1 GB |
| 檔案上傳次數 | 1 次(只傳壓縮後) | 2 次(先傳原檔再處理) |
| 隱私(SIPAI 機密) | ✅ 原檔不離開電腦 | ❌ 原檔經過 Vercel |
| 成本 | ✅ 零後端成本 | Vercel function 運算費 |
| 技術風險 | iOS 16+ Safari 支援良好 | 無 |

**全員 iPhone 16+ 的情境下,前端處理是明顯更優的選擇。**

---

## 第一階段:音質壓縮

### 目標規格

| 參數 | 值 | 理由 |
|---|---|---|
| 取樣率 | **16 kHz** | Whisper 內部就是用 16 kHz 運算,再高無意義 |
| 聲道 | **Mono** | 會議錄音無立體聲價值,直接減半 |
| 編碼 | **Opus** | 同品質下檔案比 mp3 小 50% |
| Bitrate | **24 kbps** | 人聲在此 bitrate 下 Whisper 辨識率幾乎無損失 |

### ffmpeg 指令

```bash
ffmpeg -i input.m4a \
  -ar 16000 \
  -ac 1 \
  -c:a libopus \
  -b:a 24k \
  output.opus
```

### 預期壓縮效果

| 原檔 | 壓縮後 | 壓縮比 |
|---|---|---|
| 1 小時 (28 MB) | ~10 MB | 36% |
| 2 小時 (56 MB) | ~20 MB | 36% |
| 3 小時 (84 MB) | ~30 MB | 36% |
| 4 小時 (112 MB) | ~40 MB | 36% |

**壓縮階段處理時間**:在 M1 Mac / iPhone 14 Pro 上約 **實際時長的 10-15%**,也就是 1 小時音檔約 6-9 秒可處理完。

---

## 第二階段:靜音偵測切段

### 為什麼不用固定時間切

固定時間切(例如每 15 分鐘切一刀)會切在句子中間,導致:
- 每段開頭和結尾各有半句殘話
- Whisper 對斷章取義的語音上下文判斷變差
- 兩段的邊界詞會被重複或遺漏

### 切段規則

```ts
const SEGMENT_CONFIG = {
  targetMinutes: 15,        // 理想段長
  minMinutes: 5,            // 最短段長(避免切太碎)
  maxMinutes: 20,           // 硬上限(超過就強切)
  searchWindowMinutes: 2,   // 在目標點 ±2 分鐘找切點
  silenceThresholdDb: -40,  // dB 以下視為靜音
  minSilenceDurationSec: 0.8, // 靜音至少持續 0.8 秒才算切點
  fallbackSilenceDurationSec: 0.5, // 找不到時放寬到 0.5 秒
}
```

### 切點尋找演算法

```
targetSec = 15 * 60 = 900
searchStart = 13 * 60 = 780
searchEnd = 17 * 60 = 1020

1. 在 [780, 1020] 範圍內,找所有超過 0.8 秒的靜音段
2. 如果有多個,選最接近 900 的那個
3. 如果一個都沒有,放寬到 0.5 秒再找一次
4. 如果還沒有,就在 1020 秒(20 分鐘硬上限)強制切
5. 切點取靜音段的中點(不是開頭或結尾)
```

### 為什麼選 15 分鐘為目標

- **3 小時會議 → 12 段**,並行上傳總耗時約 1-2 分鐘
- **每段壓縮後約 2.7 MB**,遠低於 25 MB 上限,有安全空間處理突發狀況
- **15 分鐘通常對應一個討論 topic**,切在 topic 之間比切在 topic 中間更符合自然語意
- **Whisper 對 15 分鐘片段的處理時間約 30-60 秒**,是 API 回應速度的甜蜜點

---

## 第三階段:並行上傳到 Whisper API

### 並行策略

```ts
const UPLOAD_CONFIG = {
  parallelChannels: 4,      // 同時 4 條上傳
  retryAttempts: 3,         // 失敗重試次數
  retryDelayMs: 2000,       // 重試間隔
}
```

### 為什麼只開 4 條並行

- OpenAI API 對 `whisper-1` 有 rate limit(每分鐘請求數)
- 12 段同時發會觸發 429 Too Many Requests
- 4 條是經驗上的安全且高效的平衡點
- 若未來 OpenAI 調整 rate limit,可從這個常數一處改

### Whisper API 呼叫規格

```ts
async function transcribeSegment(audioBlob: Blob, segmentIndex: number) {
  const formData = new FormData()
  formData.append('file', audioBlob, `segment-${segmentIndex}.opus`)
  formData.append('model', 'whisper-1')
  formData.append('language', 'zh')  // 絕對不能省
  formData.append('prompt', MEETKIT_VOCABULARY)  // 專有名詞清單
  formData.append('response_format', 'verbose_json')  // 要時間戳

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  })

  return response.json()
}
```

### 專有名詞清單 (MEETKIT_VOCABULARY)

```
Cosmoship, 宇宙小艇, SIPAI, 偷瞄的X, MX Design, qmore,
Figma, Supabase, Anthropic, Claude, Next.js, Whisper,
Resend, Vercel, ComfyUI, Flux, LoRA
```

**維護規則**:新客戶、新專案、新技術術語出現時,加進這個清單。放在 `src/lib/audio/vocabulary.ts`,未來可以做成管理介面讓 Owner 自己編輯。

### 失敗重試邏輯

```ts
async function transcribeWithRetry(
  audioBlob: Blob,
  segmentIndex: number,
  attempt = 1
): Promise<TranscriptionResult> {
  try {
    return await transcribeSegment(audioBlob, segmentIndex)
  } catch (error) {
    if (attempt >= UPLOAD_CONFIG.retryAttempts) {
      // 3 次都失敗,明確標註是哪一段壞掉
      throw new SegmentFailedError(segmentIndex, error)
    }
    await sleep(UPLOAD_CONFIG.retryDelayMs)
    return transcribeWithRetry(audioBlob, segmentIndex, attempt + 1)
  }
}
```

**使用者可以手動重傳失敗的段**,不用整份重跑。

---

## 第四階段:逐字稿合併

### 合併原則

- 按 `segmentIndex` 順序(不是按回應順序)
- 每段的時間戳要加上前面所有段的累積時長
- 段與段之間用空行分隔,AI 摘要階段 Claude 能辨認段落

```ts
function mergeTranscripts(segments: TranscriptionResult[]): MergedTranscript {
  let cumulativeOffset = 0
  const merged: TranscriptSegment[] = []

  segments
    .sort((a, b) => a.index - b.index)  // 按順序
    .forEach(seg => {
      seg.segments.forEach(s => {
        merged.push({
          start: s.start + cumulativeOffset,
          end: s.end + cumulativeOffset,
          text: s.text,
        })
      })
      cumulativeOffset += seg.duration
    })

  return { segments: merged, totalDuration: cumulativeOffset }
}
```

---

## 第五階段:AI 摘要(兩階段)

### 第一階段:結構化議程紀錄

使用 Claude Sonnet 4.6,輸入完整逐字稿,輸出:

```json
{
  "topics": [
    {
      "title": "議題標題",
      "discussion": "討論要點的重點整理(200 字內)",
      "decisions": ["決議 1", "決議 2"],
      "actionItems": [
        { "task": "要做的事", "owner": "負責人", "deadline": "期限" }
      ]
    }
  ]
}
```

**Prompt 要點:**
- 明確要求「只輸出 JSON,不要其他說明文字」
- 告訴 Claude「如果逐字稿裡提到專有名詞或客戶名,保留原樣不要翻譯」
- 要求負責人用「發言者報的名字」對應,找不到就填「未指定」

### 第二階段:短摘要

基於第一階段的 JSON,再請 Claude 產出:

```json
{
  "title": "會議標題(15 字內)",
  "summary": "三句話的會議重點"
}
```

這一段給**會議列表頁**和 **Resend email 預覽**用。

### 為什麼分兩階段

- 第一階段的 JSON 可以直接當正式會議紀錄存進 Supabase
- 第二階段的短摘要有不同的用途(列表顯示、信件預覽)
- 分兩次呼叫成本比一次出更多內容**更可控**,而且第二階段只要吃第一階段的結果,token 消耗很少

---

## UI 流程:六階段顯示

### 階段 1:拖檔區(初始狀態)

```
┌──────────────────────────────────────┐
│  🎙 拖入會議錄音檔                    │
│                                       │
│  支援 .m4a .mp3 .wav,最大 500MB     │
│  (iPhone 語音備忘錄 → 分享 → 上傳)   │
│                                       │
│         [或點擊選擇檔案]               │
└──────────────────────────────────────┘
```

### 階段 2:檔案資訊

```
┌──────────────────────────────────────┐
│  📄 2026-04-11 客戶會議.m4a          │
│                                       │
│  檔案大小:84 MB                      │
│  預估長度:約 3 小時                  │
│  預估處理時間:約 3-4 分鐘            │
│                                       │
│         [開始處理] [換一個檔案]        │
└──────────────────────────────────────┘
```

### 階段 3:壓縮進度

```
┌──────────────────────────────────────┐
│  ⚙️ 壓縮音訊中...                     │
│                                       │
│  ████████████░░░░░░░░  62%            │
│                                       │
│  原檔 84 MB → 預估壓縮後 30 MB        │
└──────────────────────────────────────┘
```

### 階段 4:切段 + 並行上傳

```
┌──────────────────────────────────────┐
│  ✂️ 已切成 12 段,正在上傳轉錄         │
│                                       │
│  段 01 ✅ 完成  段 05 ⏳ 上傳中       │
│  段 02 ✅ 完成  段 06 ⏳ 上傳中       │
│  段 03 ✅ 完成  段 07 ⏳ 上傳中       │
│  段 04 ✅ 完成  段 08 ⏳ 上傳中       │
│  段 09 ⏸ 等待   段 10 ⏸ 等待         │
│  段 11 ⏸ 等待   段 12 ⏸ 等待         │
│                                       │
│  整體進度:████████░░░░░░░  4/12      │
└──────────────────────────────────────┘
```

### 階段 5:AI 摘要

```
┌──────────────────────────────────────┐
│  🤖 Claude 正在整理會議重點...        │
│                                       │
│  ████████████████░░░░  78%            │
│                                       │
│  第一階段:結構化議程紀錄              │
│  第二階段:短摘要與標題                │
└──────────────────────────────────────┘
```

### 階段 6:完成

```
┌──────────────────────────────────────┐
│  ✅ 會議紀錄已產出                    │
│                                       │
│  會議標題:客戶品牌定位初步討論        │
│  會議長度:2 小時 58 分鐘              │
│  討論議題:6 個                        │
│  Action Items:12 項                   │
│                                       │
│  [查看摘要] [下載逐字稿] [寄給與會者]  │
└──────────────────────────────────────┘
```

### 錯誤狀態(任何階段都可能出現)

```
┌──────────────────────────────────────┐
│  ⚠️ 段 07 上傳失敗(已重試 3 次)      │
│                                       │
│  錯誤原因:網路逾時                    │
│                                       │
│  其他 11 段已成功上傳                  │
│                                       │
│  [重傳段 07] [先用已完成的段繼續]      │
└──────────────────────────────────────┘
```

**使用者體驗原則:**
- 絕不讓使用者看著 spinner 猜現在在做什麼
- 每個階段顯示預估剩餘時間
- 失敗訊息**永遠明確告訴使用者發生什麼事、可以怎麼辦**
- 成功後的畫面讓使用者立刻能決定下一步(看、下載、寄)

---

## 檔案結構建議

```
src/lib/audio/
├── compress.ts          # ffmpeg.wasm 壓縮邏輯
├── segment.ts           # 靜音偵測切段
├── upload.ts            # 並行上傳 + 重試
├── merge.ts             # 逐字稿合併
├── summarize.ts         # 兩階段 AI 摘要
├── vocabulary.ts        # 專有名詞清單
├── types.ts             # 所有型別定義
└── pipeline.ts          # 整合以上所有步驟的主流程

src/components/upload/
├── AudioUploader.tsx    # 拖檔區 UI
├── ProcessingStages.tsx # 六階段進度顯示
├── SegmentGrid.tsx      # 切段上傳進度的格狀顯示
└── ResultSummary.tsx    # 完成後的結果卡片
```

---

## 常數集中管理

所有數字魔術值集中在 `src/lib/audio/config.ts`:

```ts
export const AUDIO_CONFIG = {
  // 壓縮
  sampleRate: 16000,
  channels: 1,
  bitrate: 24,
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
  maxFileSizeMB: 500,      // 原檔上限
  whisperMaxSizeMB: 25,    // Whisper API 限制
  whisperLanguage: 'zh',
}
```

**修改這些常數時,要同步更新 CLAUDE.md §5 的相關說明。**

---

## 測試建議(Phase 2 完成前必測)

| 測試情境 | 預期結果 |
|---|---|
| 30 分鐘短會議 | 切成 2 段,總處理 < 1 分鐘 |
| 2 小時標準會議 | 切成 8 段,總處理 < 2 分鐘 |
| 3 小時超長客戶會議 | 切成 12 段,總處理 < 3 分鐘 |
| iPhone 直接上傳(Safari) | ffmpeg.wasm 正常運作 |
| 上傳中網路斷掉 | 自動重試,失敗段明確標註 |
| 檔案超過 500 MB | 前端直接拒絕,不上傳 |
| 空白錄音(全靜音) | 切段演算法不 crash,友善錯誤訊息 |
| 中英混講 + 專有名詞 | 辨識率 > 95% |

---

_最後更新:2026-04-11 — 初版,Phase 2 音訊 pipeline 開工前_
