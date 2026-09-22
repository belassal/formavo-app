"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clubRequestAction = exports.expireTrials = exports.TRIAL_DAYS = exports.syncClubMemberTeams = exports.onClubRequestUpdated = exports.onClubRequestCreated = exports.onUserDeleted = exports.sweepStaleLiveMatches = exports.rsvpReminders = exports.weeklyDigest = exports.onEventWriteRecompute = exports.onMatchCompletedAggregates = exports.onMatchEventCreated = exports.onTrainingAttendanceUpdated = exports.onMessageSent = exports.onTrainingCreated = exports.onRsvpUpdated = exports.onMatchCreated = exports.onAnnouncementCreated = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const crypto_1 = require("crypto");
const messaging_1 = require("firebase-admin/messaging");
const functions = require("firebase-functions/v1");
const params_1 = require("firebase-functions/params");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
// Where new club requests are sent for approval (set in functions/.env or at deploy).
const adminNotifyEmail = (0, params_1.defineString)('ADMIN_NOTIFY_EMAIL');
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
// ─── 13. Club requests → owner approval → club provisioning ──────────────────
// The club is the paying tenant, so clients never create clubs. A coach files
// clubRequests/{id} (status 'pending'); the app owner reviews it and sets
// status to 'approved' or 'rejected' in the console. Approval provisions the
// club here with a trial plan — the same `plan` fields a billing webhook will
// write later.
function escapeHtml(s) {
    return String(s !== null && s !== void 0 ? s : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function emailShell(title, bodyHtml) {
    return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="font-size: 22px; font-weight: 800; color: #111; margin-bottom: 8px;">${title}</h2>
      ${bodyHtml}
    </div>`;
}
exports.onClubRequestCreated = functions.firestore
    .document('clubRequests/{requestId}')
    .onCreate(async (snap, context) => {
    var _a, _b;
    const data = snap.data();
    if (!data)
        return;
    const to = adminNotifyEmail.value();
    if (!to) {
        console.warn('ADMIN_NOTIFY_EMAIL is not set; skipping club request email');
        return;
    }
    // One-click approval: a random token stored on the request doc authorizes
    // the clubRequestAction HTTPS endpoint (links only ever go to the admin).
    // Kept OUT of the request doc itself: the requester can read their own
    // request, and must never see the token that approves it.
    const adminToken = (0, crypto_1.randomBytes)(16).toString('hex');
    await snap.ref.collection('private').doc('admin').set({ adminToken });
    const actionUrl = (action) => `https://us-central1-formavo-prod.cloudfunctions.net/clubRequestAction` +
        `?id=${context.params.requestId}&action=${action}&token=${adminToken}`;
    const rows = [
        ['Club', data.clubName],
        ['Contact', `${data.contactName || '—'} (${data.contactEmailLower})`],
        ['Teams', String((_a = data.teamCount) !== null && _a !== void 0 ? _a : '—')],
        ['Players', String((_b = data.playerCount) !== null && _b !== void 0 ? _b : '—')],
        ['Notes', data.notes || '—'],
        ['Request ID', context.params.requestId],
    ];
    const table = rows
        .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;">${k}</td>` +
        `<td style="padding:6px 0;color:#111;font-size:14px;">${escapeHtml(v)}</td></tr>`)
        .join('');
    await db.collection('mail').add({
        to: [to],
        message: {
            subject: `Formavo club request: ${data.clubName}`,
            html: emailShell('New club request', `<table style="border-collapse:collapse;">${table}</table>
           <p style="margin-top:20px;">
             <a href="${actionUrl('approve')}" style="display:inline-block;background:#16a34a;color:#fff;font-weight:700;font-size:15px;padding:12px 28px;border-radius:12px;text-decoration:none;">Approve</a>
             &nbsp;&nbsp;
             <a href="${actionUrl('reject')}" style="display:inline-block;background:#f3f4f6;color:#374151;font-weight:700;font-size:15px;padding:12px 28px;border-radius:12px;text-decoration:none;">Reject</a>
           </p>
           <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin-top:12px;">
             One tap provisions the club and emails the coach. Fallback: set
             <code>status</code> on <code>clubRequests/${context.params.requestId}</code>
             in the Firebase console.
           </p>`),
            text: rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
                `\n\nApprove: ${actionUrl('approve')}\nReject: ${actionUrl('reject')}`,
        },
    });
});
exports.onClubRequestUpdated = functions.firestore
    .document('clubRequests/{requestId}')
    .onUpdate(async (change, context) => {
    var _a, _b, _c;
    const before = change.before.data();
    const after = change.after.data();
    if (!before || !after)
        return;
    if (before.status === after.status)
        return;
    if (before.status !== 'pending')
        return;
    const requestId = context.params.requestId;
    const contactEmail = after.contactEmailLower;
    const clubName = after.clubName;
    if (after.status === 'rejected') {
        await change.after.ref.set({ reviewedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
        await db.collection('mail').add({
            to: [contactEmail],
            message: {
                subject: `Your Formavo club request for ${clubName}`,
                html: emailShell('About your club request', `<p style="color:#374151;font-size:16px;line-height:1.6;">
               Thanks for your interest in Formavo. We're not able to set up
               <strong>${escapeHtml(clubName)}</strong> right now. Reply to this email if
               you'd like to talk it through.
             </p>`),
                text: `Thanks for your interest in Formavo. We're not able to set up ${clubName} right now. Reply to this email if you'd like to talk it through.`,
            },
        });
        return;
    }
    if (after.status !== 'approved')
        return;
    if (after.clubId)
        return;
    const uid = after.uid;
    const userSnap = await db.collection('users').doc(uid).get();
    const displayName = after.contactName || ((_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.displayName) || contactEmail;
    const clubRef = db.collection('clubs').doc();
    const now = firestore_1.FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(clubRef, {
        name: clubName,
        createdBy: uid,
        requestId,
        plan: {
            tier: 'trial',
            status: 'active',
            maxTeams: Number(after.teamCount) > 0 ? Number(after.teamCount) : 3,
            startedAt: now,
            expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + exports.TRIAL_DAYS * 24 * 60 * 60 * 1000),
        },
        createdAt: now,
        updatedAt: now,
    });
    batch.set(clubRef.collection('members').doc(uid), {
        role: 'owner',
        status: 'active',
        displayName,
        email: contactEmail,
        photoUrl: (_c = (_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.photoUrl) !== null && _c !== void 0 ? _c : null,
        teamIds: [],
        teamPositions: {},
        joinedAt: now,
    });
    batch.set(db.collection('users').doc(uid).collection('clubRef').doc('data'), { clubId: clubRef.id }, { merge: true });
    batch.set(change.after.ref, { clubId: clubRef.id, reviewedAt: now }, { merge: true });
    await batch.commit();
    await db.collection('mail').add({
        to: [contactEmail],
        message: {
            subject: `${clubName} is ready on Formavo ⚽`,
            html: emailShell("You're in", `<p style="color:#374151;font-size:16px;line-height:1.6;">
             <strong>${escapeHtml(clubName)}</strong> has been set up on Formavo and you're its owner.
             Open the app to create your first team, import your roster and invite your coaches.
           </p>`),
            text: `${clubName} has been set up on Formavo and you're its owner. Open the app to create your first team, import your roster and invite your coaches.`,
        },
    });
    console.log(`Provisioned club ${clubRef.id} for request ${requestId}`);
});
// ─── Sync club member team assignments → team memberships ───────────────────
// The client (StaffProfile / invite acceptance) only edits the club member doc
// (teamPositions: {teamId: title}); security rules don't let one user write
// another user's teamRefs, so this function reconciles the real memberships:
//   • assign/retitle → teams/{t}/members/{uid} {role, title} + users/{uid}/teamRefs/{t}
//   • unassign or club removal → both docs deleted
// Guards: invite_ docs are skipped (handled at acceptance), teams outside this
// club are never touched, and a member doc holding role 'parent' is left alone.
function assignmentsOf(data) {
    var _a, _b;
    if (!data)
        return {};
    const positions = ((_a = data.teamPositions) !== null && _a !== void 0 ? _a : {});
    const out = Object.assign({}, positions);
    // Legacy members: teamIds without teamPositions — derive a default title.
    const fallback = data.role === 'owner' || data.role === 'head_coach'
        ? 'Head Coach'
        : data.role === 'asst_coach'
            ? 'Assistant Coach'
            : 'Team Manager';
    for (const teamId of ((_b = data.teamIds) !== null && _b !== void 0 ? _b : [])) {
        if (!out[teamId])
            out[teamId] = fallback;
    }
    return out;
}
exports.syncClubMemberTeams = functions.firestore
    .document('clubs/{clubId}/members/{memberId}')
    .onWrite(async (change, context) => {
    var _a, _b, _c;
    const { clubId, memberId } = context.params;
    if (memberId.startsWith('invite_'))
        return;
    const before = assignmentsOf(change.before.exists ? change.before.data() : undefined);
    const after = assignmentsOf(change.after.exists ? change.after.data() : undefined);
    const afterData = change.after.exists ? change.after.data() : {};
    const uid = memberId;
    const toRemove = Object.keys(before).filter((t) => !(t in after));
    const toSet = Object.keys(after).filter((t) => before[t] !== after[t]);
    if (!toRemove.length && !toSet.length)
        return;
    const teamIds = [...new Set([...toRemove, ...toSet])];
    const teamSnaps = await db.getAll(...teamIds.map((t) => db.collection('teams').doc(t)));
    const teamById = new Map(teamSnaps.map((s) => [s.id, s]));
    const memberSnaps = await db.getAll(...teamIds.map((t) => db.collection('teams').doc(t).collection('members').doc(uid)));
    const memberByTeam = new Map(teamIds.map((t, i) => [t, memberSnaps[i]]));
    const batch = db.batch();
    let writes = 0;
    for (const teamId of toRemove) {
        const teamSnap = teamById.get(teamId);
        if (!(teamSnap === null || teamSnap === void 0 ? void 0 : teamSnap.exists) || ((_a = teamSnap.data()) === null || _a === void 0 ? void 0 : _a.clubId) !== clubId)
            continue;
        const existing = memberByTeam.get(teamId);
        if ((existing === null || existing === void 0 ? void 0 : existing.exists) && ((_b = existing.data()) === null || _b === void 0 ? void 0 : _b.role) === 'parent')
            continue;
        batch.delete(db.collection('teams').doc(teamId).collection('members').doc(uid));
        batch.delete(db.collection('users').doc(uid).collection('teamRefs').doc(teamId));
        writes++;
    }
    for (const teamId of toSet) {
        const teamSnap = teamById.get(teamId);
        const teamData = (teamSnap === null || teamSnap === void 0 ? void 0 : teamSnap.exists) ? teamSnap.data() : null;
        if (!teamData || teamData.isDeleted || teamData.clubId !== clubId)
            continue;
        const existing = memberByTeam.get(teamId);
        if ((existing === null || existing === void 0 ? void 0 : existing.exists) && ((_c = existing.data()) === null || _c === void 0 ? void 0 : _c.role) === 'parent')
            continue;
        const title = after[teamId];
        const role = title === 'Head Coach' ? 'coach' : 'assistant';
        const teamName = teamData.name || 'Team';
        batch.set(db.collection('teams').doc(teamId).collection('members').doc(uid), Object.assign(Object.assign({ role,
            title, status: 'active' }, (afterData.displayName ? { displayName: afterData.displayName } : {})), ((existing === null || existing === void 0 ? void 0 : existing.exists) ? {} : { joinedAt: firestore_1.FieldValue.serverTimestamp() })), { merge: true });
        batch.set(db.collection('users').doc(uid).collection('teamRefs').doc(teamId), {
            teamId,
            role,
            title,
            status: 'active',
            teamName,
            teamNameLower: String(teamName).toLowerCase(),
            isDeleted: false,
        }, { merge: true });
        writes++;
    }
    if (writes)
        await batch.commit();
    console.log(`syncClubMemberTeams ${clubId}/${uid}: ${toSet.length} set, ${toRemove.length} removed, ${writes} applied`);
});
// ─── Trial expiry ────────────────────────────────────────────────────────────
// Daily sweep: trials past their expiresAt flip to status 'expired', which the
// rules + client gate on (no new teams; existing data stays readable). Clubs
// whose plan has NO expiresAt (backfilled/grandfathered) never expire here.
exports.TRIAL_DAYS = 30;
exports.expireTrials = functions.pubsub
    .schedule('every day 06:00')
    .timeZone('America/Halifax')
    .onRun(async () => {
    var _a, _b, _c, _d, _e;
    const snap = await db.collection('clubs').where('plan.status', '==', 'active').get();
    const nowMs = Date.now();
    let expired = 0;
    for (const doc of snap.docs) {
        const plan = doc.data().plan || {};
        if (plan.tier !== 'trial')
            continue;
        if (!((_a = plan.expiresAt) === null || _a === void 0 ? void 0 : _a.toMillis))
            continue;
        const msLeft = plan.expiresAt.toMillis() - nowMs;
        // Heads-up email once, in the final week of the trial.
        if (msLeft > 0 && msLeft <= 7 * 24 * 60 * 60 * 1000 && !plan.warningSentAt) {
            const ownerSnap = await doc.ref
                .collection('members').where('role', '==', 'owner').limit(1).get();
            const ownerEmail = (_c = (_b = ownerSnap.docs[0]) === null || _b === void 0 ? void 0 : _b.data()) === null || _c === void 0 ? void 0 : _c.email;
            if (ownerEmail) {
                const clubName = doc.data().name || 'your club';
                const daysLeft = Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
                await db.collection('mail').add({
                    to: [ownerEmail],
                    message: {
                        subject: `Your Formavo trial for ${clubName} ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
                        html: emailShell('Your trial is ending soon', `<p style="color:#374151;font-size:16px;line-height:1.6;">
                   The trial for <strong>${escapeHtml(clubName)}</strong> ends in
                   <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>. Everything you've
                   built — teams, schedules, stats — stays safe either way.
                 </p>
                 <p style="color:#374151;font-size:16px;line-height:1.6;">
                   Reply to this email to keep going without interruption.
                 </p>`),
                        text: `The trial for ${clubName} ends in ${daysLeft} day(s). Everything you've built stays safe either way. Reply to this email to keep going without interruption.`,
                    },
                });
            }
            await doc.ref.update({ 'plan.warningSentAt': firestore_1.FieldValue.serverTimestamp() });
        }
        if (msLeft > 0)
            continue;
        await doc.ref.update({
            'plan.status': 'expired',
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        expired++;
        // Tell the owner (best effort).
        const ownerSnap = await doc.ref
            .collection('members')
            .where('role', '==', 'owner')
            .limit(1)
            .get();
        const ownerEmail = (_e = (_d = ownerSnap.docs[0]) === null || _d === void 0 ? void 0 : _d.data()) === null || _e === void 0 ? void 0 : _e.email;
        if (ownerEmail) {
            const clubName = doc.data().name || 'your club';
            await db.collection('mail').add({
                to: [ownerEmail],
                message: {
                    subject: `Your Formavo trial for ${clubName} has ended`,
                    html: emailShell('Your trial has ended', `<p style="color:#374151;font-size:16px;line-height:1.6;">
                 The trial for <strong>${escapeHtml(clubName)}</strong> has ended. Your
                 teams, schedules and stats are all safe and stay readable — but new
                 teams can't be added until the plan is renewed.
               </p>
               <p style="color:#374151;font-size:16px;line-height:1.6;">
                 Reply to this email and we'll get you set up.
               </p>`),
                    text: `The trial for ${clubName} has ended. Your teams, schedules and stats are safe and stay readable, but new teams can't be added until the plan is renewed. Reply to this email and we'll get you set up.`,
                },
            });
        }
    }
    console.log(`expireTrials: ${snap.size} active plans checked, ${expired} expired`);
});
// ─── One-click club request approval (links in the admin email) ─────────────
// GET ?id=<requestId>&action=approve|reject&token=<adminToken>. The token is
// random, generated per request, stored only on the request doc and mailed
// only to ADMIN_NOTIFY_EMAIL. Flipping status here fires onClubRequestUpdated,
// which does the actual provisioning/emails.
exports.clubRequestAction = functions.https.onRequest(async (req, res) => {
    var _a;
    const page = (title, body, code = 200) => res.status(code).send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<body style="font-family:-apple-system,sans-serif;background:#f2f2f7;display:flex;justify-content:center;padding-top:15vh;">` +
        `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px 32px;max-width:420px;text-align:center;">` +
        `<h2 style="margin:0 0 8px;color:#111;">${title}</h2>` +
        `<p style="color:#6b7280;margin:0;line-height:1.6;">${body}</p></div>`);
    const id = String(req.query.id || '');
    const action = String(req.query.action || '');
    const token = String(req.query.token || '');
    if (!id || !token || !['approve', 'reject'].includes(action)) {
        page('Invalid link', 'This approval link is malformed.', 400);
        return;
    }
    const ref = db.collection('clubRequests').doc(id);
    const [snap, tokenSnap] = await Promise.all([
        ref.get(),
        ref.collection('private').doc('admin').get(),
    ]);
    const data = snap.data();
    const expected = (_a = tokenSnap.data()) === null || _a === void 0 ? void 0 : _a.adminToken;
    if (!snap.exists || !expected || expected !== token) {
        page('Invalid link', 'This approval link is not valid.', 403);
        return;
    }
    if (data.status !== 'pending') {
        page('Already handled', `This request is already <b>${escapeHtml(data.status)}</b>.`);
        return;
    }
    await ref.update({
        status: action === 'approve' ? 'approved' : 'rejected',
        actionedVia: 'email-link',
    });
    if (action === 'approve') {
        page('Approved ✓', `<b>${escapeHtml(data.clubName)}</b> is being provisioned — the coach gets their welcome email in a moment.`);
    }
    else {
        page('Rejected', `<b>${escapeHtml(data.clubName)}</b> was declined; the requester has been emailed.`);
    }
});
//# sourceMappingURL=index.js.map