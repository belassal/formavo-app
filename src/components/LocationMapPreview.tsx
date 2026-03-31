import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { openMaps } from '../utils/openMaps';

type Coords = { latitude: number; longitude: number };

type Props = {
  address: string;
  fieldName?: string;
};

// Try Nominatim first, fall back to Photon (komoot)
async function geocode(address: string): Promise<Coords | null> {
  const encoded = encodeURIComponent(address);

  // --- Attempt 1: Nominatim ---
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
      {
        headers: {
          'User-Agent': 'FormavoApp/1.0 (formavo.app)',
          'Accept-Language': 'en',
        },
      },
    );
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        console.log('[LocationMap] Nominatim success:', lat, lon);
        return { latitude: lat, longitude: lon };
      }
    }
    console.log('[LocationMap] Nominatim empty for:', address, data);
  } catch (e) {
    console.warn('[LocationMap] Nominatim error:', e);
  }

  // --- Attempt 2: Photon (komoot) ---
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encoded}&limit=1`,
    );
    const data = await res.json();
    const feature = data?.features?.[0];
    if (feature) {
      const [lon, lat] = feature.geometry.coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        console.log('[LocationMap] Photon success:', lat, lon);
        return { latitude: lat, longitude: lon };
      }
    }
    console.log('[LocationMap] Photon empty for:', address, data);
  } catch (e) {
    console.warn('[LocationMap] Photon error:', e);
  }

  return null;
}

export default function LocationMapPreview({ address, fieldName }: Props) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!address?.trim()) {
      setLoading(false);
      setFailed(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setCoords(null);
    geocode(address).then((c) => {
      if (cancelled) return;
      if (c) setCoords(c);
      else setFailed(true);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [address]);

  return (
    <TouchableOpacity
      onPress={() => openMaps(address)}
      activeOpacity={0.9}
      style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' }}
    >
      {/* Map area */}
      <View style={{ height: 160 }}>
        {loading && (
          <View style={{ flex: 1, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator />
          </View>
        )}
        {!loading && failed && (
          // Fallback: grey placeholder with map pin — still tappable to open Maps
          <View style={{ flex: 1, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 28 }}>🗺️</Text>
            <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '500' }}>Tap to open in Maps</Text>
          </View>
        )}
        {!loading && coords && (
          <MapView
            provider={PROVIDER_DEFAULT}
            style={{ flex: 1 }}
            region={{
              latitude: coords.latitude,
              longitude: coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            pointerEvents="none"
          >
            <Marker coordinate={coords} />
          </MapView>
        )}
      </View>

      {/* Address footer */}
      <View style={{ backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 13, color: '#3b82f6' }}>📍</Text>
          <Text style={{ fontSize: 13, color: '#3b82f6', fontWeight: '500', flex: 1 }} numberOfLines={1}>
            {address}
          </Text>
        </View>
        {fieldName ? (
          <Text style={{ fontSize: 13, color: '#374151', fontWeight: '500', marginLeft: 20 }}>
            {fieldName}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
