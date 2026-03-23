import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { startNewSeason } from '../../../services/seasonService';

type RosterPlayer = {
  id: string;
  playerName: string;
  number?: string;
  position?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  teamId: string;
  currentSeasonId: string | null;
  currentRoster: RosterPlayer[];
  onCreated: (newSeasonId: string) => void;
};

function getNextSeasonLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  return `${year}/${year + 1}`;
}

function getNextSeasonYear(): number {
  const now = new Date();
  return now.getFullYear() + 1;
}

export default function NewSeasonModal({
  visible,
  onClose,
  teamId,
  currentSeasonId,
  currentRoster,
  onCreated,
}: Props) {
  const [label, setLabel] = useState(getNextSeasonLabel());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Pre-select all players when modal opens
  useEffect(() => {
    if (visible) {
      setLabel(getNextSeasonLabel());
      setSelectedIds(new Set(currentRoster.map((p) => p.id)));
    }
  }, [visible, currentRoster]);

  const togglePlayer = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(currentRoster.map((p) => p.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const onConfirm = async () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      Alert.alert('Missing Label', 'Please enter a season label, e.g. "2026/2027".');
      return;
    }

    try {
      setSaving(true);
      const newSeasonId = await startNewSeason({
        teamId,
        label: trimmedLabel,
        year: getNextSeasonYear(),
        keepPlayerIds: Array.from(selectedIds),
      });
      onCreated(newSeasonId);
      onClose();
    } catch (e: any) {
      Alert.alert('Failed', e?.message ?? 'Could not start new season. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.35)',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: 20,
            paddingBottom: 32,
            maxHeight: '85%',
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>
              Start New Season
            </Text>
            <TouchableOpacity
              onPress={onClose}
              disabled={saving}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#6b7280' }}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
          >
            {/* Season label input */}
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 }}>
              Season label
            </Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder='e.g. "2026/2027" or "2026 Fall"'
              placeholderTextColor="#9ca3af"
              style={{
                borderWidth: 1,
                borderColor: '#e5e7eb',
                padding: 12,
                borderRadius: 12,
                fontSize: 15,
                color: '#111',
                marginBottom: 20,
              }}
              editable={!saving}
            />

            {/* Player selection header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>
                Which players are returning?
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={selectAll}
                  disabled={saving}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    backgroundColor: '#f3f4f6',
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>
                    All
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={deselectAll}
                  disabled={saving}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    backgroundColor: '#f3f4f6',
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>
                    None
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {currentRoster.length === 0 ? (
              <View
                style={{
                  paddingVertical: 20,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#e5e7eb',
                  backgroundColor: '#fafafa',
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <Text style={{ color: '#9ca3af', fontSize: 14 }}>
                  No players on the current roster.
                </Text>
              </View>
            ) : (
              <View
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#e5e7eb',
                  backgroundColor: '#fff',
                  overflow: 'hidden',
                  marginBottom: 16,
                }}
              >
                {currentRoster.map((player, idx) => {
                  const isChecked = selectedIds.has(player.id);
                  return (
                    <View key={player.id}>
                      {idx > 0 && (
                        <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />
                      )}
                      <TouchableOpacity
                        onPress={() => togglePlayer(player.id)}
                        disabled={saving}
                        activeOpacity={0.6}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 16,
                          paddingVertical: 12,
                          backgroundColor: isChecked ? '#f0fdf4' : 'transparent',
                        }}
                      >
                        {/* Checkbox */}
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            borderWidth: 2,
                            borderColor: isChecked ? '#16a34a' : '#d1d5db',
                            backgroundColor: isChecked ? '#16a34a' : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 12,
                          }}
                        >
                          {isChecked ? (
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>✓</Text>
                          ) : null}
                        </View>

                        {/* Player info */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>
                            {player.playerName}
                            {player.number ? `  #${player.number}` : ''}
                          </Text>
                          {player.position ? (
                            <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
                              {player.position}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Selected count */}
            <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 16, textAlign: 'center' }}>
              {selectedIds.size} of {currentRoster.length} players selected
            </Text>
          </ScrollView>

          {/* Action button */}
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <TouchableOpacity
              onPress={onConfirm}
              disabled={saving}
              activeOpacity={0.8}
              style={{
                paddingVertical: 14,
                borderRadius: 14,
                backgroundColor: saving ? '#9ca3af' : '#111',
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {saving ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                    Starting…
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                  Start New Season
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
