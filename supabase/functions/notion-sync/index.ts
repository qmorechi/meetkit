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
