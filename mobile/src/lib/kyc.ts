import { useFocusEffect } from 'expo-router';
import { useCallback, useState, useSyncExternalStore } from 'react';

import type { DraftLine } from './booking-draft';
import { rpcLines } from './bookings';
import { uuid } from './handover';
import { readPhoto } from './kyc-files';
import { useSession } from './session';
import { supabase } from './supabase';

/**
 * Renter ID check, manual path (docs/kyc-contract.md "Renter app", UX in docs/ux-kyc-protection.md §3–4).
 * The renter photographs their ID (front, and back for a driver's licence or voter's card) and a selfie
 * holding it; the photos go to the private `kyc-documents` bucket under `<uid>/<folder>/` and
 * submit_kyc records the submission. Staff approve in the admin portal before any gear leaves.
 */

export type KycStatus = 'none' | 'pending' | 'needs_more' | 'verified' | 'rejected';
export type IdType = 'nin_slip' | 'drivers_licence' | 'voters_card' | 'passport';
export type KycReason = 'blurry' | 'glare' | 'id_expired' | 'face_unclear' | 'name_mismatch' | 'id_not_accepted' | 'other';

/** Shown on verify/index as the consent the renter ticks; stored with the submission. */
export const CONSENT_VERSION = 'kyc-2026-10';
export const PRIVACY_URL = 'https://deloo.space/privacy';

export const ID_TYPES: { key: IdType; label: string; back: boolean }[] = [
  { key: 'nin_slip', label: 'NIN slip', back: false },
  { key: 'drivers_licence', label: 'Driver’s licence', back: true },
  { key: 'voters_card', label: 'Voter’s card', back: true },
  { key: 'passport', label: 'Passport', back: false },
];
export const needsBack = (t: IdType | undefined) => !!ID_TYPES.find((x) => x.key === t)?.back;

// ---------------------------------------------------------------------------
// The gate (kyc_gate): what this basket needs before Pay
// ---------------------------------------------------------------------------
export type KycGate = {
  /** 1: phone sign-in is enough; 2: ID check; 3: ID check plus history or a staff call. */
  required: 1 | 2 | 3;
  trust: number;
  kyc_status: KycStatus;
  kyc_reason: string | null;
  basket_value_kobo: number;
  top_item: { name: string; value_kobo: number } | null;
  ok_to_pay: boolean;
  blocked: boolean;
};

/** kyc_gate with the same lines quote_booking gets. */
export async function kycGate(lines: DraftLine[]): Promise<KycGate> {
  const { data, error } = await supabase.rpc('kyc_gate', { p_lines: rpcLines(lines) });
  if (error) throw error;
  const g = data as KycGate;
  return { ...g, basket_value_kobo: Number(g.basket_value_kobo ?? 0), top_item: g.top_item ? { ...g.top_item, value_kobo: Number(g.top_item.value_kobo) } : null };
}

/** Which Review card to show for a gate answer. `null`: nothing to say (tier 1 basket, not verified). */
export type GateCard = 'verified' | 'needed' | 'pending' | 'needs_more' | 'rejected' | 'blocked' | 'tier3' | null;

export function gateCard(g: KycGate): GateCard {
  if (g.blocked) return 'blocked';
  if (g.trust >= g.required) return g.required >= 2 || g.kyc_status === 'verified' ? 'verified' : null;
  // Verified at tier 2 but the basket needs tier 3: the split-order / quick call message.
  if (g.required === 3 && g.trust >= 2) return 'tier3';
  switch (g.kyc_status) {
    case 'pending': return 'pending';
    case 'needs_more': return 'needs_more';
    case 'rejected': return 'rejected';
    default: return 'needed'; // none, or a verification that has expired
  }
}

