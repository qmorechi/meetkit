-- 2026-04-27: projects 加 notion_url ── 保存使用者貼的原始 URL,UI 顯示用
--
-- 原本只存 notion_parent_page_id(32 碼 hex),歸檔流程夠用,
-- 但載入時 UI 把 hex 塞回輸入框,跟使用者一開始貼的 URL 不一樣 → 看起來像「被改掉」
-- 這欄位只是純文字備份,不影響歸檔邏輯,RLS 不需動

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS notion_url TEXT;
