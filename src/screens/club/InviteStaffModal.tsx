import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { inviteStaffMember } from '../../services/clubService';
import type { ClubRole } from '../../services/clubService';
import { defaultPositionForClubRole } from '../../models/staffPosition';
import { listenClubPositions, DEFAULT_POSITIONS } from '../../services/staffPositionService';

type Props = {
  visible: boolean;
  onClose: () => void;
  clubId: string;
  teams: Array<{ id: string; name: string }>;
  invitedByName: string;
};

const ROLE_OPTIONS: Array<{ value: ClubRole; label: string }> = [
  { value: 'head_coach', label: 'Head Coach' },
  { value: 'asst_coach', label: 'Asst Coach' },
  { value: 'staff', label: 'Staff' },
];

const ROLE_COLORS: Record<ClubRole, string> = {
  owner: '#111',
  head_coach: '#1d4ed8',
  asst_coach: '#4f46e5',
  staff: '#6b7280',
};

export default function InviteStaffModal({ visible, onClose, clubId, teams, invitedByName }: Props) {
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<ClubRole>('asst_coach');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  // Per-team position title, keyed by teamId (defaults from the club role).
  const [teamPositions, setTeamPositions] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  const [clubPositions, setClubPositions] = useState<string[]>(DEFAULT_POSITIONS);
  useEffect(() => listenClubPositions(clubId, setClubPositions), [clubId]);

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) => {
      const selected = prev.includes(teamId);
      setTeamPositions((pos) => {
        const next = { ...pos };
        if (selected) delete next[teamId];
        else next[teamId] = defaultPositionForClubRole(selectedRole);
        return next;
      });
      return selected ? prev.filter((id) => id !== teamId) : [...prev, teamId];
    });
  };

  const handleSend = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    try {
      setSending(true);
      await inviteStaffMember({
        clubId,
        email: trimmedEmail,
        role: selectedRole,
        teamIds: selectedTeamIds,
        teamPositions,
        invitedByName,
      });
      // Reset and close
      setEmail('');
      setSelectedRole('asst_coach');
      setSelectedTeamIds([]);
      setTeamPositions({});
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not send invite.');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setSelectedRole('asst_coach');
    setSelectedTeamIds([]);
    setTeamPositions({});
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            gap: 16,
            maxHeight: '90%',
          }}
        >
          {/* Modal Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111' }}>Invite Staff Member</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={{ fontSize: 16, color: '#6b7280', fontWeight: '500' }}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>

            {/* Email Input */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Email Address
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="staff@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  borderWidth: 1,
                  borderColor: '#e5e7eb',
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 15,
                  color: '#111',
                }}
              />
            </View>

            {/* Role Picker */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Role
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {ROLE_OPTIONS.map((opt) => {
                  const active = selectedRole === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setSelectedRole(opt.value)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 12,
                        alignItems: 'center',
                        backgroundColor: active ? ROLE_COLORS[opt.value] : '#f3f4f6',
                        borderWidth: active ? 0 : 1,
                        borderColor: '#e5e7eb',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '700',
                          color: active ? '#fff' : '#374151',
                        }}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Team Assignments */}
            {teams.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Assign to Teams
                </Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#e5e7eb',
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                >
                  {teams.map((team, index) => {
                    const checked = selectedTeamIds.includes(team.id);
                    return (
                      <View key={team.id}>
                        {index > 0 && <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />}
                        <TouchableOpacity
                          onPress={() => toggleTeam(team.id)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            gap: 12,
                          }}
                          activeOpacity={0.6}
                        >
                          <View
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              borderWidth: 2,
                              borderColor: checked ? '#111' : '#d1d5db',
                              backgroundColor: checked ? '#111' : '#fff',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {checked && (
                              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 }}>✓</Text>
                            )}
                          </View>
                          <Text style={{ fontSize: 15, fontWeight: '500', color: '#111' }}>
                            {team.name}
                          </Text>
                        </TouchableOpacity>

                        {/* Position on this team */}
                        {checked && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 48, paddingRight: 14, paddingBottom: 10 }}>
                            {clubPositions.map((p) => {
                              const active = teamPositions[team.id] === p;
                              return (
                                <TouchableOpacity
                                  key={p}
                                  onPress={() => setTeamPositions((pos) => ({ ...pos, [team.id]: p }))}
                                  style={{
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: 20,
                                    backgroundColor: active ? '#111' : '#f3f4f6',
                                  }}
                                >
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>
                                    {p}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

          </ScrollView>

          {/* Send Button */}
          <TouchableOpacity
            onPress={handleSend}
            disabled={sending}
            style={{
              backgroundColor: '#111',
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              marginTop: 4,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
              {sending ? 'Sending...' : 'Send Invite'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
