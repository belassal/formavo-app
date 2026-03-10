/**
 * DateTimePickerModal
 * Zero-dependency drum-roll date + time picker for React Native.
 * Stores/returns "YYYY-MM-DD HH:mm" to match existing dateISO format.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const ITEM_H = 48;
const VISIBLE = 5;
const DRUM_H = ITEM_H * VISIBLE;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function pad2(n: number) { return String(n).padStart(2, '0'); }

function daysInMonth(year: number, month1: number) {
  return new Date(year, month1, 0).getDate();
}

function parseISO(iso: string): Date {
  if (!iso) return new Date();
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) return new Date();
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return isNaN(d.getTime()) ? new Date() : d;
}

function toISO(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDateISO(iso: string): string {
  if (!iso) return '';
  const d = parseISO(iso);
  if (isNaN(d.getTime())) return iso;
  const h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()} ${d.getFullYear()} · ${h12}:${pad2(d.getMinutes())} ${ampm}`;
}

// ─── DrumColumn ────────────────────────────────────────────────────────────

type DrumColumnProps = {
  items: string[];
  selectedIndex: number;
  onChange: (i: number) => void;
  width: number;
};

function DrumColumn({ items, selectedIndex, onChange, width }: DrumColumnProps) {
  const ref = useRef<ScrollView>(null);
  const mounted = useRef(false);
  const pad = ITEM_H * Math.floor(VISIBLE / 2);

  useEffect(() => {
    const delay = mounted.current ? 0 : 120;
    mounted.current = true;
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: delay === 0 });
    }, delay);
    return () => clearTimeout(t);
  }, [selectedIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = (raw: number) => Math.max(0, Math.min(items.length - 1, raw));

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    onChange(clamp(Math.round(e.nativeEvent.contentOffset.y / ITEM_H)));
  }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDragEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    onChange(clamp(Math.round(e.nativeEvent.contentOffset.y / ITEM_H)));
  }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ width, height: DRUM_H, overflow: 'hidden' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: pad,
          left: 3,
          right: 3,
          height: ITEM_H,
          backgroundColor: '#f0fdf4',
          borderRadius: 10,
          borderWidth: 1.5,
          borderColor: '#86efac',
        }}
      />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumEnd}
        onScrollEndDrag={onDragEnd}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: pad, paddingBottom: pad }}
      >
        {items.map((label, i) => {
          const isSel = i === selectedIndex;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => {
                onChange(i);
                ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
              }}
              style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}
              activeOpacity={0.7}
            >
              <Text style={{
                fontSize: isSel ? 20 : 17,
                fontWeight: isSel ? '800' : '400',
                color: isSel ? '#111' : '#b0b8c4',
              }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  value: string;
  onConfirm: (iso: string) => void;
  onClose: () => void;
  minYear?: number;
  maxYear?: number;
};

export default function DateTimePickerModal({
  visible,
  value,
  onConfirm,
  onClose,
  minYear = 2020,
  maxYear = 2035,
}: Props) {

  // ── CRITICAL: render nothing when not visible ──────────────────────────
  // An invisible Modal with transparent overlay still intercepts ALL touches
  // on iOS. We guard with this flag so the component tree is simply absent.
  if (!visible) return null;

  return (
    <DateTimePickerInner
      value={value}
      onConfirm={onConfirm}
      onClose={onClose}
      minYear={minYear}
      maxYear={maxYear}
    />
  );
}

// Inner component — only mounted when visible=true so hooks always run
type InnerProps = Omit<Props, 'visible'>;

function DateTimePickerInner({ value, onConfirm, onClose, minYear = 2020, maxYear = 2035 }: InnerProps) {
  const years   = Array.from({ length: maxYear - minYear + 1 }, (_, i) => String(minYear + i));
  const hours   = Array.from({ length: 24 }, (_, i) => pad2(i));
  const minutes = Array.from({ length: 12 }, (_, i) => pad2(i * 5));

  // Seed state from value immediately
  const initial = parseISO(value);
  const [yearIdx,   setYearIdx]   = useState(() => Math.max(0, Math.min(years.length - 1, initial.getFullYear() - minYear)));
  const [monthIdx,  setMonthIdx]  = useState(() => initial.getMonth());
  const [dayIdx,    setDayIdx]    = useState(() => initial.getDate() - 1);
  const [hourIdx,   setHourIdx]   = useState(() => initial.getHours());
  const [minuteIdx, setMinuteIdx] = useState(() => Math.round(initial.getMinutes() / 5) % 12);

  const year    = minYear + yearIdx;
  const numDays = daysInMonth(year, monthIdx + 1);
  const days    = Array.from({ length: numDays }, (_, i) => pad2(i + 1));

  useEffect(() => {
    if (dayIdx >= numDays) setDayIdx(numDays - 1);
  }, [numDays]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewDate = new Date(year, monthIdx, Math.min(dayIdx + 1, numDays), hourIdx, minuteIdx * 5);
  const handleDone = () => onConfirm(toISO(previewDate));

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Dim area — Pressable so tapping the dim closes the picker */}
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Sheet content — Pressable with onPress stop-prop so inner taps don't close */}
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheet}>

            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 20, right: 20 }}>
                <Text style={styles.btnCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.title}>Date &amp; Time</Text>
              <TouchableOpacity onPress={handleDone} hitSlop={{ top: 16, bottom: 16, left: 20, right: 20 }}>
                <Text style={styles.btnDone}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Live preview */}
            <View style={styles.preview}>
              <Text style={styles.previewText}>
                {formatDateISO(toISO(previewDate))}
              </Text>
            </View>

            {/* Drum wheels */}
            <View style={styles.drums}>
              <DrumColumn items={MONTHS} selectedIndex={monthIdx}                           onChange={setMonthIdx}  width={62} />
              <DrumColumn items={days}   selectedIndex={Math.min(dayIdx, days.length - 1)}  onChange={setDayIdx}    width={50} />
              <DrumColumn items={years}  selectedIndex={yearIdx}                             onChange={setYearIdx}   width={66} />
              <View style={styles.divider} />
              <DrumColumn items={hours}   selectedIndex={hourIdx}   onChange={setHourIdx}   width={50} />
              <View style={styles.colon}><Text style={styles.colonText}>:</Text></View>
              <DrumColumn items={minutes} selectedIndex={minuteIdx} onChange={setMinuteIdx} width={50} />
            </View>

            {/* Labels */}
            <View style={styles.labelsRow}>
              <Text style={[styles.lbl, { width: 62 }]}>MONTH</Text>
              <Text style={[styles.lbl, { width: 50 }]}>DAY</Text>
              <Text style={[styles.lbl, { width: 66 }]}>YEAR</Text>
              <View style={{ width: 24 }} />
              <Text style={[styles.lbl, { width: 50 }]}>HOUR</Text>
              <View style={{ width: 14 }} />
              <Text style={[styles.lbl, { width: 50 }]}>MIN</Text>
            </View>

          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 16, fontWeight: '800', color: '#111' },
  btnCancel: { fontSize: 15, color: '#6b7280', fontWeight: '600' },
  btnDone:   { fontSize: 15, color: '#16a34a', fontWeight: '900' },
  preview: {
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#f9fafb',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  previewText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  drums: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 4,
  },
  divider: {
    width: 1,
    height: DRUM_H * 0.5,
    backgroundColor: '#d1d5db',
    marginHorizontal: 6,
  },
  colon: { width: 14, alignItems: 'center', justifyContent: 'center' },
  colonText: { fontSize: 22, fontWeight: '900', color: '#374151' },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 8,
    paddingTop: 2,
  },
  lbl: { fontSize: 9, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8, textAlign: 'center' },
});