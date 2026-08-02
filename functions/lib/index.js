"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sweepStaleLiveMatches = exports.onEventWriteRecompute = exports.onMatchCompletedAggregates = exports.onMatchEventCreated = exports.onTrainingAttendanceUpdated = exports.onMessageSent = exports.onTrainingCreated = exports.onRsvpUpdated = exports.onMatchCreated = exports.onAnnouncementCreated = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const functions = require("firebase-functions/v1");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
// ─── Helper: send FCM to all tokens of a user ────────────────────────────────
async function sendToUser(uid, notification, data, prefKey) {
    var _a, _b, _c;
    const userDoc = await db.collection('users').doc(uid).get();
    if (prefKey && ((_b = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.notificationPrefs) === null || _b === void 0 ? void 0 : _b[prefKey]) === false)
        return;
    const tokens = ((_c = userDoc.data()) === null || _c === void 0 ? void 0 : _c.fcmTokens) || [];
    if (!tokens.length)
        return;
    const messages = tokens.map((token) => ({
        token,
        notification,
        data: data || {},
        apns: { payload: { aps: { sound: 'default' } } },
        android: { notification: { sound: 'default' } },
    }));
    const results = await (0, messaging_1.getMessaging)().sendEach(messages);
    // Remove stale tokens
    const staleTokens = tokens.filter((_, i) => results.responses[i].error);
    if (staleTokens.length) {
        await db.collection('users').doc(uid).update({
            fcmTokens: firestore_1.FieldValue.arrayRemove(...staleTokens),
        });
    }
}
// ─── Helper: get all member UIDs for a team ──────────────────────────────────
// Member docs are keyed by uid (teams/{teamId}/members/{uid}); there is no uid field.
async function getTeamMemberUids(teamId) {
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
async function getTeamCoachUids(teamId) {
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
    }, { type: 'announcement', teamId }, 'announcements')));
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
    }, { type: 'match_created', teamId, matchId: context.params.matchId }, 'schedule')));
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
    }, { type: 'rsvp_updated', teamId, matchId }, 'rsvp')));
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
    await Promise.all(targets.map((uid) => sendToUser(uid, { title: `🏃 ${teamName} — New training session`, body }, { type: 'training_created', teamId, trainingId }, 'schedule')));
});
// ─── 5. New chat message → notify all team members ───────────────────────────
exports.onMessageSent = functions.firestore
    .document('teams/{teamId}/messages/{messageId}')
    .onCreate(async (snap, context) => {
    var _a;
    const { teamId } = context.params;
    const data = snap.data();
    if (!data)
        return;
    const teamDoc = await db.collection('teams').doc(teamId).get();
    const teamName = ((_a = teamDoc.data()) === null || _a === void 0 ? void 0 : _a.name) || 'Your team';
    const senderName = data.senderName || 'Someone';
    const text = data.text || '';
    const body = text.length > 100 ? text.substring(0, 97) + '…' : text;
    const uids = await getTeamMemberUids(teamId);
    // Don't notify the sender
    const targets = uids.filter((uid) => uid !== data.senderId);
    await Promise.all(targets.map((uid) => sendToUser(uid, {
        title: `${senderName} (${teamName})`,
        body,
    }, { type: 'team_message', teamId, messageId: context.params.messageId }, 'chat')));
});
// ─── 6. Training attendance confirmed → notify coaches ────────────────────────
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
    }, { type: 'training_attendance', teamId, trainingId }, 'rsvp')));
});
// ─── 7. Goal logged → live score push to the whole team ──────────────────────
exports.onMatchEventCreated = functions.firestore
    .document('teams/{teamId}/matches/{matchId}/events/{eventId}')
    .onCreate(async (snap, context) => {
    var _a, _b, _c;
    const { teamId, matchId } = context.params;
    const event = snap.data();
    if (!event || event.type !== 'goal')
        return;
    const [teamDoc, matchDoc] = await Promise.all([
        db.collection('teams').doc(teamId).get(),
        db.collection('teams').doc(teamId).collection('matches').doc(matchId).get(),
    ]);
    const match = matchDoc.data();
    if (!match || match.isDeleted)
        return;
    const teamName = ((_a = teamDoc.data()) === null || _a === void 0 ? void 0 : _a.name) || 'Your team';
    const opponent = match.opponent || 'Opponent';
    // The score increment happens in the same transaction as the event write,
    // so by the time this trigger reads the match doc it reflects this goal.
    const score = `${(_b = match.homeScore) !== null && _b !== void 0 ? _b : 0}-${(_c = match.awayScore) !== null && _c !== void 0 ? _c : 0}`;
    const minute = typeof event.minute === 'number' && event.minute > 0 ? ` ${event.minute}'` : '';
    const side = event.side || 'home';
    const title = side === 'home' ? `⚽ GOAL — ${teamName}!` : `⚽ ${opponent} score`;
    const scorer = side === 'home'
        ? (event.scorerName && event.scorerName !== 'Team' ? `${event.scorerName}${minute} · ` : '')
        : '';
    const body = `${scorer}${score} vs ${opponent}`;
    const uids = await getTeamMemberUids(teamId);
    await Promise.all(uids.map((uid) => sendToUser(uid, { title, body }, { type: 'goal', teamId, matchId }, 'live')));
});
// Port of src/services/minutesService.calculateMatchMinutes
function calcMinutes(roster, events, matchDuration) {
    const subs = events.filter((e) => e.type === 'sub').sort((a, b) => a.minute - b.minute);
    const out = {};
    for (const p of roster) {
        if (p.attendance === 'absent' || p.attendance === 'injured')
            continue;
        const started = (p.role || 'bench') === 'starter';
        const on = subs.find((e) => e.inPlayerId === p.playerId);
        const off = subs.find((e) => e.outPlayerId === p.playerId);
        const minuteOn = started ? 0 : on ? on.minute : null;
        if (minuteOn === null)
            continue;
        const minutes = Math.max(0, (off ? off.minute : matchDuration) - minuteOn);
        out[p.playerId] = { minutes, started };
    }
    return out;
}
async function buildMatchSummary(teamId, matchId, match) {
    var _a, _b, _c, _d, _e;
    const matchRef = db.collection('teams').doc(teamId).collection('matches').doc(matchId);
    const [eventsSnap, rosterSnap] = await Promise.all([
        matchRef.collection('events').get(),
        matchRef.collection('roster').get(),
    ]);
    const events = eventsSnap.docs.map((d) => d.data());
    const roster = rosterSnap.docs.map((d) => ({
        playerId: d.id,
        playerName: d.data().playerName || 'Unknown',
        role: d.data().role,
        attendance: d.data().attendance,
    }));
    const homeScore = (_a = match.homeScore) !== null && _a !== void 0 ? _a : 0;
    const awayScore = (_b = match.awayScore) !== null && _b !== void 0 ? _b : 0;
    const result = homeScore > awayScore ? 'W' : homeScore < awayScore ? 'L' : 'D';
    const matchDuration = ((_c = match.halfDuration) !== null && _c !== void 0 ? _c : 45) * 2;
    const minutes = calcMinutes(roster, events, matchDuration);
    const lines = {};
    const line = (id, name) => {
        var _a, _b, _c, _d, _e, _f;
        if (!lines[id]) {
            lines[id] = {
                playerId: id, playerName: name,
                goals: 0, assists: 0, yellow: 0, red: 0,
                minutes: (_b = (_a = minutes[id]) === null || _a === void 0 ? void 0 : _a.minutes) !== null && _b !== void 0 ? _b : 0,
                started: (_d = (_c = minutes[id]) === null || _c === void 0 ? void 0 : _c.started) !== null && _d !== void 0 ? _d : false,
                appeared: ((_f = (_e = minutes[id]) === null || _e === void 0 ? void 0 : _e.minutes) !== null && _f !== void 0 ? _f : 0) > 0,
            };
        }
        return lines[id];
    };
    // Seed lines for everyone who played, even without events
    for (const p of roster) {
        if (minutes[p.playerId])
            line(p.playerId, p.playerName);
    }
    const scorers = [];
    for (const e of events) {
        if (e.type === 'goal' && (e.side || 'home') === 'home') {
            scorers.push({ playerId: e.scorerId || '', name: e.scorerName || 'Team', minute: (_d = e.minute) !== null && _d !== void 0 ? _d : 0 });
            if (e.scorerId)
                line(e.scorerId, e.scorerName || 'Unknown').goals++;
            if (e.assistId)
                line(e.assistId, e.assistName || 'Unknown').assists++;
        }
        if (e.type === 'card' && e.playerId) {
            const l = line(e.playerId, e.playerName || 'Unknown');
            if (e.cardColor === 'red')
                l.red++;
            else
                l.yellow++;
        }
    }
    const summary = {
        result,
        homeScore,
        awayScore,
        opponent: match.opponent || 'Opponent',
        dateISO: match.dateISO || '',
        seasonId: (_e = match.seasonId) !== null && _e !== void 0 ? _e : null,
        scorers,
        playerLines: Object.values(lines),
        cleanSheet: awayScore === 0,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    await matchRef.set({ summary }, { merge: true });
    return summary;
}
async function recomputeSeasonAggregates(teamId, seasonId) {
    const seasonKey = seasonId || 'none';
    const matchesSnap = await db
        .collection('teams').doc(teamId).collection('matches')
        .where('status', '==', 'completed')
        .get();
    const matches = matchesSnap.docs
        .map((d) => d.data())
        .filter((m) => { var _a; return !m.isDeleted && ((_a = m.seasonId) !== null && _a !== void 0 ? _a : null) === seasonId && m.summary; });
    const team = {
        played: 0, wins: 0, draws: 0, losses: 0,
        goalsFor: 0, goalsAgainst: 0, cleanSheets: 0,
        form: [],
    };
    const players = {};
    const ordered = [...matches].sort((a, b) => String(a.summary.dateISO).localeCompare(String(b.summary.dateISO)));
    for (const m of ordered) {
        const s = m.summary;
        team.played++;
        if (s.result === 'W')
            team.wins++;
        else if (s.result === 'D')
            team.draws++;
        else
            team.losses++;
        team.goalsFor += s.homeScore;
        team.goalsAgainst += s.awayScore;
        if (s.cleanSheet)
            team.cleanSheets++;
        team.form.push(s.result);
        for (const l of s.playerLines || []) {
            const p = players[l.playerId] || (players[l.playerId] = {
                playerId: l.playerId, playerName: l.playerName, seasonId: seasonKey,
                goals: 0, assists: 0, yellow: 0, red: 0,
                appearances: 0, starts: 0, minutes: 0,
            });
            p.playerName = l.playerName || p.playerName;
            p.goals += l.goals;
            p.assists += l.assists;
            p.yellow += l.yellow;
            p.red += l.red;
            if (l.appeared)
                p.appearances++;
            if (l.started)
                p.starts++;
            p.minutes += l.minutes;
        }
    }
    const batch = db.batch();
    batch.set(db.collection('teams').doc(teamId).collection('aggregates').doc(seasonKey), Object.assign(Object.assign({}, team), { form: team.form.slice(-5), seasonId: seasonKey, updatedAt: firestore_1.FieldValue.serverTimestamp() }));
    for (const p of Object.values(players)) {
        batch.set(db.collection('teams').doc(teamId).collection('playerAggregates').doc(`${p.playerId}_${seasonKey}`), Object.assign(Object.assign({}, p), { updatedAt: firestore_1.FieldValue.serverTimestamp() }));
    }
    await batch.commit();
}
exports.onMatchCompletedAggregates = functions.firestore
    .document('teams/{teamId}/matches/{matchId}')
    .onUpdate(async (change, context) => {
    var _a;
    const before = change.before.data();
    const after = change.after.data();
    if (!after)
        return;
    const becameCompleted = after.status === 'completed' && (before === null || before === void 0 ? void 0 : before.status) !== 'completed';
    const editedWhileCompleted = after.status === 'completed' &&
        ((before === null || before === void 0 ? void 0 : before.homeScore) !== after.homeScore ||
            (before === null || before === void 0 ? void 0 : before.awayScore) !== after.awayScore ||
            (before === null || before === void 0 ? void 0 : before.isDeleted) !== after.isDeleted);
    if (!becameCompleted && !editedWhileCompleted)
        return;
    const { teamId, matchId } = context.params;
    await buildMatchSummary(teamId, matchId, after);
    await recomputeSeasonAggregates(teamId, (_a = after.seasonId) !== null && _a !== void 0 ? _a : null);
});
// Post-completion event edits (undo, corrections) refresh the summary too.
exports.onEventWriteRecompute = functions.firestore
    .document('teams/{teamId}/matches/{matchId}/events/{eventId}')
    .onWrite(async (_change, context) => {
    var _a;
    const { teamId, matchId } = context.params;
    const matchDoc = await db.collection('teams').doc(teamId).collection('matches').doc(matchId).get();
    const match = matchDoc.data();
    if (!match || match.status !== 'completed' || match.isDeleted)
        return;
    await buildMatchSummary(teamId, matchId, match);
    await recomputeSeasonAggregates(teamId, (_a = match.seasonId) !== null && _a !== void 0 ? _a : null);
});
// ─── 9. Sweep: auto-finalize matches left live for 6+ hours ──────────────────
exports.sweepStaleLiveMatches = functions.pubsub
    .schedule('every 60 minutes')
    .onRun(async () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const cutoffMs = Date.now() - 6 * 3600 * 1000;
    const snap = await db.collectionGroup('matches').where('status', '==', 'live').get();
    for (const doc of snap.docs) {
        const m = doc.data();
        const state = m.state || {};
        // Latest sign of life: clock timestamps (epoch ms) or the doc's updatedAt.
        const lastActivity = Math.max((_a = state.resumedAt) !== null && _a !== void 0 ? _a : 0, (_b = state.startedAt) !== null && _b !== void 0 ? _b : 0, (_e = (_d = (_c = m.updatedAt) === null || _c === void 0 ? void 0 : _c.toMillis) === null || _d === void 0 ? void 0 : _d.call(_c)) !== null && _e !== void 0 ? _e : 0, (_h = (_g = (_f = m.startedAt) === null || _f === void 0 ? void 0 : _f.toMillis) === null || _g === void 0 ? void 0 : _g.call(_f)) !== null && _h !== void 0 ? _h : 0);
        if (lastActivity === 0 || lastActivity > cutoffMs)
            continue;
        const halfDuration = (_j = m.halfDuration) !== null && _j !== void 0 ? _j : 45;
        const cappedElapsed = Math.min(((_k = state.elapsedSec) !== null && _k !== void 0 ? _k : 0) + Math.max(0, (cutoffMs - ((_l = state.resumedAt) !== null && _l !== void 0 ? _l : cutoffMs)) / 1000), halfDuration * 2 * 60 + 20 * 60);
        await doc.ref.set({
            status: 'completed',
            completedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            autoFinalized: true,
            state: {
                status: 'final',
                elapsedSec: Math.floor(cappedElapsed),
                resumedAt: firestore_1.FieldValue.delete(),
            },
        }, { merge: true });
        console.log(`Auto-finalized stale live match ${doc.ref.path}`);
    }
});
//# sourceMappingURL=index.js.map