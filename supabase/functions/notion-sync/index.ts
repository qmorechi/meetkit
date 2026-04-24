const NOTION_API = 'https://api.notion.com/v1';

// 長文字切成 1900 字一段（Notion 單 block 上限 2000）
function chunkText(text: string, size = 1900): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function paragraphBlocks(text: string) {
  if (!text?.trim()) return [];
  return chunkText(text).map(chunk => ({
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] }
  }));
}

function heading2(text: string) {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: text } }] } };
}

function heading3(text: string) {
  return { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: text } }] } };
}

function imageBlock(url: string, caption?: string) {
  return {
    object: 'block',
    type: 'image',
    image: {
      type: 'external',
      external: { url },
      caption: caption ? [{ type: 'text', text: { content: caption.slice(0, 1900) } }] : [],
    },
  };
}

function fileBlock(url: string, name: string) {
  return {
    object: 'block',
    type: 'file',
    file: {
      type: 'external',
      external: { url },
      caption: [{ type: 'text', text: { content: name.slice(0, 1900) } }],
    },
  };
}

function calloutBlock(emoji: string, text: string, color = 'yellow_background') {
  return {
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: [{ type: 'text', text: { content: text.slice(0, 1900) } }],
      icon: { type: 'emoji', emoji },
      color,
    },
  };
}

// 依附件 kind 組 Notion blocks（圖 + 文字 + 原檔下載連結 + 格式警告）
function attachmentBlocks(att: any) {
  const out: object[] = [];
  const header = att.note ? `📎 附件：${att.fileName}　${att.note}` : `📎 附件：${att.fileName}`;
  out.push(heading3(header));

  if (att.kind === 'needs-export') {
    out.push(calloutBlock('⚠️', `${att.fileName}：${att.hint}`, 'orange_background'));
    return out;
  }

  if (att.kind === 'empty') {
    out.push(calloutBlock('ℹ️', `${att.fileName}：無法擷取內容（可能是未支援的格式）`, 'gray_background'));
    if (att.originalUrl) out.push(fileBlock(att.originalUrl, att.fileName));
    return out;
  }

  // 圖片（PDF 每頁 render、PPTX 內嵌圖、直接上傳的圖片）
  if (Array.isArray(att.images) && att.images.length > 0) {
    for (const img of att.images) {
      if (img?.url) out.push(imageBlock(img.url, img.caption || ''));
    }
  }

  // 抽取的文字（DOCX/TXT/MD/PPTX 文字）→ 給 AI 讀懂用
  if (att.text && att.text.trim()) {
    out.push(...paragraphBlocks(att.text));
  }

  // 原檔下載連結：
  //   直接圖片（isDirectImage）→ 不重複,images 已經是原檔
  //   其它（PDF / PPTX / DOCX / TXT）→ 一律附原檔供下載
  if (att.originalUrl && !att.isDirectImage) {
    const label = att.kind === 'vision' ? `原始 PDF：${att.fileName}` : `原檔：${att.fileName}`;
    out.push(fileBlock(att.originalUrl, label));
  }

  return out;
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { journal, projectTitle, isoDate } = await req.json();

    const token = Deno.env.get('NOTION_TOKEN');
    const dbId  = Deno.env.get('NOTION_DB_ID');
    if (!token || !dbId) throw new Error('NOTION_TOKEN 或 NOTION_DB_ID 未設定');

    const pageTitle = `${journal.date}｜${projectTitle || '未命名專案'}`;
    const summarySnippet = (journal.summary || '').slice(0, 2000);

    // ─── 組合 Notion page 內容 blocks ───────────────────────────
    const blocks: object[] = [];

    if (journal.proposals?.length > 0) {
      blocks.push(heading2('📋 議程'));
      for (const p of journal.proposals) {
        const label = p.author ? `${p.title}（${p.author}）` : p.title;
        blocks.push(heading3(label));
        if (p.content) blocks.push(...paragraphBlocks(p.content));
        // 附件（圖 + 文字 + 原檔 + 警告）
        if (Array.isArray(p.attachments)) {
          for (const att of p.attachments) {
            blocks.push(...attachmentBlocks(att));
          }
        }
      }
    }

    if (journal.summary) {
      blocks.push(heading2('🤖 AI 摘要'));
      blocks.push(...paragraphBlocks(journal.summary));
    }

    if (journal.transcript) {
      blocks.push(heading2('📝 逐字稿'));
      blocks.push(...paragraphBlocks(journal.transcript));
    }

    // ─── 建立 Notion page（最多 100 blocks）───────────────────────
    const res = await fetch(`${NOTION_API}/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          'Name':   { title:     [{ text: { content: pageTitle } }] },
          '會議日期': { date:      isoDate ? { start: isoDate } : null },
          '專案名稱': { rich_text: [{ text: { content: projectTitle || '' } }] },
          '摘要':    { rich_text: [{ text: { content: summarySnippet } }] },
        },
        children: blocks.slice(0, 100),
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Notion API ${res.status}`);

    // ─── 超過 100 blocks 的部分分批 append ──────────────────────
    if (blocks.length > 100) {
      for (let i = 100; i < blocks.length; i += 100) {
        await fetch(`${NOTION_API}/blocks/${data.id}/children`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ children: blocks.slice(i, i + 100) }),
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, notionPageId: data.id, notionUrl: data.url }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('notion-sync error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
});
