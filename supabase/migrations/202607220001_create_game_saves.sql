create table if not exists public.game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  save_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.game_saves enable row level security;

drop policy if exists "Players can read their own save" on public.game_saves;
create policy "Players can read their own save"
on public.game_saves
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Players can create their own save" on public.game_saves;
create policy "Players can create their own save"
on public.game_saves
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Players can update their own save" on public.game_saves;
create policy "Players can update their own save"
on public.game_saves
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.game_saves from anon;
grant select, insert, update on table public.game_saves to authenticated;
