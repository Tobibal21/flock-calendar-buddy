
-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  farm_name text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- auto create profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, farm_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), 'My Farm')
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- flocks
create table public.flocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  breed text,
  bird_type text not null default 'layer', -- layer, broiler, mixed
  initial_count integer not null default 0,
  current_count integer not null default 0,
  mortality_count integer not null default 0,
  date_acquired date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.flocks enable row level security;
create policy "own flocks all" on public.flocks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index flocks_user_idx on public.flocks(user_id);

-- production records
create table public.production_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  flock_id uuid references public.flocks(id) on delete cascade,
  record_date date not null default current_date,
  eggs_collected integer not null default 0,
  broken_eggs integer not null default 0,
  feed_kg numeric(10,2) default 0,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.production_records enable row level security;
create policy "own production all" on public.production_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index production_user_date_idx on public.production_records(user_id, record_date desc);

-- vaccinations
create table public.vaccinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  flock_id uuid references public.flocks(id) on delete cascade,
  vaccine_name text not null,
  scheduled_date date not null,
  administered boolean not null default false,
  administered_date date,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.vaccinations enable row level security;
create policy "own vaccinations all" on public.vaccinations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index vaccinations_user_date_idx on public.vaccinations(user_id, scheduled_date);
