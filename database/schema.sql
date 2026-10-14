-- =====================================================
-- SALES + INVENTORY + CRM APP : DATABASE SCHEMA (Step 1)
-- Paste this whole file into Supabase > SQL Editor > Run
-- =====================================================

-- ---------- 1. TABLES ----------

create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type text not null default 'retail'
    check (business_type in ('retail','restaurant','cyber_cafe','other')),
  currency text not null default 'NGN',
  created_at timestamptz not null default now()
);

-- One profile per logged-in user; links the user to their business and role
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  full_name text,
  role text not null default 'cashier'
    check (role in ('owner','manager','cashier')),
  created_at timestamptz not null default now()
);

-- Everything you sell: products (stock tracked), services, timed services
create table items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  sku text,
  barcode text,
  category text,
  item_type text not null default 'product'
    check (item_type in ('product','service','timed_service')),
  cost_price numeric(12,2) not null default 0,
  selling_price numeric(12,2) not null default 0,
  stock_qty numeric(12,2) not null default 0,
  reorder_level numeric(12,2) not null default 0,
  track_stock boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  birthday date,
  notes text,
  balance_owed numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  cashier_id uuid references profiles(id) on delete set null,
  total numeric(12,2) not null default 0,
  total_cost numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  payment_method text not null default 'cash'
    check (payment_method in ('cash','transfer','card','credit')),
  note text,
  created_at timestamptz not null default now()
);

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  sale_id uuid not null references sales(id) on delete cascade,
  item_id uuid references items(id) on delete set null,
  item_name text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category text not null,
  description text,
  amount numeric(12,2) not null,
  expense_date date not null default current_date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Every stock change is recorded here (purchases, sales, waste, corrections)
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  change numeric(12,2) not null,
  reason text not null
    check (reason in ('purchase','sale','adjustment','waste','return')),
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- 2. INDEXES (keeps things fast as data grows) ----------

create index idx_items_business on items(business_id);
create index idx_customers_business on customers(business_id);
create index idx_sales_business_date on sales(business_id, created_at desc);
create index idx_sale_items_sale on sale_items(sale_id);
create index idx_expenses_business_date on expenses(business_id, expense_date desc);
create index idx_stock_movements_item on stock_movements(item_id, created_at desc);

-- ---------- 3. HELPER: which business does the current user belong to? ----------

create or replace function my_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id from profiles where id = auth.uid()
$$;

-- ---------- 4. SECURITY: each business can only see its own data ----------

alter table businesses enable row level security;
alter table profiles enable row level security;

create policy "businesses_select" on businesses
  for select to authenticated using (id = my_business_id());
create policy "businesses_update" on businesses
  for update to authenticated using (id = my_business_id());

create policy "profiles_select" on profiles
  for select to authenticated
  using (id = auth.uid() or business_id = my_business_id());
create policy "profiles_update_self" on profiles
  for update to authenticated using (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['items','customers','sales','sale_items','expenses','stock_movements']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "%1$s_isolation" on %1$I for all to authenticated
         using (business_id = my_business_id())
         with check (business_id = my_business_id())', t);
  end loop;
end $$;

-- ---------- 5. SIGN-UP FUNCTION: creates a business + makes the user its owner ----------

create or replace function create_business(
  p_name text,
  p_type text default 'retail',
  p_full_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in';
  end if;

  if exists (select 1 from profiles where id = auth.uid() and business_id is not null) then
    raise exception 'This user already has a business';
  end if;

  insert into businesses (name, business_type)
  values (p_name, p_type)
  returning id into new_id;

  insert into profiles (id, business_id, full_name, role)
  values (auth.uid(), new_id, p_full_name, 'owner')
  on conflict (id) do update
    set business_id = new_id, role = 'owner', full_name = p_full_name;

  return new_id;
end;
$$;
