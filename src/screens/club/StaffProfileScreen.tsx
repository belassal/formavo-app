import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import {
  listenClubMembers,
  removeMember,
  updateMemberRole,
  updateMemberTeams,
} from '../../services/clubService';
import type { ClubMember, ClubRole } from '../../services/clubService';
import Avatar from '../../components/Avatar';
import { listenMyTeams } from '../../services/teamService';
import { getUserProfile, type UserProfile } from '../../services/userService';
import auth from '@react-native-firebase/auth';

type Props = NativeStackScreenProps<TeamsStackParamList, 'StaffProfile'>;

const ROLE_LABELS: Record<ClubRole, string> = {
  owner: 'Owner',
  head_coach: 'Head Coach',
  asst_coach: 'Asst Coach',
  staff: 'Staff',
};

const ROLE_COLORS: Record<ClubRole, string> = {
  owner: '#111',
  head_coach: '#1d4ed8',
  asst_coach: '#4f46e5',
  staff: '#6b7280',
};

const ROLE_OPTIONS: ClubRole[] = ['owner', 'head_coach', 'asst_coach', 'staff'];

function InfoRow({ icon, value, multiline }: { icon: string; value: string; multiline?: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center',
      paddingHorizontal: 16, paddingVertical: 12,
      borderTopWidth: 1, borderTopColor: '#f3f4f6', gap: 12,
    }}>
      <Text style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{icon}</Text>
      <Text style={{ flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 }}>{value}</Text>
    </View>
  );
}

function RoleBadge({ role }: { role: ClubRole }) {
  return (
    <View
      style={{
        backgroundColor: ROLE_COLORS[role] ?? '#6b7280',
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 3,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
        {ROLE_LABELS[role] ?? role}
      </Text>
    </View>
  );
}

export default function StaffProfileScreen({ route }: Props) {
  const { clubId, memberId, memberName, viewerRole } = route.params;
  const navigation = useNavigation();

  const uid = auth().currentUser?.uid ?? null;
  const isOwner = viewerRole === 'owner';

  const [member, setMember] = useState<ClubMember | null>(null);
  const [extProfile, setExtProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // All teams the viewer manages (for team assignment)
  const [allTeams, setAllTeams] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    const unsub = listenClubMembers(clubId, (members) => {
      const found = members.find((m) => m.id === memberId) ?? null;
      setMember(found);
      setLoading(false);
    });
    return () => unsub();
  }, [clubId, memberId]);

  // Load extended profile from users/{memberId} if available
  useEffect(() => {
    getUserProfile(memberId).then(setExtProfile).catch(console.warn);
  }, [memberId]);

  useEffect(() => {
    if (!uid) return;
    const unsub = listenMyTeams(uid, (rows: any[]) => {
      setAllTeams(
        rows
          .filter((r) => !r.isDeleted && r.role !== 'parent')
          .map((r) => ({ id: r.id, name: r.teamName || r.id })),
      );
    });
    return () => unsub();
  }, [uid]);

  const handleRoleChange = async (newRole: ClubRole) => {
    if (!member) return;
    try {
      setSaving(true);
      await updateMemberRole({ clubId, userId: memberId, role: newRole });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update role.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTeam = async (teamId: string) => {
    if (!member) return;
    const current = member.teamIds ?? [];
    const next = current.includes(teamId)
      ? current.filter((id) => id !== teamId)
      : [...current, teamId];
    try {
      setSaving(true);
      await updateMemberTeams({ clubId, userId: memberId, teamIds: next });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update team assignment.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove from Club',
      `Are you sure you want to remove ${member?.displayName || 'this member'} from the club?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember({ clubId, userId: memberId });
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not remove member.');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f2f2f7' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!member) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16, backgroundColor: '#f2f2f7' }}>
        <Text style={{ color: '#6b7280', marginTop: 20 }}>Member not found.</Text>
      </SafeAreaView>
    );
  }

  const assignedTeamIds = member.teamIds ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>

        {/* Profile Header Card */}
        <View style={cardStyle}>
          <View style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 20, paddingHorizontal: 20, gap: 12 }}>
            <Avatar
              name={member.displayName || member.email || '?'}
              avatarUrl={extProfile?.photoUrl ?? member.photoUrl}
              size={80}
            />
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#111' }}>
                {member.displayName || member.email}
              </Text>
              {member.email && member.displayName !== member.email && (
                <Text style={{ fontSize: 14, color: '#6b7280' }}>{member.email}</Text>
              )}
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                <RoleBadge role={member.role} />
                {member.status === 'invited' && (
                  <View style={{ backgroundColor: '#f59e0b', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Pending Invite</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Extra info rows */}
          {(extProfile?.phone || extProfile?.bio || member.email) && (
            <>
              {member.email ? (
                <InfoRow icon="✉" value={member.email} />
              ) : null}
              {extProfile?.phone ? (
                <InfoRow icon="📞" value={extProfile.phone} />
              ) : null}
              {extProfile?.bio ? (
                <InfoRow icon="💬" value={extProfile.bio} multiline />
              ) : null}
            </>
          )}
        </View>

        {/* Role Picker (owner only) */}
        {isOwner && member.role !== 'owner' && (
          <View style={cardStyle}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 13 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>Role</Text>
            </View>
            <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />
            <View style={{ padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ROLE_OPTIONS.filter((r) => r !== 'owner').map((roleOption) => {
                const active = member.role === roleOption;
                return (
                  <TouchableOpacity
                    key={roleOption}
                    onPress={() => handleRoleChange(roleOption)}
                    disabled={saving}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: active ? ROLE_COLORS[roleOption] : '#f3f4f6',
                      borderWidth: active ? 0 : 1,
                      borderColor: '#e5e7eb',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: active ? '#fff' : '#374151',
                      }}
                    >
                      {ROLE_LABELS[roleOption]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Team Assignments */}
        <View style={cardStyle}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 13 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>Team Assignments</Text>
          </View>

          {allTeams.length === 0 ? (
            <>
              <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />
              <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
                <Text style={{ color: '#9ca3af', fontSize: 14 }}>No teams available.</Text>
              </View>
            </>
          ) : (
            allTeams.map((team) => {
              const assigned = assignedTeamIds.includes(team.id);
              return (
                <View key={team.id}>
                  <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />
                  <TouchableOpacity
                    onPress={() => isOwner && handleToggleTeam(team.id)}
                    disabled={!isOwner || saving}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      gap: 12,
                    }}
                    activeOpacity={isOwner ? 0.6 : 1}
                  >
                    {/* Checkbox indicator */}
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        borderWidth: 2,
                        borderColor: assigned ? '#111' : '#d1d5db',
                        backgroundColor: assigned ? '#111' : '#fff',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {assigned && (
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 }}>✓</Text>
                      )}
                    </View>
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: '#111' }}>
                      {team.name}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

        {/* Remove from Club (owner only, not for self or other owners) */}
        {isOwner && member.role !== 'owner' && (
          <TouchableOpacity
            onPress={handleRemove}
            style={{
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#fecaca',
              paddingVertical: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 15 }}>
              Remove from Club
            </Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const cardStyle = {
  backgroundColor: '#fff',
  borderRadius: 14,
  borderWidth: 1,
  borderColor: '#e5e7eb',
  overflow: 'hidden' as const,
};
