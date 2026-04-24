-- 20260425_project_members.sql
-- MeetKit 白名單權限模型:把「6 碼 + 密碼」的共享模型改成「邀請制」
--
-- 這支 migration 做四件事:
--   1) 新增 project_members 表(專案 → 被邀請的 email 清單)
--   2) 建立 SECURITY DEFINER helper(避免 RLS 跨表遞迴檢查)
--   3) 把既有的 owner-only RLS 換成「owner OR 成員」
--   4) 既有 33 個專案:owner 自動加到 project_members(讓同步也能看得到)
--
-- 為什麼要 helper function:
--   - 如果直接用 EXISTS(SELECT FROM project_members...) 寫在 projects 的 policy 裡,
--     Postgres 會跑 project_members 的 RLS,而 project_members 的 RLS 又會查 projects,
--     → 無限遞迴。
--   - SECURITY DEFINER 會以 function 擁有者身份執行,繞過 RLS,斷開循環。
--   - 只要 function 本身不回傳機密(只回 boolean),就是安全的。

-- ─────────────────────────────────────────────
-- 1) project_members 表
-- ─────────────────────────────────────────────

create table if not exists public.project_members (
  project_id text not null references public.projects(id) on delete cascade,
  member_email text not null,
  added_by text,
  added_at timestamptz not null default now(),
  primary key (project_id, member_email)
);

create index if not exists project_members_email_idx
  on public.project_members(member_email);

alter table public.project_members enable row level security;

-- ─────────────────────────────────────────────
-- 2) Helper functions(security definer 避免遞迴)
-- ─────────────────────────────────────────────

create or replace function public.is_project_owner(pid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.projects
     where id = pid
       and owner_email = auth.jwt()->>'email'
  );
$$;

create or replace function public.is_project_member(pid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.project_members
     where project_id = pid
       and member_email = auth.jwt()->>'email'
  );
$$;

-- 讓 function 可被 authenticated 角色呼叫
grant execute on function public.is_project_owner(text) to authenticated, anon;
grant execute on function public.is_project_member(text) to authenticated, anon;

-- ─────────────────────────────────────────────
-- 3) 刪掉舊的 owner-only policies,換成 owner-or-member
-- ─────────────────────────────────────────────

-- projects -------------------------------------
drop policy if exists "projects_owner_select" on public.projects;
drop policy if exists "projects_owner_insert" on public.projects;
drop policy if exists "projects_owner_update" on public.projects;
drop policy if exists "projects_owner_delete" on public.projects;
-- 新 policies 也先 drop,讓 migration 可以重複跑(idempotent)
drop policy if exists "projects_select" on public.projects;
drop policy if exists "projects_insert" on public.projects;
drop policy if exists "projects_update" on public.projects;
drop policy if exists "projects_delete" on public.projects;

-- 可見:owner 或 被邀請的 member
create policy "projects_select" on public.projects
  for select
  using (
    owner_email = auth.jwt()->>'email'
    or public.is_project_member(id)
  );

-- 建立:只能以自己的 email 當 owner
create policy "projects_insert" on public.projects
  for insert
  with check (owner_email = auth.jwt()->>'email');

-- 修改/刪除:只有 owner
create policy "projects_update" on public.projects
  for update
  using (owner_email = auth.jwt()->>'email')
  with check (owner_email = auth.jwt()->>'email');

create policy "projects_delete" on public.projects
  for delete
  using (owner_email = auth.jwt()->>'email');

-- proposals ------------------------------------
drop policy if exists "proposals_owner_select" on public.proposals;
drop policy if exists "proposals_owner_insert" on public.proposals;
drop policy if exists "proposals_owner_update" on public.proposals;
drop policy if exists "proposals_owner_delete" on public.proposals;
drop policy if exists "proposals_select" on public.proposals;
drop policy if exists "proposals_insert" on public.proposals;
drop policy if exists "proposals_update" on public.proposals;
drop policy if exists "proposals_delete" on public.proposals;

