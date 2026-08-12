import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import * as functions from 'firebase-functions/v1';

initializeApp();

const db = getFirestore();

// Notification preference keys. users/{uid}.notificationPrefs = { [key]: boolean }.
// Missing key or missing map means ON (opt-out model).
export type NotifPref = 'announcements' | 'schedule' | 'rsvp' | 'chat' | 'live' | 'digest';

// ─── Helper: send FCM to all tokens of a user ────────────────────────────────
async function sendToUser(
  uid: string,
  notification: { title: string; body: string },
  data?: Record<string, string>,
  prefKey?: NotifPref
) {
  const userDoc = await db.collection('users').doc(uid).get();
  if (prefKey && userDoc.data()?.notificationPrefs?.[prefKey] === false) return;
  const tokens: string[] = userDoc.data()?.fcmTokens || [];
  if (!tokens.length) return;

  const messages = tokens.map((token) => ({
    token,
    notification,
    data: data || {},
    apns: { payload: { aps: { sound: 'default' } } },
    android: { notification: { sound: 'default' } },
  }));

  const results = await getMessaging().sendEach(messages);
  // Remove stale tokens
  const staleTokens = tokens.filter((_, i) => results.responses[i].error);
  if (staleTokens.length) {
    await db.collection('users').doc(uid).update({
      fcmTokens: FieldValue.arrayRemove(...staleTokens),
    });
  }
}

// ─── Helper: get all member UIDs for a team ──────────────────────────────────
// Member docs are keyed by uid (teams/{teamId}/members/{uid}); there is no uid field.
async function getTeamMemberUids(teamId: string): Promise<string[]> {
  const snap = await db
    .collection('teams')
    .doc(teamId)
    .collection('members')
    .where('status', '==', 'active')
    .get();
  return snap.docs.map((d) => d.id);
}

// ─── Helper: get coach UIDs for a team ───────────────────────────────────────
// TeamRole values are 'coach' | 'assistant' | 'parent' (src/services/teamService.ts).
async function getTeamCoachUids(teamId: string): Promise<string[]> {
  const snap = await db
    .collection('teams')
    .doc(teamId)
    .collection('members')
    .where('status', '==', 'active')
    .where('role', 'in', ['coach', 'assistant'])
    .get();
  return snap.docs.map((d) => d.id);
}

// ─── 1. New announcement → notify all team members ───────────────────────────
export const onAnnouncementCreated = functions.firestore
  .document('teams/{teamId}/announcements/{announcementId}')
  .onCreate(async (snap, context) => {
    const { teamId } = context.params;
    const data = snap.data();
    if (!data) return;

    const teamDoc = await db.collection('teams').doc(teamId).get();
    const teamName = teamDoc.data()?.name || 'Your team';

    const uids = await getTeamMemberUids(teamId);
    // Don't notify the author
    const targets = uids.filter((uid) => uid !== data.createdBy);

    await Promise.all(
      targets.map((uid) =>
        sendToUser(
          uid,
          {
            title: `📣 ${teamName}`,
            body: data.text.length > 100 ? data.text.substring(0, 97) + '…' : data.text,
          },
          { type: 'announcement', teamId },
          'announcements'
        )
      )
    );
  });

// ─── 2. New match created → notify all members to check schedule ─────────────
export const onMatchCreated = functions.firestore
  .document('teams/{teamId}/matches/{matchId}')
  .onCreate(async (snap, context) => {
    const { teamId } = context.params;
    const data = snap.data();
    if (!data || data.isDeleted) return;

    const teamDoc = await db.collection('teams').doc(teamId).get();
    const teamName = teamDoc.data()?.name || 'Your team';
    const opponent = data.opponent || 'Opponent';
    const dateLabel = data.dateISO ? data.dateISO.substring(0, 10) : '';

    const uids = await getTeamMemberUids(teamId);
    await Promise.all(
      uids.map((uid) =>
        sendToUser(
          uid,
          {
            title: `⚽ New match scheduled`,
            body: `${teamName} vs ${opponent}${dateLabel ? ` · ${dateLabel}` : ''}`,
          },
          { type: 'match_created', teamId, matchId: context.params.matchId },
          'schedule'
        )
      )
    );
  });

