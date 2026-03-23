"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRsvpUpdated = exports.onMatchCreated = exports.onAnnouncementCreated = void 0;
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
//# sourceMappingURL=index.js.map