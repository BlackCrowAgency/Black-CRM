-- Black CRM · esquema base para PostgreSQL (versión real).
-- El stock no se guarda: se calcula sumando movimientos (vista stock_actual).

create table locations (
  id text primary key,
  name text not null,
  kind text not null default 'tienda',
  timezone text not null default 'America/Lima'
);

create table suppliers (
  id text primary key,
  name text not null,
  email text,
  lead_time_days integer not null default 7,
  order_channel text not null default 'email'
);

create table products (
  sku text primary key,
  name text not null,
  category text not null,
  image_url text,
  price numeric(12, 2) not null,
  unit_cost numeric(12, 2) not null,
  pack_size integer not null default 1,
  supplier_id text references suppliers (id),
  active boolean not null default true
);

create table movements (
  id bigserial primary key,
  external_id text not null,
  source text not null,
  type text not null check (type in ('venta', 'recepcion', 'devolucion', 'ajuste', 'transferencia')),
  sku text not null references products (sku),
  location_id text not null references locations (id),
  quantity integer not null check (quantity <> 0),
  channel text,
  reference text,
  note text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

create index movements_sku_time on movements (sku, location_id, occurred_at);

create table purchase_orders (
  id text primary key,
  sku text not null references products (sku),
  location_id text not null references locations (id),
  supplier_id text not null references suppliers (id),
  quantity integer not null check (quantity > 0),
  status text not null default 'enviada',
  created_at timestamptz not null default now(),
  expected_at timestamptz,
  received_at timestamptz
);

create table reminders (
  sku text not null references products (sku),
  location_id text not null references locations (id),
  until timestamptz not null,
  primary key (sku, location_id)
);

create view stock_actual as
select sku, location_id, sum(quantity)::integer as disponible, max(occurred_at) as ultimo_movimiento
from movements
group by sku, location_id;

-- Ventas diarias (base del pronóstico).
create view ventas_diarias as
select sku, location_id, (occurred_at at time zone 'America/Lima')::date as dia, -sum(quantity)::integer as unidades
from movements
where type = 'venta'
group by 1, 2, 3;
