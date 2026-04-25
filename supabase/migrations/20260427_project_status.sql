-- 2026-04-27: projects 表加 status 欄位 ── 進行中 / 暫停 / 結案 三態管理
--
-- active(預設):正常顯示,不加任何視覺標記
-- paused      :排到清單最後,標「⏸ 暫停中」+ 降透明度
-- closed      :從清單完全隱藏(軟刪除,日誌和提案完整保留)
--                沒有 UI 復原途徑,要重啟另開新案 + Notion 連結重接
--
-- RLS 不需改:現有 UPDATE policy 是 owner only,自動把這個欄位也保護到。

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'paused', 'closed'));

CREATE INDEX IF NOT EXISTS projects_status_idx ON projects (status);
