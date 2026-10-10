import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getBooking, plain, type BookingDetail, type BookingItem } from '@/lib/bookings';
import {
  addCapture, confirmJob, removeCapture, signedUrls, startJob, updateJob, useHandoverJobs, waitingText,
  type Capture, type HandoverKind, type Shot,
} from '@/lib/handover';
import { useFileUri } from '@/lib/handover-files';
import { CameraDenied, shootEvidencePhoto, shootEvidenceVideo } from '@/lib/photos';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { EmptyState, Notice, Skeleton } from '@/ui/feedback';
import { Icon } from '@/ui/icon';
import { Field } from '@/ui/layout';
import { SlideToConfirm } from '@/ui/slide-to-confirm';
import { Text } from '@/ui/text';
import { Tile } from '@/ui/tile';
import { TopBar } from '@/ui/top-bar';

const OPEN_FOR: Record<HandoverKind, string[]> = { delivery: ['out_for_delivery', 'delivered'], collection: ['delivered', 'collected'] };
const CHECKS: Record<HandoverKind, { key: string; label: string }[]> = {
  delivery: [{ key: 'accessories_present', label: 'Everything in the box is here' }, { key: 'no_visible_damage', label: 'No visible damage' }, { key: 'powers_on', label: 'It powers on' }],
  collection: [{ key: 'accessories_present', label: 'Everything is packed, with cables and batteries' }, { key: 'no_visible_damage', label: 'No new damage' }],
};

/**
 * R-42 Handover photos at delivery ("I've received it") or return ("I'm returning it"). Per booked
 * unit: overview and serial plate; one accessories photo; an optional 15 s power-on video; an optional
 * problem note with photos. Everything is saved on the phone first and uploads in the background.
 */
