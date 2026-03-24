import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { useRoute, RouteProp } from '@react-navigation/native';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import { listenMessages, sendMessage, type ChatMessage } from '../../services/chatService';

type Route = RouteProp<TeamsStackParamList, 'TeamChat'>;

type SeparatorItem = { type: 'separator'; key: string; label: string };
type DisplayItem = ChatMessage | SeparatorItem;

function formatTime(ts: any): string {
  if (!ts) return '';
  const date: Date = ts?.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return timeStr;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${timeStr}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${timeStr}`;
}

function formatRole(role: string): string {
  switch (role) {
    case 'coach': return 'Coach';
    case 'assistant': return 'Asst. Coach';
    case 'owner': return 'Owner';
    case 'parent': return 'Parent';
    default: return role.charAt(0).toUpperCase() + role.slice(1);
  }
}

function roleBadgeStyle(role: string): { bg: string; text: string } {
  switch (role) {
    case 'coach':
    case 'owner':
    case 'assistant':
      return { bg: '#111', text: '#fff' };
    case 'parent':
      return { bg: '#dbeafe', text: '#1d4ed8' };
    default:
      return { bg: '#f3f4f6', text: '#374151' };
  }
}

function buildDisplayItems(messages: ChatMessage[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  let lastDayKey = '';

  for (const msg of messages) {
    if (!msg.createdAt) {
      items.push(msg);
      continue;
    }
    const date: Date = msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date(msg.createdAt);
    const dayKey = date.toDateString();

    if (dayKey !== lastDayKey) {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      let label = date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      if (dayKey === now.toDateString()) label = 'Today';
      else if (dayKey === yesterday.toDateString()) label = 'Yesterday';
      items.push({ type: 'separator', key: `sep-${dayKey}`, label });
      lastDayKey = dayKey;
    }
    items.push(msg);
  }

  return items.reverse(); // reversed for inverted FlatList
}

export default function TeamChatScreen() {
  const route = useRoute<Route>();
  const { teamId, role = 'member' } = route.params;
  const uid = useMemo(() => auth().currentUser?.uid ?? null, []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [myName, setMyName] = useState('');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch current user's display name from Firestore
  useEffect(() => {
    if (!uid) return;
    firestore()
      .collection('users')
      .doc(uid)
      .get()
      .then((doc) => {
        if (doc.exists) {
          const data = doc.data()!;
          const name =
            [data.firstName, data.lastName].filter(Boolean).join(' ').trim() ||
            data.displayName ||
            '';
          setMyName(name);
        }
      })
      .catch(console.warn);
  }, [uid]);

  // Listen to messages
  useEffect(() => {
    const unsub = listenMessages(teamId, (msgs) => {
      setMessages(msgs);
      setLoading(false);
    });
    return () => unsub();
  }, [teamId]);

  const displayItems = useMemo(() => buildDisplayItems(messages), [messages]);

  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !uid) return;
    setInputText('');
    try {
      setSending(true);
      await sendMessage({
        teamId,
        text: trimmed,
        senderId: uid,
        senderName: myName || 'Unknown',
        senderRole: role,
      });
    } catch (e) {
      console.warn('[chat] send error', e);
      setInputText(trimmed);
    } finally {
      setSending(false);
    }
  }, [inputText, uid, teamId, myName, role]);

  const renderItem = useCallback(
    ({ item }: { item: DisplayItem }) => {
      // Day separator
      if ('type' in item && item.type === 'separator') {
        return (
          <View style={{ alignItems: 'center', marginVertical: 10 }}>
            <View
              style={{
                backgroundColor: '#e5e7eb',
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 12,
              }}
            >
              <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '500' }}>
                {item.label}
              </Text>
            </View>
          </View>
        );
      }

      const msg = item as ChatMessage;
      const isMe = msg.senderId === uid;
      const badge = roleBadgeStyle(msg.senderRole);

      return (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: isMe ? 'flex-end' : 'flex-start',
            paddingHorizontal: 12,
            marginVertical: 3,
          }}
        >
          <View style={{ maxWidth: '78%' }}>
            {/* Sender info (only for others' messages) */}
            {!isMe && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 3,
                  marginLeft: 4,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>
                  {msg.senderName}
                </Text>
                <View
                  style={{
                    backgroundColor: badge.bg,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 6,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: badge.text }}>
                    {formatRole(msg.senderRole)}
                  </Text>
                </View>
              </View>
            )}

            {/* Message bubble */}
            <View
              style={{
                backgroundColor: isMe ? '#111' : '#fff',
                borderRadius: 18,
                borderBottomRightRadius: isMe ? 4 : 18,
                borderBottomLeftRadius: isMe ? 18 : 4,
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderWidth: isMe ? 0 : 1,
                borderColor: '#e5e7eb',
              }}
            >
              <Text style={{ fontSize: 15, color: isMe ? '#fff' : '#111', lineHeight: 21 }}>
                {msg.text}
              </Text>
            </View>

            {/* Timestamp */}
            <Text
              style={{
                fontSize: 11,
                color: '#9ca3af',
                marginTop: 3,
                textAlign: isMe ? 'right' : 'left',
                marginHorizontal: 4,
              }}
            >
              {formatTime(msg.createdAt)}
            </Text>
          </View>
        </View>
      );
    },
    [uid]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Messages list */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator />
          </View>
        ) : messages.length === 0 ? (
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 40,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: '#f3f4f6',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 28, color: '#9ca3af' }}>—</Text>
            </View>
            <Text
              style={{
                fontSize: 17,
                fontWeight: '700',
                color: '#111',
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              Team Chat
            </Text>
            <Text style={{ fontSize: 15, color: '#9ca3af', textAlign: 'center', lineHeight: 22 }}>
              Send a message to the whole team. Coaches and parents will see it here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={displayItems}
            keyExtractor={(item) => ('id' in item ? item.id : (item as SeparatorItem).key)}
            renderItem={renderItem}
            inverted
            contentContainerStyle={{ paddingVertical: 8 }}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Input bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: Platform.OS === 'ios' ? 14 : 10,
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: '#e5e7eb',
            gap: 10,
          }}
        >
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder="Message the team..."
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={1000}
            style={{
              flex: 1,
              fontSize: 15,
              color: '#111',
              backgroundColor: '#f3f4f6',
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 10,
              maxHeight: 120,
              minHeight: 42,
            }}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: inputText.trim() ? '#111' : '#e5e7eb',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 0,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                color: inputText.trim() ? '#fff' : '#9ca3af',
                fontWeight: '700',
              }}
            >
              {'\u2191'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
