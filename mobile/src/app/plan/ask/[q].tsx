import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LAGOS_AREAS } from '@/lib/format';
import { usePlan } from '@/lib/plan';
import { DEFAULT_PEOPLE } from '@/planner';
import type { Answers, Budget, Location, ShootType, SoundMode, TimeOfDay } from '@/planner/types';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/use-colors';
import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { DateRangeCalendar, dayCount, rentalWindow, windowDays } from '@/ui/date-range';
import { Text } from '@/ui/text';
import { Tile } from '@/ui/tile';
import { TopBar } from '@/ui/top-bar';

/**
 * The question flow: only what the plan can't guess. Each is its own route so Android back steps back
 * one question. People, angles, sound, movement and area get per-shoot defaults (shown as "assumed"
 * chips on the setup, one tap to change) and stay reachable here as edit-only screens (?edit=1).
 */
export const QUESTIONS = ['type', 'where', 'when'] as const;
type Q = (typeof QUESTIONS)[number] | 'people' | 'angles' | 'sound' | 'movement' | 'area' | 'budget';

const SHOOT_TYPES: [ShootType, string, string, string][] = [
  ['podcast', 'Podcast', 'People talking at a desk', '🎙️'],
  ['interview', 'Interview', 'Talking heads, testimonials', '🗣️'],
  ['content', 'YouTube or social content', 'Vlogs, reels, ads', '📱'],
  ['music_video', 'Music video', 'Shot to playback', '🎶'],
  ['short_film', 'Short film or skit', 'Scenes, actors, story', '🎬'],
  ['photo', 'Photo shoot', 'Portraits, products, studio', '📸'],
  ['event', 'Event coverage', 'Weddings, conferences, services', '🎉'],
  ['other', 'Something else', 'Tell us in your own words', '✨'],
];
const COUNTS: [number, string][] = [[1, '1'], [2, '2'], [3, '3'], [4, '4 or more']];

