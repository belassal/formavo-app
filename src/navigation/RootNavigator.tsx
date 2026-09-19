import React, { useEffect, useRef } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { RootGate } from './RootGate';
import { installJsErrorReporting, logScreenView } from '../services/telemetryService';

export default function RootNavigator() {
  const navRef = useNavigationContainerRef();
  const lastRouteRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    installJsErrorReporting();
  }, []);

  return (
    <NavigationContainer
      ref={navRef}
      onReady={() => {
        lastRouteRef.current = navRef.getCurrentRoute()?.name;
        if (lastRouteRef.current) logScreenView(lastRouteRef.current);
      }}
      onStateChange={() => {
        const current = navRef.getCurrentRoute()?.name;
        if (current && current !== lastRouteRef.current) {
          lastRouteRef.current = current;
          logScreenView(current);
        }
      }}
    >
      <RootGate />
    </NavigationContainer>
  );
}
