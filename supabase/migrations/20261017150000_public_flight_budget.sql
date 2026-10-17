-- Persistent, atomic budget shared by all Edge isolates. No customer/booking data.
begin;
create schema if not exists private;
create table if not exists private.dus_flight_rate_limits (
  bucket text not null check (bucket in ('minute','hour')),
  starts_at timestamptz not null,
  requests integer not null,
  primary key (bucket, starts_at)
);
alter table private.dus_flight_rate_limits enable row level security;
revoke all on private.dus_flight_rate_limits from public, anon, authenticated;
create or replace function public.consume_dus_flight_budget()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  stamp timestamptz := clock_timestamp();
  minute_count integer;
  hour_count integer;
begin
  -- All calls lock minute before hour, so concurrent isolates cannot overspend.
  insert into private.dus_flight_rate_limits as counters (bucket, starts_at, requests)
  values ('minute', date_trunc('minute',stamp), 1)
  on conflict (bucket,starts_at) do update set requests = counters.requests + 1
  returning requests into minute_count;
  insert into private.dus_flight_rate_limits as counters (bucket, starts_at, requests)
  values ('hour', date_trunc('hour',stamp), 1)
  on conflict (bucket,starts_at) do update set requests = counters.requests + 1
  returning requests into hour_count;
  delete from private.dus_flight_rate_limits where starts_at < stamp - interval '2 hours';
  return minute_count <= 120 and hour_count <= 2400;
end;
$$;
revoke all on function public.consume_dus_flight_budget() from public, anon, authenticated;
-- Anon may only consume the same global budget as the public flight handler.
-- No parameters, row reads, reset, customer data or caller-supplied limits.
grant execute on function public.consume_dus_flight_budget() to anon;
commit;
