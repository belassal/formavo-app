import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';
import storage from '@react-native-firebase/storage';
import auth from '@react-native-firebase/auth';
import type { VoiceNote } from '../models/voiceNote';

// Hard cap on a single note. Keeps files small (~0.5MB/min AAC) and matches
// the product intent: quick sideline observations, not commentary.
export const MAX_VOICE_NOTE_SEC = 120;

// Dynamic require avoids New Architecture module init issues before the
// native bridge is ready, and lets the JS bundle run on binaries that
// predate the native pod (calls just fail into the catch blocks).
let _recorder: any = null;
function recorder() {
  if (_recorder) return _recorder;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  _recorder = require('react-native-audio-recorder-player').default;
  return _recorder;
}

// ===== Recording =====

let _lastRecordMs = 0;

/**
 * Start recording (default AAC/.m4a). onTick receives elapsed whole seconds.
 * Rejects if the mic permission is denied or the native module is missing.
 */
export async function startVoiceRecording(onTick: (sec: number) => void): Promise<void> {
  const rec = recorder();
  _lastRecordMs = 0;
  await rec.startRecorder();
  rec.addRecordBackListener((e: any) => {
    _lastRecordMs = e?.currentPosition ?? _lastRecordMs;
    onTick(Math.floor(_lastRecordMs / 1000));
  });
}

/** Stop recording. Returns the local file path and measured duration. */
export async function stopVoiceRecording(): Promise<{ localPath: string; durationSec: number }> {
  const rec = recorder();
  const localPath: string = await rec.stopRecorder();
  rec.removeRecordBackListener();
  return { localPath, durationSec: Math.max(1, Math.round(_lastRecordMs / 1000)) };
}

/** Best-effort abort (user cancelled): stop and discard. */
export async function cancelVoiceRecording(): Promise<void> {
  try {
    const rec = recorder();
    await rec.stopRecorder();
    rec.removeRecordBackListener();
  } catch (e) {
    console.warn('[voiceNoteService] cancelVoiceRecording:', e);
  }
}

// ===== Persistence =====

/**
 * Upload the recorded file and create the coachNotes doc.
 * Storage path is match-scoped so storage rules can verify team staff.
 */
export async function saveVoiceNote(params: {
  teamId: string;
  matchId: string;
  minute: number;
  localPath: string;
  durationSec: number;
}): Promise<void> {
  const { teamId, matchId, minute, localPath, durationSec } = params;

  const noteRef = db
    .collection(COL.teams).doc(teamId)
    .collection(COL.matches).doc(matchId)
    .collection(COL.coachNotes).doc();

  const storagePath = `teams/${teamId}/matches/${matchId}/coachNotes/${noteRef.id}.m4a`;
  const fileRef = storage().ref(storagePath);
  await fileRef.putFile(localPath);
  const audioUrl: string = await fileRef.getDownloadURL();

  const user = auth().currentUser;
  await noteRef.set({
    minute: Math.max(0, Math.min(999, Math.floor(minute))),
    durationSec,
    audioUrl,
    storagePath,
    createdAt: serverTimestamp(),
    createdBy: user?.uid ?? null,
    createdByName: user?.displayName ?? null,
  });
}

export function listenVoiceNotes(
  teamId: string,
  matchId: string,
  onData: (rows: VoiceNote[]) => void
) {
  return db
    .collection(COL.teams).doc(teamId)
    .collection(COL.matches).doc(matchId)
    .collection(COL.coachNotes)
    .onSnapshot(
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as VoiceNote[];
        rows.sort(
          (a, b) => (a.minute ?? 0) - (b.minute ?? 0) ||
            ((a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
        );
        onData(rows);
      },
      (err) => {
        console.log('[voiceNoteService] listenVoiceNotes error:', err);
        onData([]);
      }
    );
}

export async function deleteVoiceNote(params: { teamId: string; matchId: string; note: VoiceNote }) {
  const { teamId, matchId, note } = params;
  await db
    .collection(COL.teams).doc(teamId)
    .collection(COL.matches).doc(matchId)
    .collection(COL.coachNotes).doc(note.id)
    .delete();
  if (note.storagePath) {
    try {
      await storage().ref(note.storagePath).delete();
    } catch (e) {
      console.warn('[voiceNoteService] delete audio file:', e);
    }
  }
}

// ===== Playback =====

/**
 * Play a note's audio. onProgress gets (positionSec, durationSec); onDone
 * fires at the end of the clip. Starting a new note stops the previous one.
 */
export async function playVoiceNote(
  url: string,
  onProgress: (positionSec: number, durationSec: number) => void,
  onDone: () => void
): Promise<void> {
  const rec = recorder();
  try { await rec.stopPlayer(); } catch {}
  rec.removePlayBackListener();
  await rec.startPlayer(url);
  rec.addPlayBackListener((e: any) => {
    const pos = e?.currentPosition ?? 0;
    const dur = e?.duration ?? 0;
    onProgress(Math.floor(pos / 1000), Math.floor(dur / 1000));
    if (dur > 0 && pos >= dur) {
      rec.removePlayBackListener();
      onDone();
    }
  });
}

export async function stopVoiceNotePlayback(): Promise<void> {
  try {
    const rec = recorder();
    await rec.stopPlayer();
    rec.removePlayBackListener();
  } catch (e) {
    console.warn('[voiceNoteService] stopVoiceNotePlayback:', e);
  }
}