// ─── 3. RSVP updated → notify coaches ────────────────────────────────────────
export const onRsvpUpdated = functions.firestore
  .document('teams/{teamId}/matches/{matchId}/roster/{playerId}')
  .onUpdate(async (change, context) => {
    const { teamId, matchId } = context.params;
    const before = change.before.data();
    const after = change.after.data();

    // Only trigger when rsvpStatus actually changes
    if (before?.rsvpStatus === after?.rsvpStatus) return;
    if (!after?.rsvpStatus || after.rsvpStatus === 'pending') return;

    const playerName = after.playerName || 'A player';
    const statusLabel = after.rsvpStatus === 'attending' ? '✅ attending' : '❌ can\'t make it';
    const confirmedBy = after.rsvpByName ? ` (${after.rsvpByName})` : '';

    const matchDoc = await db.collection('teams').doc(teamId).collection('matches').doc(matchId).get();
    const opponent = matchDoc.data()?.opponent || 'Opponent';

    const coachUids = await getTeamCoachUids(teamId);
    await Promise.all(
      coachUids.map((uid) =>
        sendToUser(
          uid,
          {
            title: `${playerName} is ${statusLabel}${confirmedBy}`,
            body: `vs ${opponent}`,
          },
          { type: 'rsvp_updated', teamId, matchId },
          'rsvp'
        )
      )
    );
  });

// ─── 4. New training session → notify all team members ───────────────────────
export const onTrainingCreated = functions.firestore
  .document('teams/{teamId}/trainings/{trainingId}')
  .onCreate(async (snap, context) => {
    const { teamId, trainingId } = context.params;
    const data = snap.data();
    if (!data || data.isDeleted) return;

    const teamDoc = await db.collection('teams').doc(teamId).get();
    const teamName = teamDoc.data()?.name || 'Your team';

    const title = data.title || 'Training Session';
    const startISO: string = data.startISO || '';
    const location: string = data.location || '';

    // Format date label from 'YYYY-MM-DD HH:mm'
    let dateLabel = '';
    if (startISO) {
      const [datePart, timePart] = startISO.split(' ');
      if (datePart) {
        const [, m, d] = datePart.split('-');
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const monthStr = months[parseInt(m, 10) - 1] ?? m;
        dateLabel = `${monthStr} ${parseInt(d, 10)}`;
        if (timePart) {
          const [hh, mm] = timePart.split(':');
          const hour = parseInt(hh, 10);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const h12 = hour % 12 || 12;
          dateLabel += ` · ${h12}:${mm} ${ampm}`;
        }
      }
    }

    const bodyParts = [title, dateLabel, location].filter(Boolean);
    const body = bodyParts.join(' · ');

    const uids = await getTeamMemberUids(teamId);
    const targets = uids.filter((uid) => uid !== data.createdBy);

    await Promise.all(
      targets.map((uid) =>
        sendToUser(
          uid,
          { title: `🏃 ${teamName} — New training session`, body },
          { type: 'training_created', teamId, trainingId },
          'schedule'
        )
      )
    );
  });

// ─── 5. New chat message → notify all team members ───────────────────────────
export const onMessageSent = functions.firestore
  .document('teams/{teamId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const { teamId } = context.params;
    const data = snap.data();
    if (!data) return;

    const teamDoc = await db.collection('teams').doc(teamId).get();
    const teamName = teamDoc.data()?.name || 'Your team';

    const senderName: string = data.senderName || 'Someone';
    const text: string = data.text || '';
    const body = text.length > 100 ? text.substring(0, 97) + '…' : text;

    const uids = await getTeamMemberUids(teamId);
    // Don't notify the sender
    const targets = uids.filter((uid) => uid !== data.senderId);

    await Promise.all(
      targets.map((uid) =>
        sendToUser(
          uid,
          {
            title: `${senderName} (${teamName})`,
            body,
          },
          { type: 'team_message', teamId, messageId: context.params.messageId },
          'chat'
        )
      )
    );
  });