export default function Ask() {
  const c = useColors();
  // edit=1: opened from R4/R6 to change one answer, so return instead of continuing the flow.
  const { q, edit } = useLocalSearchParams<{ q: Q; edit?: string }>();
  const { draft, answer } = usePlan();
  const a = draft.answers;
  const index = Math.max(0, (QUESTIONS as readonly string[]).indexOf(q));
  const advancing = useRef(false);

  function next() {
    advancing.current = false;
    if (edit) { router.back(); return; }
    const following = QUESTIONS[index + 1];
    if (following) router.push(`/plan/ask/${following}`);
    else router.push('/plan/setup');
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
      title = 'What are you shooting?';
      body = <>{SHOOT_TYPES.map(([k, label, desc, emoji]) => (
        <Tile key={k} emoji={emoji} title={label} description={desc} selected={a.shootType === k}
          onPress={() => pick({ shootType: k, ...(k === 'podcast' && a.sound === undefined ? { sound: 'desk' as SoundMode } : {}) })} />
      ))}{notSure({ shootType: 'unsure' })}</>;
      break;
    case 'people':
      title = 'How many people on camera?';
      helper = 'It sets how many mics, and how much light you need.';
      body = <>{COUNTS.map(([n, label]) => (
        <Tile key={n} icon="people" title={label === '1' ? 'Just one' : label} selected={a.people === n} onPress={() => pick({ people: n })} />
      ))}{notSure({ people: 'unsure' })}</>;
      break;
    case 'angles':
      title = 'How many camera angles?';
      helper = 'Cameras rolling at the same time. Two lets you cut between a wide shot and a close-up.';
      body = <>{COUNTS.map(([n, label]) => (
        <Tile key={n} icon="camera" title={n === 1 ? '1 camera' : `${label} cameras`} selected={a.angles === n} onPress={() => pick({ angles: n })} />
      ))}{notSure({ angles: 'unsure' })}</>;
      break;
    case 'where': {
      const people = typeof a.people === 'number' ? a.people : DEFAULT_PEOPLE[(a.shootType && a.shootType !== 'unsure' ? a.shootType : 'other') as ShootType];
      title = 'Where, and who’s on camera?';
      helper = 'Indoors and at night you need your own light; outdoors by day the sun does most of it.';
      body = <>
        <Text variant="label">People on camera</Text>
        <View style={styles.wrap}>
          {COUNTS.map(([n, label]) => <Chip key={n} label={label} selected={people === n} onPress={() => answer({ people: n })} />)}
        </View>
        <Text variant="label" style={{ marginTop: space.sm }}>Location</Text>
        <View style={styles.wrap}>
          {([['indoor', 'Indoors'], ['outdoor', 'Outdoors'], ['both', 'Both']] as [Location, string][]).map(([k, l]) => (
            <Chip key={k} label={l} selected={a.location === k} onPress={() => answer({ location: k })} />
          ))}
          <Chip label="Not sure" selected={a.location === 'unsure'} onPress={() => answer({ location: 'unsure' })} />
        </View>
        <Text variant="label" style={{ marginTop: space.sm }}>Time of day</Text>
        <View style={styles.wrap}>
          {([['day', 'Daytime'], ['night', 'At night'], ['both', 'Both']] as [TimeOfDay, string][]).map(([k, l]) => (
            <Chip key={k} label={l} selected={a.timeOfDay === k} onPress={() => answer({ timeOfDay: k })} />
          ))}
          <Chip label="Not sure" selected={a.timeOfDay === 'unsure'} onPress={() => answer({ timeOfDay: 'unsure' })} />
        </View>
      </>;
      footer = <Button title="Continue" disabled={a.location === undefined} onPress={() => { if (a.timeOfDay === undefined) answer({ timeOfDay: 'unsure' }); next(); }} />;
      break;
    }
    case 'sound':
      title = 'How will you record voices?';
      body = <>
        <Tile icon="mic" title="Desk mics" description="People seated, podcast style" selected={a.sound === 'desk'} onPress={() => pick({ sound: 'desk' as SoundMode })} />
        <Tile icon="mic" title="Clip-on wireless mics" description="Interviews, vlogs, people moving" selected={a.sound === 'clip'} onPress={() => pick({ sound: 'clip' })} />
        <Tile icon="close" title="No mics needed" description="Music playback, photos, or sound sorted" selected={a.sound === 'none'} onPress={() => pick({ sound: 'none' })} />
        {notSure({ sound: 'unsure' })}
      </>;
      break;
    case 'movement':
      title = 'Any moving shots?';
      helper = 'Walking, following someone, smooth tracking shots.';
      body = <>
        <Tile icon="sparkles" title="Yes, smooth moving shots" description="We’ll add a gimbal" selected={a.movement === true} onPress={() => pick({ movement: true })} />
        <Tile icon="camera" title="No, on tripods" description="Cameras stay put" selected={a.movement === false} onPress={() => pick({ movement: false })} />
        {notSure({ movement: 'unsure' })}
      </>;
      break;
    case 'when': {
      const { first, last } = windowDays(
        typeof a.startsAt === 'string' && a.startsAt !== 'unsure' ? a.startsAt : undefined,
        typeof a.endsAt === 'string' && a.endsAt !== 'unsure' ? a.endsAt : undefined,
      );
      title = 'Which days do you need it?';
      helper = 'Priced per day. We check what’s free for every day you pick.';
      body = <DateRangeCalendar first={first} last={last} onChange={(f, l) => answer(rentalWindow(f, l))} />;
      footer = <View style={styles.footerRow}>{notSure({ startsAt: 'unsure', endsAt: 'unsure' })}
        <Button title={first && last ? `Continue · ${dayCount(first, last)} ${dayCount(first, last) === 1 ? 'day' : 'days'}` : 'Continue'} style={{ flex: 1 }} disabled={!first} onPress={next} /></View>;
      break;
    }
    case 'area':
      title = 'Where in Lagos?';
      helper = 'For delivery and pickup.';
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
        <Tile icon="check" title="Middle of the road" description="What most shoots like yours choose" selected={a.budget === 'mid'} onPress={() => pick({ budget: 'mid' })} />
        <Tile icon="star" title="Make it cinematic" description="Full-frame cameras and the best light" selected={a.budget === 'high'} onPress={() => pick({ budget: 'high' })} />
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
