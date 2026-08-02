# Formavo — Launch Plan

_Last updated: Aug 2026. Owner: Bilal. Status: pre-pilot._

---

## 1. Positioning (the one-liner everything hangs on)

**Formavo is the youth soccer app built around match day.** Competitors
(Spond, TeamSnap, Heja) do scheduling and chat; none of them do a live match
console, real-time goal notifications to family, shot maps, auto-computed
minutes, or shareable recaps. That's the wedge. Lead every piece of copy and
marketing with match day; scheduling/RSVP is table stakes we also happen to do
well.

Tagline candidates:
- "Coach smarter. Win together." (current in-app)
- "Every match, live for the whole family."
- "The match day app for youth soccer."

---

## 2. Release readiness — technical checklist

### Must do before TestFlight
- [ ] **Release build config**: production scheme, bundle id final, version 1.0.0,
      build number scheme. Archive + upload via Xcode.
- [ ] **Push notifications in release**: APNs auth key uploaded to Firebase
      project settings (dev builds work; verify the release entitlement +
      production APNs environment).
- [ ] **App icon + launch screen** final art (current one may be placeholder).
- [ ] **Crashlytics + Analytics** (`@react-native-firebase/crashlytics`,
      `/analytics`): without these we're blind after launch. Log the key funnel
      events: sign_up, team_created, invite_sent, invite_accepted, match_created,
      match_live, goal_logged, recap_shared, rsvp_submitted.
- [ ] **Demo/review account** for App Store review: a seeded coach account with a
      team, players, one completed match with recap. Reviewers must be able to
      see the app working without inviting anyone.
- [ ] **Firebase hardening**: enable Firestore point-in-time recovery/backups,
      set a billing budget alert, review quotas. Consider App Check (can wait).

### Must do before public App Store release
- [ ] **Privacy policy finalized by a lawyer** (draft at `docs/privacy-policy.md`)
      and hosted at a public URL (e.g. formavo.app/privacy).
- [ ] **Terms of Service** (same treatment).
- [ ] **App Store privacy questionnaire** ("nutrition labels"): we collect
      Contact Info (name, email), User Content (photos, messages, sports data),
      Identifiers (user ID, push token). No tracking across apps, no ads.
- [ ] **Support channel**: support@ email at minimum; a simple landing page
      (formavo.app) with app description, screenshots, privacy, support, and
      App Store badge.
- [ ] **Age rating**: 4+; app is for adults (coaches/parents) — children do not
      create accounts (this is also the privacy-policy stance).
- [ ] Delete account flow — ✅ shipped (App Store requirement).

### Known deferred items (OK to launch without, keep on the list)
- Android build + Play Store (React Native — mostly config/testing; do after
  iOS pilot proves the loop).
- Payments (see §6 — launch free, add paywall when pilot proves value).
- Player-avatar storage path tightening; App Check; series-edit for recurring
  trainings; per-match photos UI.

---

## 3. App Store listing package (draft copy)

**Name:** Formavo: Youth Soccer Manager
**Subtitle (30 chars):** Live match day for your team

**Promo text:**
Every goal, live. Parents and family follow the match in real time, coaches
run the game from one screen, and every player gets their season story.

**Description (draft):**

> **The youth soccer app built around match day.**
>
> Formavo gives coaches a live match console — tap to log goals, cards, and
> subs while the clock runs — and every parent gets the score the second it
> happens. Grandparents included.
>
> **On match day**
> • Live pitch view with your lineup and formation
> • Two-tap goal logging with shot locations
> • Real-time goal notifications to the whole team family
> • Substitutions and minutes tracked automatically
> • Switch formations mid-game — players re-slot to their positions
>
> **After the whistle**
> • Instant match recap: scoreline, scorers, shot map, minutes — share to the
>   family group chat in one tap
> • Player development log with private coach ratings
> • Season stats computed automatically from what you already logged
> • Shareable season cards for every player
>
> **All season long**
> • Schedule matches and recurring trainings with RSVP
> • Smart reminders so no one forgets to confirm
> • Team chat and announcements
> • Custom formations with your own position names and layouts
> • Multi-team club dashboard for club admins
>
> Coaches run it. Parents love it. Players get their story told.
>
> Free for parents, always.

**Keywords (100 chars):**
soccer,football,youth,team,coach,manager,lineup,formation,match,live,stats,club,roster,rsvp

**Category:** Sports. **Secondary:** Productivity.

**Screenshot plan (6, in order — first two matter most):**
1. GameDay pitch live with clock + score (dark, dramatic — the differentiator)
2. Goal notification on a lock screen mockup ("⚽ GOAL — SFC U13!")
3. Match recap with shot map
4. Home hero (next match + countdown + RSVP glance)
5. Player season card
6. Schedule + chat composite

**App Review notes:** include the demo account credentials, and note that push
notifications require a second device/account to demonstrate (offer the video).

---

## 4. Documentation to write

