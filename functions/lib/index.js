"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDemoClub = exports.onUserDeleted = exports.sweepStaleLiveMatches = exports.rsvpReminders = exports.weeklyDigest = exports.onEventWriteRecompute = exports.onMatchCompletedAggregates = exports.onMatchEventCreated = exports.onTrainingAttendanceUpdated = exports.onMessageSent = exports.onTrainingCreated = exports.onRsvpUpdated = exports.onMatchCreated = exports.onAnnouncementCreated = void 0;
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
    var _a, _b, _c, _d, _e;
    const { teamId, matchId } = context.params;
    const event = snap.data();
    if (!event)
        return;
    const isGoal = event.type === 'goal';
    const isDisallowed = event.type === 'note' && event.noteKind === 'disallowed_goal';
    if (!isGoal && !isDisallowed)
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
    if (isDisallowed) {
        // The goal was already deleted (score corrected) before this note was written.
        const score = `${(_b = match.homeScore) !== null && _b !== void 0 ? _b : 0}-${(_c = match.awayScore) !== null && _c !== void 0 ? _c : 0}`;
        const uidsD = await getTeamMemberUids(teamId);
        await Promise.all(uidsD.map((uid) => sendToUser(uid, { title: `❌ Goal disallowed — ${teamName}`, body: `${event.text || 'Goal disallowed'} · now ${score} vs ${opponent}` }, { type: 'goal_disallowed', teamId, matchId }, 'live')));
        return;
    }
    // The score increment happens in the same transaction as the event write,
    // so by the time this trigger reads the match doc it reflects this goal.
    const score = `${(_d = match.homeScore) !== null && _d !== void 0 ? _d : 0}-${(_e = match.awayScore) !== null && _e !== void 0 ? _e : 0}`;
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
// Compact port of the app's slot-role heuristic: slot key (GK / L{line}-{i})
// plus the formation string yields the position a player occupied.
function roleForSlot(slotKey, formation) {
    var _a;
    if (!slotKey)
        return null;
    if (slotKey === 'GK')
        return 'GK';
    const m = slotKey.match(/^L(\d+)-(\d+)$/);
    if (!m)
        return null;
    const lines = (formation || '').split('-').map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
    if (!lines.length)
        return null;
    const L = lines.length;
    const lineIndex = parseInt(m[1], 10);
    const pos = parseInt(m[2], 10);
    const count = (_a = lines[lineIndex - 1]) !== null && _a !== void 0 ? _a : 0;
    const margin = count === 2 ? 0.28 : count === 3 ? 0.2 : count === 4 ? 0.14 : 0.08;
    const x = count <= 1 ? 0.5 : margin + (pos - 1) * ((1 - 2 * margin) / (count - 1));
    const band = L <= 1 ? 1 : (lineIndex - 1) / (L - 1);
    const left = x < 0.35;
    const right = x > 0.65;
    if (band <= 0.001)
        return count <= 2 ? 'CB' : left ? 'LB' : right ? 'RB' : 'CB';
    if (band >= 0.999)
        return count <= 2 ? 'ST' : left ? 'LW' : right ? 'RW' : 'ST';
    if (band < 0.45)
        return left ? 'LW' : right ? 'RW' : 'CDM';
    if (band > 0.55)
        return left ? 'LW' : right ? 'RW' : 'CAM';
    return left ? 'LW' : right ? 'RW' : 'CM';
}
// Port of src/services/minutesService.calculateMatchMinutes (stint-based:
// supports rolling subs and ignores orphan off-events).
function calcMinutes(roster, events, matchDuration) {
    const subs = events.filter((e) => e.type === 'sub').sort((a, b) => a.minute - b.minute);
    const out = {};
    for (const p of roster) {
        if (p.attendance === 'absent' || p.attendance === 'injured')
            continue;
        const started = (p.role || 'bench') === 'starter';
        const stints = [];
        let on = started ? 0 : null;
        for (const e of subs) {
            if (e.outPlayerId === p.playerId && on !== null) {
                stints.push([on, Math.max(on, e.minute)]);
                on = null;
            }
            if (e.inPlayerId === p.playerId && on === null) {
                on = e.minute;
            }
        }
        if (on !== null)
            stints.push([on, matchDuration]);
        if (!started && stints.length === 0)
            continue;
        const minutes = stints.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0);
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
        slotKey: d.data().slotKey,
    }));
    const homeScore = (_a = match.homeScore) !== null && _a !== void 0 ? _a : 0;
    const awayScore = (_b = match.awayScore) !== null && _b !== void 0 ? _b : 0;
    const result = homeScore > awayScore ? 'W' : homeScore < awayScore ? 'L' : 'D';
    const matchDuration = ((_c = match.halfDuration) !== null && _c !== void 0 ? _c : 45) * 2;
    const minutes = calcMinutes(roster, events, matchDuration);
    const slotByPlayer = {};
    for (const p of roster)
        slotByPlayer[p.playerId] = p.slotKey;
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
                position: roleForSlot(slotByPlayer[id], match.formation || ''),
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
        competitionType: match.competitionType || 'league',
        competitionName: match.competitionName || '',
        scorers,
        playerLines: Object.values(lines),
        cleanSheet: awayScore === 0,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    await matchRef.set({ summary }, { merge: true });
    return summary;
}
async function recomputeSeasonAggregates(teamId, seasonId) {
    var _a, _b;
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
    // Records split by competition type (league/cup/friendly/tournament) and,
    // for named cups/tournaments, per named competition (array — names are
    // free text and unsafe as Firestore map keys).
    const byCompetition = {};
    const namedComps = {};
    const tally = (bucket, s) => {
        bucket.played++;
        if (s.result === 'W')
            bucket.wins++;
        else if (s.result === 'D')
            bucket.draws++;
        else
            bucket.losses++;
        bucket.goalsFor += s.homeScore;
        bucket.goalsAgainst += s.awayScore;
    };
    const freshTally = () => ({ played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });
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
        // Read the tag from the match doc (not the summary) so re-tagging an old
        // completed match takes effect without a summary rebuild.
        const compType = m.competitionType || s.competitionType || 'league';
        const compName = String((_b = (_a = m.competitionName) !== null && _a !== void 0 ? _a : s.competitionName) !== null && _b !== void 0 ? _b : '').trim();
        tally(byCompetition[compType] || (byCompetition[compType] = freshTally()), s);
        if (compName && (compType === 'cup' || compType === 'tournament')) {
            const key = `${compType}|${compName.toLowerCase()}`;
            namedComps[key] = namedComps[key] || Object.assign({ name: compName, type: compType }, freshTally());
            tally(namedComps[key], s);
        }
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
            if (l.appeared && l.position) {
                p.positions = p.positions || {};
                p.positions[l.position] = (p.positions[l.position] || 0) + 1;
            }
        }
    }
    const batch = db.batch();
    batch.set(db.collection('teams').doc(teamId).collection('aggregates').doc(seasonKey), Object.assign(Object.assign({}, team), { form: team.form.slice(-5), seasonId: seasonKey, byCompetition, competitions: Object.values(namedComps), updatedAt: firestore_1.FieldValue.serverTimestamp() }));
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
            (before === null || before === void 0 ? void 0 : before.isDeleted) !== after.isDeleted ||
            (before === null || before === void 0 ? void 0 : before.competitionType) !== after.competitionType ||
            (before === null || before === void 0 ? void 0 : before.competitionName) !== after.competitionName);
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
// ─── Weekly digest: Sunday evening results + top scorer per team ─────────────
exports.weeklyDigest = functions.pubsub
    .schedule('every sunday 18:00')
    .timeZone('America/Halifax')
    .onRun(async () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const weekAgoKey = weekAgo.toISOString().substring(0, 10);
    const teamsSnap = await db.collection('teams').get();
    for (const teamDoc of teamsSnap.docs) {
        const team = teamDoc.data();
        if (team.isDeleted)
            continue;
        const matchesSnap = await teamDoc.ref
            .collection('matches')
            .where('status', '==', 'completed')
            .get();
        const thisWeek = matchesSnap.docs
            .map((d) => d.data())
            .filter((m) => !m.isDeleted && m.summary && String(m.summary.dateISO).substring(0, 10) >= weekAgoKey)
            .sort((a, b) => String(a.summary.dateISO).localeCompare(String(b.summary.dateISO)));
        if (thisWeek.length === 0)
            continue;
        const results = thisWeek
            .map((m) => `${m.summary.result} ${m.summary.homeScore}-${m.summary.awayScore} vs ${m.summary.opponent}`)
            .join(' · ');
        // Top scorer across the week
        const goals = {};
        for (const m of thisWeek) {
            for (const s of m.summary.scorers || []) {
                if (!s.playerId)
                    continue;
                goals[s.playerId] = goals[s.playerId] || { name: s.name, count: 0 };
                goals[s.playerId].count++;
            }
        }
        const top = Object.values(goals).sort((a, b) => b.count - a.count)[0];
        const topLine = top ? ` · Top scorer: ${top.name} (${top.count})` : '';
        const teamName = team.name || 'Your team';
        const uids = await getTeamMemberUids(teamDoc.id);
        await Promise.all(uids.map((uid) => sendToUser(uid, { title: `📅 ${teamName} — week in review`, body: `${results}${topLine}` }, { type: 'weekly_digest', teamId: teamDoc.id }, 'digest')));
    }
});
// ─── RSVP reminders: daily, for matches inside the next 48h ──────────────────
exports.rsvpReminders = functions.pubsub
    .schedule('every day 17:00')
    .timeZone('America/Halifax')
    .onRun(async () => {
    var _a;
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 3600 * 1000);
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const nowKey = fmt(now);
    const in48Key = fmt(in48h);
    const snap = await db.collectionGroup('matches').where('status', '==', 'scheduled').get();
    for (const matchDoc of snap.docs) {
        const m = matchDoc.data();
        if (m.isDeleted)
            continue;
        const dateISO = String(m.dateISO || '');
        if (!dateISO || dateISO < nowKey || dateISO > in48Key)
            continue;
        if (m.rsvpReminderSent)
            continue;
        const teamRef = matchDoc.ref.parent.parent;
        if (!teamRef)
            continue;
        const teamId = teamRef.id;
        const [rosterSnap, membersSnap, teamDoc] = await Promise.all([
            matchDoc.ref.collection('roster').get(),
            teamRef.collection('members').where('status', '==', 'active').get(),
            teamRef.get(),
        ]);
        const teamName = ((_a = teamDoc.data()) === null || _a === void 0 ? void 0 : _a.name) || 'Your team';
        const opponent = m.opponent || 'Opponent';
        const pendingIds = new Set(rosterSnap.docs
            .filter((r) => {
            const s = r.data().rsvpStatus;
            return !s || s === 'pending';
        })
            .map((r) => r.id));
        if (rosterSnap.size === 0 || pendingIds.size === 0) {
            await matchDoc.ref.set({ rsvpReminderSent: true }, { merge: true });
            continue;
        }
        // Parents whose linked children haven't responded
        const parentTargets = [];
        for (const memberDoc of membersSnap.docs) {
            const member = memberDoc.data();
            if (member.role !== 'parent')
                continue;
            const linked = Array.isArray(member.linkedPlayers)
                ? member.linkedPlayers
                : member.linkedPlayerId ? [{ id: member.linkedPlayerId }] : [];
            if (linked.some((c) => pendingIds.has(c.id)))
                parentTargets.push(memberDoc.id);
        }
        const dayLabel = dateISO.substring(0, 10) === nowKey.substring(0, 10) ? 'today' : 'soon';
        await Promise.all([
            ...parentTargets.map((uid) => sendToUser(uid, { title: `⏰ RSVP needed — ${teamName}`, body: `Match vs ${opponent} is ${dayLabel === 'today' ? 'today' : 'coming up'}. Tap to confirm attendance.` }, { type: 'rsvp_reminder', teamId, matchId: matchDoc.id }, 'rsvp')),
            ...(await getTeamCoachUids(teamId)).map((uid) => sendToUser(uid, { title: `⏰ ${teamName} vs ${opponent}`, body: `${pendingIds.size} player${pendingIds.size === 1 ? ' hasn\'t' : 's haven\'t'} confirmed yet.` }, { type: 'rsvp_reminder', teamId, matchId: matchDoc.id }, 'rsvp')),
        ]);
        await matchDoc.ref.set({ rsvpReminderSent: true }, { merge: true });
    }
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
// ─── 12. Account deletion cleanup ─────────────────────────────────────────────
// Fires when a Firebase Auth account is deleted (Settings → Delete account).
// The client only deletes the auth user; everything else happens here with
// admin privileges so parents (who can't write member docs) get cleaned up too:
//   • teams/{t}/members/{uid} + clubs/{c}/members/{uid} (discovered via the
//     user's teamRefs/clubRef subcollections)
//   • any still-pending invite docs for their email
//   • users/{uid} and all its subcollections (teamRefs, clubRef, …)
// Team records (matches, rosters, chat) stay with the team by design.
exports.onUserDeleted = functions.auth.user().onDelete(async (user) => {
    const uid = user.uid;
    const emailLower = (user.email || '').toLowerCase();
    const userRef = db.collection('users').doc(uid);
    // 1) Member docs, via the user's own refs
    const [teamRefsSnap, clubRefSnap] = await Promise.all([
        userRef.collection('teamRefs').get(),
        userRef.collection('clubRef').get(),
    ]);
    const memberRefs = [
        ...teamRefsSnap.docs.map((d) => db.collection('teams').doc(d.id).collection('members').doc(uid)),
        ...clubRefSnap.docs
            .map((d) => { var _a; return (_a = d.data()) === null || _a === void 0 ? void 0 : _a.clubId; })
            .filter(Boolean)
            .map((clubId) => db.collection('clubs').doc(clubId).collection('members').doc(uid)),
    ];
    // 2) Pending invites for this email (same query/index as acceptTeamInvitesForUser)
    if (emailLower) {
        const invitesSnap = await db
            .collectionGroup('members')
            .where('invitedEmailLower', '==', emailLower)
            .where('status', '==', 'invited')
            .get();
        memberRefs.push(...invitesSnap.docs.map((d) => d.ref));
    }
    const batch = db.batch();
    for (const ref of memberRefs)
        batch.delete(ref);
    await batch.commit();
    // 3) User doc + all subcollections
    await db.recursiveDelete(userRef);
    console.log(`Cleaned up account ${uid}: ${memberRefs.length} membership/invite docs removed`);
});
// ─── 13. Demo club seeding (TEMPORARY — delete after use) ─────────────────────
// One-shot HTTPS function that builds "Formavo FC (Demo)": a club + team with
// fictional players, a season of completed matches (events, summaries,
// aggregates), upcoming fixtures, trainings, and an announcement — so a
// partner/prospect sees every screen alive without touching real kids' data.
// Guarded by a random key; the owner (by email) gets coach + club-owner docs.
// Everything is created BEFORE member docs are written, so notification
// triggers find no recipients while seeding.
const SEED_KEY = 'fmv-demo-7kq2xw94rp';
exports.seedDemoClub = functions.https.onRequest(async (req, res) => {
    if (req.query.key !== SEED_KEY) {
        res.status(403).send('forbidden');
        return;
    }
    const ownerEmail = String(req.query.ownerEmail || '');
    if (!ownerEmail) {
        res.status(400).send('ownerEmail required');
        return;
    }
    const { getAuth } = await Promise.resolve().then(() => require('firebase-admin/auth'));
    const owner = await getAuth().getUserByEmail(ownerEmail);
    const uid = owner.uid;
    const ownerName = owner.displayName || 'Coach';
    const now = firestore_1.FieldValue.serverTimestamp();
    // ── Club + team + season ──
    const clubRef = db.collection('clubs').doc();
    await clubRef.set({
        name: 'Formavo FC (Demo)', createdBy: uid,
        sponsorName: 'Harbourview Hardware (Demo)',
        createdAt: now, updatedAt: now,
    });
    const teamRef = db.collection('teams').doc();
    await teamRef.set({
        name: 'U13 Tigers (Demo)', nameLower: 'u13 tigers (demo)',
        ageGroup: 'U13', season: '2025/2026', clubId: clubRef.id,
        createdBy: uid, activeSeasonId: null, isDeleted: false,
        createdAt: now, updatedAt: now,
    });
    const seasonRef = teamRef.collection('seasons').doc();
    await seasonRef.set({
        label: '2025/2026', year: 2026, status: 'active',
        startDate: now, endDate: null, createdAt: now, updatedAt: now,
    });
    await teamRef.update({ activeSeasonId: seasonRef.id });
    const seasonId = seasonRef.id;
    // ── Players (fictional) ──
    const PLAYERS = [
        ['Aiden Fraser', '1', 'GK'], ['Liam Doucette', '2', 'RB'],
        ['Noah Comeau', '4', 'CB'], ['Owen Gallant', '5', 'LB'],
        ['Lucas Boudreau', '6', 'CDM'], ['Mason LeBlanc', '8', 'CM'],
        ['Ethan Melanson', '10', 'CAM'], ['Jack Arsenault', '7', 'RW'],
        ['Caleb Thibodeau', '9', 'ST'], ['Ben Cormier', '11', 'LW'],
        ['Sam Bourque', '12', 'CM'], ['Nate Saulnier', '14', 'CB'],
        ['Theo Landry', '15', 'ST'], ['Max Robichaud', '16', 'RW'],
    ];
    const playerIds = [];
    {
        const batch = db.batch();
        for (const [name, number, position] of PLAYERS) {
            const pRef = clubRef.collection('players').doc();
            playerIds.push(pRef.id);
            batch.set(pRef, {
                name, nameLower: name.toLowerCase(), number, position,
                createdBy: uid, createdAt: now, updatedAt: now,
            });
            batch.set(teamRef.collection('playerMemberships').doc(pRef.id), {
                playerId: pRef.id, playerName: name, number, position,
                type: 'regular', status: 'active', seasonId,
                startDate: now, endDate: null, createdAt: now, updatedAt: now,
            });
        }
        await batch.commit();
    }
    // 9v9, 3-3-2: slots for the 9 starters (indexes 0–8), bench 9–13.
    const SLOTS = ['GK', 'L1-1', 'L1-2', 'L1-3', 'L2-1', 'L2-2', 'L2-3', 'L3-1', 'L3-2'];
    const pName = (i) => PLAYERS[i][0];
    const pId = (i) => playerIds[i];
    // ── Completed matches (goals: [scorerIdx, assistIdx|null, minute]) ──
    const COMPLETED = [
        { date: '2026-08-08 10:00', opponent: 'Harbour City SC', home: 3, away: 1, comp: 'league',
            goals: [[8, 6, 12], [7, 8, 33], [12, 5, 52]] },
        { date: '2026-08-15 10:00', opponent: 'Valley United', home: 2, away: 2, comp: 'league',
            goals: [[8, 9, 18], [6, 7, 47]], card: 4 },
        { date: '2026-08-22 12:30', opponent: 'Cape Rovers', home: 4, away: 0, comp: 'cup', compName: 'NS Cup (Demo)',
            goals: [[8, 6, 9], [9, 8, 25], [8, null, 39], [13, 10, 55]] },
        { date: '2026-08-29 10:00', opponent: 'Northside FC', home: 1, away: 2, comp: 'league',
            goals: [[7, 8, 41]], card: 2 },
        { date: '2026-09-05 14:00', opponent: 'Riverbend Athletic', home: 5, away: 1, comp: 'friendly',
            goals: [[8, 9, 8], [12, 6, 21], [9, 7, 30], [8, 10, 44], [10, 8, 58]] },
        { date: '2026-09-12 10:00', opponent: 'Harbour City SC', home: 2, away: 1, comp: 'league',
            goals: [[6, 8, 27], [8, 12, 50]] },
    ];
    for (const m of COMPLETED) {
        const matchRef = teamRef.collection('matches').doc();
        const matchData = {
            opponent: m.opponent, opponentLower: m.opponent.toLowerCase(),
            dateISO: m.date, location: 'Demo Park, Bedford', fieldName: '',
            format: '9v9', formation: '3-3-2', halfDuration: 30,
            status: 'completed', competitionType: m.comp, competitionName: m.compName || '',
            homeScore: m.home, awayScore: m.away, isDeleted: false,
            rosterCount: PLAYERS.length, seasonId,
            state: { status: 'final', elapsedSec: 3600 },
            createdAt: now, updatedAt: now,
        };
        await matchRef.set(matchData);
        const batch = db.batch();
        for (let i = 0; i < PLAYERS.length; i++) {
            batch.set(matchRef.collection('roster').doc(pId(i)), Object.assign(Object.assign({ playerId: pId(i), playerName: pName(i), role: i < 9 ? 'starter' : 'bench', attendance: 'present' }, (i < 9 ? { slotKey: SLOTS[i] } : {})), { rsvpStatus: 'attending', createdAt: now, updatedAt: now }));
        }
        for (const [scorer, assist, minute] of m.goals) {
            batch.set(matchRef.collection('events').doc(), Object.assign(Object.assign({ type: 'goal', side: 'home', minute, scorerId: pId(scorer), scorerName: pName(scorer) }, (assist != null ? { assistId: pId(assist), assistName: pName(assist) } : {})), { pos: { x: 0.3 + (minute % 5) * 0.1, y: 0.78 + (minute % 3) * 0.05 }, createdAt: now }));
        }
        for (let g = 0; g < m.away; g++) {
            batch.set(matchRef.collection('events').doc(), {
                type: 'goal', side: 'away', minute: 15 + g * 22, scorerName: 'Opponent', createdAt: now,
            });
        }
        if (m.card != null) {
            batch.set(matchRef.collection('events').doc(), {
                type: 'card', cardColor: 'yellow', minute: 38,
                playerId: pId(m.card), playerName: pName(m.card), createdAt: now,
            });
        }
        // Rolling subs: two bench players come on for wingers around 35–40'.
        batch.set(matchRef.collection('events').doc(), {
            type: 'sub', minute: 35, inPlayerId: pId(10), inPlayerName: pName(10),
            outPlayerId: pId(9), outPlayerName: pName(9), createdAt: now,
        });
        batch.set(matchRef.collection('events').doc(), {
            type: 'sub', minute: 40, inPlayerId: pId(11), inPlayerName: pName(11),
            outPlayerId: pId(7), outPlayerName: pName(7), createdAt: now,
        });
        await batch.commit();
        await buildMatchSummary(teamRef.id, matchRef.id, matchData);
    }
    await recomputeSeasonAggregates(teamRef.id, seasonId);
    // ── Upcoming fixtures ──
    const UPCOMING = [
        { date: '2026-09-22 18:00', opponent: 'Valley United', comp: 'league' },
        { date: '2026-09-26 10:00', opponent: 'Cape Rovers', comp: 'cup', compName: 'NS Cup (Demo)' },
    ];
    for (const m of UPCOMING) {
        const matchRef = teamRef.collection('matches').doc();
        await matchRef.set({
            opponent: m.opponent, opponentLower: m.opponent.toLowerCase(),
            dateISO: m.date, location: 'Demo Park, Bedford', fieldName: '',
            format: '9v9', formation: '3-3-2', halfDuration: 30,
            status: 'scheduled', competitionType: m.comp, competitionName: m.compName || '',
            homeScore: 0, awayScore: 0, isDeleted: false, rosterCount: 0, seasonId,
            createdAt: now, updatedAt: now,
        });
    }
    // ── Trainings (2 past w/ check-ins, 1 upcoming w/ RSVPs) ──
    const trainings = [
        { startISO: '2026-09-08 18:00', endISO: '2026-09-08 19:15', attended: playerIds.slice(0, 12) },
        { startISO: '2026-09-15 18:00', endISO: '2026-09-15 19:15', attended: playerIds.slice(2, 14) },
        { startISO: '2026-09-23 18:00', endISO: '2026-09-23 19:15',
            confirmed: playerIds.slice(0, 10), declined: playerIds.slice(12, 14) },
    ];
    for (const t of trainings) {
        await teamRef.collection('trainings').doc().set({
            title: 'Team Training', startISO: t.startISO, endISO: t.endISO,
            location: 'Demo Park, Bedford', status: 'scheduled', isDeleted: false,
            confirmedPlayerIds: t.confirmed || [], declinedPlayerIds: t.declined || [],
            attendedPlayerIds: t.attended || [], createdAt: now, updatedAt: now,
        });
    }
    // ── Announcement + assessments ──
    await teamRef.collection('announcements').doc().set({
        text: 'Welcome to the Formavo demo club! Everything here is fictional — open a completed match for the recap, or try the live console on an upcoming one.',
        createdBy: uid, createdByName: ownerName, createdAt: now,
    });
    for (const i of [8, 6]) {
        await teamRef.collection('playerAssessments').doc().set({
            playerId: pId(i), playerName: pName(i), window: 'Mid-season',
            scores: { technical: 4, tactical: 3, physical: 4, mental: i === 8 ? 5 : 3 },
            notes: i === 8 ? 'Clinical in front of goal; work on defensive shape.' : 'Great engine; decision speed improving.',
            coachId: uid, coachName: ownerName, createdAt: now,
        });
    }
    // ── Membership docs LAST (triggers above found no recipients) ──
    const batch = db.batch();
    batch.set(clubRef.collection('members').doc(uid), {
        role: 'owner', status: 'active', displayName: ownerName,
        email: ownerEmail.toLowerCase(), teamIds: [teamRef.id], joinedAt: now,
    });
    batch.set(teamRef.collection('members').doc(uid), {
        role: 'coach', status: 'active', joinedAt: now,
        displayName: ownerName, invitedEmail: ownerEmail.toLowerCase(),
    });
    batch.set(db.collection('users').doc(uid).collection('teamRefs').doc(teamRef.id), {
        teamId: teamRef.id, role: 'coach', status: 'active', joinedAt: now,
        teamName: 'U13 Tigers (Demo)', teamNameLower: 'u13 tigers (demo)', isDeleted: false,
    });
    await batch.commit();
    res.json({ ok: true, clubId: clubRef.id, teamId: teamRef.id, seasonId });
});
//# sourceMappingURL=index.js.map