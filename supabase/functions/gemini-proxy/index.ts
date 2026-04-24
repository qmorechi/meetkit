// gemini-proxy — 前端呼叫 Gemini API 的 Edge Function proxy
//
// 用途：讓前端 MeetKit 用 Gemini 對提案附件（PDF/PPTX/DOCX/圖片）產出統一的結構化描述，
// 這樣 Claude/GPT 做會議摘要時只需要讀文字描述，不用每次都吃原始 vision tokens。
//
// 環境變數：
//   GEMINI_API_KEY — 從 https://aistudio.google.com/apikey 取得
//
// 前端呼叫格式（frontend builds the full Gemini `contents.parts` array）：
//   POST { parts: [...], model?: string, generationConfig?: {...} }
//
// 回傳格式：Gemini API 原始 response（透傳）
//
// 部署：
//   supabase functions deploy gemini-proxy --project-ref yrugcgzkomydmorgzwhb --no-verify-jwt
//   supabase secrets set GEMINI_API_KEY=xxx --project-ref yrugcgzkomydmorgzwhb

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY 未設定');

    const body = await req.json();
    const {
      parts,
      model = 'gemini-2.5-flash',
      generationConfig = {},
      systemInstruction,
    } = body;

    if (!Array.isArray(parts) || parts.length === 0) {
      throw new Error('缺少 parts 陣列');
    }

    // 組 Gemini API payload
    // 預設關掉 2.5-flash 的 thinking(附件描述不需要 reasoning,省 token 和延遲)
    const payload: Record<string, unknown> = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.3,
        topP: 0.95,
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 0 },
        ...generationConfig,
      },
    };
    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const url = `${GEMINI_API}/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = (data as any)?.error?.message || `Gemini API ${res.status}`;
      throw new Error(msg);
    }

    // 抽出第一個 candidate 的文字（方便前端直接拿）+ 原始 response 備查
    const text = (data as any)?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text || '')
      .join('') || '';

    return new Response(
      JSON.stringify({ success: true, text, raw: data }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('gemini-proxy error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
});
