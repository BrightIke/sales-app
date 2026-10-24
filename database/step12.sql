-- =====================================================
-- STEP 12: costs and materials (the cost builder)
-- Paste into Supabase > SQL Editor > New query > Run (once)
-- =====================================================
-- Lets an item's cost price be WORKED OUT from what it uses:
--   * materials   (paper, toner, rice, oil, packaging) bought in packs
--   * extra costs (labour, gas, delivery)
--   * equipment   (printer, pot) spread over how long it lasts
-- plus how many you make at once, and an allowance for waste.
-- Everything here is visible to owners and managers only, never cashiers.
-- Safe to run again.

-- ---------- 1. "Costs and materials" becomes a switchable module ----------
alter table business_modules drop constraint if exists business_modules_module_check;
alter table business_modules add constraint business_modules_module_check
  check (module in ('inventory','money','customers','analytics','costing'));

insert into business_modules (business_id, module)
select id, 'costing' from businesses
on conflict do nothing;

-- ---------- 2. Room for small per-unit costs (e.g. N1.50 a page) ----------
alter table item_costs alter column cost_price type numeric(14,4);
alter table sale_item_costs alter column unit_cost type numeric(14,4);

alter table item_costs add column if not exists cost_mode text not null default 'manual'
  check (cost_mode in ('manual','built'));
alter table item_costs add column if not exists yield_qty numeric(14,4) not null default 1
  check (yield_qty > 0);
alter table item_costs add column if not exists waste_pct numeric(5,2) not null default 0
  check (waste_pct >= 0 and waste_pct <= 100);

-- ---------- 3. Tables ----------

-- Things you use up. You buy a PACK (500 sheets for N6,500); we work out the cost of ONE (N13).
create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  unit text not null default 'piece',
  pack_size numeric(14,4) not null default 1 check (pack_size > 0),
  pack_cost numeric(14,2) not null default 0 check (pack_cost >= 0),
  unit_cost numeric(18,6) generated always as (pack_cost / pack_size) stored,
  track_stock boolean not null default false,
  stock_qty numeric(14,4) not null default 0,
  reorder_level numeric(14,4) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- The cost sheet of an item: one row per material / extra cost / piece of equipment.
-- All amounts are PER BATCH (the batch makes "yield_qty" units, see item_costs).
create table if not exists item_cost_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  kind text not null check (kind in ('material','extra','equipment')),
  material_id uuid references materials(id) on delete restrict,
  label text,
  qty numeric(14,4),               -- material: how much per batch
  cost numeric(14,2),              -- extra: amount per batch.  equipment: purchase price
  lifetime_uses numeric(14,2),     -- equipment: how many batches/uses it lasts
  position int not null default 0,
  constraint line_shape check (
    (kind = 'material'  and material_id is not null and qty is not null and qty > 0)
 or (kind = 'extra'     and cost is not null and cost >= 0 and coalesce(trim(label), '') <> '')
 or (kind = 'equipment' and cost is not null and cost >= 0 and lifetime_uses is not null
                        and lifetime_uses > 0 and coalesce(trim(label), '') <> '')
  )
);

