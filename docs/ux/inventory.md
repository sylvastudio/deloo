# Deloo screen inventory (reconciled)

**Status:** 9 Oct 2026. Single source of truth for screen IDs. It merges the proposals in
`user-flows.md` §8 (UX research) and `screen-specs.md` §5 (UI design). Original IDs are never renumbered.

## Canonical screens

- **First run:** A1 Welcome · A2 Email (phone number in the pilot) · A3 Code · A4 Name & phone (name only in the pilot) · A5 What brings you here · A6 Vendor details
- **Renter:** R1 Plan home · R2 Voice listening sheet · R3a–R3i Question flow · R4 Missing details · R5 Sizing · R6 Your setup · R7 Why? (inline on R6) · R8 Swap sheet · R9 Nothing available · R10 Share to WhatsApp · R11 Explore · R12 Filters sheet · R13 Item detail · R14 Vendor profile · R15 Review booking sheet · R16 Verify identity gate · R17 Pay (slide to pay lives here) · R18 Success · R19 Bookings list · R20 Booking tracker · R21 Handover checklist (renter) · R22 Rate vendor · R23 Damage claim / dispute · R24 Me (both modes; vendor rows in vendor mode) · R25 Verification tiers · R26 Payment methods · R27 Notifications & settings · R28 Help · R29 Coming soon waitlists (plus a "your city" variant)
- **Vendor:** V1 Today · V2 Booking request **and** booking detail · V3 Calendar · V4 Block dates sheet · V5 Gear list · V6 Add gear: snap photo · V7 Confirm AI suggestion · V8 Price & deposit · V9 Units · V10 Availability presets · V11 Edit item · V12 Handover checklist (vendor) · V13 Raise damage claim · V14 Earnings · V15 Payout account · V16 Vendor profile edit · V17 Approval status · V18 Staff & technicians

## Added screens (final IDs)

| ID | Screen | Type | From | Phase |
|---|---|---|---|---|
| A7 | Permission primer (mic, camera, location, notifications) | sheet | UI | pilot |
| R30 | Add to plan sheet | sheet | UX | pilot (needed for Explore → booking) |
| R31 | Cancel booking sheet | sheet | both | pilot |
| R32 | Replacement offer (rescue guarantee) | screen | both | pilot |
| R33 | Your plans (all) | screen | UI | pilot |
| R34 | "Something's wrong" sheet (event-day problems) | sheet | UX | pilot |
| R35 | Activity inbox (was UX R33) | screen | UX | later |
| R36 | Hold expired (was UI R30) | sheet | UI | pilot |
| V19 | Rate renter (was UI V20) | sheet | UI | pilot |
| V20 | Decline reason sheet (was UI V21) | sheet | UI | pilot |
| S1 | Mode switch transition | system | UI | demo |
| S2 | Update required / maintenance | system | UI | pilot |
| S3 | Notification landing rules (routing, not a screen) | system | UI | pilot |

Not added: the UI designer's separate "vendor booking detail" (UI V19). It is part of **V2**, one screen with states for the booking's whole life.

## Decisions for the founder

1. **Booking timings** (`user-flows.md` §2): vendor accepts within 2 h (30 min for short notice); free cancellation until 72 h before; deposit back within 24 h of a clean return; vendor has 12 h for the return checklist; claims raised within 24 h.
2. **Who shoots the handover photos:** the vendor or technician; the renter reviews and confirms. With no signal, the two phones confirm with a 6-digit handover code.
3. **Tab bar:** the native Android/iOS bar already in the app, instead of the floating pill in the plan (cheaper, works with TalkBack and large fonts).
4. **Technician choice:** a switch on R15 (forced on for tier-3 gear), not a planning question.
5. **Token fixes:** add a darker `greenInk` for badge text (green on its tint is 3.8:1, below AA); `faint` only for placeholders.
6. **No emoji in the UI:** category emoji in the N0 build become Material/SF icons.
