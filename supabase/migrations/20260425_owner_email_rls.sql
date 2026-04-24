-- 20260425_owner_email_rls.sql
-- MeetKit Route C: Magic-link login + RLS + 每個專案獨立的 Notion 目標頁
--
-- 這支 migration 做四件事:
--   1) projects 加 owner_email(誰建的)和 notion_parent_page_id(該專案要同步到哪個 Notion 頁)
--   2) 把既有資料 backfill 給 qmorechi@mac.com(單人時期)
--   3) 開啟 projects / proposals / journals 的 RLS
--   4) 建立「只有 owner 自己看得到自己專案」的 policies
--
-- 重要前提:
--   - projects.id 是 6 碼 TEXT(例如 A3X9KP),不是 UUID
--   - proposals.project_id 和 journals.project_id 都 FK 到 projects.id
--   - 前端改造後,db() helper 會帶使用者 access_token,auth.jwt()->>'email' 才有值
--   - anon 呼叫(未登入)在 RLS 底下會看不到任何資料(符合預期)

-- ─────────────────────────────────────────────
-- 1) Schema 變更
-- ─────────────────────────────────────────────

alter table public.projects
  add column if not exists owner_email text,
  add column if not exists notion_parent_page_id text;

-- owner_email 查詢會很常用,建索引
create index if not exists projects_owner_email_idx
  on public.projects(owner_email);

-- ─────────────────────────────────────────────
-- 2) Backfill 既有資料
-- 現階段 MeetKit 只有 qmore 一個使用者,所有既有專案都給他
-- 之後如果有多使用者需要改 owner,再手動 UPDATE
-- ─────────────────────────────────────────────

update public.projects
   set owner_email = 'qmorechi@mac.com'
 where owner_email is null;

-- ─────────────────────────────────────────────
-- 3) 啟用 RLS
-- ─────────────────────────────────────────────

alter table public.projects  enable row level security;
alter table public.proposals enable row level security;
alter table public.journals  enable row level security;

-- ─────────────────────────────────────────────
-- 4) Policies
--
-- 原則:
--   - 登入後用 auth.jwt()->>'email' 比對 owner_email
--   - projects 的 SELECT / INSERT / UPDATE / DELETE 都只准 owner
--   - proposals / journals 透過 project_id 去查 projects.owner_email
--   - 未登入(anon) → auth.jwt() 回 null → 完全擋掉
-- ─────────────────────────────────────────────

-- projects -------------------------------------
drop policy if exists "projects_owner_select" on public.projects;
create policy "projects_owner_select" on public.projects
  for select
  using (owner_email = auth.jwt()->>'email');

drop policy if exists "projects_owner_insert" on public.projects;
create policy "projects_owner_insert" on public.projects
  for insert
  with check (owner_email = auth.jwt()->>'email');

drop policy if exists "projects_owner_update" on public.projects;
create policy "projects_owner_update" on public.projects
  for update
  using (owner_email = auth.jwt()->>'email')
  with check (owner_email = auth.jwt()->>'email');

drop policy if exists "projects_owner_delete" on public.projects;
create policy "projects_owner_delete" on public.projects
  for delete
  using (owner_email = auth.jwt()->>'email');

-- proposals ------------------------------------
drop policy if exists "proposals_owner_select" on public.proposals;
create policy "proposals_owner_select" on public.proposals
  for select
  using (
    exists (
      select 1 from public.projects p
       where p.id = proposals.project_id
         and p.owner_email = auth.jwt()->>'email'
    )
  );

drop policy if exists "proposals_owner_insert" on public.proposals;
create policy "proposals_owner_insert" on public.proposals
  for insert
  with check (
    exists (
      select 1 from public.projects p
       where p.id = proposals.project_id
         and p.owner_email = auth.jwt()->>'email'
    )
  );

drop policy if exists "proposals_owner_update" on public.proposals;
create policy "proposals_owner_update" on public.proposals
  for update
  using (
    exists (
      select 1 from public.projects p
       where p.id = proposals.project_id
         and p.owner_email = auth.jwt()->>'email'
    )
  );

drop policy if exists "proposals_owner_delete" on public.proposals;
create policy "proposals_owner_delete" on public.proposals
  for delete
  using (
    exists (
      select 1 from public.projects p
       where p.id = proposals.project_id
         and p.owner_email = auth.jwt()->>'email'
    )
  );

-- journals -------------------------------------
drop policy if exists "journals_owner_select" on public.journals;
create policy "journals_owner_select" on public.journals
  for select
  using (
    exists (
      select 1 from public.projects p
       where p.id = journals.project_id
         and p.owner_email = auth.jwt()->>'email'
    )
  );

drop policy if exists "journals_owner_insert" on public.journals;
create policy "journals_owner_insert" on public.journals
  for insert
  with check (
    exists (
      select 1 from public.projects p
       where p.id = journals.project_id
         and p.owner_email = auth.jwt()->>'email'
    )
  );

drop policy if exists "journals_owner_update" on public.journals;
create policy "journals_owner_update" on public.journals
  for update
  using (
    exists (
      select 1 from public.projects p
       where p.id = journals.project_id
         and p.owner_email = auth.jwt()->>'email'
    )
  );

drop policy if exists "journals_owner_delete" on public.journals;
create policy "journals_owner_delete" on public.journals
  for delete
  using (
    exists (
      select 1 from public.projects p
       where p.id = journals.project_id
         and p.owner_email = auth.jwt()->>'email'
    )
  );

-- ─────────────────────────────────────────────
-- 驗證用查詢(跑完後可以手動執行這幾行確認)
-- ─────────────────────────────────────────────
--
-- 確認新欄位已加上:
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='projects';
--
-- 確認 owner_email 已 backfill:
--   select id, title, owner_email from public.projects order by created_at desc limit 5;
--
-- 確認 RLS 已開:
--   select tablename, rowsecurity from pg_tables
--    where schemaname='public' and tablename in ('projects','proposals','journals');
--
-- 確認 policies 已建:
--   select tablename, policyname, cmd from pg_policies
--    where schemaname='public' order by tablename, cmd;
