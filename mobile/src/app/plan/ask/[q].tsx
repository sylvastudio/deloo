import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LAGOS_AREAS } from '@/lib/format';
import { usePlan } from '@/lib/plan';
import type { Answers, Budget, EventType, PowerSource, StageAct, StreamMode, Venue } from '@/planner/types';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { CrowdPicker } from '@/ui/crowd-picker';
import { Notice } from '@/ui/feedback';
import { Text } from '@/ui/text';
import { Tile } from '@/ui/tile';
import { TopBar } from '@/ui/top-bar';
import { WhenPicker } from '@/ui/when-picker';

/** R3a–R3i, in order. Each is its own route so Android back steps back one question. */
export const QUESTIONS = ['type', 'venue', 'crowd', 'stage', 'stream', 'power', 'when', 'area', 'budget'] as const;
type Q = (typeof QUESTIONS)[number];

const EVENT_TYPES: [EventType, string, string][] = [
  ['service', 'Church service', '⛪'], ['crusade', 'Crusade or outdoor service', '🙌'], ['conference', 'Conference or seminar', '🎤'],
  ['wedding', 'Wedding', '💍'], ['concert', 'Concert or show', '🎶'], ['launch', 'Product launch', '🚀'], ['party', 'Party', '🎉'], ['other', 'Something else', '✨'],
];
const STAGE: [StageAct, string, string][] = [
  ['speakers', 'Speakers or preaching', 'One or two people talking'], ['band', 'Live band', 'Drums, keys, guitars'], ['choir', 'Choir', 'A group singing'],
  ['dj', 'DJ or playback', 'Music from a laptop or phone'], ['panel', 'Panel', 'Several people at a table'],
];
const DEFAULT_STAGE: Partial<Record<EventType, StageAct[]>> = {
  service: ['speakers', 'choir'], crusade: ['speakers', 'band'], conference: ['speakers', 'panel'], wedding: ['dj', 'speakers'],
  concert: ['band'], party: ['dj'], launch: ['speakers'],
};

