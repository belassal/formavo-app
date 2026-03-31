import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { listenLocations, type SavedLocation } from '../services/locationService';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (location: SavedLocation) => void;
};

export default function LocationPickerModal({ visible, onClose, onSelect }: Props) {
  const uid = auth().currentUser?.uid ?? null;
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible || !uid) return;
    setLoading(true);
    const unsub = listenLocations(uid, (locs) => {
      setLocations(locs);
      setLoading(false);
    });
    return () => unsub();
  }, [visible, uid]);

  const filtered = query.trim()
    ? locations.filter(
        (l) =>
          l.name.toLowerCase().includes(query.toLowerCase()) ||
          l.address.toLowerCase().includes(query.toLowerCase()),
      )
    : locations;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
          backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
        }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>Saved Locations</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 15, color: '#3b82f6', fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search locations…"
            placeholderTextColor="#9ca3af"
            style={{
              backgroundColor: '#f3f4f6', borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 9,
              fontSize: 15, color: '#111',
            }}
            autoFocus
            clearButtonMode="while-editing"
          />
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator />
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
            <Text style={{ fontSize: 15, color: '#9ca3af', textAlign: 'center' }}>
              {locations.length === 0
                ? 'No saved locations yet.\nAdd some from Settings → Locations.'
                : 'No matches found.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, gap: 1 }}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#f3f4f6' }} />}
            renderItem={({ item, index }) => {
              const isFirst = index === 0;
              const isLast = index === filtered.length - 1;
              return (
                <TouchableOpacity
                  onPress={() => { onSelect(item); onClose(); }}
                  activeOpacity={0.7}
                  style={{
                    backgroundColor: '#fff',
                    paddingHorizontal: 16, paddingVertical: 14,
                    borderTopLeftRadius: isFirst ? 14 : 0,
                    borderTopRightRadius: isFirst ? 14 : 0,
                    borderBottomLeftRadius: isLast ? 14 : 0,
                    borderBottomRightRadius: isLast ? 14 : 0,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>{item.name}</Text>
                  <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{item.address}</Text>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}
