import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

admin.initializeApp();

const db = admin.firestore();

// ─── Helper: send FCM to all tokens of a user ────────────────────────────────
async function sendToUser(
  uid: string,
  notification: { title: string; body: string },
  data?: Record<string, string>
) {
  const userDoc = await db.collection('users').doc(uid).get();
  const tokens: string[] = userDoc.data()?.fcmTokens || [];
  if (!tokens.length) return;

  const messages = tokens.map((token) => ({
    token,
    notification,
    data: data || {},
    apns: { payload: { aps: { sound: 'default' } } },
    android: { notification: { sound: 'default' } },
  }));

  const results = await admin.messaging().sendEach(messages);
  // Remove stale tokens
  const staleTokens = tokens.filter((_, i) => results.responses[i].error);
  if (staleTokens.length) {
    await db.collection('users').doc(uid).update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...staleTokens),
    });
  }
}

// ─── Helper: get all member UIDs for a team ──────────────────────────────────
async function getTeamMemberUids(teamId: string): Promise<string[]> {
  const snap = await db
    .collection('teams')
    .doc(teamId)
    .collection('members')
    .where('status', '==', 'active')
    .get();
  return snap.docs.map((d) => d.data().uid).filter(Boolean);
}

// ─── Helper: get coach UIDs for a team ───────────────────────────────────────
async function getTeamCoachUids(teamId: string): Promise<string[]> {
  const snap = await db
    .collection('teams')
    .doc(teamId)
    .collection('members')
    .where('status', '==', 'active')
    .where('role', 'in', ['owner', 'coach', 'head_coach', 'assistant_coach'])
    .get();
  return snap.docs.map((d) => d.data().uid).filter(Boolean);
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
          { type: 'announcement', teamId }
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
          { type: 'match_created', teamId, matchId: context.params.matchId }
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
          { type: 'rsvp_updated', teamId, matchId }
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
          { type: 'training_created', teamId, trainingId }
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
          { type: 'team_message', teamId, messageId: context.params.messageId }
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
          { type: 'training_attendance', teamId, trainingId }
        )
      )
    );
  });
