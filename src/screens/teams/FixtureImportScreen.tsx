/**
 * FixtureImportScreen — bulk-create matches from a league schedule.
 * Two inputs, no native dependencies:
 *   • ICS URL — fetch and parse a published calendar (league sites, TeamSnap
 *     exports, Google Calendar public links)
 *   • CSV paste — one fixture per line: date time, opponent, location
 * Parsed fixtures are previewed with checkboxes; duplicates (same date +
 * opponent) are pre-unchecked. One formation/format applies to the batch.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { createMatch, listenMatches } from '../../services/matchService';
import FormationPickerModal, { type FormationPickerResult } from '../matches/components/FormationPickerModal';

type Params = { FixtureImport: { teamId: string; seasonId?: string } };

type ParsedFixture = {
  dateISO: string;
  opponent: string;
  location: string;
  selected: boolean;
  duplicate: boolean;
};

function pad2(n: number) { return String(n).padStart(2, '0'); }

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Parse ICS text into fixtures. Handles DTSTART with Z (UTC), TZID, and date-only forms. */
export function parseICS(text: string): Omit<ParsedFixture, 'selected' | 'duplicate'>[] {
  const out: Omit<ParsedFixture, 'selected' | 'duplicate'>[] = [];
  const unfolded = text.replace(/\r?\n[ \t]/g, ''); // unfold continuation lines
  const events = unfolded.split('BEGIN:VEVENT').slice(1);
  for (const ev of events) {
    const dtMatch = ev.match(/DTSTART[^:]*:(\d{8})(T(\d{6})(Z)?)?/);
    if (!dtMatch) continue;
    const [, ymd, , hms, isUTC] = dtMatch;
    const y = +ymd.slice(0, 4), mo = +ymd.slice(4, 6) - 1, da = +ymd.slice(6, 8);
    let date: Date;
    if (hms) {
      const h = +hms.slice(0, 2), mi = +hms.slice(2, 4);
      date = isUTC ? new Date(Date.UTC(y, mo, da, h, mi)) : new Date(y, mo, da, h, mi);
    } else {
      date = new Date(y, mo, da, 12, 0); // date-only: assume midday
    }
    const summary = (ev.match(/SUMMARY[^:]*:(.*)/)?.[1] ?? '').trim();
    const location = (ev.match(/LOCATION[^:]*:(.*)/)?.[1] ?? '').trim()
      .replace(/\\,/g, ',').replace(/\\;/g, ';');
    // Opponent heuristics: strip common prefixes like "vs", "TeamName vs "
    const opponent = summary
      .replace(/\\,/g, ',')
      .replace(/^.*\bvs\.?\s+/i, '')
      .replace(/^\s*match:?\s*/i, '')
      .trim() || summary || 'Opponent';
    out.push({ dateISO: toISO(date), opponent, location });
  }
  return out;
}

/** Parse pasted CSV/TSV lines: date [time], opponent, [location]. */
export function parseCSV(text: string): Omit<ParsedFixture, 'selected' | 'duplicate'>[] {
  const out: Omit<ParsedFixture, 'selected' | 'duplicate'>[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\t|,/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    // First part (possibly first two) is the date/time
    let dateStr = parts[0];
    let rest = parts.slice(1);
    if (rest.length && /^\d{1,2}:\d{2}/.test(rest[0])) {
      dateStr = `${dateStr} ${rest[0]}`;
      rest = rest.slice(1);
    }
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime()) || rest.length === 0) continue;
    if (!/\d{1,2}:\d{2}/.test(dateStr)) parsed.setHours(12, 0);
    out.push({
      dateISO: toISO(parsed),
      opponent: rest[0],
      location: rest.slice(1).join(', '),
    });
  }
  return out;
}

