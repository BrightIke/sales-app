-- =====================================================
-- STEP 7: customers and debt tracking
-- Paste into Supabase > SQL Editor > New query > Run (once)
-- =====================================================

-- ---------- 1. Debt payments ----------
create table customer_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash','transfer','card')),
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_customer_payments_customer on customer_payments(customer_id, created_at desc);

alter table customer_payments enable row level security;

-- The app can READ payments, but can only CREATE them through
-- record_payment below, so the balance can never go out of sync.
create policy "customer_payments_select" on customer_payments
  for select to authenticated using (business_id = my_business_id());

-- ---------- 2. Record a payment against a customer's debt ----------
create or replace function record_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_method text default 'cash',
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid := my_business_id();
  c customers%rowtype;
begin
  if auth.uid() is null or biz is null then
    raise exception 'Not allowed';
  end if;

  if p_method not in ('cash','transfer','card') then
    raise exception 'Invalid payment method';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount above zero';
  end if;

  select * into c
  from customers
  where id = p_customer_id and business_id = biz
  for update;

  if not found then
    raise exception 'Customer not found';
  end if;

  if p_amount > c.balance_owed then
    raise exception 'That is more than the customer owes (%)', c.balance_owed;
  end if;

  insert into customer_payments (business_id, customer_id, amount, payment_method, note, created_by)
  values (biz, c.id, p_amount, p_method, p_note, auth.uid());

  update customers set balance_owed = balance_owed - p_amount where id = c.id;
end;
$$;

-- ---------- 3. Per-customer stats (visits, total spent, last purchase) ----------
-- security_invoker makes the view respect the same privacy rules as the tables.
create or replace view customer_stats
with (security_invoker = true) as
select
  c.id as customer_id,
  count(s.id) as visits,
  coalesce(sum(s.total), 0) as total_spent,
  max(s.created_at) as last_purchase
from customers c
left join sales s on s.customer_id = c.id
group by c.id;
