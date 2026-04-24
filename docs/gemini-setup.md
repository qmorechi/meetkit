# Gemini 附件統一描述 — 設定說明

> MeetKit 現在會把每份附件(PDF/PPTX/DOCX/圖片)先送 Gemini 2.5 Flash 產出結構化 Markdown 描述,讓 Claude 摘要階段只讀這段描述,不必重吃 vision tokens。省 token、格式統一、Notion 頁面也會多一個「🤖 Gemini AI 描述」摺疊區塊。

---

## 為什麼選 Gemini 2.5 Flash(thinking off)

| 維度 | 得分 |
|---|---|
| PDF 原生支援 | ✅ 一口氣吃 1000 頁 |
| 成本 | $0.30 / $2.50 per 1M tokens(thinking 關掉省 80%+) |
| context | 1M tokens |
| 中文 | 好 |
| 多模態(圖+文) | 強 |

> **為什麼關掉 thinking**:附件描述是純粹的「看圖說故事」,不需要推理鏈。實測 thinking 開啟會多耗 80% token、延遲多 3-5 秒,對 describer 任務沒幫助。frontend 和 Edge Function 都預設 `thinkingBudget: 0`。

---

## 一次性設定:設 `GEMINI_API_KEY` secret

### 步驟 1 — 拿 API key

1. 去 https://aistudio.google.com/apikey
2. 建一把新 key(或用現有)
3. 複製 key 備用

### 步驟 2 — 把 key 放進 Supabase Edge Function secrets

**方式 A:用 CLI(推薦)**

```bash
cd /Volumes/T7/Cosmoship/Anthropic_Claude_Project/meetkit
supabase secrets set GEMINI_API_KEY=貼你的key \
  --project-ref yrugcgzkomydmorgzwhb
```

**方式 B:用 Dashboard**

1. 打開 https://supabase.com/dashboard/project/yrugcgzkomydmorgzwhb/functions
2. 左側找到 **gemini-proxy**(或任何一個 function)
3. 進到 **Secrets** 分頁
4. 新增:
   - Name: `GEMINI_API_KEY`
   - Value: 貼你的 key
5. 按 **Save**

Secret 是 project-wide 的,所有 Edge Function 都能讀到,設一次就好。

---

## 驗證

設好之後,隨便開一個測試專案:

1. 建一個提案,附件上傳 **一份 PDF 或 PPTX**
2. 按「歸檔到日誌」
3. 同步到 Notion
4. 打開 Notion 頁面,每個附件下應該看到:
   - `### 📎 附件:XXX.pdf`
   - 🤖 **Gemini AI 描述(展開看結構化分析)** ← 摺疊區塊
   - 圖片(PDF 每頁 render / PPTX 內嵌圖)
   - `原檔:XXX.pdf` 下載連結

展開 Gemini 描述,裡面應該有 `## 整體概述 / ## 關鍵資訊 / ## 視覺元素描述 / ## 重點原文引用 / ## 未能解析` 五個章節。

---

## 成本預估

Gemini 2.0 Flash 計價(2025 年版):
- 輸入 $0.075 / 1M tokens
- 輸出 $0.30 / 1M tokens

實測估算:
- **一份 10 頁 PDF** ≈ 5K input + 500 output tokens ≈ **NT$0.02**(二分錢)
- **一份 20 張 slide 的 PPTX** ≈ 10K input + 800 output ≈ **NT$0.05**
- **一張圖片** ≈ 1K input + 300 output ≈ **NT$0.005**

每場會議大概 10-20 份附件,總成本 **NT$0.5-2 元**之間。

---

## fallback 行為(Gemini 失敗時)

萬一 Gemini 被 rate limit 或掛點:
- `description` 會是空字串
- Claude 摘要會自動 fallback 到舊的 vision/text 餵法(不會崩)
- Notion 頁面也會少「Gemini AI 描述」摺疊區塊,但其他內容正常

所以短暫失敗不會影響歸檔,只是該附件那次會少 Gemini 描述。

---

## 架構圖

```
使用者上傳附件(PDF/PPTX/DOCX/圖)
  ↓
extractAttachmentParts(fileUrl, fileName)
  ├─ PDF  → pdfToImageBlocks → 同時 geminiDescribePdf(丟整份 PDF)
  ├─ PPTX → pptxToParts      → geminiDescribePptx(丟文字+內嵌圖)
  ├─ DOCX → mammoth          → geminiDescribeDocx(丟純文字)
  └─ IMG  → base64           → geminiDescribeImage(丟圖)
  ↓
{ ...part, description: "## 整體概述..." }
  ↓
┌─────────────────────────┬───────────────────────────┐
↓                         ↓                           ↓
Claude 摘要                 Notion 同步                 Supabase journals
(讀 description 不讀原圖)    (Gemini 描述摺疊區塊)      (attachments JSON 含 description)
```

---

## 程式碼位置

- **Edge Function**: `supabase/functions/gemini-proxy/index.ts`
- **前端呼叫**: `index-dev.html` 內 `callGeminiDescribe`、`geminiDescribePdf/Pptx/Docx/Image`
- **Claude prompt**: `index-dev.html` 第 2216 行附近,優先讀 `part.description`
- **Notion 渲染**: `supabase/functions/notion-sync/index.ts` 的 `attachmentBlocks`

---

_建立時間:2026-04-24 — Gemini 統一描述功能上線_
