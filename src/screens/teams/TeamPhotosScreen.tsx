import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import auth from '@react-native-firebase/auth';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import { listenTeamPhotos, addTeamPhoto, deleteTeamPhoto, type TeamPhoto } from '../../services/photoService';
import { pickPhoto, uploadTeamPhoto, deleteTeamPhotoFromStorage } from '../../services/storageService';

type RouteT = RouteProp<TeamsStackParamList, 'TeamPhotos'>;

const { width } = Dimensions.get('window');
const THUMB = (width - 4) / 3;

export default function TeamPhotosScreen() {
  const route = useRoute<RouteT>();
  const { teamId, role } = route.params;
  const isParent = role === 'parent';

  const [photos, setPhotos] = useState<TeamPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload flow
  const [uploading, setUploading] = useState(false);
  const [captionText, setCaptionText] = useState('');
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [showCaptionModal, setShowCaptionModal] = useState(false);

  // Full-screen viewer
  const [viewPhoto, setViewPhoto] = useState<TeamPhoto | null>(null);

  useEffect(() => {
    const unsub = listenTeamPhotos(teamId, (data) => {
      setPhotos(data);
      setLoading(false);
    });
    return () => unsub();
  }, [teamId]);

  const handlePickPhoto = async () => {
    const uri = await pickPhoto();
    if (!uri) return;
    setPendingUri(uri);
    setCaptionText('');
    setShowCaptionModal(true);
  };

  const handleUpload = async () => {
    if (!pendingUri) return;
    const uid = auth().currentUser?.uid;
    const name = auth().currentUser?.displayName || 'Coach';
    if (!uid) return;
    try {
      setUploading(true);
      setShowCaptionModal(false);
      const filename = `${Date.now()}.jpg`;
      const storagePath = `teams/${teamId}/photos/${filename}`;
      const url = await uploadTeamPhoto(teamId, pendingUri, filename);
      await addTeamPhoto({
        teamId,
        url,
        storagePath,
        uploadedBy: uid,
        uploaderName: name,
        caption: captionText,
      });
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Unknown error');
    } finally {
      setUploading(false);
      setPendingUri(null);
    }
  };

  const handleDeletePhoto = (photo: TeamPhoto) => {
    Alert.alert('Delete photo?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setViewPhoto(null);
          await deleteTeamPhoto(teamId, photo.id);
          if (photo.storagePath) {
            await deleteTeamPhotoFromStorage(photo.storagePath);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      {/* Upload button */}
      {!isParent && (
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <TouchableOpacity
            onPress={handlePickPhoto}
            disabled={uploading}
            style={{
              backgroundColor: '#111',
              borderRadius: 12,
              paddingVertical: 13,
              alignItems: 'center',
            }}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>📷  Add Photo</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#111" />
      ) : photos.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Text style={{ fontSize: 40 }}>📷</Text>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#374151' }}>No photos yet</Text>
          {!isParent && (
            <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 40 }}>
              Tap "Add Photo" to share your first team photo
            </Text>
          )}
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={{ gap: 2, paddingBottom: 20 }}
          columnWrapperStyle={{ gap: 2 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setViewPhoto(item)}
              activeOpacity={0.85}
              style={{ width: THUMB, height: THUMB }}
            >
              <Image
                source={{ uri: item.url }}
                style={{ width: THUMB, height: THUMB, backgroundColor: '#e5e7eb' }}
                resizeMode="cover"
              />
            </TouchableOpacity>
          )}
        />
      )}

      {/* Caption modal before upload */}
      <Modal visible={showCaptionModal} animationType="slide" transparent onRequestClose={() => setShowCaptionModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111' }}>Add a caption</Text>
              {pendingUri && (
                <Image
                  source={{ uri: pendingUri }}
                  style={{ width: '100%', height: 200, borderRadius: 12, backgroundColor: '#e5e7eb' }}
                  resizeMode="cover"
                />
              )}
              <TextInput
                placeholder="Caption (optional)"
                value={captionText}
                onChangeText={setCaptionText}
                style={{
                  borderWidth: 1,
                  borderColor: '#e5e7eb',
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: '#111',
                }}
              />
              <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
                <TouchableOpacity onPress={() => setShowCaptionModal(false)}>
                  <Text style={{ padding: 10, color: '#6b7280', fontWeight: '500' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleUpload}
                  style={{ paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#111', borderRadius: 12 }}
                >
                  <Text style={{ fontWeight: '700', color: '#fff' }}>Upload</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Full-screen viewer */}
      <Modal visible={!!viewPhoto} animationType="fade" transparent onRequestClose={() => setViewPhoto(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => setViewPhoto(null)}
            style={{ position: 'absolute', top: 56, right: 20, zIndex: 10, padding: 8 }}
          >
            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '300' }}>✕</Text>
          </TouchableOpacity>

          {viewPhoto && (
            <>
              <Image
                source={{ uri: viewPhoto.url }}
                style={{ width: width, height: width, resizeMode: 'contain' }}
              />
              {viewPhoto.caption ? (
                <Text style={{ color: '#e5e7eb', marginTop: 12, fontSize: 15, paddingHorizontal: 24, textAlign: 'center' }}>
                  {viewPhoto.caption}
                </Text>
              ) : null}
              <Text style={{ color: '#6b7280', marginTop: 6, fontSize: 13 }}>
                {viewPhoto.uploaderName}
              </Text>

              {!isParent && (
                <TouchableOpacity
                  onPress={() => handleDeletePhoto(viewPhoto)}
                  style={{ marginTop: 20, paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#dc2626', borderRadius: 10 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Delete photo</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
