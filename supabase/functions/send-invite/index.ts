// send-invite — 寄會議邀請信給 project_members
//
// 用途:前端建完專案 / 加 member 時呼叫,Resend 幫忙把 MeetKit 邀請信寄給所有 email。
// 收信人點信裡的 MeetKit 連結,用該 email 登入,magic link 驗證後就進得了專案會議室。
//
// 前端呼叫格式:
//   POST {
//     projectCode: 'A3X9KP',
//     projectTitle: 'SIPAI 第三次討論會',
//     meetingDate: '2026-05-12',      // 可選
//     meetingTime: '14:30',            // 可選
//     senderEmail: 'qmore@minimax.com.tw',
//     senderName: 'Qmore',             // 可選,沒帶就用 email 前綴
//     recipientEmails: ['a@b.com', ...]
//   }
//
// 回:
//   { ok: true, sent: [...], failed: [{ email, error }...] }
//
// 部署:
//   supabase functions deploy send-invite --project-ref yrugcgzkomydmorgzwhb --no-verify-jwt
//
// 需要的 secrets:
//   - RESEND_API_KEY(到 https://resend.com/api-keys 拿)
//   - RESEND_FROM(寄件者,預設 "MeetKit <meetkit@mx.design>")
//   - MEETKIT_BASE_URL(預設 https://meetkit.mx.design/index-dev.html)

const RESEND_API = 'https://api.resend.com/emails';

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) throw new Error('RESEND_API_KEY 未設定');

    const from = Deno.env.get('RESEND_FROM') || 'MeetKit <meetkit@mx.design>';
    // 預設指正式環境 index.html;開發測試請設 MEETKIT_BASE_URL secret 蓋過(例如 .../index-dev.html)
    const baseUrl = Deno.env.get('MEETKIT_BASE_URL') || 'https://meetkit.mx.design/index.html';

    const body = await req.json();
    const {
      projectCode,
      projectTitle,
      meetingDate,
      meetingTime,
      senderEmail,
      senderName,
      recipientEmails,
      // 排程寄送:UTC ISO 字串(例 "2026-04-28T01:00:00.000Z"),
      // 或 Resend 支援的自然語言(例 "in 1 hour")。空值/未提供 = 立即寄送。
      // 交給 Resend 的 scheduled_at 欄位,Resend 內部排程,我們不自建 queue。
      scheduledAt,
    } = body;

    if (!projectCode) throw new Error('缺少 projectCode');
    if (!Array.isArray(recipientEmails) || recipientEmails.length === 0) {
      throw new Error('缺少 recipientEmails 或為空陣列');
    }

    const display = senderName || (senderEmail ? senderEmail.split('@')[0] : 'MeetKit');
    const joinUrl = `${baseUrl}?p=${encodeURIComponent(projectCode)}`;
    const timeLine = meetingDate
      ? `${meetingDate}${meetingTime ? `　${meetingTime}` : ''}`
      : '時間待定';

    const subject = `${display} 邀請你參加「${projectTitle || '未命名專案'}」會議`;

    const sent: string[] = [];
    const failed: { email: string; error: string }[] = [];

    // 一封一封寄(Resend rate limit 寬,序列寄比較好 debug)
    for (const rawEmail of recipientEmails) {
      const email = String(rawEmail || '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        failed.push({ email: rawEmail, error: '格式無效' });
        continue;
      }

      const html = renderInviteHtml({
        senderDisplay: display,
        projectTitle: projectTitle || '未命名專案',
        timeLine,
        projectCode,
        joinUrl,
        recipientEmail: email,
      });

      try {
        const res = await fetch(RESEND_API, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [email],
            subject,
            html,
            // 讓收信匣顯示 "MeetKit" 而非 noreply,同時讓 reply 回到發起人
            reply_to: senderEmail || undefined,
            // 有排程時間就讓 Resend 延後寄(UTC ISO 或 "in 1 hour" 這類自然語言)
            ...(scheduledAt && String(scheduledAt).trim() ? { scheduled_at: String(scheduledAt).trim() } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          failed.push({ email, error: data.message || `Resend ${res.status}` });
        } else {
          sent.push(email);
        }
      } catch (e) {
        failed.push({ email, error: (e as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent, failed }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('send-invite error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
});

function renderInviteHtml(p: {
  senderDisplay: string;
  projectTitle: string;
  timeLine: string;
  projectCode: string;
  joinUrl: string;
  recipientEmail: string;
}): string {
  // 簡潔的 email HTML,email client 相容性優先(用 table + inline style)
  return `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC','Microsoft JhengHei',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
        <tr><td style="padding:28px 32px 8px 32px;">
          <div style="font-size:13px;color:#8e8e93;letter-spacing:0.08em;">◈ MEETKIT</div>
          <h1 style="margin:14px 0 6px 0;font-size:20px;font-weight:700;color:#1d1d1f;line-height:1.35;">
            ${escapeHtml(p.senderDisplay)} 邀請你參加會議
          </h1>
          <div style="font-size:15px;color:#3a3a3c;line-height:1.55;margin-bottom:18px;">
            <b>${escapeHtml(p.projectTitle)}</b><br>
            ${escapeHtml(p.timeLine)}
          </div>
        </td></tr>
        <tr><td style="padding:0 32px 24px 32px;">
          <a href="${escapeAttr(p.joinUrl)}"
             style="display:block;background:#0071e3;color:#ffffff;text-align:center;padding:14px 20px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.01em;">
            進入會議室
          </a>
          <div style="margin-top:14px;font-size:13px;color:#6e6e73;line-height:1.6;">
            用 <b>${escapeHtml(p.recipientEmail)}</b> 登入即可進入。<br>
            MeetKit 會寄一封登入連結信,點一下就登入,不用記密碼。
          </div>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#fafafa;border-top:1px solid #e5e5ea;">
          <div style="font-size:12px;color:#8e8e93;line-height:1.6;">
            專案代碼:<span style="font-family:'SF Mono',Consolas,monospace;letter-spacing:0.08em;color:#3a3a3c;">${escapeHtml(p.projectCode)}</span><br>
            如果按鈕沒反應,把以下網址貼到瀏覽器:<br>
            <span style="word-break:break-all;color:#3a3a3c;">${escapeHtml(p.joinUrl)}</span>
          </div>
        </td></tr>
      </table>
      <div style="font-size:11px;color:#8e8e93;margin-top:14px;">
        MX Design ・ MeetKit
      </div>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