create table if not exists material_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  material_id uuid not null references materials(id) on delete cascade,
  change numeric(14,4) not null,
  reason text not null check (reason in ('purchase','sale','waste','adjustment')),
  note text,
  sale_id uuid references sales(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_materials_business on materials(business_id);
create index if not exists idx_cost_lines_item on item_cost_lines(item_id);
create index if not exists idx_cost_lines_material on item_cost_lines(material_id);
create index if not exists idx_material_moves on material_movements(material_id, created_at desc);

-- ---------- 4. Security: owners and managers only; changes only through the functions below ----------
alter table materials enable row level security;
alter table item_cost_lines enable row level security;
alter table material_movements enable row level security;

drop policy if exists "materials_select" on materials;
create policy "materials_select" on materials
  for select to authenticated using (business_id = my_business_id() and is_manager());
drop policy if exists "item_cost_lines_select" on item_cost_lines;
create policy "item_cost_lines_select" on item_cost_lines
  for select to authenticated using (business_id = my_business_id() and is_manager());
drop policy if exists "material_movements_select" on material_movements;
create policy "material_movements_select" on material_movements
  for select to authenticated using (business_id = my_business_id() and is_manager());

revoke all on materials, item_cost_lines, material_movements from anon;
revoke insert, update, delete, truncate, references, trigger
  on materials, item_cost_lines, material_movements from authenticated;

-- ---------- 5. The cost formula (internal: not callable from the browser) ----------
--   cost per unit = (materials + extra costs + equipment wear per batch) x (1 + waste%) / units per batch
create or replace function compute_item_cost(p_item uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
           case l.kind
             when 'material'  then l.qty * m.unit_cost
             when 'extra'     then l.cost
             when 'equipment' then l.cost / l.lifetime_uses
           end), 0)
         * (1 + c.waste_pct / 100) / c.yield_qty
  from item_costs c
  left join item_cost_lines l on l.item_id = c.item_id
  left join materials m on m.id = l.material_id
  where c.item_id = p_item
  group by c.waste_pct, c.yield_qty
$$;

