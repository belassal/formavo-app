"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onTrainingAttendanceUpdated = exports.onTrainingCreated = exports.onRsvpUpdated = exports.onMatchCreated = exports.onAnnouncementCreated = void 0;
const admin = require("firebase-admin");
const functions = require("firebase-functions");
admin.initializeApp();
const db = admin.firestore();
// ─── Helper: send FCM to all tokens of a user ────────────────────────────────
async function sendToUser(uid, notification, data) {
    var _a;
    const userDoc = await db.collection('users').doc(uid).get();
    const tokens = ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.fcmTokens) || [];
    if (!tokens.length)
        return;
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
async function getTeamMemberUids(teamId) {
    const snap = await db
        .collection('teams')
        .doc(teamId)
        .collection('members')
        .where('status', '==', 'active')
        .get();
    return snap.docs.map((d) => d.data().uid).filter(Boolean);
}
// ─── Helper: get coach UIDs for a team ───────────────────────────────────────
async function getTeamCoachUids(teamId) {
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
exports.onAnnouncementCreated = functions.firestore
    .document('teams/{teamId}/announcements/{announcementId}')
    .onCreate(async (snap, context) => {
    var _a;
    const { teamId } = context.params;
    const data = snap.data();
    if (!data)
        return;
    const teamDoc = await db.collection('teams').doc(teamId).get();
    const teamName = ((_a = teamDoc.data()) === null || _a === void 0 ? void 0 : _a.name) || 'Your team';
    const uids = await getTeamMemberUids(teamId);
    // Don't notify the author
    const targets = uids.filter((uid) => uid !== data.createdBy);
    await Promise.all(targets.map((uid) => sendToUser(uid, {
        title: `📣 ${teamName}`,
        body: data.text.length > 100 ? data.text.substring(0, 97) + '…' : data.text,
    }, { type: 'announcement', teamId })));
});
// ─── 2. New match created → notify all members to check schedule ─────────────
exports.onMatchCreated = functions.firestore
    .document('teams/{teamId}/matches/{matchId}')
    .onCreate(async (snap, context) => {
    var _a;
    const { teamId } = context.params;
    const data = snap.data();
    if (!data || data.isDeleted)
        return;
    const teamDoc = await db.collection('teams').doc(teamId).get();
    const teamName = ((_a = teamDoc.data()) === null || _a === void 0 ? void 0 : _a.name) || 'Your team';
    const opponent = data.opponent || 'Opponent';
    const dateLabel = data.dateISO ? data.dateISO.substring(0, 10) : '';
    const uids = await getTeamMemberUids(teamId);
    await Promise.all(uids.map((uid) => sendToUser(uid, {
        title: `⚽ New match scheduled`,
        body: `${teamName} vs ${opponent}${dateLabel ? ` · ${dateLabel}` : ''}`,
    }, { type: 'match_created', teamId, matchId: context.params.matchId })));
});
// ─── 3. RSVP updated → notify coaches ────────────────────────────────────────
exports.onRsvpUpdated = functions.firestore
    .document('teams/{teamId}/matches/{matchId}/roster/{playerId}')
    .onUpdate(async (change, context) => {
    var _a;
    const { teamId, matchId } = context.params;
    const before = change.before.data();
    const after = change.after.data();
    // Only trigger when rsvpStatus actually changes
    if ((before === null || before === void 0 ? void 0 : before.rsvpStatus) === (after === null || after === void 0 ? void 0 : after.rsvpStatus))
        return;
    if (!(after === null || after === void 0 ? void 0 : after.rsvpStatus) || after.rsvpStatus === 'pending')
        return;
    const playerName = after.playerName || 'A player';
    const statusLabel = after.rsvpStatus === 'attending' ? '✅ attending' : '❌ can\'t make it';
    const confirmedBy = after.rsvpByName ? ` (${after.rsvpByName})` : '';
    const matchDoc = await db.collection('teams').doc(teamId).collection('matches').doc(matchId).get();
    const opponent = ((_a = matchDoc.data()) === null || _a === void 0 ? void 0 : _a.opponent) || 'Opponent';
    const coachUids = await getTeamCoachUids(teamId);
    await Promise.all(coachUids.map((uid) => sendToUser(uid, {
        title: `${playerName} is ${statusLabel}${confirmedBy}`,
        body: `vs ${opponent}`,
    }, { type: 'rsvp_updated', teamId, matchId })));
});
// ─── 4. New training session → notify all team members ───────────────────────
exports.onTrainingCreated = functions.firestore
    .document('teams/{teamId}/trainings/{trainingId}')
    .onCreate(async (snap, context) => {
    var _a, _b;
    const { teamId, trainingId } = context.params;
    const data = snap.data();
    if (!data || data.isDeleted)
        return;
    const teamDoc = await db.collection('teams').doc(teamId).get();
    const teamName = ((_a = teamDoc.data()) === null || _a === void 0 ? void 0 : _a.name) || 'Your team';
    const title = data.title || 'Training Session';
    const startISO = data.startISO || '';
    const location = data.location || '';
    // Format date label from 'YYYY-MM-DD HH:mm'
    let dateLabel = '';
    if (startISO) {
        const [datePart, timePart] = startISO.split(' ');
        if (datePart) {
            const [, m, d] = datePart.split('-');
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthStr = (_b = months[parseInt(m, 10) - 1]) !== null && _b !== void 0 ? _b : m;
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
    await Promise.all(targets.map((uid) => sendToUser(uid, { title: `🏃 ${teamName} — New training session`, body }, { type: 'training_created', teamId, trainingId })));
});
// ─── 5. Training attendance confirmed → notify coaches ────────────────────────
exports.onTrainingAttendanceUpdated = functions.firestore
    .document('teams/{teamId}/trainings/{trainingId}/attendance/{playerId}')
    .onWrite(async (change, context) => {
    var _a;
    const { teamId, trainingId } = context.params;
    const before = change.before.data();
    const after = change.after.data();
    if ((before === null || before === void 0 ? void 0 : before.status) === (after === null || after === void 0 ? void 0 : after.status))
        return;
    if (!(after === null || after === void 0 ? void 0 : after.status))
        return;
    const playerName = after.playerName || 'A player';
    const statusLabel = after.status === 'confirmed' ? '✅ confirmed' : '❌ declined';
    const trainingDoc = await db
        .collection('teams').doc(teamId)
        .collection('trainings').doc(trainingId)
        .get();
    const trainingTitle = ((_a = trainingDoc.data()) === null || _a === void 0 ? void 0 : _a.title) || 'training session';
    const coachUids = await getTeamCoachUids(teamId);
    await Promise.all(coachUids.map((uid) => sendToUser(uid, {
        title: `${playerName} ${statusLabel} attendance`,
        body: trainingTitle,
    }, { type: 'training_attendance', teamId, trainingId })));
});
//# sourceMappingURL=index.js.map