-- Logo fidelity (PRD Phase 3 "done when", revised 4 Oct 2026): every export records which approved
-- logo variant it used and that file's SHA-256, instead of claiming the PNG contains the upload byte for byte.
-- brand_kits.logos stays jsonb; it now holds variant objects (see lib/posters/logos.ts). Old string entries still read.

alter table public.assets
  add column if not exists logo_variant_id text,
  add column if not exists logo_sha256 text check (logo_sha256 is null or logo_sha256 ~ '^[0-9a-f]{64}$');