// ─── 6. Training attendance confirmed → notify coaches ────────────────────────
export const onTrainingAttendanceUpdated = functions.firestore
  .document('teams/{teamId}/trainings/{trainingId}/attendance/{playerId}')
  .onWrite(async (change, context) => {
    const { teamId, trainingId } = context.params;
    const before = change.before.data();
    const after = change.after.data();

    if (before?.status === after?.status) return;
    if (!after?.status) return;

    const playerName = after.playerName || 'A player';
    const statusLabel = after.status === 'confirmed' ? '✅ confirmed' : '❌ declined';

    const trainingDoc = await db
      .collection('teams').doc(teamId)
      .collection('trainings').doc(trainingId)
      .get();
    const trainingTitle = trainingDoc.data()?.title || 'training session';

    const coachUids = await getTeamCoachUids(teamId);
    await Promise.all(
      coachUids.map((uid) =>
        sendToUser(
          uid,
          {
            title: `${playerName} ${statusLabel} attendance`,
            body: trainingTitle,
          },
          { type: 'training_attendance', teamId, trainingId },
          'rsvp'
        )
      )
    );
  });

// ─── 7. Goal logged → live score push to the whole team ──────────────────────
export const onMatchEventCreated = functions.firestore
  .document('teams/{teamId}/matches/{matchId}/events/{eventId}')
  .onCreate(async (snap, context) => {
    const { teamId, matchId } = context.params;
    const event = snap.data();
    if (!event) return;
    const isGoal = event.type === 'goal';
    const isDisallowed = event.type === 'note' && event.noteKind === 'disallowed_goal';
    if (!isGoal && !isDisallowed) return;

    const [teamDoc, matchDoc] = await Promise.all([
      db.collection('teams').doc(teamId).get(),
      db.collection('teams').doc(teamId).collection('matches').doc(matchId).get(),
    ]);
    const match = matchDoc.data();
    if (!match || match.isDeleted) return;

    const teamName = teamDoc.data()?.name || 'Your team';
    const opponent = match.opponent || 'Opponent';

    if (isDisallowed) {
      // The goal was already deleted (score corrected) before this note was written.
      const score = `${match.homeScore ?? 0}-${match.awayScore ?? 0}`;
      const uidsD = await getTeamMemberUids(teamId);
      await Promise.all(
        uidsD.map((uid) =>
          sendToUser(
            uid,
            { title: `❌ Goal disallowed — ${teamName}`, body: `${event.text || 'Goal disallowed'} · now ${score} vs ${opponent}` },
            { type: 'goal_disallowed', teamId, matchId },
            'live'
          )
        )
      );
      return;
    }
    // The score increment happens in the same transaction as the event write,
    // so by the time this trigger reads the match doc it reflects this goal.
    const score = `${match.homeScore ?? 0}-${match.awayScore ?? 0}`;
    const minute = typeof event.minute === 'number' && event.minute > 0 ? ` ${event.minute}'` : '';

    const side = event.side || 'home';
    const title = side === 'home' ? `⚽ GOAL — ${teamName}!` : `⚽ ${opponent} score`;
    const scorer = side === 'home'
      ? (event.scorerName && event.scorerName !== 'Team' ? `${event.scorerName}${minute} · ` : '')
      : '';
    const body = `${scorer}${score} vs ${opponent}`;

    const uids = await getTeamMemberUids(teamId);
    await Promise.all(
      uids.map((uid) =>
        sendToUser(uid, { title, body }, { type: 'goal', teamId, matchId }, 'live')
      )
    );
  });

// ─── 8. Aggregates: match summary + season stats ─────────────────────────────
//
// On match completion (or post-completion score/event edits):
//   1. Build match.summary from events + roster (scorers, cards, per-player lines
//      with minutes) so recaps and digests read one doc.
//   2. Recompute teams/{teamId}/aggregates/{seasonId|none} (W/D/L, GF/GA, form,
//      clean sheets) and teams/{teamId}/playerAggregates/{playerId}_{seasonId|none}
//      from completed matches' summaries — recompute-on-write keeps it idempotent.

type RosterLine = { playerId: string; playerName: string; role?: string; attendance?: string; slotKey?: string };

