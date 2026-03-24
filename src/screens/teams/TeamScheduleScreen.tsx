import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import { listenMatches } from '../../services/matchService';
import { listenTrainings, type Training } from '../../services/trainingService';
import { formatDateISO } from '../../components/DateTimePickerModal';

type Route = RouteProp<TeamsStackParamList, 'TeamSchedule'>;

type ScheduleEvent = {
  id: string;
  type: 'match' | 'training';
  title: string;
  dateKey: string; // 'YYYY-MM-DD'
  dateISO: string; // 'YYYY-MM-DD HH:mm'
  subtitle?: string;
  status?: string;
};

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getDateKey(isoStr: string): string {
  return (isoStr || '').split(' ')[0] || '';
}

function buildCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function padTwo(n: number): string {
  return String(n).padStart(2, '0');
}

export default function TeamScheduleScreen() {
  const route = useRoute<Route>();
  const { teamId } = route.params;

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let matchesLoaded = false;
    let trainingsLoaded = false;

    const unsubMatches = listenMatches(teamId, (rows) => {
      setMatches((rows || []).filter((m: any) => !m.isDeleted));
      matchesLoaded = true;
      if (trainingsLoaded) setLoading(false);
    });

    const unsubTrainings = listenTrainings(teamId, (rows) => {
      setTrainings(rows);
      trainingsLoaded = true;
      if (matchesLoaded) setLoading(false);
    });

    return () => {
      unsubMatches();
      unsubTrainings();
    };
  }, [teamId]);

  // Build unified events list
  const allEvents = useMemo((): ScheduleEvent[] => {
    const events: ScheduleEvent[] = [];

    for (const m of matches) {
      const dateKey = getDateKey(m.dateISO || '');
      if (!dateKey) continue;
      events.push({
        id: m.id,
        type: 'match',
        title: `vs ${m.opponent || 'Opponent'}`,
        dateKey,
        dateISO: m.dateISO || '',
        subtitle: m.location || '',
        status: m.status,
      });
    }

    for (const t of trainings) {
      const dateKey = getDateKey(t.startISO || '');
      if (!dateKey) continue;
      events.push({
        id: t.id,
        type: 'training',
        title: t.title,
        dateKey,
        dateISO: t.startISO || '',
        subtitle: t.location || '',
        status: t.status,
      });
    }

    return events.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  }, [matches, trainings]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, ScheduleEvent[]> = {};
    for (const e of allEvents) {
      if (!map[e.dateKey]) map[e.dateKey] = [];
      map[e.dateKey].push(e);
    }
    return map;
  }, [allEvents]);

  const calendarDays = useMemo(
    () => buildCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const todayKey = `${today.getFullYear()}-${padTwo(today.getMonth() + 1)}-${padTwo(today.getDate())}`;

  const displayedEvents = useMemo(() => {
    if (selectedDayKey) return eventsByDate[selectedDayKey] || [];
    return allEvents.filter((e) => e.dateKey >= todayKey);
  }, [selectedDayKey, eventsByDate, allEvents, todayKey]);

  const goToPrevMonth = () => {
    setSelectedDayKey(null);
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };

  const goToNextMonth = () => {
    setSelectedDayKey(null);
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>

        {/* ── Calendar Card ── */}
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#e5e7eb',
            padding: 16,
          }}
        >
          {/* Month navigation */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <TouchableOpacity
              onPress={goToPrevMonth}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: '#f3f4f6',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 18, color: '#374151', lineHeight: 22 }}>{'\u2039'}</Text>
            </TouchableOpacity>

            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>
              {MONTHS[viewMonth]} {viewYear}
            </Text>

            <TouchableOpacity
              onPress={goToNextMonth}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: '#f3f4f6',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 18, color: '#374151', lineHeight: 22 }}>{'\u203a'}</Text>
            </TouchableOpacity>
          </View>

          {/* Weekday headers */}
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            {WEEKDAYS.map((d) => (
              <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af' }}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Day grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {calendarDays.map((day, idx) => {
              if (!day) {
                return (
                  <View
                    key={`empty-${idx}`}
                    style={{ width: `${100 / 7}%`, aspectRatio: 1 }}
                  />
                );
              }

              const dayKey = `${viewYear}-${padTwo(viewMonth + 1)}-${padTwo(day)}`;
              const dayEvents = eventsByDate[dayKey] || [];
              const isToday = dayKey === todayKey;
              const isSelected = dayKey === selectedDayKey;
              const hasMatch = dayEvents.some((e) => e.type === 'match');
              const hasTraining = dayEvents.some((e) => e.type === 'training');

              return (
                <TouchableOpacity
                  key={dayKey}
                  onPress={() => setSelectedDayKey(isSelected ? null : dayKey)}
                  style={{
                    width: `${100 / 7}%`,
                    aspectRatio: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? '#111' : 'transparent',
                      borderWidth: isToday && !isSelected ? 1.5 : 0,
                      borderColor: '#111',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: isToday || isSelected ? '700' : '400',
                        color: isSelected ? '#fff' : '#111',
                      }}
                    >
                      {day}
                    </Text>
                  </View>

                  {/* Event dots */}
                  {dayEvents.length > 0 && (
                    <View
                      style={{
                        flexDirection: 'row',
                        gap: 3,
                        marginTop: 2,
                        height: 6,
                        alignItems: 'center',
                      }}
                    >
                      {hasMatch && (
                        <View
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: isSelected ? '#ccc' : '#3b82f6',
                          }}
                        />
                      )}
                      {hasTraining && (
                        <View
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: isSelected ? '#ccc' : '#16a34a',
                          }}
                        />
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          <View
            style={{
              flexDirection: 'row',
              gap: 20,
              marginTop: 14,
              justifyContent: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3b82f6' }} />
              <Text style={{ fontSize: 12, color: '#6b7280' }}>Match</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16a34a' }} />
              <Text style={{ fontSize: 12, color: '#6b7280' }}>Training</Text>
            </View>
          </View>
        </View>

        {/* ── Events List ── */}
        <View>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: '#9ca3af',
              marginBottom: 8,
              marginLeft: 4,
              letterSpacing: 0.5,
            }}
          >
            {selectedDayKey
              ? selectedDayKey === todayKey
                ? 'TODAY'
                : 'EVENTS'
              : 'UPCOMING'}
          </Text>

          {displayedEvents.length === 0 ? (
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#e5e7eb',
                paddingVertical: 24,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 14, color: '#9ca3af' }}>
                {selectedDayKey ? 'Nothing scheduled on this day' : 'No upcoming events'}
              </Text>
            </View>
          ) : (
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#e5e7eb',
                overflow: 'hidden',
              }}
            >
              {displayedEvents.map((event, idx) => {
                const isMatch = event.type === 'match';
                const statusBg =
                  event.status === 'completed' || event.status === 'cancelled'
                    ? '#f3f4f6'
                    : event.status === 'live'
                    ? '#dcfce7'
                    : null;
                const statusTextColor =
                  event.status === 'live' ? '#15803d' : '#374151';

                return (
                  <View key={event.id}>
                    {idx > 0 && (
                      <View style={{ height: 1, backgroundColor: '#f3f4f6' }} />
                    )}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 14,
                        gap: 12,
                      }}
                    >
                      {/* Color bar */}
                      <View
                        style={{
                          width: 4,
                          height: 44,
                          borderRadius: 2,
                          backgroundColor: isMatch ? '#3b82f6' : '#16a34a',
                        }}
                      />

                      {/* Event info */}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>
                          {event.title}
                        </Text>
                        <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                          {formatDateISO(event.dateISO)}
                          {event.subtitle ? ` · ${event.subtitle}` : ''}
                        </Text>
                      </View>

                      {/* Type + status */}
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View
                          style={{
                            backgroundColor: isMatch ? '#eff6ff' : '#f0fdf4',
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 8,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: '700',
                              color: isMatch ? '#1d4ed8' : '#15803d',
                            }}
                          >
                            {isMatch ? 'MATCH' : 'TRAINING'}
                          </Text>
                        </View>

                        {event.status &&
                          event.status !== 'scheduled' &&
                          statusBg && (
                            <View
                              style={{
                                backgroundColor: statusBg,
                                paddingHorizontal: 7,
                                paddingVertical: 2,
                                borderRadius: 6,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '600',
                                  color: statusTextColor,
                                }}
                              >
                                {event.status.toUpperCase()}
                              </Text>
                            </View>
                          )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
