import React from 'react';
import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Season } from '../../../services/seasonService';

type Props = {
  visible: boolean;
  onClose: () => void;
  teamId: string;
  seasons: Season[];
  currentSeasonId: string | null;
  onSelectSeason: (seasonId: string) => void;
  onNewSeason: () => void;
  isOwner: boolean;
};

export default function SeasonPickerModal({
  visible,
  onClose,
  teamId,
  seasons,
  currentSeasonId,
  onSelectSeason,
  onNewSeason,
  isOwner,
}: Props) {
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
            maxHeight: '70%',
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>
              Seasons
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#6b7280' }}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: '#e5e7eb', marginBottom: 4 }} />

          {/* Season list */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ flexGrow: 0 }}
          >
            {seasons.length === 0 ? (
              <View style={{ paddingHorizontal: 20, paddingVertical: 24 }}>
                <Text style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center' }}>
                  No seasons yet.
                </Text>
              </View>
            ) : (
              seasons.map((season, idx) => {
                const isSelected = season.id === currentSeasonId;
                const isActive = season.status === 'active';

                return (
                  <View key={season.id}>
                    {idx > 0 && (
                      <View style={{ height: 1, backgroundColor: '#f3f4f6', marginHorizontal: 20 }} />
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        onSelectSeason(season.id);
                        onClose();
                      }}
                      activeOpacity={0.6}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 20,
                        paddingVertical: 14,
                        backgroundColor: isSelected ? '#f0fdf4' : 'transparent',
                      }}
                    >
                      {/* Season label and badge */}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text
                            style={{
                              fontSize: 15,
                              fontWeight: '600',
                              color: '#111',
                            }}
                          >
                            {season.label}
                          </Text>
                          <View
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: 999,
                              backgroundColor: isActive ? '#dcfce7' : '#f3f4f6',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '700',
                                color: isActive ? '#15803d' : '#6b7280',
                              }}
                            >
                              {isActive ? 'Active' : 'Completed'}
                            </Text>
                          </View>
                        </View>
                        {season.startDate?.toDate ? (
                          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                            Started {season.startDate.toDate().toLocaleDateString([], { month: 'short', year: 'numeric' })}
                          </Text>
                        ) : null}
                      </View>

                      {/* Checkmark for selected */}
                      {isSelected ? (
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: '#16a34a',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>✓</Text>
                        </View>
                      ) : (
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 2,
                            borderColor: '#d1d5db',
                          }}
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* New season button — coaches only */}
          {isOwner && (
            <>
              <View style={{ height: 1, backgroundColor: '#e5e7eb', marginTop: 8, marginHorizontal: 20 }} />
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  onNewSeason();
                }}
                activeOpacity={0.7}
                style={{
                  marginHorizontal: 20,
                  marginTop: 12,
                  paddingVertical: 13,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#e5e7eb',
                  backgroundColor: '#f9fafb',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>
                  + New Season
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