// Compact port of the app's slot-role heuristic: slot key (GK / L{line}-{i})
// plus the formation string yields the position a player occupied.
function roleForSlot(slotKey: string | undefined, formation: string): string | null {
  if (!slotKey) return null;
  if (slotKey === 'GK') return 'GK';
  const m = slotKey.match(/^L(\d+)-(\d+)$/);
  if (!m) return null;
  const lines = (formation || '').split('-').map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
  if (!lines.length) return null;
  const L = lines.length;
  const lineIndex = parseInt(m[1], 10);
  const pos = parseInt(m[2], 10);
  const count = lines[lineIndex - 1] ?? 0;
  const margin = count === 2 ? 0.28 : count === 3 ? 0.2 : count === 4 ? 0.14 : 0.08;
  const x = count <= 1 ? 0.5 : margin + (pos - 1) * ((1 - 2 * margin) / (count - 1));
  const band = L <= 1 ? 1 : (lineIndex - 1) / (L - 1);
  const left = x < 0.35;
  const right = x > 0.65;
  if (band <= 0.001) return count <= 2 ? 'CB' : left ? 'LB' : right ? 'RB' : 'CB';
  if (band >= 0.999) return count <= 2 ? 'ST' : left ? 'LW' : right ? 'RW' : 'ST';
  if (band < 0.45) return left ? 'LW' : right ? 'RW' : 'CDM';
  if (band > 0.55) return left ? 'LW' : right ? 'RW' : 'CAM';
  return left ? 'LW' : right ? 'RW' : 'CM';
}
type EventLine = {
  type: string; minute: number; side?: string;
  scorerId?: string; scorerName?: string; assistId?: string; assistName?: string;
  playerId?: string; playerName?: string; cardColor?: string;
  inPlayerId?: string; outPlayerId?: string;
};

// Port of src/services/minutesService.calculateMatchMinutes (stint-based:
// supports rolling subs and ignores orphan off-events).
function calcMinutes(roster: RosterLine[], events: EventLine[], matchDuration: number) {
  const subs = events.filter((e) => e.type === 'sub').sort((a, b) => a.minute - b.minute);
  const out: Record<string, { minutes: number; started: boolean }> = {};
  for (const p of roster) {
    if (p.attendance === 'absent' || p.attendance === 'injured') continue;
    const started = (p.role || 'bench') === 'starter';
    const stints: Array<[number, number]> = [];
    let on: number | null = started ? 0 : null;
    for (const e of subs) {
      if (e.outPlayerId === p.playerId && on !== null) {
        stints.push([on, Math.max(on, e.minute)]);
        on = null;
      }
      if (e.inPlayerId === p.playerId && on === null) {
        on = e.minute;
      }
    }
    if (on !== null) stints.push([on, matchDuration]);
    if (!started && stints.length === 0) continue;
    const minutes = stints.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0);
    out[p.playerId] = { minutes, started };
  }
  return out;
}

