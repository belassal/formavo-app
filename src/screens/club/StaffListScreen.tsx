import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import { listenClub, listenClubMembers } from '../../services/clubService';
import type { Club, ClubMember, ClubRole } from '../../services/clubService';
import Avatar from '../../components/Avatar';
import InviteStaffModal from './InviteStaffModal';
import { listenMyTeams } from '../../services/teamService';
import auth from '@react-native-firebase/auth';

type Props = NativeStackScreenProps<TeamsStackParamList, 'StaffList'>;

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

function RoleBadge({ role }: { role: ClubRole }) {
  return (
    <View
      style={{
        backgroundColor: ROLE_COLORS[role] ?? '#6b7280',
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
        {ROLE_LABELS[role] ?? role}
      </Text>
    </View>
  );
}

function StatusBadge() {
  return (
    <View
      style={{
        backgroundColor: '#f59e0b',
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Pending</Text>
    </View>
  );
}

export default function StaffListScreen({ route }: Props) {
  const { clubId, clubName, viewerRole } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<TeamsStackParamList>>();

  const uid = auth().currentUser?.uid ?? null;

  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  // Teams for invite modal
  const [myTeams, setMyTeams] = useState<Array<{ id: string; name: string }>>([]);

  const canInvite = viewerRole === 'owner' || viewerRole === 'head_coach';

  useEffect(() => {
    const unsubClub = listenClub(clubId, (c) => setClub(c));
    const unsubMembers = listenClubMembers(clubId, (m) => {
      setMembers(m);
      setLoading(false);
    });
    return () => {
      unsubClub();
      unsubMembers();
    };
  }, [clubId]);

  useEffect(() => {
    if (!uid) return;
    const unsub = listenMyTeams(uid, (rows: any[]) => {
      setMyTeams(
        rows
          .filter((r) => !r.isDeleted && r.role !== 'parent')
          .map((r) => ({ id: r.id, name: r.teamName || r.id })),
      );
    });
    return () => unsub();
  }, [uid]);

  const inviterName = auth().currentUser?.displayName ?? auth().currentUser?.email ?? 'Coach';

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f2f2f7' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>

        {/* Header card */}
        <View style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>
              {club?.name ?? clubName ?? 'Club Staff'}
            </Text>
            {canInvite && (
              <TouchableOpacity
                onPress={() => setShowInvite(true)}
                style={{ paddingVertical: 6, paddingHorizontal: 14, backgroundColor: '#f3f4f6', borderRadius: 20 }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>+ Invite</Text>
              </TouchableOpacity>
            )}
          </View>

          {members.length === 0 ? (
            <>
              <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />
              <View style={{ paddingHorizontal: 16, paddingVertical: 20 }}>
                <Text style={{ color: '#9ca3af', fontSize: 14 }}>No staff members yet.</Text>
              </View>
            </>
          ) : (
            members.map((member, index) => (
              <View key={member.id}>
                <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('StaffProfile', {
                      clubId,
                      memberId: member.id,
                      memberName: member.displayName,
                      viewerRole,
                    })
                  }
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}
                  activeOpacity={0.6}
                >
                  <Avatar
                    name={member.displayName || member.email || '?'}
                    avatarUrl={member.photoUrl}
                    size={40}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>
                      {member.displayName || member.email}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
                      <RoleBadge role={member.role} />
                      {member.status === 'invited' && <StatusBadge />}
                      {member.teamIds && member.teamIds.length > 0 && (
                        <Text style={{ fontSize: 12, color: '#6b7280' }}>
                          {member.teamIds.length} {member.teamIds.length === 1 ? 'team' : 'teams'}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Text style={{ fontSize: 18, color: '#c7c7cc' }}>›</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

      </ScrollView>

      <InviteStaffModal
        visible={showInvite}
        onClose={() => setShowInvite(false)}
        clubId={clubId}
        teams={myTeams}
        invitedByName={inviterName}
      />
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
