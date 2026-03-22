import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { listenMatches } from '../../services/matchService';
import { setRsvp, type RsvpStatus } from '../../services/rsvpService';
import { db } from '../../services/firebase';
import { COL } from '../../models/collections';
import { formatDateISO } from '../../components/DateTimePickerModal';
import Avatar from '../../components/Avatar';

type ParentTeamRef = {
  id: string;       // same as teamId in Firestore
  teamId?: string;
  teamName?: string;
  linkedPlayerId: string;
  linkedPlayerName: string;
  avatarUrl?: string;
};

type Props = {
  parentTeamRefs: ParentTeamRef[];
  uid: string;
  onNavigateToMatch: (params: {
    teamId: string;
    matchId: string;
    teamName: string;
    opponent: string;
  }) => void;
};

type RsvpMap = Record<string, RsvpStatus>; // key: matchId

type ChildSectionProps = {
  teamRef: ParentTeamRef;
  uid: string;
  onNavigateToMatch: Props['onNavigateToMatch'];
};

function ChildSection({ teamRef, uid, onNavigateToMatch }: ChildSectionProps) {
  const teamId = teamRef.teamId || teamRef.id;
  const teamName = teamRef.teamName || 'Team';
  const { linkedPlayerId, linkedPlayerName } = teamRef;

  const [matches, setMatches] = useState<any[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [rsvpMap, setRsvpMap] = useState<RsvpMap>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({}); // matchId -> draft note
  const [savingRsvp, setSavingRsvp] = useState<string | null>(null); // matchId being saved

  const displayName = auth().currentUser?.displayName || auth().currentUser?.email || 'Parent';

  // Listen to all matches for this team
  useEffect(() => {
    const unsub = listenMatches(teamId, (rows) => {
      const visible = (rows || [])
        .filter((m: any) => !m.isDeleted)
        .sort((a: any, b: any) => String(b.dateISO || '').localeCompare(String(a.dateISO || '')));
      setMatches(visible);
      setLoadingMatches(false);
    });
    return () => unsub();
  }, [teamId]);

  // Listen to RSVP status for this player across all matches
  // We subscribe to each roster doc for the linked player
  useEffect(() => {
    if (!linkedPlayerId || matches.length === 0) return;

    const unsubs: (() => void)[] = matches.slice(0, 15).map((match) => {
      return db
        .collection(COL.teams)
        .doc(teamId)
        .collection(COL.matches)
        .doc(match.id)
        .collection(COL.roster)
        .doc(linkedPlayerId)
        .onSnapshot((snap) => {
          const data = snap.data();
          setRsvpMap((prev) => ({
            ...prev,
            [match.id]: (data?.rsvpStatus as RsvpStatus) || 'pending',
          }));
        });
    });

    return () => { unsubs.forEach((u) => u()); };
  }, [teamId, linkedPlayerId, matches]);

  const handleRsvp = async (matchId: string, status: RsvpStatus) => {
    setSavingRsvp(matchId);
    try {
      await setRsvp({
        teamId,
        matchId,
        playerId: linkedPlayerId,
        status,
        byUid: uid,
        confirmedByName: displayName,
        note: noteMap[matchId]?.trim() || undefined,
      });
      setRsvpMap((prev) => ({ ...prev, [matchId]: status }));
    } catch (e) {
      console.warn('[ParentMatchesSection] RSVP error', e);
    } finally {
      setSavingRsvp(null);
    }
  };

  const upcoming = matches.filter((m) => m.status !== 'completed');
  const past = matches.filter((m) => m.status === 'completed').slice(0, 5);

  return (
    <View style={{ marginBottom: 20 }}>
      {/* ── Child header ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Avatar name={linkedPlayerName} avatarUrl={teamRef.avatarUrl ?? null} size={36} />
        <View>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#111' }}>{linkedPlayerName}</Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{teamName}</Text>
        </View>
      </View>

      {loadingMatches ? (
        <ActivityIndicator style={{ marginTop: 12 }} />
      ) : matches.length === 0 ? (
        <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 20 }}>
          <Text style={{ color: '#9ca3af', fontSize: 14 }}>No matches scheduled yet.</Text>
        </View>
      ) : (
        <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>

          {/* Upcoming matches */}
          {upcoming.length > 0 && (
            <>
              <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#f9fafb' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5 }}>UPCOMING</Text>
              </View>
              {upcoming.map((match, idx) => {
                const rsvp: RsvpStatus = rsvpMap[match.id] ?? 'pending';
                const isSaving = savingRsvp === match.id;
                const isLive = match.status === 'live';

                return (
                  <View key={match.id}>
                    {idx > 0 && <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />}
                    <TouchableOpacity
                      onPress={() => onNavigateToMatch({ teamId, matchId: match.id, teamName, opponent: match.opponent || 'Opponent' })}
                      activeOpacity={0.7}
                      style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}
                    >
                      {/* Match info row */}
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                        <View style={{ flex: 1, marginRight: 12 }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>
                            vs {match.opponent || 'Opponent'}
                          </Text>
                          <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>
                            {match.dateISO ? formatDateISO(match.dateISO) : 'No date'}
                            {match.location ? ` · ${match.location}` : ''}
                          </Text>
                        </View>
                        {isLive && (
                          <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#dcfce7', borderRadius: 999 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a' }}>LIVE</Text>
                          </View>
                        )}
                      </View>

                      {/* RSVP buttons */}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => handleRsvp(match.id, 'attending')}
                          disabled={isSaving}
                          style={{
                            flex: 1,
                            paddingVertical: 9,
                            borderRadius: 10,
                            alignItems: 'center',
                            backgroundColor: rsvp === 'attending' ? '#16a34a' : '#f3f4f6',
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: rsvp === 'attending' ? '#fff' : '#374151' }}>
                            {isSaving ? '…' : '✓  Attending'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleRsvp(match.id, 'absent')}
                          disabled={isSaving}
                          style={{
                            flex: 1,
                            paddingVertical: 9,
                            borderRadius: 10,
                            alignItems: 'center',
                            backgroundColor: rsvp === 'absent' ? '#ef4444' : '#f3f4f6',
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: rsvp === 'absent' ? '#fff' : '#374151' }}>
                            {isSaving ? '…' : '✕  Can\'t Make It'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Note input */}
                      <TextInput
                        placeholder="Add a note (optional)…"
                        placeholderTextColor="#9ca3af"
                        value={noteMap[match.id] || ''}
                        onChangeText={(t) => setNoteMap((prev) => ({ ...prev, [match.id]: t }))}
                        style={{
                          marginTop: 8,
                          backgroundColor: '#f3f4f6',
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          fontSize: 13,
                          color: '#111',
                        }}
                      />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}

          {/* Past matches */}
          {past.length > 0 && (
            <>
              <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />
              <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#f9fafb' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5 }}>RECENT RESULTS</Text>
              </View>
              {past.map((match, idx) => {
                const hg = Number.isFinite(match.homeScore) ? match.homeScore : 0;
                const ag = Number.isFinite(match.awayScore) ? match.awayScore : 0;
                return (
                  <View key={match.id}>
                    {idx > 0 && <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />}
                    <TouchableOpacity
                      onPress={() => onNavigateToMatch({ teamId, matchId: match.id, teamName, opponent: match.opponent || 'Opponent' })}
                      activeOpacity={0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 }}
                    >
                      <View>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>
                          vs {match.opponent || 'Opponent'}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
                          {match.dateISO ? formatDateISO(match.dateISO) : ''}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>FT {hg}–{ag}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </View>
      )}
    </View>
  );
}

export default function ParentMatchesSection({ parentTeamRefs, uid, onNavigateToMatch }: Props) {
  if (parentTeamRefs.length === 0) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      {/* Section title */}
      <Text style={{ fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 14 }}>
        My Child's Matches
      </Text>

      {parentTeamRefs.map((ref) => (
        <ChildSection
          key={ref.id}
          teamRef={ref}
          uid={uid}
          onNavigateToMatch={onNavigateToMatch}
        />
      ))}
    </View>
  );
}
