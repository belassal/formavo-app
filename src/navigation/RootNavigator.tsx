import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { RootGate } from './RootGate';

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <RootGate />
    </NavigationContainer>
  );
}

