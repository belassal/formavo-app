import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert } from 'react-native';
import { fbAuth } from '../../services/firebase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    try {
      setLoading(true);
      await fbAuth.signInWithEmailAndPassword(email.trim(), pass);
    } catch (e: any) {
      Alert.alert('Login failed', e?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 16, justifyContent: 'center', gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>Formavo</Text>

      <TextInput
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
      />

      <TextInput
        placeholder="Password"
        secureTextEntry
        value={pass}
        onChangeText={setPass}
        style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
      />

      <Button title={loading ? 'Signing in...' : 'Sign in'} onPress={signIn} disabled={loading} />
    </View>
  );
}

