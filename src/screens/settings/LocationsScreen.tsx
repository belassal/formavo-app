import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import {
  listenLocations,
  addLocation,
  updateLocation,
  deleteLocation,
  type SavedLocation,
} from '../../services/locationService';

function EditModal({
  visible,
  initial,
  onSave,
  onClose,
}: {
  visible: boolean;
  initial: SavedLocation | null;
  onSave: (name: string, address: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setAddress(initial?.address ?? '');
    }
  }, [visible, initial]);

  const canSave = name.trim().length > 0 && address.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
          backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
        }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 15, color: '#6b7280', fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>
            {initial ? 'Edit Location' : 'New Location'}
          </Text>
          <TouchableOpacity
            onPress={() => canSave && onSave(name, address)}
            disabled={!canSave}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: canSave ? '#3b82f6' : '#9ca3af' }}>Save</Text>
          </TouchableOpacity>
        </View>

        <View style={{ padding: 16, gap: 16 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
            {/* Name */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
              <Text style={{ width: 80, fontSize: 14, fontWeight: '500', color: '#6b7280' }}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. BMO Field"
                placeholderTextColor="#d1d5db"
                autoCapitalize="words"
                style={{ flex: 1, fontSize: 15, color: '#111' }}
                autoFocus
              />
            </View>
            {/* Address */}
            <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
              <Text style={{ width: 80, fontSize: 14, fontWeight: '500', color: '#6b7280', paddingTop: 2 }}>Address</Text>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="e.g. 100 Queens Quay W, Toronto"
                placeholderTextColor="#d1d5db"
                autoCapitalize="words"
                multiline
                style={{ flex: 1, fontSize: 15, color: '#111', minHeight: 48 }}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function LocationsScreen() {
  const uid = auth().currentUser?.uid ?? null;
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SavedLocation | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = listenLocations(uid, (locs) => {
      setLocations(locs);
      setLoading(false);
    });
    return () => unsub();
  }, [uid]);

  const handleSave = async (name: string, address: string) => {
    if (!uid) return;
    try {
      if (editing) {
        await updateLocation(uid, editing.id, name, address);
      } else {
        await addLocation(uid, name, address);
      }
      setShowModal(false);
      setEditing(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not save location');
    }
  };

  const handleDelete = (loc: SavedLocation) => {
    Alert.alert('Delete Location', `Remove "${loc.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (!uid) return;
          await deleteLocation(uid, loc.id).catch(console.warn);
        },
      },
    ]);
  };

  const openEdit = (loc: SavedLocation) => {
    setEditing(loc);
    setShowModal(true);
  };

  const openAdd = () => {
    setEditing(null);
    setShowModal(true);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <FlatList
        data={locations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          locations.length > 0 ? (
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 }}>
              SAVED LOCATIONS
            </Text>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#f3f4f6' }} />}
        renderItem={({ item, index }) => {
          const isFirst = index === 0;
          const isLast = index === locations.length - 1;
          return (
            <TouchableOpacity
              onPress={() => openEdit(item)}
              activeOpacity={0.7}
              style={{
                backgroundColor: '#fff',
                paddingHorizontal: 16, paddingVertical: 14,
                flexDirection: 'row', alignItems: 'center', gap: 12,
                borderTopLeftRadius: isFirst ? 14 : 0,
                borderTopRightRadius: isFirst ? 14 : 0,
                borderBottomLeftRadius: isLast ? 14 : 0,
                borderBottomRightRadius: isLast ? 14 : 0,
                borderWidth: 1, borderColor: '#e5e7eb',
                borderTopWidth: isFirst ? 1 : 0,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>{item.name}</Text>
                <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{item.address}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 18, color: '#ef4444' }}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={{
            backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb',
            paddingVertical: 48, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 14, color: '#9ca3af' }}>No saved locations yet.</Text>
            <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>Tap + Add Location to get started.</Text>
          </View>
        }
        ListFooterComponent={
          <TouchableOpacity
            onPress={openAdd}
            style={{
              marginTop: 16, backgroundColor: '#111', borderRadius: 14,
              paddingVertical: 15, alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>+ Add Location</Text>
          </TouchableOpacity>
        }
      />

      <EditModal
        visible={showModal}
        initial={editing}
        onSave={handleSave}
        onClose={() => { setShowModal(false); setEditing(null); }}
      />
    </SafeAreaView>
  );
}
