-- ASEAN Mission Control: tables for Supabase Postgres (or any Postgres 13+).
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Then set DATABASE_URL on Vercel to the transaction pooler URL (port 6543).
--
-- Matches backend/app/models.py. The API also creates any missing tables on
-- startup, so running this first is safe: it never drops or changes data.

-- Founder profile ("Founder DNA") extracted from uploaded materials.
create table if not exists founder (
    id           varchar     not null primary key,
    company_name varchar     not null default '',
    dna          json,
    meta         json,
    created_at   timestamptz not null default now()
);

-- A founder's goal in one target market (e.g. Malaysia -> Indonesia).
create table if not exists mission (
    id         varchar     not null primary key,
    founder_id varchar     not null references founder (id),
    origin     varchar     not null,
    target     varchar     not null,
    objective  varchar     not null,
    sector     varchar     not null default 'all',
    created_at timestamptz not null default now()
);
create index if not exists ix_mission_founder_id on mission (founder_id);

-- Launch Passport: requirements assessed for a mission. The latest row per mission is used.
create table if not exists passport (
    id         varchar     not null primary key,
    mission_id varchar     not null references mission (id),
    payload    json,
    gaps       json,
    meta       json,
    created_at timestamptz not null default now()
);
create index if not exists ix_passport_mission_id on passport (mission_id);

-- Consultation requests prepared on the Market desk.
create table if not exists referralrequest (
    id          varchar     not null primary key,
    mission_id  varchar     not null references mission (id),
    referral_id varchar     not null,
    status      varchar     not null default 'referral_prepared',
    pack        json,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists ix_referralrequest_mission_id on referralrequest (mission_id);

-- Progress the founder has saved (requirement reviewed, opportunity saved, ...).
create table if not exists milestone (
    id         varchar     not null primary key,
    mission_id varchar     not null references mission (id),
    kind       varchar     not null,
    label      varchar     not null,
    ref_id     varchar,
    created_at timestamptz not null default now()
);
create index if not exists ix_milestone_mission_id on milestone (mission_id);

-- Supabase exposes tables in "public" through its REST API using the anon key.
-- Only the FastAPI backend should touch this data, so turn on row level security
-- with no policies: REST access is denied, while the backend's database user
-- (the "postgres" role in DATABASE_URL) bypasses RLS and works as before.
alter table founder         enable row level security;
alter table mission         enable row level security;
alter table passport        enable row level security;
alter table referralrequest enable row level security;
alter table milestone       enable row level security;