export default function Handover() {
  const c = useColors();
  const { booking, kind: kindParam } = useLocalSearchParams<{ booking: string; kind: string }>();
  const kind: HandoverKind = kindParam === 'collection' ? 'collection' : 'delivery';
  const [b, setB] = useState<BookingDetail | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [problem, setProblem] = useState(false);
  const [ours, setOurs] = useState<{ url: string; shot: string }[]>([]);
  const jobs = useHandoverJobs();
  const job = jobs.find((j) => j.id === jobId);

  const load = useCallback(async () => {
    setError('');
    try { setB(await getBooking(booking)); } catch (e) { setError(plain(e, 'Couldn’t load this booking.')); }
  }, [booking]);
  useEffect(() => { load(); }, [load]);

  const open = !!b && OPEN_FOR[kind].includes(b.status);
  useEffect(() => {
    if (open && !jobId) {
      const j = startJob(booking, kind);
      setJobId(j.id);
      setProblem(!!j.problemNote || j.media.some((m) => m.shot === 'damage'));
    }
  }, [open, jobId, booking, kind]);

  // "Compare with ours": the photos we took before it left (dispatch), or on delivery for a return.
  useEffect(() => {
    if (!b) return;
    const ref = b.handovers.find((h) => h.party === 'staff' && h.kind === 'dispatch') ?? b.handovers.find((h) => h.kind === 'delivery');
    const photos = ref?.handover_media.filter((m) => m.media_type === 'photo') ?? [];
    signedUrls(photos.map((m) => m.storage_path)).then((u) => setOurs(photos.flatMap((m) => (u[m.storage_path] ? [{ url: u[m.storage_path], shot: m.shot }] : []))));
  }, [b]);

  const find = useCallback((shot: Shot, unitId: string | null) => job?.media.find((m) => m.shot === shot && m.unitId === unitId), [job]);

  async function take(shot: Shot, unitId: string | null, video = false) {
    if (!job) return;
    setBusy(`${shot}:${unitId}`); setCaptureError('');
    try {
      const e = video ? await shootEvidenceVideo() : await shootEvidencePhoto();
      if (e) await addCapture(job.id, shot, unitId, e);
      setDenied(false);
    } catch (err) {
      if (err instanceof CameraDenied) setDenied(true);
      else setCaptureError(err instanceof Error && /^Keep it/.test(err.message) ? err.message : 'That didn’t save. Try again; if your phone is full, free some space first.');
    } finally { setBusy(null); }
  }

  const items = b?.booking_items.filter((i) => i.kind === 'rental') ?? [];
  const required = useMemo(() => {
    if (!job) return { done: 0, total: 1 };
    const need = items.flatMap((i) => [find('overview', i.unit_id), find('serial', i.unit_id)]).concat(find('accessories', null));
    return { done: need.filter(Boolean).length, total: need.length };
  }, [job, items, find]);
  const complete = required.done === required.total && (!problem || !!job?.problemNote.trim());

  if (b === null) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><TopBar title="Handover photos" /><EmptyState icon="calendar" title="Booking not found" action="Back" onAction={() => router.back()} /></SafeAreaView>;
  }
  if (error || !b) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><TopBar title="Handover photos" />
        {error ? <EmptyState icon="warning" title="Couldn’t open this booking" body={error} action="Try again" onAction={load} />
          : <View style={styles.content}><Skeleton style={{ height: 120 }} /><Skeleton style={{ height: 120 }} /></View>}
      </SafeAreaView>
    );
  }
  if (job?.state === 'ready') {
    const left = job.media.filter((m) => !m.uploaded).length;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><TopBar title="Handover photos" />
        <EmptyState icon="check" title="Saved, thank you"
          body={`${kind === 'delivery' ? 'The rider can go now. Your photos are on your booking.' : 'We’ll check the gear and send your deposit within 48 hours.'}\n\n${left ? `${waitingText(left)}. We’ll keep trying, even if you close the app.` : 'All uploaded.'}`}
          action="Back to booking" onAction={() => router.back()} />
      </SafeAreaView>
    );
  }
  if (!open) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}><TopBar title="Handover photos" />
        <EmptyState icon="camera" title="Not yet"
          body={kind === 'delivery' ? 'You can take photos once your gear is on its way.' : 'You can take return photos while you have the gear.'} action="Back" onAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  const video = find('video_test', null);
  const damage = job?.media.filter((m) => m.shot === 'damage') ?? [];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={kind === 'delivery' ? 'Photos on delivery' : 'Photos before return'}
        right={<Text variant="label" tone="slate" accessibilityLabel={`${required.done} of ${required.total} photos taken`}>{required.done}/{required.total}</Text>} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space.xs }}>
          <Text variant="bodyStrong">{kind === 'delivery' ? 'Takes about 3 minutes. Ask the rider to wait.' : 'Copy your footage off the cards first.'}</Text>
          <Text tone="slate">
            {kind === 'delivery'
              ? 'Take these with the rider there. They show the condition you received it in, so nobody can blame you for an old scratch. If you skip this, our photos from before it left are what we go by.'
              : 'Then take these before the rider leaves with it, about 3 minutes. They show the condition you returned it in.'}
          </Text>
        </View>
        {denied ? (
          <Notice tone="problem">
            <View style={{ gap: space.xs }}>
              <Text variant="caption" tone="red">Deloo needs the camera for handover photos. Open settings and allow Camera.</Text>
              <Text variant="label" tone="lagoon" onPress={() => Linking.openSettings().catch(() => {})} accessibilityRole="button">Open settings</Text>
            </View>
          </Notice>
        ) : null}
        {captureError ? <Notice tone="problem">{captureError}</Notice> : null}

        {ours.length ? (
          <View style={{ gap: space.xs }}>
            <Text variant="label" tone="slate">COMPARE WITH OURS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {ours.map((o) => <Image key={o.url} source={{ uri: o.url }} style={styles.ours} contentFit="cover" accessibilityLabel={`Our ${o.shot} photo`} />)}
            </ScrollView>
          </View>
        ) : null}

        {items.map((i, n) => <UnitCard key={i.id} item={i} n={n + 1} of={items.length} find={find} busy={busy} onTake={take} onRemove={(m) => job && removeCapture(job.id, m.id)} />)}

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text variant="bodyStrong">Accessories</Text>
          <Text variant="caption" tone="slate">Lay out batteries, chargers, cards, cables and caps together, in one photo.</Text>
          <Slot label="Accessories laid out" capture={find('accessories', null)} busy={busy === 'accessories:null'}
            onTake={() => take('accessories', null)} onRemove={(m) => job && removeCapture(job.id, m.id)} />
        </View>

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text variant="bodyStrong">Power-on video (optional)</Text>
          <Text variant="caption" tone="slate">Up to 15 seconds: switch it on and show the screen or light working.</Text>
          <Slot label="Record video" video capture={video} busy={busy === 'video_test:null'}
            onTake={() => take('video_test', null, true)} onRemove={(m) => job && removeCapture(job.id, m.id)} />
        </View>

        <View style={{ gap: space.sm }}>
          {CHECKS[kind].map((ch) => (
            <Tile key={ch.key} multi title={ch.label} selected={!!job?.checklist[ch.key]}
              onPress={() => job && updateJob(job.id, { checklist: { ...job.checklist, [ch.key]: !job.checklist[ch.key] } })} />
          ))}
          <Tile multi title="Note a problem" description="A scratch, a missing battery, something not working" selected={problem}
            onPress={() => setProblem(!problem)} />
        </View>
        {problem && job ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Field label="What’s wrong?" value={job.problemNote} onChangeText={(t) => updateJob(job.id, { problemNote: t })} multiline
              placeholder="e.g. Small scratch on the lens hood; one battery missing" style={{ minHeight: 88, paddingTop: space.md, textAlignVertical: 'top' }} />
            <View style={styles.slots}>
              {damage.map((m) => <Slot key={m.id} label="Problem photo" capture={m} onTake={() => {}} onRemove={(x) => removeCapture(job.id, x.id)} />)}
              <Slot label="Add a photo of it" busy={busy === 'damage:null'} onTake={() => take('damage', null)} onRemove={() => {}} />
            </View>
            <Text variant="caption" tone="slate">We’ll see this straight away and call you if we need to swap anything.</Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: c.line, backgroundColor: c.paper }]}>
        {!complete ? (
          <Text variant="caption" tone="slate" style={{ textAlign: 'center' }}>
            {required.done < required.total ? `${required.total - required.done} more ${required.total - required.done === 1 ? 'photo' : 'photos'} to go` : 'Describe the problem to continue'}
          </Text>
        ) : null}
        <SlideToConfirm label={kind === 'delivery' ? 'I received these in this condition' : 'I’m returning these in this condition'}
          disabled={!complete || !job} onConfirm={() => { if (job) confirmJob(job.id); }} />
      </View>
    </SafeAreaView>
  );
}