async function buildMatchSummary(teamId: string, matchId: string, match: FirebaseFirestore.DocumentData) {
  const matchRef = db.collection('teams').doc(teamId).collection('matches').doc(matchId);
  const [eventsSnap, rosterSnap] = await Promise.all([
    matchRef.collection('events').get(),
    matchRef.collection('roster').get(),
  ]);
  const events = eventsSnap.docs.map((d) => d.data() as EventLine);
  const roster: RosterLine[] = rosterSnap.docs.map((d) => ({
    playerId: d.id,
    playerName: (d.data() as any).playerName || 'Unknown',
    role: (d.data() as any).role,
    attendance: (d.data() as any).attendance,
    slotKey: (d.data() as any).slotKey,
  }));

  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;
  const result = homeScore > awayScore ? 'W' : homeScore < awayScore ? 'L' : 'D';
  const matchDuration = (match.halfDuration ?? 45) * 2;
  const minutes = calcMinutes(roster, events, matchDuration);

  const slotByPlayer: Record<string, string | undefined> = {};
  for (const p of roster) slotByPlayer[p.playerId] = p.slotKey;

  const lines: Record<string, any> = {};
  const line = (id: string, name: string) => {
    if (!lines[id]) {
      lines[id] = {
        playerId: id, playerName: name,
        goals: 0, assists: 0, yellow: 0, red: 0,
        minutes: minutes[id]?.minutes ?? 0,
        started: minutes[id]?.started ?? false,
        appeared: (minutes[id]?.minutes ?? 0) > 0,
        position: roleForSlot(slotByPlayer[id], match.formation || ''),
      };
    }
    return lines[id];
  };
  // Seed lines for everyone who played, even without events
  for (const p of roster) {
    if (minutes[p.playerId]) line(p.playerId, p.playerName);
  }
  const scorers: any[] = [];
  for (const e of events) {
    if (e.type === 'goal' && (e.side || 'home') === 'home') {
      scorers.push({ playerId: e.scorerId || '', name: e.scorerName || 'Team', minute: e.minute ?? 0 });
      if (e.scorerId) line(e.scorerId, e.scorerName || 'Unknown').goals++;
      if (e.assistId) line(e.assistId, e.assistName || 'Unknown').assists++;
    }
    if (e.type === 'card' && e.playerId) {
      const l = line(e.playerId, e.playerName || 'Unknown');
      if (e.cardColor === 'red') l.red++; else l.yellow++;
    }
  }

  const summary = {
    result,
    homeScore,
    awayScore,
    opponent: match.opponent || 'Opponent',
    dateISO: match.dateISO || '',
    seasonId: match.seasonId ?? null,
    competitionType: match.competitionType || 'league',
    competitionName: match.competitionName || '',
    scorers,
    playerLines: Object.values(lines),
    cleanSheet: awayScore === 0,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await matchRef.set({ summary }, { merge: true });
  return summary;
}

async function recomputeSeasonAggregates(teamId: string, seasonId: string | null) {
  const seasonKey = seasonId || 'none';
  const matchesSnap = await db
    .collection('teams').doc(teamId).collection('matches')
    .where('status', '==', 'completed')
    .get();

  const matches = matchesSnap.docs
    .map((d) => d.data())
    .filter((m) => !m.isDeleted && (m.seasonId ?? null) === seasonId && m.summary);

  const team = {
    played: 0, wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0, cleanSheets: 0,
    form: [] as string[],
  };
  const players: Record<string, any> = {};
  // Records split by competition type (league/cup/friendly/tournament) and,
  // for named cups/tournaments, per named competition (array — names are
  // free text and unsafe as Firestore map keys).
  const byCompetition: Record<string, any> = {};
  const namedComps: Record<string, any> = {};
  const tally = (bucket: any, s: any) => {
    bucket.played++;
    if (s.result === 'W') bucket.wins++;
    else if (s.result === 'D') bucket.draws++;
    else bucket.losses++;
    bucket.goalsFor += s.homeScore;
    bucket.goalsAgainst += s.awayScore;
  };
  const freshTally = () => ({ played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });

  const ordered = [...matches].sort((a, b) =>
    String(a.summary.dateISO).localeCompare(String(b.summary.dateISO)));

  for (const m of ordered) {
    const s = m.summary;
    team.played++;
    if (s.result === 'W') team.wins++;
    else if (s.result === 'D') team.draws++;
    else team.losses++;
    team.goalsFor += s.homeScore;
    team.goalsAgainst += s.awayScore;
    if (s.cleanSheet) team.cleanSheets++;
    team.form.push(s.result);

    // Read the tag from the match doc (not the summary) so re-tagging an old
    // completed match takes effect without a summary rebuild.
    const compType = m.competitionType || s.competitionType || 'league';
    const compName = String(m.competitionName ?? s.competitionName ?? '').trim();
    tally(byCompetition[compType] || (byCompetition[compType] = freshTally()), s);
    if (compName && (compType === 'cup' || compType === 'tournament')) {
      const key = `${compType}|${compName.toLowerCase()}`;
      namedComps[key] = namedComps[key] || { name: compName, type: compType, ...freshTally() };
      tally(namedComps[key], s);
    }

    for (const l of s.playerLines || []) {
      const p = players[l.playerId] || (players[l.playerId] = {
        playerId: l.playerId, playerName: l.playerName, seasonId: seasonKey,
        goals: 0, assists: 0, yellow: 0, red: 0,
        appearances: 0, starts: 0, minutes: 0,
      });
      p.playerName = l.playerName || p.playerName;
      p.goals += l.goals; p.assists += l.assists;
      p.yellow += l.yellow; p.red += l.red;
      if (l.appeared) p.appearances++;
      if (l.started) p.starts++;
      p.minutes += l.minutes;
      if (l.appeared && l.position) {
        p.positions = p.positions || {};
        p.positions[l.position] = (p.positions[l.position] || 0) + 1;
      }
    }
  }

  const batch = db.batch();
  batch.set(
    db.collection('teams').doc(teamId).collection('aggregates').doc(seasonKey),
    {
      ...team, form: team.form.slice(-5), seasonId: seasonKey,
      byCompetition,
      competitions: Object.values(namedComps),
      updatedAt: FieldValue.serverTimestamp(),
    },
  );
  for (const p of Object.values(players)) {
    batch.set(
      db.collection('teams').doc(teamId).collection('playerAggregates').doc(`${p.playerId}_${seasonKey}`),
      { ...p, updatedAt: FieldValue.serverTimestamp() },
    );
  }
  await batch.commit();
}

export const onMatchCompletedAggregates = functions.firestore
  .document('teams/{teamId}/matches/{matchId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!after) return;

    const becameCompleted = after.status === 'completed' && before?.status !== 'completed';
    const editedWhileCompleted =
      after.status === 'completed' &&
      (before?.homeScore !== after.homeScore ||
        before?.awayScore !== after.awayScore ||
        before?.isDeleted !== after.isDeleted ||
        before?.competitionType !== after.competitionType ||
        before?.competitionName !== after.competitionName);

    if (!becameCompleted && !editedWhileCompleted) return;

    const { teamId, matchId } = context.params;
    await buildMatchSummary(teamId, matchId, after);
    await recomputeSeasonAggregates(teamId, after.seasonId ?? null);
  });

