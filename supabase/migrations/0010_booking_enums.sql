-- Booking and unit stages for real rentals (docs/prd-mvp-rental-ops.md §6). Run after 0009, and on
-- its own: Postgres can't use a new enum value in the same transaction that adds it, and 0011 uses them.

alter type public.booking_status add value if not exists 'expired';
alter type public.booking_status add value if not exists 'preparing';
alter type public.booking_status add value if not exists 'out_for_delivery';
alter type public.booking_status add value if not exists 'delivered';
alter type public.booking_status add value if not exists 'collected';
alter type public.booking_status add value if not exists 'inspected';

alter type public.unit_status add value if not exists 'quarantine';
alter type public.unit_status add value if not exists 'lost';
