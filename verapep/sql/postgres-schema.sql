-- VERAPEP V14 target PostgreSQL schema (production migration target)
-- This file is intentionally not wired into the runtime until a managed PostgreSQL
-- instance and migration window have been provisioned and tested.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE products (
  id text PRIMARY KEY,
  catalogue_name text NOT NULL,
  display_name text,
  category text NOT NULL,
  published boolean NOT NULL DEFAULT false,
  information_only boolean NOT NULL DEFAULT true,
  available_for_sale boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  short_description text,
  full_description text,
  ingredients text,
  storage text,
  usage text,
  warnings text,
  image_url text,
  image_alt text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  catalogue_no text,
  specification text NOT NULL,
  retail_price_cents integer CHECK (retail_price_cents IS NULL OR retail_price_cents > 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  sale_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_variants_product_idx ON product_variants(product_id);

CREATE TABLE product_compliance (
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  country_code char(2) NOT NULL,
  status text NOT NULL CHECK (status IN ('information_only','review_required','approved','blocked')),
  review_reference text,
  reviewed_by text,
  reviewed_at timestamptz,
  notes text,
  PRIMARY KEY (product_id, country_code)
);

CREATE TABLE inventory (
  variant_id text PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
  on_hand integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reserved <= on_hand)
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id text NOT NULL REFERENCES product_variants(id),
  order_id text,
  movement_type text NOT NULL CHECK (movement_type IN ('reserve','release','sale','restock','adjustment')),
  quantity integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_variant_idx ON inventory_movements(variant_id, created_at DESC);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_email_idx ON customers(lower(email));

CREATE TABLE orders (
  id text PRIMARY KEY,
  customer_id uuid REFERENCES customers(id),
  customer_email text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text,
  shipping_address jsonb NOT NULL,
  currency char(3) NOT NULL,
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents integer NOT NULL CHECK (shipping_cents >= 0),
  tax_cents integer NOT NULL CHECK (tax_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  tax_rate numeric(8,6),
  tax_label text,
  destination_country char(2),
  shipping_method jsonb,
  payment_status text NOT NULL,
  order_status text NOT NULL,
  access_token_hash text NOT NULL,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  legal_accepted_at timestamptz NOT NULL,
  reservation_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_customer_email_idx ON orders(lower(customer_email));
CREATE INDEX orders_created_at_idx ON orders(created_at DESC);
CREATE INDEX orders_status_idx ON orders(order_status, created_at DESC);

CREATE TABLE order_items (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id),
  variant_id text NOT NULL REFERENCES product_variants(id),
  product_name text NOT NULL,
  specification text NOT NULL,
  catalogue_no text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents > 0),
  line_total_cents integer NOT NULL CHECK (line_total_cents > 0)
);
CREATE INDEX order_items_order_idx ON order_items(order_id);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES orders(id),
  provider text NOT NULL,
  provider_reference text NOT NULL,
  status text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_reference)
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES orders(id),
  payment_id uuid REFERENCES payments(id),
  provider_reference text,
  status text NOT NULL,
  amount_cents integer,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_reference)
);

CREATE TABLE shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES orders(id),
  carrier text,
  tracking_number text,
  status text NOT NULL DEFAULT 'pending',
  shipped_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE returns (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id),
  status text NOT NULL,
  reason text,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE withdrawals (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id),
  customer_email text NOT NULL,
  status text NOT NULL,
  channel text NOT NULL DEFAULT 'website',
  note text,
  statement text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX withdrawals_active_order_idx ON withdrawals(order_id) WHERE status <> 'withdrawn';

CREATE TABLE order_timeline (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  label text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_timeline_order_idx ON order_timeline(order_id, created_at);

CREATE TABLE admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','editor','support')),
  password_hash text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  mfa_secret text,
  mfa_enabled boolean NOT NULL DEFAULT false,
  recovery_codes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor_email text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);

CREATE TABLE payment_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  payload_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider, event_id)
);

CREATE TABLE idempotency_keys (
  scope text NOT NULL,
  key text NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope, key)
);

CREATE TABLE reviews (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL,
  verified_purchase boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_events (
  id text PRIMARY KEY,
  order_id text REFERENCES orders(id),
  recipient text NOT NULL,
  event_type text NOT NULL,
  subject text NOT NULL,
  delivery_status text NOT NULL,
  provider_reference text,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