// ---------------------------------------------------------------------------
// Reasons staff give (needs_more / rejected)
// ---------------------------------------------------------------------------
const REASONS: Record<KycReason, string> = {
  blurry: 'The photo was blurry. Hold your phone steady, in good light.',
  glare: 'There was glare on your ID. Tilt it away from the light.',
  id_expired: 'That ID has expired. Use one that’s still valid.',
  face_unclear: 'We couldn’t see your face clearly. Face a window and keep your ID next to your face.',
  name_mismatch: 'The name on your ID doesn’t match your Deloo name. Check your name, then send it again.',
  id_not_accepted: 'We can’t accept that kind of ID. Use your NIN slip, driver’s licence, voter’s card or passport.',
  other: 'Something wasn’t clear. Send new photos, please.',
};

/**
 * Renter-facing text for profiles.kyc_reason, which holds staff's note or, with no note, the reason code.
 * A note is shown as written (with a full stop added if it has none).
 */
export function reasonText(reason: string | null | undefined): string {
  const r = (reason ?? '').trim();
  if (!r) return REASONS.other;
  if (r in REASONS) return REASONS[r as KycReason];
  return /[.!?]$/.test(r) ? r : `${r}.`;
}

// ---------------------------------------------------------------------------
// The renter's own status (profiles), fresh on every focus
// ---------------------------------------------------------------------------
export type KycProfile = { kyc_status: KycStatus; kyc_reason: string | null; trust_level: number };

export async function fetchKyc(userId: string): Promise<KycProfile | null> {
  const { data, error } = await supabase.from('profiles').select('kyc_status, kyc_reason, trust_level').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  return data as KycProfile;
}

/**
 * The renter's verification status: the session's copy at once, then re-read whenever the screen comes
 * into focus (staff decide in the admin portal, so the session's copy goes stale).
 */
export function useKyc(): KycProfile {
  const { session, profile } = useSession();
  const [fresh, setFresh] = useState<KycProfile | null>(null);
  const uid = session?.user.id;
  useFocusEffect(useCallback(() => {
    if (!uid) return;
    let live = true;
    fetchKyc(uid).then((k) => { if (live && k) setFresh(k); }).catch(() => {});
    return () => { live = false; };
  }, [uid]));
  return fresh ?? { kyc_status: profile?.kyc_status ?? 'none', kyc_reason: profile?.kyc_reason ?? null, trust_level: profile?.trust_level ?? 0 };
}

/** Short status for the Me chip. */
export const KYC_LABEL: Record<KycStatus, string> = {
  none: 'Not verified', pending: 'Under review', needs_more: 'Need more', verified: 'ID verified', rejected: 'Not verified',
};

// ---------------------------------------------------------------------------
// The flow in progress (verify/index → id → selfie): kept in memory, so going back and forth between
// the screens, or Review re-holding the gear, never asks for a photo twice.
// ---------------------------------------------------------------------------
export type Shot = 'front' | 'back' | 'selfie';
export type KycFlow = {
  /** The folder under `<uid>/` this attempt uploads to. A retake after an upload starts a new one. */
  folderId: string;
  consentAt?: string;
  idType?: IdType;
  photos: Partial<Record<Shot, string>>;
  /** Storage paths already uploaded, per shot. */
  uploaded: Partial<Record<Shot, string>>;
};

const newFlow = (): KycFlow => ({ folderId: uuid(), photos: {}, uploaded: {} });
let flow: KycFlow = newFlow();
const listeners = new Set<() => void>();
function commit(next: KycFlow) { flow = next; listeners.forEach((fn) => fn()); }
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function useKycFlow() {
  return useSyncExternalStore(subscribe, () => flow);
}

export function giveConsent() {
  commit({ ...flow, consentAt: new Date().toISOString() });
}

export function setIdType(idType: IdType) {
  // A different ID means different photos.
  if (idType === flow.idType) return;
  commit({ ...newFlow(), consentAt: flow.consentAt, idType });
}

export function setPhoto(shot: Shot, uri: string) {
  // The bucket takes no overwrites: once anything is up, a retake goes to a fresh folder.
  const anyUp = Object.keys(flow.uploaded).length > 0;
  commit(anyUp
    ? { ...flow, folderId: uuid(), uploaded: {}, photos: { ...flow.photos, [shot]: uri } }
    : { ...flow, photos: { ...flow.photos, [shot]: uri } });
}