| Doc | Audience | Format | Notes |
|---|---|---|---|
| Coach quick-start | New coaches | 1-page PDF + web | Create team → roster → invite parents → first match. Mirrors in-app intro. |
| Parent one-pager | Parents | Shareable image/PDF | "You've been invited" — what the app does for them, RSVP how-to. Coaches forward it in WhatsApp. |
| Match day cheat sheet | Coaches | 1 page | Kick off → tap scorer → subs → full time → recap share. The assistant-as-logger tip. |
| FAQ | All | Web page | Invite email mismatch, notifications not arriving, formation editing, data/privacy. |
| Club admin guide | Club owners | Web page | Dashboard, staff invites, custom formations. Written when club tier monetizes. |

Keep all of it short. Youth-sports volunteers don't read manuals — the app's
in-app overlays carry the real onboarding.

---

## 5. Release phases

### Phase 0 — Closed pilot (now → +4–6 weeks)
- TestFlight, 2–3 friendly teams (ideally including one you don't coach).
- Personally onboard each coach (15-min call). Watch them, don't guide them —
  onboarding friction you observe here is the cheapest it will ever be to fix.
- **Metrics that decide go/no-go:** weekly coach retention (does every match
  get logged?), parent RSVP response rate (>70% within 48h of reminder),
  goal-push delivery, recap shares per match (>0.5 = the growth loop works).
- Fix list from pilot > new features.

### Phase 1 — Soft launch (pilot + ~4 weeks)
- App Store live, but marketed only regionally (Nova Scotia / local
  associations). Landing page up. Analytics watching the same metrics at
  10–30 teams.
- Start the waitlist/interest list for clubs.

### Phase 2 — Real launch (when Phase 1 metrics hold)
- Android build + Play Store.
- Payments on (see §6). Broader marketing push.
- Localization can wait unless a specific market pulls (fr-CA is the obvious
  second locale given the region).

---

## 6. Monetization

### Principles
1. **Parents never pay.** They're the network effect; charging them kills adoption.
2. **The buyer is the coach first, the club second.** Coaches feel the pain daily;
   clubs have budgets.
3. **Charge for the differentiator** (match day + insight), keep the commodity
   (schedule/RSVP/chat) free — that's the acquisition funnel.

### Short term (Phase 2, first paid version)
- **Free (per team):** schedule, trainings, RSVP + reminders, chat,
  announcements, roster, basic results.
- **Coach Pro — ~CA$9/mo or $69/yr per team** (via RevenueCat):
  - Live match console + goal notifications
  - Match recaps + shot maps + share cards
  - Player development log (ratings), minutes, season stats depth
  - Player season cards
  - Custom formations + saved layouts
- Pilot-club grandfathering: pilot teams get Pro free for a year — they're the
  references and case studies.
- Trial: every new team gets Pro free for their first 3 matches — the hook is
  *experiencing* match day, not reading about it.

### Medium term
- **Club tier — ~CA$29–59/mo by club size:** club dashboard, club player
  registry, staff management, all teams get Pro, priority support. One buyer,
  many teams — better economics than per-coach.
- Annual season billing aligned to registration season (clubs budget yearly).

### Long term ideas (validate before building)
- League/association tier (fixtures ingestion, cross-club standings).
- Local sponsor logo on shared recap/season cards (sponsor pays club, we take a
  cut — sponsorship is native to youth sports culture).
- End-of-season printed/HD season card packs (one-off purchase, parents).
- AI season summaries per player from the development log (Pro add-on).

### Explicitly not doing
- Ads (kids' context), selling data (obviously), charging parents.

---

## 7. Marketing plan

### The built-in growth loop (this is most of the strategy)
Every **recap share** and **season card** lands in a WhatsApp/Facebook group of
20+ families with "from Formavo ⚽" on it. Every **parent invite** creates
accounts. Every **goal push** makes a grandparent ask "what app is that?" —
the product is the funnel. Marketing's job is just to seed clubs and keep the
share loops polished.

### Seeding channels (Phase 1–2)
1. **Direct club outreach** — Soccer Nova Scotia clubs first: a 15-min demo of
   match day beats any ad. Target the club technical director, not individual
   coaches; one yes = 10–40 teams.
2. **Coach communities** — provincial coaching Facebook groups, grassroots
   coaching subreddits/forums. Show, don't pitch: post a recap card.
3. **A 45-second demo video** — phone on a tripod at a real match: goal happens
   → two taps → parent's phone lights up → final whistle → recap share. That
   video *is* the pitch, everywhere (App Store preview, site, socials).
4. **League partnerships** — offer a league free club-tier for a season in
   exchange for recommending Formavo to member clubs.
5. **App Store Optimization** — the keyword field above, seasonal screenshot
   refresh, ratings prompt after a recap share (happy moment).

### What to measure
Installs → team_created (activation), invite_accepted per team (network
depth), weekly coach retention (the metric), recap_shares per completed match
(growth loop health), free→Pro conversion after trial (business health).

---

## 8. Immediate next actions (ordered)

1. Lawyer review of privacy policy + ToS; buy formavo.app; hosted policy URL.
2. App icon/launch art final; Crashlytics + Analytics events wired.
3. APNs release config verified; TestFlight build 1.0.0 up.
4. Seeded demo account for App Review.
5. Recruit pilot teams (2–3), schedule onboarding calls, start Phase 0.
6. Shoot the 45-second match day video at the first pilot match.
