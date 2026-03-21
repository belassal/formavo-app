import React from 'react';
import { Image, Text, View } from 'react-native';

const AVATAR_COLORS = [
  '#e63946', '#457b9d', '#2a9d8f', '#e9a84c',
  '#6d6875', '#3d405b', '#2e86ab', '#a23b72',
];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

type Props = {
  name: string;
  avatarUrl?: string | null;
  size?: number;
};

export default function Avatar({ name, avatarUrl, size = 40 }: Props) {
  const bg = avatarColor(name);
  const radius = size / 2;
  const fontSize = Math.round(size * 0.36);

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: 'white', fontWeight: '800', fontSize }}>
        {avatarInitials(name)}
      </Text>
    </View>
  );
}
