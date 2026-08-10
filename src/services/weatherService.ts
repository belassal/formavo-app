/**
 * weatherService — kickoff-hour forecast for a venue address.
 * Free + keyless: Nominatim (OSM) geocoding, Open-Meteo forecast.
 * Results are cached in memory per session; all failures resolve to null
 * so callers can simply hide the chip.
 */

export type MatchWeather = {
  emoji: string;
  label: string;
  tempC: number;
  precipPct: number | null;
};

const geoCache = new Map<string, { lat: number; lon: number } | null>();
const weatherCache = new Map<string, MatchWeather | null>();

/** Weather is town-granular, so degrade gracefully: full address → without
 *  house number → postal code → last locality segments. */
function geocodeVariants(address: string): string[] {
  const a = address.trim();
  const out = [a];
  const noHouse = a.replace(/^\s*\d+[\s,]+/, '');
  if (noHouse && noHouse !== a) out.push(noHouse);
  const postal = a.match(/[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d/); // Canadian postal code
  if (postal) out.push(`${postal[0]}, Canada`);
  const parts = a.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) out.push(parts.slice(-2).join(', '));
  return [...new Set(out)];
}

async function geocode(address: string): Promise<{ lat: number; lon: number } | null> {
  const key = address.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key)!;
  for (const variant of geocodeVariants(address)) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(variant)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'Formavo/1.0 (contact: support@formavo.app)' } },
      );
      const data = await res.json();
      const hit = Array.isArray(data) && data[0];
      if (hit) {
        const coords = { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon) };
        geoCache.set(key, coords);
        return coords;
      }
    } catch {
      // try the next variant
    }
  }
  geoCache.set(key, null);
  return null;
}

function describe(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Clear' };
  if (code <= 2) return { emoji: '⛅️', label: 'Partly cloudy' };
  if (code === 3) return { emoji: '☁️', label: 'Overcast' };
  if (code === 45 || code === 48) return { emoji: '🌫', label: 'Fog' };
  if (code >= 51 && code <= 57) return { emoji: '🌦', label: 'Drizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { emoji: '🌧', label: 'Rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { emoji: '❄️', label: 'Snow' };
  if (code >= 95) return { emoji: '⛈', label: 'Thunderstorm' };
  return { emoji: '🌤', label: 'Mixed' };
}

/**
 * Forecast for the kickoff hour. Returns null for past matches, matches
 * beyond the 16-day forecast window, or when the venue can't be located.
 * dateISO format: 'YYYY-MM-DD HH:mm'.
 */
export async function fetchMatchWeather(
  address: string,
  dateISO: string,
): Promise<MatchWeather | null> {
  if (!address?.trim() || !dateISO) return null;

  const [datePart, timePart] = dateISO.split(' ');
  if (!datePart) return null;
  const hourKey = `${datePart}T${(timePart || '12:00').slice(0, 2)}:00`;

  const kickoff = new Date(`${datePart}T${timePart || '12:00'}:00`);
  const now = new Date();
  const daysAhead = (kickoff.getTime() - now.getTime()) / (24 * 3600 * 1000);
  if (daysAhead < -0.5 || daysAhead > 15.5) return null;

  const cacheKey = `${address.trim().toLowerCase()}|${hourKey}`;
  if (weatherCache.has(cacheKey)) return weatherCache.get(cacheKey)!;

  try {
    const coords = await geocode(address);
    if (!coords) {
      weatherCache.set(cacheKey, null);
      return null;
    }
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
        `&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=16&timezone=auto`,
    );
    const data = await res.json();
    const times: string[] = data?.hourly?.time ?? [];
    const idx = times.indexOf(hourKey);
    if (idx < 0) {
      weatherCache.set(cacheKey, null);
      return null;
    }
    const code = data.hourly.weather_code?.[idx];
    const { emoji, label } = describe(typeof code === 'number' ? code : -1);
    const result: MatchWeather = {
      emoji,
      label,
      tempC: Math.round(data.hourly.temperature_2m?.[idx] ?? 0),
      precipPct: data.hourly.precipitation_probability?.[idx] ?? null,
    };
    weatherCache.set(cacheKey, result);
    return result;
  } catch {
    weatherCache.set(cacheKey, null);
    return null;
  }
}
