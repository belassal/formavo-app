import React from 'react';
import { View, Text, Button } from 'react-native';
import { fbAuth } from '../../services/firebase';

export default function ProfileScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Text>Profile</Text>
      <Button title="Sign out" onPress={() => fbAuth.signOut()} />
    </View>
  );
}

