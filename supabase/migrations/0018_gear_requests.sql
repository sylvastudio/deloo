-- 0018: "Can't find it? Tell us" on the Gear tab (Phase 1, 10 Oct 2026).
-- Run in the Supabase SQL Editor after 0014 (it does not depend on 0015-0017). Safe to re-run.
--
-- A renter who searches the Gear tab and finds nothing can ask for it. The request goes to unmet_demand
-- (reason 'not_stocked'), the list the planner already fills, so Ops reads one list of what to stock.
-- Until now a row needed a plan (event) the renter owns; a request from search has none, so it must be
-- the renter's own row instead (profile_id defaults to auth.uid(), 0011). Ops still reads them all.

drop policy if exists unmet_insert on public.unmet_demand;
create policy unmet_insert on public.unmet_demand for insert to authenticated
  with check (
    (event_id is not null and private.owns_event(event_id))
    or (event_id is null and profile_id = auth.uid())
  );

-- The free text lives in spec; keep one request to a sensible size.
alter table public.unmet_demand drop constraint if exists unmet_demand_spec_size;
alter table public.unmet_demand add constraint unmet_demand_spec_size check (pg_column_size(spec) <= 4000) not valid;
