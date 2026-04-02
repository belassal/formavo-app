import { db } from './firebase';
import { COL } from '../models/collections';

export type TeamSummary = {
  id: string;
  name: string;
  rosterCount: number;
  nextMatch: { id: string; opponent: string; dateISO: string } | null;
  nextTraining: { id: string; title: string; dateISO: string } | null;
  recentForm: ('W' | 'D' | 'L')[]; // last 5 completed, newest first
  liveMatch: { id: string; opponent: string } | null;
  record: { w: number; d: number; l: number };
  staffIds: string[]; // member uids assigned to this team
};

export type StaffSummary = {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
  photoUrl?: string;
  teamIds: string[];
};

export type ClubDashboardData = {
  teams: TeamSummary[];
  staff: StaffSummary[];
  clubRecord: { w: number; d: number; l: number; gf: number; ga: number };
};

function getTodayISO(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function fetchClubDashboard(clubId: string): Promise<ClubDashboardData> {
  const today = getTodayISO();

  // 1) Load all teams tagged with this clubId
  const teamsSnap = await db
    .collection(COL.teams)
    .where('clubId', '==', clubId)
    .where('isDeleted', '!=', true)
    .get();

  // 2) Load all club staff members
  const staffSnap = await db
    .collection(COL.clubs)
    .doc(clubId)
    .collection(COL.clubMembers)
    .get();

  const staff: StaffSummary[] = staffSnap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      displayName: data.displayName || data.invitedEmail || 'Staff',
      email: data.email || data.invitedEmail || '',
      role: data.role || 'staff',
      status: data.status || 'active',
      photoUrl: data.photoUrl,
      teamIds: data.teamIds || [],
    };
  });

  // Build a map: teamId → staff uids assigned
  const teamStaffMap: Record<string, string[]> = {};
  for (const s of staff) {
    for (const tid of s.teamIds) {
      if (!teamStaffMap[tid]) teamStaffMap[tid] = [];
      teamStaffMap[tid].push(s.id);
    }
  }

  // 3) For each team, load roster count + matches + next training in parallel
  const teamSummaries = await Promise.all(
    teamsSnap.docs.map(async (teamDoc) => {
      const teamId = teamDoc.id;
      const teamData = teamDoc.data() as any;
      const teamName = teamData.name || 'Team';

      const [rosterSnap, matchesSnap, trainingsSnap] = await Promise.all([
        db.collection(COL.teams).doc(teamId).collection(COL.playerMemberships)
          .where('status', '==', 'active').get(),
        db.collection(COL.teams).doc(teamId).collection(COL.matches)
          .where('isDeleted', '!=', true).get(),
        db.collection(COL.teams).doc(teamId).collection(COL.trainings)
          .orderBy('startISO').startAt(today).limit(1).get(),
      ]);

      const rosterCount = rosterSnap.size;

      const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      // Next upcoming match
      const upcoming = matches
        .filter((m) => m.status === 'scheduled' && (m.dateISO || '') >= today)
        .sort((a, b) => (a.dateISO || '').localeCompare(b.dateISO || ''));
      const nextMatch = upcoming[0]
        ? { id: upcoming[0].id, opponent: upcoming[0].opponent || 'Opponent', dateISO: upcoming[0].dateISO }
        : null;

      // Live match
      const live = matches.find((m) => m.status === 'live');
      const liveMatch = live ? { id: live.id, opponent: live.opponent || 'Opponent' } : null;

      // Recent form (last 5 completed)
      const completed = matches
        .filter((m) => m.status === 'completed')
        .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || ''))
        .slice(0, 5);
      const recentForm: ('W' | 'D' | 'L')[] = completed.map((m) => {
        const h = Number(m.homeScore ?? 0);
        const a = Number(m.awayScore ?? 0);
        if (h > a) return 'W';
        if (h === a) return 'D';
        return 'L';
      });

      // Season record
      let w = 0, d = 0, l = 0, gf = 0, ga = 0;
      for (const m of completed) {
        const h = Number(m.homeScore ?? 0);
        const aw = Number(m.awayScore ?? 0);
        gf += h; ga += aw;
        if (h > aw) w++; else if (h === aw) d++; else l++;
      }

      // Next training
      const nextTrainingDoc = trainingsSnap.docs[0];
      const nextTraining = nextTrainingDoc
        ? { id: nextTrainingDoc.id, title: nextTrainingDoc.data().title || 'Practice', dateISO: nextTrainingDoc.data().startISO || '' }
        : null;

      return {
        id: teamId,
        name: teamName,
        rosterCount,
        nextMatch,
        nextTraining,
        recentForm,
        liveMatch,
        record: { w, d, l },
        gf, ga,
        staffIds: teamStaffMap[teamId] || [],
      } as TeamSummary & { gf: number; ga: number };
    }),
  );

  // Club-wide record
  const clubRecord = teamSummaries.reduce(
    (acc, t: any) => ({
      w: acc.w + t.record.w,
      d: acc.d + t.record.d,
      l: acc.l + t.record.l,
      gf: acc.gf + (t.gf || 0),
      ga: acc.ga + (t.ga || 0),
    }),
    { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
  );

  return {
    teams: teamSummaries.sort((a, b) => a.name.localeCompare(b.name)),
    staff,
    clubRecord,
  };
}