export function resetKycFlow() { commit(newFlow()); }

// ---------------------------------------------------------------------------
// Upload and submit
// ---------------------------------------------------------------------------

/** Uploads one photo to `kyc-documents/<uid>/<folderId>/<name>.jpg`; returns the storage path. */
export async function uploadKycPhoto(localUri: string, folderId: string, name: Shot): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Sign in again, then send your photos.');
  const bytes = await readPhoto(localUri);
  if (!bytes) throw new Error('We lost that photo. Take it again, please.');
  const path = `${uid}/${folderId}/${name}.jpg`;
  const { error } = await supabase.storage.from('kyc-documents').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  // Uploaded on an earlier try whose answer never arrived.
  if (error && !/exists|duplicate/i.test(error.message)) throw error;
  return path;
}

export async function submitKyc(input: {
  idType: IdType; frontPath: string; backPath: string | null; selfiePath: string; consentVersion?: string; docLast4?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('submit_kyc', {
    p_id_type: input.idType, p_front_path: input.frontPath, p_back_path: input.backPath, p_selfie_path: input.selfiePath,
    p_consent_version: input.consentVersion ?? CONSENT_VERSION, p_doc_last4: input.docLast4 ?? null,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Sends the flow in progress: uploads whatever isn't up yet (a retry skips what already went), then
 * submit_kyc. On success the flow is cleared. Throws a renter-facing message.
 */
export async function sendKyc(): Promise<void> {
  const f = flow;
  if (!f.idType || !f.photos.front || !f.photos.selfie || (needsBack(f.idType) && !f.photos.back)) {
    throw new Error('A photo is missing. Go back and take it.');
  }
  const shots: Shot[] = needsBack(f.idType) ? ['front', 'back', 'selfie'] : ['front', 'selfie'];
  try {
    for (const s of shots) {
      if (flow.uploaded[s]) continue;
      const path = await uploadKycPhoto(f.photos[s]!, f.folderId, s);
      commit({ ...flow, uploaded: { ...flow.uploaded, [s]: path } });
    }
    try {
      await submitKyc({
        idType: f.idType, frontPath: flow.uploaded.front!, backPath: flow.uploaded.back ?? null, selfiePath: flow.uploaded.selfie!,
      });
    } catch (e) {
      // Already sent (an earlier try whose answer never arrived, or another phone): that's done.
      if (errMessage(e).includes('kyc_pending')) { resetKycFlow(); return; }
      // The server didn't like the paths: the next try uploads to a fresh folder.
      if (errMessage(e).includes('kyc_bad_path')) commit({ ...flow, folderId: uuid(), uploaded: {} });
      throw e;
    }
  } catch (e) {
    throw new Error(kycErrorText(e));
  }
  resetKycFlow();
}

const errMessage = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';

/** submit_kyc raises kyc_pending, kyc_rejected, already_verified, kyc_bad_path (P0001); the rest is network or storage. */
function kycErrorText(e: unknown): string {
  const m = errMessage(e);
  if (/network|failed to fetch|timed? ?out|aborted/i.test(m)) return 'You’re offline. Your photos are kept here, so connect and tap Send again.';
  if (m.includes('already_verified')) return 'Your ID is already verified. You’re all set.';
  if (m.includes('kyc_rejected')) return 'We couldn’t verify this account, so we can’t take a new ID check. Chat with us on WhatsApp.';
  if (m.includes('kyc_bad_path')) return 'Your photos didn’t send properly. Tap Send to try again.';
  // Our own sentences (missing photo, sign in again) pass through; anything technical doesn't.
  return m && m.length < 140 && !/[{}_]|violat|relation|column|function|permission|jwt|row-level/i.test(m) ? m : 'Couldn’t send your photos. Try again.';
}
