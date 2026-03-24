import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import {
  getClubPlayer,
  updateClubPlayer,
  syncClubPlayerToMemberships,
  type ClubPlayer,
} from '../../services/clubPlayerService';
import { pickPlayerPhoto, uploadPlayerAvatar } from '../../services/storageService';
import Avatar from '../../components/Avatar';
import DateTimePickerModal from '../../components/DateTimePickerModal';

type Route = RouteProp<TeamsStackParamList, 'PlayerEdit'>;
type Nav = NativeStackNavigationProp<TeamsStackParamList>;

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];

function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 }}>
      {children}
    </Text>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
}) {
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
      <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
        <Text style={{ width: 110, fontSize: 14, fontWeight: '500', color: '#6b7280', paddingTop: multiline ? 2 : 0 }}>
          {label}
        </Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? label}
          placeholderTextColor="#d1d5db"
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize={autoCapitalize ?? 'words'}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          style={{
            flex: 1,
            fontSize: 15,
            color: '#111',
            minHeight: multiline ? 80 : undefined,
            textAlignVertical: multiline ? 'top' : 'auto',
          }}
        />
      </View>
    </View>
  );
}

export default function PlayerEditScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { clubId, playerId } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [number, setNumber] = useState('');
  const [positions, setPositions] = useState<string[]>([]);
  const [dob, setDob] = useState('');
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Derived display name for avatar
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'Player';

  useEffect(() => {
    getClubPlayer({ clubId, playerId })
      .then((p) => {
        if (!p) return;
        // Populate first/last from existing name if not yet split
        setFirstName(p.firstName ?? (p.name?.split(' ')[0] ?? ''));
        setLastName(p.lastName ?? (p.name?.split(' ').slice(1).join(' ') ?? ''));
        setNumber(p.number ?? '');
        // Load positions array; fall back to splitting legacy position string
        if (p.positions && p.positions.length > 0) {
          setPositions(p.positions);
        } else if (p.position) {
          setPositions(p.position.split(/[\s·,/]+/).map((s) => s.trim()).filter(Boolean));
        }
        setDob(p.dob ?? '');
        setPhone(p.phone ?? '');
        setEmail(p.email ?? '');
        setGuardianName(p.guardianName ?? '');
        setGuardianPhone(p.guardianPhone ?? '');
        setGuardianEmail(p.guardianEmail ?? '');
        setNotes(p.notes ?? '');
        setAvatarUrl(p.avatarUrl ?? null);
      })
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [clubId, playerId]);

  const handlePickPhoto = async () => {
    try {
      const uri = await pickPlayerPhoto();
      if (!uri) return;
      setUploadingPhoto(true);
      const url = await uploadPlayerAvatar(playerId, uri);
      setAvatarUrl(url);
      // Save avatar immediately
      await updateClubPlayer({ clubId, playerId, avatarUrl: url });
    } catch (e: any) {
      Alert.alert('Photo Error', e?.message ?? 'Could not upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!firstName.trim() && !lastName.trim()) {
      Alert.alert('Name required', 'Please enter at least a first or last name.');
      return;
    }
    const f = firstName.trim();
    const l = lastName.trim();
    const fullName = [f, l].filter(Boolean).join(' ') || 'Unknown';
    const num = number.trim();

    try {
      setSaving(true);
      await updateClubPlayer({
        clubId,
        playerId,
        firstName: f,
        lastName: l,
        number: num,
        positions,
        dob: dob.trim(),
        phone: phone.trim(),
        email: email.trim(),
        guardianName: guardianName.trim(),
        guardianPhone: guardianPhone.trim(),
        guardianEmail: guardianEmail.trim(),
        notes: notes.trim(),
      });
      // Propagate name/number/positions/avatar to every team membership in the club
      await syncClubPlayerToMemberships({
        clubId,
        playerId,
        name: fullName,
        number: num,
        positions,
        avatarUrl,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Save Failed', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f2f2f7' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={{ flex: 1, backgroundColor: '#f2f2f7' }} contentContainerStyle={{ padding: 16, gap: 20 }}>

        {/* ── Photo ── */}
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <TouchableOpacity onPress={handlePickPhoto} disabled={uploadingPhoto} activeOpacity={0.8}>
            <View>
              <Avatar name={displayName} avatarUrl={avatarUrl} size={90} />
              <View style={{
                position: 'absolute', bottom: 0, right: 0,
                backgroundColor: '#111', borderRadius: 999,
                width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: '#f2f2f7',
              }}>
                {uploadingPhoto
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontSize: 14 }}>✎</Text>
                }
              </View>
            </View>
          </TouchableOpacity>
          <Text style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>Tap to change photo</Text>
        </View>

        {/* ── Personal info ── */}
        <View>
          <SectionLabel>PERSONAL INFO</SectionLabel>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
            <Field label="First Name" value={firstName} onChangeText={setFirstName} />
            <Field label="Last Name" value={lastName} onChangeText={setLastName} />

            {/* DOB row */}
            <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
              <TouchableOpacity
                onPress={() => setShowDobPicker(true)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
              >
                <Text style={{ width: 110, fontSize: 14, fontWeight: '500', color: '#6b7280' }}>Date of Birth</Text>
                <Text style={{ flex: 1, fontSize: 15, color: dob ? '#111' : '#d1d5db' }}>
                  {dob ? formatDob(dob) : 'Select date'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Team info ── */}
        <View>
          <SectionLabel>TEAM INFO</SectionLabel>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
            <Field
              label="Jersey #"
              value={number}
              onChangeText={setNumber}
              placeholder="e.g. 10"
              keyboardType="number-pad"
              autoCapitalize="none"
            />

            {/* Position picker row — multi-select */}
            <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#6b7280', marginBottom: 10 }}>
                Position{positions.length > 1 ? 's' : ''}
                {positions.length > 0 ? (
                  <Text style={{ color: '#9ca3af', fontWeight: '400' }}>  {positions.join(' · ')}</Text>
                ) : null}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {POSITIONS.map((pos) => {
                  const selected = positions.includes(pos);
                  return (
                    <TouchableOpacity
                      key={pos}
                      onPress={() =>
                        setPositions((prev) =>
                          selected ? prev.filter((p) => p !== pos) : [...prev, pos],
                        )
                      }
                      style={{
                        paddingVertical: 6, paddingHorizontal: 14,
                        borderRadius: 999,
                        backgroundColor: selected ? '#111' : '#f3f4f6',
                        borderWidth: 1,
                        borderColor: selected ? '#111' : '#e5e7eb',
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: selected ? '#fff' : '#374151' }}>
                        {pos}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        {/* ── Contact ── */}
        <View>
          <SectionLabel>PLAYER CONTACT</SectionLabel>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="player@email.com" keyboardType="email-address" autoCapitalize="none" />
            <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+1 (555) 000-0000" keyboardType="phone-pad" autoCapitalize="none" />
          </View>
        </View>

        {/* ── Guardian ── */}
        <View>
          <SectionLabel>GUARDIAN / PARENT</SectionLabel>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
            <Field label="Name" value={guardianName} onChangeText={setGuardianName} placeholder="Guardian full name" />
            <Field label="Phone" value={guardianPhone} onChangeText={setGuardianPhone} placeholder="+1 (555) 000-0000" keyboardType="phone-pad" autoCapitalize="none" />
            <Field label="Email" value={guardianEmail} onChangeText={setGuardianEmail} placeholder="guardian@email.com" keyboardType="email-address" autoCapitalize="none" />
          </View>
        </View>

        {/* ── Notes ── */}
        <View>
          <SectionLabel>NOTES</SectionLabel>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
            <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Any additional info…" multiline autoCapitalize="sentences" />
          </View>
        </View>

        {/* ── Save ── */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={{
            backgroundColor: '#111', borderRadius: 14,
            paddingVertical: 16, alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      <DateTimePickerModal
        visible={showDobPicker}
        value={dob || `${new Date().getFullYear() - 10}-01-01`}
        onConfirm={(iso) => { setDob(iso); setShowDobPicker(false); }}
        onClose={() => setShowDobPicker(false)}
        minYear={1990}
        maxYear={new Date().getFullYear()}
        dateOnly
      />
    </KeyboardAvoidingView>
  );
}

function formatDob(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}