// Post-completion event edits (undo, corrections) refresh the summary too.
export const onEventWriteRecompute = functions.firestore
  .document('teams/{teamId}/matches/{matchId}/events/{eventId}')
  .onWrite(async (_change, context) => {
    const { teamId, matchId } = context.params;
    const matchDoc = await db.collection('teams').doc(teamId).collection('matches').doc(matchId).get();
    const match = matchDoc.data();
    if (!match || match.status !== 'completed' || match.isDeleted) return;
    await buildMatchSummary(teamId, matchId, match);
    await recomputeSeasonAggregates(teamId, match.seasonId ?? null);
  });

// ─── Weekly digest: Sunday evening results + top scorer per team ─────────────
export const weeklyDigest = functions.pubsub
  .schedule('every sunday 18:00')
  .timeZone('America/Halifax')
  .onRun(async () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const weekAgoKey = weekAgo.toISOString().substring(0, 10);

    const teamsSnap = await db.collection('teams').get();
    for (const teamDoc of teamsSnap.docs) {
      const team = teamDoc.data();
      if (team.isDeleted) continue;

      const matchesSnap = await teamDoc.ref
        .collection('matches')
        .where('status', '==', 'completed')
        .get();
      const thisWeek = matchesSnap.docs
        .map((d) => d.data())
        .filter((m) => !m.isDeleted && m.summary && String(m.summary.dateISO).substring(0, 10) >= weekAgoKey)
        .sort((a, b) => String(a.summary.dateISO).localeCompare(String(b.summary.dateISO)));
      if (thisWeek.length === 0) continue;

      const results = thisWeek
        .map((m) => `${m.summary.result} ${m.summary.homeScore}-${m.summary.awayScore} vs ${m.summary.opponent}`)
        .join(' · ');

      // Top scorer across the week
      const goals: Record<string, { name: string; count: number }> = {};
      for (const m of thisWeek) {
        for (const s of m.summary.scorers || []) {
          if (!s.playerId) continue;
          goals[s.playerId] = goals[s.playerId] || { name: s.name, count: 0 };
          goals[s.playerId].count++;
        }
      }
      const top = Object.values(goals).sort((a, b) => b.count - a.count)[0];
      const topLine = top ? ` · Top scorer: ${top.name} (${top.count})` : '';

      const teamName = team.name || 'Your team';
      const uids = await getTeamMemberUids(teamDoc.id);
      await Promise.all(
        uids.map((uid) =>
          sendToUser(
            uid,
            { title: `📅 ${teamName} — week in review`, body: `${results}${topLine}` },
            { type: 'weekly_digest', teamId: teamDoc.id },
            'digest'
          )
        )
      );
    }
  });