function UnitCard({ item, n, of, find, busy, onTake, onRemove }: {
  item: BookingItem; n: number; of: number; find: (shot: Shot, unitId: string | null) => Capture | undefined; busy: string | null;
  onTake: (shot: Shot, unitId: string | null) => void; onRemove: (m: Capture) => void;
}) {
  const c = useColors();
  const u = item.unit_id;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
      <Text variant="bodyStrong">{item.item_name}</Text>
      <Text variant="caption" tone="slate">{of > 1 ? `Item ${n} of ${of}` : 'Your item'}{item.units?.tag ? ` · ${item.units.tag}` : ''}{item.units?.serial ? ` · S/N ${item.units.serial}` : ''}</Text>
      <View style={styles.slots}>
        <Slot label="Whole item" capture={find('overview', u)} busy={busy === `overview:${u}`} onTake={() => onTake('overview', u)} onRemove={onRemove} />
        <Slot label="Serial plate" capture={find('serial', u)} busy={busy === `serial:${u}`} onTake={() => onTake('serial', u)} onRemove={onRemove} />
      </View>
    </View>
  );
}

/** A stored capture's thumbnail (on the web the stored uri is resolved to an object URL). */
function Thumb({ uri }: { uri: string }) {
  const src = useFileUri(uri);
  return src ? <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null;
}

/** One photo to take: empty (tap to take), or the thumbnail (tap to retake, × to remove). */
function Slot({ label, capture, busy, video, onTake, onRemove }: {
  label: string; capture?: Capture; busy?: boolean; video?: boolean; onTake: () => void; onRemove: (m: Capture) => void;
}) {
  const c = useColors();
  return (
    <View style={styles.slotWrap}>
      <Pressable onPress={onTake} disabled={busy} accessibilityRole="button" accessibilityLabel={capture ? `Retake: ${label}` : `Take: ${label}`}
        android_ripple={{ color: c.lagoonTint }}
        style={[styles.slot, { borderColor: capture ? c.lagoon : c.line, backgroundColor: capture ? c.surface : c.raised }]}>
        {busy ? <ActivityIndicator color={c.lagoon} />
          : capture && capture.mediaType === 'photo' ? <Thumb uri={capture.uri} />
          : capture ? <View style={{ alignItems: 'center', gap: 2 }}><Icon name="check" color={c.lagoon} /><Text variant="caption">{capture.durationS ? `${Math.round(capture.durationS)} s video` : 'Video saved'}</Text></View>
          : <View style={{ alignItems: 'center', gap: 4 }}><Icon name="camera" color={c.slate} /><Text variant="caption" tone="slate" style={{ textAlign: 'center' }}>{video ? 'Record' : 'Take photo'}</Text></View>}
      </Pressable>
      <View style={styles.slotFoot}>
        <Text variant="caption" tone={capture ? 'ink' : 'slate'} style={{ flex: 1 }} numberOfLines={1}>{label}</Text>
        {capture ? (
          <Pressable onPress={() => onRemove(capture)} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Remove ${label}`}>
            <Icon name="close" size={18} color={c.slate} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg, paddingBottom: space.xxxl },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.sm },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  slotWrap: { width: 140, gap: 4 },
  slot: { width: 140, height: 105, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  slotFoot: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 24 },
  ours: { width: 96, height: 72, borderRadius: radius.md },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
