/**
 * WeatherChip — kickoff-hour forecast for a venue. Renders nothing when no
 * forecast applies (past match, >16 days out, address not found), so it can
 * be dropped anywhere without layout fallbacks.
 */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { fetchMatchWeather, type MatchWeather } from '../services/weatherService';

export default function WeatherChip({
  address,
  dateISO,
  dark = false,
}: {
  address?: string | null;
  dateISO?: string | null;
  dark?: boolean;
}) {
  const [weather, setWeather] = useState<MatchWeather | null>(null);

  useEffect(() => {
    let cancelled = false;
    setWeather(null);
    if (!address || !dateISO) return;
    fetchMatchWeather(address, dateISO).then((w) => {
      if (!cancelled) setWeather(w);
    });
    return () => { cancelled = true; };
  }, [address, dateISO]);

  if (!weather) return null;

  const rain = weather.precipPct != null && weather.precipPct >= 30
    ? ` · ${weather.precipPct}% rain`
    : '';

  return (
    <View style={{
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: dark ? 'rgba(255,255,255,0.12)' : '#f3f4f6',
      borderRadius: 10,
      paddingHorizontal: 9,
      paddingVertical: 4,
      marginTop: 6,
    }}>
      <Text style={{ fontSize: 13 }}>{weather.emoji}</Text>
      <Text style={{
        fontSize: 12,
        fontWeight: '600',
        color: dark ? 'rgba(255,255,255,0.85)' : '#374151',
      }}>
        {weather.tempC}°C {weather.label.toLowerCase()}{rain} at kickoff
      </Text>
    </View>
  );
}