create or replace function recompute_item_cost(p_item uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update item_costs
  set cost_price = round(coalesce(compute_item_cost(p_item), 0), 4)
  where item_id = p_item and cost_mode = 'built';
end;
$$;

-- ---------- 6. Materials ----------
create or replace function save_material(
  p_id uuid,
  p_name text,
  p_unit text,
  p_pack_size numeric,
  p_pack_cost numeric,
  p_track_stock boolean,
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
  v_id uuid;
  it record;
begin
  if biz is null or not is_manager() then
    raise exception 'Only owners and managers can change materials';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Enter a name for the material';
  end if;
  if coalesce(trim(p_unit), '') = '' then
    raise exception 'Enter the unit, for example sheet, kg or litre';
  end if;
  if p_pack_size is null or p_pack_size <= 0 then
    raise exception 'Enter how many units come in one pack';
  end if;
  if p_pack_cost is null or p_pack_cost < 0 then
    raise exception 'Enter what one pack costs';
  end if;

  if p_id is null then
    insert into materials
      (business_id, name, unit, pack_size, pack_cost, track_stock, stock_qty, reorder_level)
    values
      (biz, trim(p_name), trim(p_unit), p_pack_size, p_pack_cost, coalesce(p_track_stock, false),
       case when coalesce(p_track_stock, false) then greatest(coalesce(p_opening_stock, 0), 0) else 0 end,
       case when coalesce(p_track_stock, false) then greatest(coalesce(p_reorder, 0), 0) else 0 end)
    returning id into v_id;

    if coalesce(p_track_stock, false) and coalesce(p_opening_stock, 0) > 0 then
      insert into material_movements (business_id, material_id, change, reason, note, created_by)
      values (biz, v_id, p_opening_stock, 'purchase', 'Opening stock', auth.uid());
    end if;
  else
    update materials
    set name = trim(p_name),
        unit = trim(p_unit),
        pack_size = p_pack_size,
        pack_cost = p_pack_cost,
        track_stock = coalesce(p_track_stock, false),
        reorder_level = case when coalesce(p_track_stock, false) then greatest(coalesce(p_reorder, 0), 0) else 0 end
    where id = p_id and business_id = biz
    returning id into v_id;

    if v_id is null then
      raise exception 'Material not found';
    end if;

    -- A price change updates the cost of every item that uses this material
    for it in select distinct item_id from item_cost_lines where material_id = v_id loop
      perform recompute_item_cost(it.item_id);
    end loop;
  end if;

  return v_id;
end;
$$;

create or replace function archive_material(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if my_business_id() is null or not is_manager() then
    raise exception 'Only owners and managers can archive materials';
  end if;
  update materials set is_active = false where id = p_id and business_id = my_business_id();
end;
$$;

-- Restock, or correct the count. A restock can also carry the NEW pack price.
create or replace function adjust_material(
  p_material_id uuid,
  p_change numeric,
  p_reason text,
  p_note text default null,
  p_new_pack_cost numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid := my_business_id();
  m materials%rowtype;
  it record;
begin
  if biz is null or not is_manager() then
    raise exception 'Only owners and managers can change material stock';
  end if;
  if p_reason not in ('purchase','waste','adjustment') then
    raise exception 'Invalid reason';
  end if;
  if p_change is null or p_change = 0 then
    raise exception 'Enter a quantity';
  end if;
  if p_new_pack_cost is not null and p_new_pack_cost < 0 then
    raise exception 'The pack price cannot be negative';
  end if;

  select * into m from materials
  where id = p_material_id and business_id = biz and is_active
  for update;

  if not found then
    raise exception 'Material not found';
  end if;
  if not m.track_stock then
    raise exception 'Switch on "keep count" for this material first';
  end if;
  if p_change < 0 and m.stock_qty + p_change < 0 then
    raise exception 'Stock cannot go below zero';
  end if;

  update materials
  set stock_qty = stock_qty + p_change,
      pack_cost = coalesce(p_new_pack_cost, pack_cost)
  where id = m.id;

  insert into material_movements (business_id, material_id, change, reason, note, created_by)
  values (biz, m.id, p_change, p_reason, p_note, auth.uid());

  if p_new_pack_cost is not null and p_new_pack_cost is distinct from m.pack_cost then
    for it in select distinct item_id from item_cost_lines where material_id = m.id loop
      perform recompute_item_cost(it.item_id);
    end loop;
  end if;
end;
$$;

-- ---------- 7. The cost sheet of an item ----------
-- p_mode 'built'  : replace the cost sheet and recompute the item's cost price
-- p_mode 'manual' : stop using the sheet (the last cost price stays until edited)
create or replace function save_cost_sheet(
  p_item_id uuid,
  p_mode text,
  p_yield numeric,
  p_waste numeric,
  p_lines jsonb
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid := my_business_id();
  el jsonb;
  k text;
  v_pos int := 0;
  v_mat uuid;
  v_qty numeric;
  v_cost numeric;
  v_uses numeric;
  v_label text;
  result numeric;
begin
  if biz is null or not is_manager() then
    raise exception 'Only owners and managers can change costs';
  end if;
  if p_mode not in ('manual','built') then
    raise exception 'Invalid costing mode';
  end if;
  if not exists (select 1 from items where id = p_item_id and business_id = biz and is_active) then
    raise exception 'Item not found';
  end if;
  if not exists (select 1 from item_costs where item_id = p_item_id) then
    insert into item_costs (item_id, business_id, cost_price) values (p_item_id, biz, 0);
  end if;

  if p_mode = 'manual' then
    update item_costs set cost_mode = 'manual' where item_id = p_item_id;
    select cost_price into result from item_costs where item_id = p_item_id;
    return result;
  end if;

  if p_yield is null or p_yield <= 0 then
    raise exception 'Enter how many you make at once (more than zero)';
  end if;
  if p_waste is null or p_waste < 0 or p_waste > 100 then
    raise exception 'Waste must be between 0 and 100 percent';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one cost';
  end if;
  if jsonb_array_length(p_lines) > 60 then
    raise exception 'Too many cost lines (the limit is 60)';
  end if;

  delete from item_cost_lines where item_id = p_item_id;

  for el in select * from jsonb_array_elements(p_lines)
  loop
    k := el->>'kind';
    v_pos := v_pos + 1;

    if k = 'material' then
      v_mat := nullif(el->>'material_id', '')::uuid;
      v_qty := nullif(el->>'qty', '')::numeric;
      if v_mat is null or v_qty is null or v_qty <= 0 then
        raise exception 'Choose a material and a quantity above zero';
      end if;
      if not exists (select 1 from materials where id = v_mat and business_id = biz) then
        raise exception 'Material not found';
      end if;
      insert into item_cost_lines (business_id, item_id, kind, material_id, qty, position)
      values (biz, p_item_id, 'material', v_mat, v_qty, v_pos);

    elsif k = 'extra' then
      v_label := trim(coalesce(el->>'label', ''));
      v_cost := nullif(el->>'cost', '')::numeric;
      if v_label = '' or v_cost is null or v_cost < 0 then
        raise exception 'Give each other cost a name and an amount';
      end if;
      insert into item_cost_lines (business_id, item_id, kind, label, cost, position)
      values (biz, p_item_id, 'extra', v_label, v_cost, v_pos);

    elsif k = 'equipment' then
      v_label := trim(coalesce(el->>'label', ''));
      v_cost := nullif(el->>'cost', '')::numeric;
      v_uses := nullif(el->>'lifetime_uses', '')::numeric;
      if v_label = '' or v_cost is null or v_cost < 0 or v_uses is null or v_uses <= 0 then
        raise exception 'Equipment needs a name, a price, and how many uses it lasts';
      end if;
      insert into item_cost_lines (business_id, item_id, kind, label, cost, lifetime_uses, position)
      values (biz, p_item_id, 'equipment', v_label, v_cost, v_uses, v_pos);

    else
      raise exception 'Unknown cost type';
    end if;
  end loop;

  update item_costs
  set cost_mode = 'built', yield_qty = p_yield, waste_pct = p_waste
  where item_id = p_item_id;

  perform recompute_item_cost(p_item_id);

  select cost_price into result from item_costs where item_id = p_item_id;
  return result;
end;
$$;

-- ---------- 8. Updated functions ----------
-- save_item keeps a worked-out cost; record_sale uses up materials; create_business adds the new module

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
    on conflict (item_id) do update
      set cost_price = case when item_costs.cost_mode = 'built'
                            then item_costs.cost_price   -- worked out from its costs: keep it
                            else excluded.cost_price end;
  end if;

  return v_item;
end;
$$;

-- Archive an item (owners and managers)

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
  mat record;
  v_sold numeric;
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

    -- Materials used up by this sale (only items costed from materials, and only
    -- materials that are being counted). Never blocks a sale: if the count was
    -- never restocked it simply goes negative, which the Materials page flags.
    v_sold := qty;
    for mat in
      select l.material_id,
             l.qty * v_sold / c.yield_qty * (1 + c.waste_pct / 100) as use_qty
      from item_cost_lines l
      join materials m on m.id = l.material_id and m.track_stock
      join item_costs c on c.item_id = l.item_id and c.cost_mode = 'built'
      where l.item_id = it.id and l.kind = 'material'
    loop
      update materials set stock_qty = stock_qty - mat.use_qty where id = mat.material_id;
      insert into material_movements (business_id, material_id, change, reason, sale_id, created_by)
      values (biz, mat.material_id, -mat.use_qty, 'sale', new_sale, auth.uid());
    end loop;
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
  v_type text := p_type;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in';
  end if;

  if v_type not in ('retail','restaurant','cyber_cafe','other') then
    v_type := 'other';
  end if;

  insert into businesses (name, business_type)
  values (p_name, v_type)
  returning id into new_id;

  insert into memberships (user_id, business_id, role)
  values (auth.uid(), new_id, 'owner');

  -- Preset: cyber cafes start with stock management switched off
  insert into business_modules (business_id, module, enabled)
  select new_id, m, not (v_type = 'cyber_cafe' and m = 'inventory')
  from unnest(array['inventory','money','customers','analytics','costing']) as m;

  insert into profiles (id, business_id, full_name, role)
  values (auth.uid(), new_id, p_full_name, 'owner')
  on conflict (id) do update
    set business_id = new_id,
        role = 'owner',
        full_name = coalesce(p_full_name, profiles.full_name);

  return new_id;
end;
$$;

-- Switch which business you're working in

-- ---------- 9. Permissions ----------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
-- internal helpers must never be callable from the browser
revoke execute on function compute_item_cost(uuid), recompute_item_cost(uuid) from authenticated;

notify pgrst, 'reload schema';