create policy "proposals_select" on public.proposals
  for select
  using (
    public.is_project_owner(project_id)
    or public.is_project_member(project_id)
  );

create policy "proposals_insert" on public.proposals
  for insert
  with check (
    public.is_project_owner(project_id)
    or public.is_project_member(project_id)
  );

create policy "proposals_update" on public.proposals
  for update
  using (
    public.is_project_owner(project_id)
    or public.is_project_member(project_id)
  );

-- DELETE 放鬆給所有成員(避免 owner 忙不過來收拾),但只有 owner 能從 project 設定把人踢掉
create policy "proposals_delete" on public.proposals
  for delete
  using (
    public.is_project_owner(project_id)
    or public.is_project_member(project_id)
  );

-- journals -------------------------------------
drop policy if exists "journals_owner_select" on public.journals;
drop policy if exists "journals_owner_insert" on public.journals;
drop policy if exists "journals_owner_update" on public.journals;
drop policy if exists "journals_owner_delete" on public.journals;
drop policy if exists "journals_select" on public.journals;
drop policy if exists "journals_insert" on public.journals;
drop policy if exists "journals_update" on public.journals;
drop policy if exists "journals_delete" on public.journals;

create policy "journals_select" on public.journals
  for select
  using (
    public.is_project_owner(project_id)
    or public.is_project_member(project_id)
  );

create policy "journals_insert" on public.journals
  for insert
  with check (
    public.is_project_owner(project_id)
    or public.is_project_member(project_id)
  );

create policy "journals_update" on public.journals
  for update
  using (
    public.is_project_owner(project_id)
    or public.is_project_member(project_id)
  );

-- journals 是會議紀錄本身(逐字稿+摘要),DELETE 保守點只給 owner
create policy "journals_delete" on public.journals
  for delete
  using (public.is_project_owner(project_id));

-- project_members ------------------------------
drop policy if exists "members_select" on public.project_members;
drop policy if exists "members_insert" on public.project_members;
drop policy if exists "members_delete" on public.project_members;

-- 可見:自己是成員(看到自己被邀請的專案)、或自己是該專案的 owner
create policy "members_select" on public.project_members
  for select
  using (
    member_email = auth.jwt()->>'email'
    or public.is_project_owner(project_id)
  );

-- 只有 owner 能加/刪成員
create policy "members_insert" on public.project_members
  for insert
  with check (public.is_project_owner(project_id));

create policy "members_delete" on public.project_members
  for delete
  using (public.is_project_owner(project_id));

-- ─────────────────────────────────────────────
-- 4) Backfill:既有專案的 owner 也要加進 project_members
--    (這樣 is_project_member 對 owner 也回 true,檢查統一走同一條路)
--    不過 policy 已經 owner OR member 了,這步其實可選 — 我們跳過。
-- ─────────────────────────────────────────────

-- 不 backfill owner → member。owner 走 is_project_owner 這條路,不需要在 members 表佔位。

-- ─────────────────────────────────────────────
-- 驗證用(migration 跑完可以手動執行):
-- ─────────────────────────────────────────────
--
-- 確認表與 RLS:
--   select tablename, rowsecurity from pg_tables
--    where schemaname='public' and tablename in ('projects','proposals','journals','project_members');
--
-- 確認 policies 數量(應該 4 tables × 4 或 3 policies):
--   select tablename, policyname, cmd from pg_policies
--    where schemaname='public' order by tablename, cmd;
--
-- 確認 helper functions 存在:
--   select proname, prosecdef from pg_proc
--    where proname in ('is_project_owner','is_project_member');
--
-- 自己測試:
--   select public.is_project_owner('某專案6碼代碼');  -- 應該回 true(因為你是 owner)
--   select public.is_project_member('某專案6碼代碼'); -- false(你還沒把自己加成 member)
