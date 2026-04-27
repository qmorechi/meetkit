-- 2026-04-27: projects 加 notion_parent_type ── 支援把歸檔寫到 Notion database (整列新增)
--
-- 原本 notion_parent_page_id 一律當 page 處理,parent 寫 { page_id: ... }
-- 同事 Bow 想把歸檔接到資料庫(每場會議變一列),貼了 DB URL 觸發 Notion API 400
-- → 新增 notion_parent_type 欄位區分 'page' | 'database'
-- → notion-sync 會依 type 用 { page_id: ... } 或 { database_id: ... }
--
-- 預設 'page' 跟舊行為對齊;舊資料不用回填,RLS 不需動

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS notion_parent_type TEXT DEFAULT 'page'
    CHECK (notion_parent_type IN ('page', 'database'));
