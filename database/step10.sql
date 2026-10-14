-- =====================================================
-- STEP 10: staff accounts + security lockdown
-- Paste into Supabase > SQL Editor > New query > Run (once)
-- =====================================================
-- What this does:
--  1. Hides cost prices and profit figures from cashiers at the DATABASE level
--     (moved into tables only owners and managers can read).
--  2. Removes the browser's ability to write to tables directly. Every change
--     now goes through a checked function.
--  3. Adds staff invitations, roles, and team management.
-- Your existing data is kept and moved across automatically.

-- ---------- 1. ROLE HELPERS ----------

create or replace function my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(my_role() in ('owner','manager'), false)
$$;

-- ---------- 2. COST TABLES (owners and managers only) ----------

create table if not exists item_costs (
  item_id uuid primary key references items(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  cost_price numeric(12,2) not null default 0
);

create table if not exists sale_costs (
  sale_id uuid primary key references sales(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  total_cost numeric(12,2) not null default 0
);

create table if not exists sale_item_costs (
  sale_item_id uuid primary key references sale_items(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  unit_cost numeric(12,2) not null default 0
);

-- Move the existing cost data across, then remove the old columns.
-- (Safe to re-run: it only does this if the old columns still exist.)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'items' and column_name = 'cost_price'
  ) then
    insert into item_costs (item_id, business_id, cost_price)
      select id, business_id, cost_price from items
      on conflict do nothing;
    insert into sale_costs (sale_id, business_id, total_cost)
      select id, business_id, total_cost from sales
      on conflict do nothing;
    insert into sale_item_costs (sale_item_id, business_id, unit_cost)
      select id, business_id, unit_cost from sale_items
      on conflict do nothing;

    alter table items drop column cost_price;
    alter table sales drop column total_cost;
    alter table sale_items drop column unit_cost;
  end if;
end $$;

alter table item_costs enable row level security;
alter table sale_costs enable row level security;
alter table sale_item_costs enable row level security;

drop policy if exists "item_costs_select" on item_costs;
create policy "item_costs_select" on item_costs
  for select to authenticated
  using (business_id = my_business_id() and is_manager());

drop policy if exists "sale_costs_select" on sale_costs;
create policy "sale_costs_select" on sale_costs
  for select to authenticated
  using (business_id = my_business_id() and is_manager());

drop policy if exists "sale_item_costs_select" on sale_item_costs;
create policy "sale_item_costs_select" on sale_item_costs
  for select to authenticated
  using (business_id = my_business_id() and is_manager());

-- ---------- 3. READ-ONLY POLICIES ----------
-- Replace the old "can do anything" policies with read-only ones.

do $$
declare t text;
begin
  foreach t in array array['items','customers','sales','sale_items']
  loop
    execute format('drop policy if exists "%1$s_isolation" on %1$I', t);
    execute format('drop policy if exists "%1$s_select" on %1$I', t);
    execute format(
      'create policy "%1$s_select" on %1$I for select to authenticated
         using (business_id = my_business_id())', t);
  end loop;
end $$;

-- Expenses and stock history are for owners and managers only
drop policy if exists "expenses_isolation" on expenses;
drop policy if exists "expenses_select" on expenses;
create policy "expenses_select" on expenses
  for select to authenticated
  using (business_id = my_business_id() and is_manager());

drop policy if exists "stock_movements_isolation" on stock_movements;
drop policy if exists "stock_movements_select" on stock_movements;
create policy "stock_movements_select" on stock_movements
  for select to authenticated
  using (business_id = my_business_id() and is_manager());

-- Nobody can rename a business straight from the browser any more
drop policy if exists "businesses_update" on businesses;

-- ---------- 4. SECURE FUNCTIONS FOR EVERY WRITE ----------

-- Create or edit an item (owners and managers)
create or replace function save_item(
  p_id uuid,
  p_name text,
  p_item_type text,
  p_category text,
  p_barcode text,
  p_cost numeric,
  p_price numeric,
  p_opening_stock numeric,
  p_reorder numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid := my_business_id();
  tracked boolean;
  v_item uuid;
begin
  if biz is null or not is_manager() then
    raise exception 'Only owners and managers can change items';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Enter an item name';
  end if;
  if p_item_type not in ('product','service','timed_service') then
    raise exception 'Invalid item type';
  end if;
  if coalesce(p_price, 0) < 0 or coalesce(p_cost, 0) < 0 then
    raise exception 'Prices cannot be negative';
  end if;

  tracked := (p_item_type = 'product');

  if p_id is null then
    insert into items
      (business_id, name, item_type, category, barcode, selling_price,
       stock_qty, reorder_level, track_stock)
    values
      (biz, trim(p_name), p_item_type, nullif(trim(p_category), ''), nullif(trim(p_barcode), ''),
       coalesce(p_price, 0),
       case when tracked then greatest(coalesce(p_opening_stock, 0), 0) else 0 end,
       case when tracked then greatest(coalesce(p_reorder, 0), 0) else 0 end,
       tracked)
    returning id into v_item;

    insert into item_costs (item_id, business_id, cost_price)
    values (v_item, biz, coalesce(p_cost, 0));

    if tracked and coalesce(p_opening_stock, 0) > 0 then
      insert into stock_movements (business_id, item_id, change, reason, note, created_by)
      values (biz, v_item, p_opening_stock, 'purchase', 'Opening stock', auth.uid());
    end if;
  else
    update items
    set name = trim(p_name),
        item_type = p_item_type,
        category = nullif(trim(p_category), ''),
        barcode = nullif(trim(p_barcode), ''),
        selling_price = coalesce(p_price, 0),
        reorder_level = case when tracked then greatest(coalesce(p_reorder, 0), 0) else 0 end,
        track_stock = tracked
    where id = p_id and business_id = biz
    returning id into v_item;

    if v_item is null then
      raise exception 'Item not found';
    end if;

    insert into item_costs (item_id, business_id, cost_price)
    values (v_item, biz, coalesce(p_cost, 0))
    on conflict (item_id) do update set cost_price = excluded.cost_price;
  end if;

  return v_item;
end;
$$;

-- Archive an item (owners and managers)
create or replace function archive_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if my_business_id() is null or not is_manager() then
    raise exception 'Only owners and managers can archive items';
  end if;
  update items set is_active = false where id = p_id and business_id = my_business_id();
end;
$$;

-- Create or edit a customer (everyone on the team; balance can NOT be set here)
create or replace function save_customer(
  p_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_birthday date,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid := my_business_id();
  v_id uuid;
begin
  if auth.uid() is null or biz is null then
    raise exception 'Not allowed';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Enter the customer name';
  end if;

  if p_id is null then
    insert into customers (business_id, name, phone, email, birthday, notes)
    values (biz, trim(p_name), nullif(trim(p_phone), ''), nullif(trim(p_email), ''),
            p_birthday, nullif(trim(p_notes), ''))
    returning id into v_id;
  else
    update customers
    set name = trim(p_name),
        phone = nullif(trim(p_phone), ''),
        email = nullif(trim(p_email), ''),
        birthday = p_birthday,
        notes = nullif(trim(p_notes), '')
    where id = p_id and business_id = biz
    returning id into v_id;

    if v_id is null then
      raise exception 'Customer not found';
    end if;
  end if;

  return v_id;
end;
$$;

-- Expenses (owners and managers)
create or replace function add_expense(
  p_category text,
  p_description text,
  p_amount numeric,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if my_business_id() is null or not is_manager() then
    raise exception 'Only owners and managers can record expenses';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount above zero';
  end if;
  insert into expenses (business_id, category, description, amount, expense_date, created_by)
  values (my_business_id(), p_category, nullif(trim(p_description), ''), p_amount,
          coalesce(p_date, current_date), auth.uid());
end;
$$;

create or replace function delete_expense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if my_business_id() is null or not is_manager() then
    raise exception 'Only owners and managers can delete expenses';
  end if;
  delete from expenses where id = p_id and business_id = my_business_id();
end;
$$;

-- ---------- 5. STAFF: INVITES AND TEAM ----------

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  email text not null,
  role text not null check (role in ('manager','cashier')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists invites_pending
  on invites (business_id, lower(email)) where accepted_at is null;

alter table invites enable row level security;

drop policy if exists "invites_select_owner" on invites;
create policy "invites_select_owner" on invites
  for select to authenticated
  using (business_id = my_business_id() and my_role() = 'owner');

-- Owner invites someone by email
create or replace function invite_staff(p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid := my_business_id();
  em text := lower(trim(coalesce(p_email, '')));
begin
  if biz is null or my_role() <> 'owner' then
    raise exception 'Only the owner can invite staff';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if p_role not in ('manager','cashier') then
    raise exception 'Role must be manager or cashier';
  end if;
  if exists (
    select 1 from memberships m
    join auth.users u on u.id = m.user_id
    where m.business_id = biz and lower(u.email) = em
  ) then
    raise exception 'That person is already on your team';
  end if;

  insert into invites (business_id, email, role, invited_by)
  values (biz, em, p_role, auth.uid())
  on conflict (business_id, lower(email)) where accepted_at is null
  do update set role = excluded.role;
end;
$$;

create or replace function revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if my_business_id() is null or my_role() <> 'owner' then
    raise exception 'Only the owner can cancel invites';
  end if;
  delete from invites
  where id = p_invite_id and business_id = my_business_id() and accepted_at is null;
end;
$$;

-- Invitations waiting for the logged-in person (matched by their email)
create or replace function my_invites()
returns table (invite_id uuid, biz_id uuid, business_name text, invite_role text)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.business_id, b.name, i.role
  from invites i
  join businesses b on b.id = i.business_id
  where i.accepted_at is null
    and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function accept_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invites%rowtype;
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    raise exception 'You must be logged in';
  end if;

  select * into inv
  from invites
  where id = p_invite_id and accepted_at is null and lower(email) = em
  for update;

  if not found then
    raise exception 'Invitation not found or already used';
  end if;

  insert into memberships (user_id, business_id, role)
  values (auth.uid(), inv.business_id, inv.role)
  on conflict (user_id, business_id) do update set role = excluded.role;

  update invites set accepted_at = now() where id = inv.id;

  insert into profiles (id, business_id, full_name, role)
  values (auth.uid(), inv.business_id,
          auth.jwt() -> 'user_metadata' ->> 'full_name', inv.role)
  on conflict (id) do update
    set business_id = inv.business_id, role = inv.role;
end;
$$;

-- Everyone on the current business (owner only)
create or replace function list_team()
returns table (
  member_id uuid,
  full_name text,
  email text,
  member_role text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  biz uuid := my_business_id();
begin
  if biz is null or my_role() <> 'owner' then
    raise exception 'Only the owner can view the team';
  end if;

  return query
    select m.user_id, p.full_name, u.email::text, m.role, m.created_at
    from memberships m
    join auth.users u on u.id = m.user_id
    left join profiles p on p.id = m.user_id
    where m.business_id = biz
    order by m.created_at;
end;
$$;

create or replace function set_member_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid := my_business_id();
begin
  if biz is null or my_role() <> 'owner' then
    raise exception 'Only the owner can change roles';
  end if;
  if p_role not in ('manager','cashier') then
    raise exception 'Role must be manager or cashier';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;

  update memberships set role = p_role
  where user_id = p_user_id and business_id = biz and role <> 'owner';
  if not found then
    raise exception 'Team member not found';
  end if;

  update profiles set role = p_role where id = p_user_id and business_id = biz;
end;
$$;

create or replace function remove_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid := my_business_id();
begin
  if biz is null or my_role() <> 'owner' then
    raise exception 'Only the owner can remove team members';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot remove yourself';
  end if;

  delete from memberships
  where user_id = p_user_id and business_id = biz and role <> 'owner';
  if not found then
    raise exception 'Team member not found';
  end if;

  -- Move them to another business they belong to, or to none
  update profiles p
  set business_id = m.business_id, role = m.role
  from (
    select business_id, role from memberships
    where user_id = p_user_id order by created_at limit 1
  ) m
  where p.id = p_user_id and p.business_id = biz;

  update profiles set business_id = null where id = p_user_id and business_id = biz;
end;
$$;

-- ---------- 6. UPDATED FUNCTIONS (now use the cost tables) ----------

create or replace function record_sale(
  p_items jsonb,
  p_payment_method text,
  p_customer_id uuid default null,
  p_amount_paid numeric default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid := my_business_id();
  new_sale uuid;
  rec jsonb;
  it items%rowtype;
  qty numeric;
  v_total numeric := 0;
  v_cost numeric := 0;
  paid numeric;
  v_line uuid;
  v_unit_cost numeric;
begin
  if auth.uid() is null or biz is null then
    raise exception 'Not allowed';
  end if;

  if p_payment_method not in ('cash','transfer','card','credit') then
    raise exception 'Invalid payment method';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the sale';
  end if;

  if p_payment_method = 'credit' and p_customer_id is null then
    raise exception 'Choose a customer for a credit sale';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from customers where id = p_customer_id and business_id = biz
  ) then
    raise exception 'Customer not found';
  end if;

  insert into sales (business_id, customer_id, cashier_id, payment_method, note)
  values (biz, p_customer_id, auth.uid(), p_payment_method, p_note)
  returning id into new_sale;

  for rec in select * from jsonb_array_elements(p_items)
  loop
    qty := (rec->>'quantity')::numeric;
    if qty is null or qty <= 0 then
      raise exception 'Quantity must be more than zero';
    end if;

    select * into it
    from items
    where id = (rec->>'item_id')::uuid and business_id = biz and is_active
    for update;

    if not found then
      raise exception 'Item not found';
    end if;

    if it.track_stock and it.stock_qty < qty then
      raise exception 'Not enough stock for %', it.name;
    end if;

    select coalesce(cost_price, 0) into v_unit_cost from item_costs where item_id = it.id;
    v_unit_cost := coalesce(v_unit_cost, 0);

    insert into sale_items
      (business_id, sale_id, item_id, item_name, quantity, unit_price, line_total)
    values
      (biz, new_sale, it.id, it.name, qty, it.selling_price, it.selling_price * qty)
    returning id into v_line;

    insert into sale_item_costs (sale_item_id, business_id, unit_cost)
    values (v_line, biz, v_unit_cost);

    v_total := v_total + it.selling_price * qty;
    v_cost := v_cost + v_unit_cost * qty;

    if it.track_stock then
      update items set stock_qty = stock_qty - qty where id = it.id;
      insert into stock_movements (business_id, item_id, change, reason, created_by)
      values (biz, it.id, -qty, 'sale', auth.uid());
    end if;
  end loop;

  if p_payment_method = 'credit' then
    paid := least(greatest(coalesce(p_amount_paid, 0), 0), v_total);
  else
    paid := v_total;
  end if;

  update sales
  set total = v_total, amount_paid = paid
  where id = new_sale;

  insert into sale_costs (sale_id, business_id, total_cost)
  values (new_sale, biz, v_cost);

  if v_total - paid > 0 and p_customer_id is not null then
    update customers
    set balance_owed = balance_owed + (v_total - paid)
    where id = p_customer_id;
  end if;

  return new_sale;
end;
$$;

create or replace function adjust_stock(
  p_item_id uuid,
  p_change numeric,
  p_reason text,
  p_note text default null,
  p_new_cost numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid := my_business_id();
  r text;
  it items%rowtype;
begin
  select role into r from profiles where id = auth.uid();

  if biz is null or r not in ('owner','manager') then
    raise exception 'Only owners and managers can change stock';
  end if;

  if p_reason not in ('purchase','adjustment','waste','return') then
    raise exception 'Invalid reason';
  end if;

  if p_change is null or p_change = 0 then
    raise exception 'Enter a quantity';
  end if;

  select * into it
  from items
  where id = p_item_id and business_id = biz and is_active
  for update;

  if not found then
    raise exception 'Item not found';
  end if;

  if not it.track_stock then
    raise exception 'This item does not track stock';
  end if;

  if it.stock_qty + p_change < 0 then
    raise exception 'Stock cannot go below zero';
  end if;

  update items set stock_qty = stock_qty + p_change where id = it.id;

  if p_new_cost is not null then
    insert into item_costs (item_id, business_id, cost_price)
    values (it.id, biz, p_new_cost)
    on conflict (item_id) do update set cost_price = excluded.cost_price;
  end if;

  insert into stock_movements (business_id, item_id, change, reason, note, created_by)
  values (biz, it.id, p_change, p_reason, p_note, auth.uid());
end;
$$;

create or replace function analytics_summary(
  p_days int default 30,
  p_tz text default 'UTC'
)
returns jsonb
language plpgsql
stable
as $$
declare
  biz uuid := my_business_id();
  r text;
  local_start timestamp;
  s timestamptz;
  ps timestamptz;
  result jsonb;
begin
  select role into r from profiles where id = auth.uid();

  if biz is null or r not in ('owner','manager') then
    raise exception 'Only owners and managers can view analytics';
  end if;

  p_days := least(greatest(p_days, 1), 365);

  -- start of the window (and of the previous window) in the business's local time
  local_start := date_trunc('day', now() at time zone p_tz) - make_interval(days => p_days - 1);
  s  := local_start at time zone p_tz;
  ps := (local_start - make_interval(days => p_days)) at time zone p_tz;

  with cur as (
    select s2.*, coalesce(sc.total_cost, 0) as total_cost
    from sales s2
    left join sale_costs sc on sc.sale_id = s2.id
    where s2.business_id = biz and s2.created_at >= s
  ),
  prev as (
    select s2.*, coalesce(sc.total_cost, 0) as total_cost
    from sales s2
    left join sale_costs sc on sc.sale_id = s2.id
    where s2.business_id = biz and s2.created_at >= ps and s2.created_at < s
  ),
  daily as (
    select
      d::date as day,
      coalesce(sum(c.total), 0) as revenue,
      coalesce(sum(c.total - c.total_cost), 0) as profit
    from generate_series(local_start::date, (now() at time zone p_tz)::date, interval '1 day') d
    left join cur c on (c.created_at at time zone p_tz)::date = d::date
    group by d
  )
  select jsonb_build_object(
    'days', p_days,

    'totals', (
      select jsonb_build_object(
        'revenue', coalesce(sum(total), 0),
        'profit', coalesce(sum(total - total_cost), 0),
        'transactions', count(*))
      from cur),

    'previous', (
      select jsonb_build_object(
        'revenue', coalesce(sum(total), 0),
        'profit', coalesce(sum(total - total_cost), 0),
        'transactions', count(*))
      from prev),

    'expenses', (
      select coalesce(sum(amount), 0)
      from expenses
      where business_id = biz and expense_date >= local_start::date),

    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', day, 'revenue', revenue, 'profit', profit) order by day), '[]'::jsonb)
      from daily),

    -- average revenue for each day of the week (1 = Monday ... 7 = Sunday)
    'weekday', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'dow', dow, 'avg_revenue', avg_rev) order by dow), '[]'::jsonb)
      from (
        select extract(isodow from day)::int as dow, avg(revenue) as avg_rev
        from daily group by 1
      ) w),

    'hourly', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'hour', h, 'revenue', revenue, 'cnt', cnt) order by h), '[]'::jsonb)
      from (
        select extract(hour from created_at at time zone p_tz)::int as h,
               sum(total) as revenue, count(*) as cnt
        from cur group by 1
      ) x),

    'top_items', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.revenue desc), '[]'::jsonb)
      from (
        select si.item_name as name,
               sum(si.quantity) as qty,
               sum(si.line_total) as revenue,
               sum(si.line_total - coalesce(sic.unit_cost, 0) * si.quantity) as profit
        from sale_items si
        join cur c on c.id = si.sale_id
        left join sale_item_costs sic on sic.sale_item_id = si.id
        group by si.item_name
        order by sum(si.line_total) desc
        limit 8
      ) t),

    'payments', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.total desc), '[]'::jsonb)
      from (
        select payment_method as method, sum(total) as total, count(*) as cnt
        from cur group by 1
      ) p),

    -- products with stock on the shelf that have not sold at all in this window
    'dead_stock', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.value desc), '[]'::jsonb)
      from (
        select i.name, i.stock_qty as qty, i.stock_qty * coalesce(ic.cost_price, 0) as value
        from items i
        left join item_costs ic on ic.item_id = i.id
        where i.business_id = biz and i.is_active and i.track_stock and i.stock_qty > 0
          and not exists (
            select 1 from sale_items si
            join cur c on c.id = si.sale_id
            where si.item_id = i.id)
        order by i.stock_qty * coalesce(ic.cost_price, 0) desc
        limit 5
      ) d)
  ) into result;

  return result;
end;
$$;

-- ---------- 7. THE LOCKDOWN ----------
-- The browser can now only READ tables. Every change must go through
-- one of the checked functions above. Even if someone tampers with the
-- app in their browser, the database refuses direct writes.

revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from authenticated;

alter default privileges in schema public
  revoke insert, update, delete on tables from anon, authenticated;

-- Only logged-in users may call our functions (not anonymous visitors)
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public
  revoke execute on functions from public, anon;

-- Make the API notice the new tables and functions straight away
notify pgrst, 'reload schema';
