// models/voiceNote.ts
//
// Coach voice notes recorded during a match (GameDayPitch mic button).
// Stored at teams/{teamId}/matches/{matchId}/coachNotes/{noteId} — a separate
// subcollection from events because security rules restrict these to staff
// (canWriteTeam) for BOTH read and write: parents must never see them.

export type VoiceNote = {
  id: string;

  // Capped match minute at the moment recording started (matchClock).
  minute: number;

  durationSec: number;

  // Firebase Storage download URL + path (path needed for delete).
  audioUrl: string;
  storagePath: string;

  createdAt?: any;
  createdBy?: string;
  createdByName?: string;
};
