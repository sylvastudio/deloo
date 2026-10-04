-- Phase 4 print sizes (lib/posters/render.ts PRINT_SIZES). Print files are high-quality JPEGs:
-- PNG with paper grain would be 50 MB+ at flex-banner size.

alter type public.asset_size add value if not exists 'a5_handbill_bleed';
alter type public.asset_size add value if not exists 'flex_3x6ft';
alter type public.asset_size add value if not exists 'flex_4x8ft';
alter type public.asset_size add value if not exists 'rollup_85x200cm';

update storage.buckets
   set allowed_mime_types = array['image/png', 'image/jpeg', 'application/pdf']
 where id = 'print';
