/**
 * RosterImportScreen — bulk-create players (and optionally send parent
 * invites) from a pasted list. The club-migration path: a club moving onto
 * Formavo pastes a spreadsheet export instead of hand-typing every player.
 *
 * Accepts loose CSV: one player per line, comma/semicolon/tab separated.
 * Columns are detected per cell, so column order doesn't matter:
 *   • cell containing @        → parent email (invite sent)
 *   • cell of 1–3 digits       → jersey number
 *   • first remaining cell     → player name
 * A header line containing "name" is skipped automatically.
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
import auth from '@react-native-firebase/auth';
import { addPlayerToTeam, createGlobalPlayer, listenTeamMemberships } from '../../services/playerService';
import { inviteParent } from '../../services/teamService';

type Params = {
  RosterImport: { teamId: string; clubId?: string; seasonId?: string };
};

type ParsedRow = {
  name: string;
  number: string;
  parentEmail: string;
  duplicate: boolean;
  selected: boolean;
};

export function parseRosterText(text: string): Omit<ParsedRow, 'duplicate' | 'selected'>[] {
  const rows: Omit<ParsedRow, 'duplicate' | 'selected'>[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, '')).filter(Boolean);
    if (cells.length === 0) continue;
    // Skip a header line ("name, number, parent email", …)
    if (rows.length === 0 && cells.some((c) => /^(player\s*)?name$/i.test(c))) continue;

    let name = '';
    let number = '';
    let parentEmail = '';
    for (const cell of cells) {
      if (!parentEmail && cell.includes('@')) { parentEmail = cell.toLowerCase(); continue; }
      if (!number && /^#?\d{1,3}$/.test(cell)) { number = cell.replace(/^#/, ''); continue; }
      if (!name) { name = cell; }
    }
    if (name) rows.push({ name, number, parentEmail });
  }
  return rows;
}

export default function RosterImportScreen() {
  const route = useRoute<RouteProp<Params, 'RosterImport'>>();
  const navigation = useNavigation<any>();
  const { teamId, clubId, seasonId } = route.params;
  const uid = auth().currentUser?.uid ?? '';

  const [text, setText] = useState('');
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => listenTeamMemberships(
    teamId,
    (m) => setExistingNames(new Set(m.map((r: any) => (r.playerName || '').trim().toLowerCase()))),
    seasonId ? { seasonId } : undefined,
  ), [teamId, seasonId]);

  const runParse = () => {
    const parsed = parseRosterText(text);
    if (parsed.length === 0) {
      Alert.alert('Nothing found', 'No players could be read. One player per line: name, number, parent email (number and email optional, any order).');
      return;
    }
    setRows(parsed.map((r) => {
      const dup = existingNames.has(r.name.toLowerCase());
      return { ...r, duplicate: dup, selected: !dup };
    }));
  };

  const createSelected = async () => {
    const selected = (rows || []).filter((r) => r.selected);
    if (selected.length === 0 || !uid) return;
    setCreating(true);
    let created = 0;
    let invited = 0;
    const failures: string[] = [];
    try {
      for (const r of selected) {
        setProgress(`Adding ${r.name}… (${created + 1}/${selected.length})`);
        try {
          const playerId = await createGlobalPlayer({
            name: r.name, number: r.number, createdBy: uid, clubId: clubId ?? undefined,
          });
          await addPlayerToTeam({
            teamId, playerId, playerName: r.name, number: r.number,
            ...(seasonId ? { seasonId } : {}),
          });
          created++;
          if (r.parentEmail) {
            try {
              await inviteParent({
                teamId, inviteEmail: r.parentEmail, invitedBy: uid,
                linkedPlayerId: playerId, linkedPlayerName: r.name,
              });
              invited++;
            } catch (e: any) {
              failures.push(`${r.name}: invite failed (${e?.message ?? 'error'})`);
            }
          }
        } catch (e: any) {
          failures.push(`${r.name}: ${e?.message ?? 'error'}`);
        }
      }
      const lines = [
        `${created} player${created === 1 ? '' : 's'} added`,
        invited > 0 ? `${invited} parent invite${invited === 1 ? '' : 's'} sent` : '',
        ...failures.slice(0, 3),
        failures.length > 3 ? `…and ${failures.length - 3} more issues` : '',
      ].filter(Boolean);
      Alert.alert('Import complete', lines.join('\n'), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } finally {
      setCreating(false);
      setProgress('');
    }
  };

  const selectedCount = (rows || []).filter((r) => r.selected).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 12.5, color: '#9ca3af', lineHeight: 18 }}>
            Paste your roster — one player per line, from a spreadsheet or registration export.
            Number and parent email are optional and can be in any order:
          </Text>
          <View style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', padding: 10, marginTop: 8 }}>
            <Text style={{ fontSize: 12, color: '#6b7280', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
              Aiden MacDonald, 7, parent@email.com{'\n'}
              Liam Doucette, 10{'\n'}
              Emma Landry
            </Text>
          </View>

          <TextInput
            multiline
            value={text}
            onChangeText={(t) => { setText(t); setRows(null); }}
            placeholder="Paste roster here…"
            placeholderTextColor="#9ca3af"
            style={{
              backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12,
              padding: 12, fontSize: 14, color: '#111', minHeight: 140, marginTop: 12,
              textAlignVertical: 'top',
            }}
          />

          <TouchableOpacity
            onPress={runParse}
            style={{ backgroundColor: '#111', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 12 }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Preview players</Text>
          </TouchableOpacity>

          {rows && (
            <>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#111', marginTop: 20 }}>
                {rows.length} found · {selectedCount} selected
              </Text>
              <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', marginTop: 10, overflow: 'hidden' }}>
                {rows.map((r, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setRows((prev) => prev!.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13,
                      borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#f3f4f6',
                      opacity: r.selected ? 1 : 0.45,
                    }}
                  >
                    <View style={{
                      width: 22, height: 22, borderRadius: 6,
                      backgroundColor: r.selected ? '#22c55e' : '#e5e7eb',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {r.selected && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#111' }}>
                        {r.name}{r.number ? `  #${r.number}` : ''}{r.duplicate ? '  · already on roster' : ''}
                      </Text>
                      {!!r.parentEmail && (
                        <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
                          ✉️ invite {r.parentEmail}
                        </Text>
                      )}
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
                {creating ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{progress}</Text>
                  </View>
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                    Add {selectedCount} player{selectedCount === 1 ? '' : 's'}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