// ─── RSVP reminders: daily, for matches inside the next 48h ──────────────────
export const rsvpReminders = functions.pubsub
  .schedule('every day 17:00')
  .timeZone('America/Halifax')
  .onRun(async () => {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 3600 * 1000);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const nowKey = fmt(now);
    const in48Key = fmt(in48h);

    const snap = await db.collectionGroup('matches').where('status', '==', 'scheduled').get();

    for (const matchDoc of snap.docs) {
      const m = matchDoc.data();
      if (m.isDeleted) continue;
      const dateISO = String(m.dateISO || '');
      if (!dateISO || dateISO < nowKey || dateISO > in48Key) continue;
      if (m.rsvpReminderSent) continue;

      const teamRef = matchDoc.ref.parent.parent;
      if (!teamRef) continue;
      const teamId = teamRef.id;

      const [rosterSnap, membersSnap, teamDoc] = await Promise.all([
        matchDoc.ref.collection('roster').get(),
        teamRef.collection('members').where('status', '==', 'active').get(),
        teamRef.get(),
      ]);

      const teamName = teamDoc.data()?.name || 'Your team';
      const opponent = m.opponent || 'Opponent';
      const pendingIds = new Set(
        rosterSnap.docs
          .filter((r) => {
            const s = (r.data() as any).rsvpStatus;
            return !s || s === 'pending';
          })
          .map((r) => r.id),
      );
      if (rosterSnap.size === 0 || pendingIds.size === 0) {
        await matchDoc.ref.set({ rsvpReminderSent: true }, { merge: true });
        continue;
      }

      // Parents whose linked children haven't responded
      const parentTargets: string[] = [];
      for (const memberDoc of membersSnap.docs) {
        const member = memberDoc.data() as any;
        if (member.role !== 'parent') continue;
        const linked: { id: string }[] = Array.isArray(member.linkedPlayers)
          ? member.linkedPlayers
          : member.linkedPlayerId ? [{ id: member.linkedPlayerId }] : [];
        if (linked.some((c) => pendingIds.has(c.id))) parentTargets.push(memberDoc.id);
      }

      const dayLabel = dateISO.substring(0, 10) === nowKey.substring(0, 10) ? 'today' : 'soon';
      await Promise.all([
        ...parentTargets.map((uid) =>
          sendToUser(
            uid,
            { title: `⏰ RSVP needed — ${teamName}`, body: `Match vs ${opponent} is ${dayLabel === 'today' ? 'today' : 'coming up'}. Tap to confirm attendance.` },
            { type: 'rsvp_reminder', teamId, matchId: matchDoc.id },
            'rsvp'
          )
        ),
        ...(await getTeamCoachUids(teamId)).map((uid) =>
          sendToUser(
            uid,
            { title: `⏰ ${teamName} vs ${opponent}`, body: `${pendingIds.size} player${pendingIds.size === 1 ? ' hasn\'t' : 's haven\'t'} confirmed yet.` },
            { type: 'rsvp_reminder', teamId, matchId: matchDoc.id },
            'rsvp'
          )
        ),
      ]);

      await matchDoc.ref.set({ rsvpReminderSent: true }, { merge: true });
    }
  });

// ─── 9. Sweep: auto-finalize matches left live for 6+ hours ──────────────────
export const sweepStaleLiveMatches = functions.pubsub
  .schedule('every 60 minutes')
  .onRun(async () => {
    const cutoffMs = Date.now() - 6 * 3600 * 1000;
    const snap = await db.collectionGroup('matches').where('status', '==', 'live').get();

    for (const doc of snap.docs) {
      const m = doc.data();
      const state = m.state || {};
      // Latest sign of life: clock timestamps (epoch ms) or the doc's updatedAt.
      const lastActivity = Math.max(
        state.resumedAt ?? 0,
        state.startedAt ?? 0,
        m.updatedAt?.toMillis?.() ?? 0,
        m.startedAt?.toMillis?.() ?? 0,
      );
      if (lastActivity === 0 || lastActivity > cutoffMs) continue;

      const halfDuration = m.halfDuration ?? 45;
      const cappedElapsed = Math.min(
        (state.elapsedSec ?? 0) + Math.max(0, (cutoffMs - (state.resumedAt ?? cutoffMs)) / 1000),
        halfDuration * 2 * 60 + 20 * 60,
      );

      await doc.ref.set(
        {
          status: 'completed',
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          autoFinalized: true,
          state: {
            status: 'final',
            elapsedSec: Math.floor(cappedElapsed),
            resumedAt: FieldValue.delete(),
          },
        },
        { merge: true },
      );
      console.log(`Auto-finalized stale live match ${doc.ref.path}`);
    }
  });
