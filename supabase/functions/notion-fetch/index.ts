// notion-fetch — 從 Notion API 抓頁面內容,給 MeetKit 解析提案裡的 Notion 連結用
//
// 用途：當提案 content 包含 notion.so 連結時,呼叫這支 function 把該頁內容抓下來,
// 攤平成 Markdown,交給 Gemini 生統一描述,再給 Claude 摘要。
//
// 共用的 NOTION_TOKEN(notion-sync 寫頁用的同一把)只要 integration 被分享給該頁或
// 其父頁面/資料庫,就能讀。404 代表沒分享。
//
// 前端呼叫格式：
//   POST { pageId: string, test?: boolean }
//     test=true → 只檢查是否能讀,回 { ok, title }
//     test=false → 完整抓頁面 + 遞迴子 blocks,攤平成 markdown,回 { ok, title, markdown, images }
//
// 部署：
//   supabase functions deploy notion-fetch --project-ref yrugcgzkomydmorgzwhb --no-verify-jwt

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const MAX_DEPTH = 3;             // 子頁面遞迴深度上限(避免無限吃 token)
const MAX_BLOCKS_PER_PAGE = 500; // 單頁最多抓 500 blocks(足夠處理 99% 提案頁)

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const token = Deno.env.get('NOTION_TOKEN');
    if (!token) throw new Error('NOTION_TOKEN 未設定');

    const body = await req.json();
    const { pageId, test = false } = body;
    if (!pageId) throw new Error('缺少 pageId');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
    };

    // 1) 先打 pages API 確認頁面存在 + integration 有權限
    const pageRes = await fetch(`${NOTION_API}/pages/${pageId}`, { headers });
    if (!pageRes.ok) {
      const err = await pageRes.json().catch(() => ({}));
      const hint = pageRes.status === 404
        ? '此頁尚未分享給 MeetKit integration(請到該頁 ⋯ 選單 → Add connections → 選 MeetKit),或頁面 ID 錯誤'
        : pageRes.status === 401
        ? 'NOTION_TOKEN 失效,請重新產生'
        : `Notion API ${pageRes.status}`;
      return new Response(
        JSON.stringify({ ok: false, status: pageRes.status, error: err.message || hint, hint }),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }
    const pageData = await pageRes.json();
    const title = extractTitle(pageData);

    // test 模式：只確認能讀,不撈內容
    if (test) {
      return new Response(
        JSON.stringify({ ok: true, title, pageId }),
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // 2) 遞迴抓 blocks,攤平成 Markdown
    const result = { markdown: '', images: [] as string[], blockCount: 0 };
    await fetchBlocksRecursive(pageId, headers, 0, result);

    return new Response(
      JSON.stringify({
        ok: true,
        title,
        pageId,
        markdown: result.markdown.trim(),
        images: result.images,
        blockCount: result.blockCount,
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('notion-fetch error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }
    );
  }
});

// 從 page properties 裡挑 title 欄位(資料庫頁有 Name 等,一般 page 也有 title 欄)
function extractTitle(pageData: any): string {
  const props = pageData?.properties || {};
  for (const key of Object.keys(props)) {
    const p = props[key];
    if (p?.type === 'title') {
      const text = (p.title || []).map((t: any) => t.plain_text || '').join('').trim();
      if (text) return text;
    }
  }
  return '(無標題)';
}

// 遞迴撈 children blocks,攤平成 Markdown
async function fetchBlocksRecursive(
  blockId: string,
  headers: Record<string, string>,
  depth: number,
  result: { markdown: string; images: string[]; blockCount: number },
): Promise<void> {
  if (depth > MAX_DEPTH) return;
  if (result.blockCount >= MAX_BLOCKS_PER_PAGE) return;

  let cursor: string | undefined;
  while (true) {
    const url = new URL(`${NOTION_API}/blocks/${blockId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) break;
    const data = await res.json();

    for (const block of (data.results || [])) {
      if (result.blockCount >= MAX_BLOCKS_PER_PAGE) return;
      result.blockCount++;

      const md = blockToMarkdown(block, depth, result);
      if (md) result.markdown += md + '\n';

      // 有 children 就遞迴(child_page / child_database 例外,避免吃太深)
      if (block.has_children && !['child_page', 'child_database', 'synced_block'].includes(block.type)) {
        await fetchBlocksRecursive(block.id, headers, depth + 1, result);
      }
    }

    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
}

function richTextToMd(rt: any[]): string {
  if (!Array.isArray(rt)) return '';
  return rt.map(t => {
    let text = t.plain_text || '';
    if (!text) return '';
    const a = t.annotations || {};
    if (a.code) text = '`' + text + '`';
    if (a.bold) text = `**${text}**`;
    if (a.italic) text = `*${text}*`;
    if (a.strikethrough) text = `~~${text}~~`;
    if (t.href) text = `[${text}](${t.href})`;
    return text;
  }).join('');
}

function blockToMarkdown(
  block: any,
  depth: number,
  result: { images: string[] },
): string {
  const indent = '  '.repeat(Math.min(depth, 3));
  const t = block.type;
  const data = block[t] || {};

  switch (t) {
    case 'heading_1': return `# ${richTextToMd(data.rich_text)}`;
    case 'heading_2': return `## ${richTextToMd(data.rich_text)}`;
    case 'heading_3': return `### ${richTextToMd(data.rich_text)}`;
    case 'paragraph': {
      const txt = richTextToMd(data.rich_text);
      return txt ? txt : '';
    }
    case 'bulleted_list_item': return `${indent}- ${richTextToMd(data.rich_text)}`;
    case 'numbered_list_item': return `${indent}1. ${richTextToMd(data.rich_text)}`;
    case 'to_do': return `${indent}- [${data.checked ? 'x' : ' '}] ${richTextToMd(data.rich_text)}`;
    case 'toggle': return `${indent}▸ ${richTextToMd(data.rich_text)}`;
    case 'quote': return `> ${richTextToMd(data.rich_text)}`;
    case 'callout': {
      const emoji = data.icon?.emoji || '💡';
      return `${emoji} ${richTextToMd(data.rich_text)}`;
    }
    case 'code': return '```' + (data.language || '') + '\n' + richTextToMd(data.rich_text) + '\n```';
    case 'image': {
      const url = data.external?.url || data.file?.url || '';
      const caption = richTextToMd(data.caption || []) || '圖片';
      if (url) result.images.push(url);
      return url ? `![${caption}](${url})` : '';
    }
    case 'video': case 'audio': case 'file': case 'pdf': {
      const url = data.external?.url || data.file?.url || '';
      const caption = richTextToMd(data.caption || []) || t;
      return url ? `📎 [${caption}](${url})` : '';
    }
    case 'bookmark': case 'embed': case 'link_preview': {
      const url = data.url || '';
      const caption = richTextToMd(data.caption || []) || url;
      return url ? `🔗 [${caption}](${url})` : '';
    }
    case 'divider': return '---';
    case 'child_page': return `📄 **[子頁面]** ${data.title || '(無標題)'}`;
    case 'child_database': return `🗃 **[資料庫]** ${data.title || '(無標題)'}`;
    case 'table_of_contents': return '';
    case 'equation': return data.expression ? `$$${data.expression}$$` : '';
    case 'table': case 'table_row': return ''; // table 遞迴 children 處理(rows)
    case 'column_list': case 'column': return ''; // column 遞迴 children 處理
    default: return '';
  }
}