export default function FixtureImportScreen() {
  const route = useRoute<RouteProp<Params, 'FixtureImport'>>();
  const navigation = useNavigation<any>();
  const { teamId, seasonId } = route.params;

  const [mode, setMode] = useState<'url' | 'csv'>('url');
  const [url, setUrl] = useState('');
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [fixtures, setFixtures] = useState<ParsedFixture[] | null>(null);
  const [existing, setExisting] = useState<{ dateKey: string; opponent: string }[]>([]);
  const [formation, setFormation] = useState<{ format: string; name: string } | null>(null);
  const [showFormationPicker, setShowFormationPicker] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => listenMatches(teamId, (rows) => {
    setExisting(rows.filter((m: any) => !m.isDeleted).map((m: any) => ({
      dateKey: (m.dateISO || '').substring(0, 10),
      opponent: (m.opponent || '').toLowerCase(),
    })));
  }), [teamId]);

  const markDuplicates = (list: Omit<ParsedFixture, 'selected' | 'duplicate'>[]): ParsedFixture[] =>
    list.map((f) => {
      const dup = existing.some(
        (e) => e.dateKey === f.dateISO.substring(0, 10) && e.opponent === f.opponent.toLowerCase(),
      );
      return { ...f, duplicate: dup, selected: !dup };
    });

  const runParse = async () => {
    setBusy(true);
    try {
      let parsed: Omit<ParsedFixture, 'selected' | 'duplicate'>[] = [];
      if (mode === 'url') {
        if (!url.trim()) { Alert.alert('Enter a schedule URL'); return; }
        const res = await fetch(url.trim().replace(/^webcal:\/\//i, 'https://'));
        const text = await res.text();
        parsed = text.includes('BEGIN:VEVENT') ? parseICS(text) : parseCSV(text);
      } else {
        parsed = csv.includes('BEGIN:VEVENT') ? parseICS(csv) : parseCSV(csv);
      }
      if (parsed.length === 0) {
        Alert.alert('Nothing found', 'No fixtures could be read from that input. Check the format hint below.');
        return;
      }
      parsed.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
      setFixtures(markDuplicates(parsed));
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? 'Could not read the schedule.');
    } finally {
      setBusy(false);
    }
  };

  const createSelected = async () => {
    const selected = (fixtures || []).filter((f) => f.selected);
    if (selected.length === 0) return;
    setCreating(true);
    try {
      for (const f of selected) {
        await createMatch({
          teamId,
          opponent: f.opponent,
          dateISO: f.dateISO,
          location: f.location,
          format: formation?.format ?? '',
          formation: formation?.name ?? '',
          halfDuration: 45,
          ...(seasonId ? { seasonId } : {}),
        });
      }
      Alert.alert('Imported', `${selected.length} match${selected.length === 1 ? '' : 'es'} created.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  const selectedCount = (fixtures || []).filter((f) => f.selected).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Mode toggle */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['url', 'csv'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => { setMode(m); setFixtures(null); }}
                style={{
                  paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
                  backgroundColor: mode === m ? '#111' : '#fff',
                  borderWidth: 1, borderColor: mode === m ? '#111' : '#e5e7eb',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: mode === m ? '#fff' : '#374151' }}>
                  {m === 'url' ? 'Schedule link' : 'Paste text'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'url' ? (
            <>
              <TextInput
                value={url}
                onChangeText={setUrl}
                placeholder="https://… calendar or schedule link (.ics)"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={s.input}
              />
              <Text style={s.hint}>
                Works with published calendar links from league sites and Google Calendar
                (webcal:// links are fine too).
              </Text>
            </>
          ) : (
            <>
              <TextInput
                value={csv}
                onChangeText={setCsv}
                placeholder={'One fixture per line:\n2026-09-14 10:00, Valley United, Weir Field\n2026-09-21 12:30, Harbour City FC'}
                placeholderTextColor="#9ca3af"
                multiline
                style={[s.input, { minHeight: 120, textAlignVertical: 'top' }]}
              />
              <Text style={s.hint}>
                Format: date time, opponent, location (location optional). Pasted ICS text works too.
              </Text>
            </>
          )}

          <TouchableOpacity
            onPress={runParse}
            disabled={busy}
            style={{ backgroundColor: '#111', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 12, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? <ActivityIndicator color="#fff" /> : (
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Preview fixtures</Text>
            )}
          </TouchableOpacity>

          {/* Preview */}
          {fixtures && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#111' }}>
                  {fixtures.length} found · {selectedCount} selected
                </Text>
                <TouchableOpacity onPress={() => setShowFormationPicker(true)}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#16a34a' }}>
                    {formation ? `${formation.format} · ${formation.name}` : 'Set format/formation ›'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', marginTop: 10, overflow: 'hidden' }}>
                {fixtures.map((f, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setFixtures((prev) => prev!.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13,
                      borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#f3f4f6',
                      opacity: f.selected ? 1 : 0.45,
                    }}
                  >
                    <View style={{
                      width: 22, height: 22, borderRadius: 6,
                      backgroundColor: f.selected ? '#22c55e' : '#e5e7eb',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {f.selected && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#111' }}>
                        vs {f.opponent}{f.duplicate ? '  · already exists' : ''}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
                        {f.dateISO}{f.location ? ` · ${f.location}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={createSelected}
                disabled={creating || selectedCount === 0}
                style={{
                  backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
                  marginTop: 14, opacity: creating || selectedCount === 0 ? 0.5 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                  {creating ? 'Creating…' : `Create ${selectedCount} match${selectedCount === 1 ? '' : 'es'}`}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <FormationPickerModal
        visible={showFormationPicker}
        onClose={() => setShowFormationPicker(false)}
        onConfirm={(r: FormationPickerResult) => {
          setFormation({ format: r.format, name: r.formation.name });
          setShowFormationPicker(false);
        }}
      />
    </SafeAreaView>
  );
}

const s = {
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12,
    padding: 12, fontSize: 14, color: '#111', marginTop: 12,
  } as const,
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 6, lineHeight: 17 } as const,
};
