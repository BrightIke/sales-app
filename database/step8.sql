-- =====================================================
-- STEP 8: analytics_summary function
-- Paste into Supabase > SQL Editor > New query > Run (once)
-- =====================================================
-- Does all the number-crunching inside the database and returns one
-- small package of results, so the page stays fast however many sales
-- a business has. Only owners and managers can use it.
-- It takes your timezone so "busiest hour" matches your local clock.

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
    select * from sales where business_id = biz and created_at >= s
  ),
  prev as (
    select * from sales where business_id = biz and created_at >= ps and created_at < s
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
               sum(si.line_total - si.unit_cost * si.quantity) as profit
        from sale_items si
        join cur c on c.id = si.sale_id
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
        select i.name, i.stock_qty as qty, i.stock_qty * i.cost_price as value
        from items i
        where i.business_id = biz and i.is_active and i.track_stock and i.stock_qty > 0
          and not exists (
            select 1 from sale_items si
            join cur c on c.id = si.sale_id
            where si.item_id = i.id)
        order by i.stock_qty * i.cost_price desc
        limit 5
      ) d)
  ) into result;

  return result;
end;
$$;