export default function Ask() {
  const c = useColors();
  // edit=1: opened from R4/R6 to change one answer, so return instead of continuing the flow.
  const { q, edit } = useLocalSearchParams<{ q: Q; edit?: string }>();
  const { draft, answer } = usePlan();
  const a = draft.answers;
  const index = Math.max(0, QUESTIONS.indexOf(q));
  const advancing = useRef(false);

  function next() {
    advancing.current = false;
    if (edit) { router.back(); return; }
    const following = QUESTIONS[index + 1];
    if (following) router.push(`/plan/ask/${following}`);
    else router.push('/plan/sizing');
  }
  /** Single-choice answers auto-advance after a beat so the selection is seen (user-flows §2 rule 1). */
  function pick(patch: Partial<Answers>) {
    answer(patch);
    if (advancing.current) return;
    advancing.current = true;
    setTimeout(next, 250);
  }
  const notSure = (patch: Partial<Answers>) => (
    <Pressable onPress={() => pick(patch)} hitSlop={8} accessibilityRole="button" style={styles.unsure}>
      <Text variant="label" tone="lagoon">Not sure</Text>
    </Pressable>
  );

  let title = '', helper = '', body: React.ReactNode = null, footer: React.ReactNode = null;

  switch (q) {
    case 'type':
      title = 'What kind of event is it?';
      body = <>{EVENT_TYPES.map(([k, label, emoji]) => (
        <Tile key={k} emoji={emoji} title={label} selected={a.eventType === k}
          onPress={() => pick({ eventType: k })} />
      ))}{notSure({ eventType: 'unsure' })}</>;
      break;
    case 'venue':
      title = 'Where will it hold?';
      helper = 'Sound and screens work very differently indoors and in the open.';
      body = <>
        <Tile icon="led_wall" title="Indoors" description="A hall, church auditorium or room" selected={a.venue === 'indoor'} onPress={() => answer({ venue: 'indoor' as Venue })} />
        <Tile icon="shield" title="Outdoors, covered" description="Under a canopy or tent" selected={a.venue === 'covered'} onPress={() => pick({ venue: 'covered', roomSize: undefined })} />
        <Tile icon="sparkles" title="Outdoors, open" description="A field or open ground, maybe in daylight" selected={a.venue === 'open'} onPress={() => pick({ venue: 'open', roomSize: undefined })} />
        {a.venue === 'indoor' ? <>
          <Text variant="label" style={{ marginTop: space.sm }}>How big is the room?</Text>
          <View style={styles.wrap}>
            {([['small', 'Small room'], ['hall', 'Hall'], ['auditorium', 'Auditorium']] as const).map(([k, l]) => (
              <Chip key={k} label={l} selected={a.roomSize === k} onPress={() => pick({ roomSize: k })} />
            ))}
            <Chip label="Not sure" selected={a.roomSize === 'unsure'} onPress={() => pick({ roomSize: 'unsure' })} />
          </View>
        </> : notSure({ venue: 'unsure' })}
      </>;
      break;
    case 'crowd':
      title = 'How many people are you expecting?';
      helper = 'A rough number is fine. It sets how much sound and how big a screen you need.';
      body = <CrowdPicker value={typeof a.crowd === 'number' ? a.crowd : 300} onChange={(n) => answer({ crowd: n })} />;
      footer = <View style={styles.footerRow}>{notSure({ crowd: 'unsure' })}<Button title="Continue" style={{ flex: 1 }} onPress={() => { if (a.crowd === undefined) answer({ crowd: 300 }); next(); }} /></View>;
      break;
    case 'stage': {
      const type = typeof a.eventType === 'string' && a.eventType !== 'unsure' ? a.eventType : undefined;
      const current: StageAct[] = Array.isArray(a.stage) ? a.stage : (type && DEFAULT_STAGE[type]) || [];
      title = 'What’s happening on stage?';
      helper = 'Pick everything that applies. It decides how many mics and what kind of mixer.';
      body = STAGE.map(([k, label, desc]) => (
        <Tile key={k} multi title={label} description={desc} selected={current.includes(k)}
          onPress={() => answer({ stage: current.includes(k) ? current.filter((x) => x !== k) : [...current, k] })} />
      ));
      footer = <View style={styles.footerRow}>{notSure({ stage: 'unsure' })}<Button title="Continue" style={{ flex: 1 }} onPress={() => { if (!Array.isArray(a.stage)) answer({ stage: current }); next(); }} /></View>;
      break;
    }
    case 'stream':
      title = 'Will you stream or record it?';
      body = <>
        <Tile icon="close" title="No" description="Just the people in the room" selected={a.stream === 'none'} onPress={() => pick({ stream: 'none' as StreamMode })} />
        <Tile icon="camera_cat" title="Record it" description="Video to edit and post later" selected={a.stream === 'record'} onPress={() => pick({ stream: 'record' })} />
        <Tile icon="streaming_kit" title="Stream it live" description="YouTube, Facebook, Instagram or Zoom" selected={a.stream === 'live'} onPress={() => answer({ stream: 'live' })} />
        {a.stream === 'live' ? (
          <View style={styles.wrap}>
            {(['youtube', 'facebook', 'instagram', 'zoom'] as const).map((p) => (
              <Chip key={p} label={p[0].toUpperCase() + p.slice(1).replace('tube', 'Tube')} selected={a.platform === p} onPress={() => pick({ platform: p })} />
            ))}
            <Chip label="Not decided" selected={a.platform === 'unsure'} onPress={() => pick({ platform: 'unsure' })} />
          </View>
        ) : notSure({ stream: 'unsure' })}
      </>;
      break;
    case 'power':
      title = 'What power will you have?';
      body = <>
        <Tile icon="bolt" title="Grid (NEPA)" description="We’ll still suggest a backup, in case light goes" selected={a.power === 'grid'} onPress={() => pick({ power: 'grid' as PowerSource })} />
        <Tile icon="generator" title="We have a generator" description="Your own, big enough for the gear" selected={a.power === 'generator'} onPress={() => pick({ power: 'generator' })} />
        <Tile icon="warning" title="Nothing yet" description="We’ll add a generator sized to your setup" selected={a.power === 'none'} onPress={() => pick({ power: 'none' })} />
        <Notice tone="tip" icon="shield">We always add surge protection. Power surges are the number one way sound gear gets damaged.</Notice>
        {notSure({ power: 'unsure' })}
      </>;
      break;
    case 'when':
      title = 'When is it?';
      helper = 'Include setup time. We check what’s free for the whole window.';
      body = <WhenPicker startsAt={typeof a.startsAt === 'string' && a.startsAt !== 'unsure' ? a.startsAt : undefined}
        endsAt={typeof a.endsAt === 'string' && a.endsAt !== 'unsure' ? a.endsAt : undefined}
        onChange={(startsAt, endsAt) => answer({ startsAt, endsAt })} />;
      footer = <View style={styles.footerRow}>{notSure({ startsAt: 'unsure', endsAt: 'unsure' })}
        <Button title="Continue" style={{ flex: 1 }} disabled={!a.startsAt} onPress={next} /></View>;
      break;
    case 'area':
      title = 'Where in Lagos?';
      helper = 'So we pick owners close to you and delivery stays cheap.';
      body = <>
        <View style={styles.wrap}>
          {LAGOS_AREAS.map((ar) => <Chip key={ar} label={ar} selected={a.area === ar} onPress={() => pick({ area: ar })} />)}
        </View>
        <Pressable onPress={() => router.push('/coming-soon?city=1')} hitSlop={8}><Text variant="label" tone="lagoon">Not in Lagos? Join the list for your city</Text></Pressable>
        {notSure({ area: 'unsure' })}
      </>;
      break;
    case 'budget':
      title = 'Any budget in mind?';
      body = <>
        <Tile icon="sparkles" title="Show me options" description="See Good, Better and Best, then decide" selected={a.budget === 'options'} onPress={() => pick({ budget: 'options' as Budget })} />
        <Tile icon="minus" title="Keep it lean" description="The minimum that works well" selected={a.budget === 'low'} onPress={() => pick({ budget: 'low' })} />
        <Tile icon="check" title="Middle of the road" description="What most events like yours choose" selected={a.budget === 'mid'} onPress={() => pick({ budget: 'mid' })} />
        <Tile icon="star" title="Make it excellent" description="Comfortable headroom and the best picture" selected={a.budget === 'high'} onPress={() => pick({ budget: 'high' })} />
      </>;
      break;
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar steps={edit ? undefined : { current: index + 1, total: QUESTIONS.length }} title={edit ? 'Change answer' : undefined} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="title" accessibilityRole="header">{title}</Text>
        {helper ? <Text tone="slate">{helper}</Text> : null}
        {body}
      </ScrollView>
      {footer ? <View style={[styles.footer, { borderTopColor: c.line }]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  unsure: { alignSelf: 'flex-start', paddingVertical: space.sm, minHeight: 44, justifyContent: 'center' },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
});
