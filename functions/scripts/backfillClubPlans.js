// One-off: give every existing club (created before the request/approval flow)
// an active trial plan so its owner can keep creating teams under the new rules.
//
//   cd functions && npm ci
//   gcloud auth application-default login   (or set GOOGLE_APPLICATION_CREDENTIALS)
//   node scripts/backfillClubPlans.js [--dry-run]
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const dryRun = process.argv.includes('--dry-run');

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'formavo-prod' });
const db = getFirestore();

async function main() {
  const snap = await db.collection('clubs').get();
  const missing = snap.docs.filter((d) => !d.data().plan);
  console.log(`${snap.size} clubs, ${missing.length} without a plan`);

  if (dryRun) {
    for (const d of missing) console.log(`  would update ${d.id} (${d.data().name})`);
    return;
  }

  let batch = db.batch();
  let n = 0;
  for (const d of missing) {
    batch.set(
      d.ref,
      { plan: { tier: 'trial', status: 'active', startedAt: FieldValue.serverTimestamp() } },
      { merge: true },
    );
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (n % 400 !== 0) await batch.commit();
  console.log(`Updated ${n} clubs`);
}

main().catch((e) => { console.error(e); process.exit(1); });
