import axiosInstance from "./axiosinstance";

export type MeetingRole = "host" | "guest";
export type MeetingStatus = "live" | "upcoming" | "past";

export type StoredMeeting = {
  roomId: string;
  title: string;
  role: MeetingRole;
  createdAt: string;
  scheduledFor?: string;
  durationMin?: number;
  startedAt?: string;
  endedAt?: string;
};

const MAX_STORED = 200;
const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;
const DEFAULT_DURATION_MIN = 60;

export const userKeyFor = (userId?: string | null) => userId || "guest";
const storageKey = (userKey: string) => `yuutube-meetings:${userKey}`;
const inBrowser = () => typeof window !== "undefined";

function read(userKey: string): StoredMeeting[] {
  if (!inBrowser()) return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(storageKey(userKey)) || "[]",
    );
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(userKey: string, meetings: StoredMeeting[]) {
  if (!inBrowser()) return;
  try {
    window.localStorage.setItem(
      storageKey(userKey),
      JSON.stringify(meetings.slice(0, MAX_STORED)),
    );
  } catch {
    // Storage can be full or blocked (private mode); history is best-effort.
  }
}

/** Pulls this account's meetings from the server and refreshes the local cache.
 *  No-op for guests, who have nothing to sync to. */
export async function syncMeetingsFromServer(userKey: string) {
  if (userKey === "guest") return;
  try {
    const response = await axiosInstance.get(`/meeting/${userKey}`);
    const serverMeetings: StoredMeeting[] = (response.data || []).map(
      (meeting: any) => ({
        roomId: meeting.roomId,
        title: meeting.title,
        role: meeting.role,
        createdAt: meeting.createdAt,
        scheduledFor: meeting.scheduledFor || undefined,
        durationMin: meeting.durationMin || undefined,
        startedAt: meeting.startedAt || undefined,
        endedAt: meeting.endedAt || undefined,
      }),
    );
    write(userKey, serverMeetings);
  } catch {
    // Offline or request failed — keep showing whatever is cached locally.
  }
}

/** 12 random hex characters formatted like abcd-ef01-2345. */
export function newRoomId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/** Invite links never carry the ?host=1 flag. */
export const buildInviteLink = (roomId: string) =>
  `${window.location.origin}/meetings/${roomId}`;

export const listMeetings = (userKey: string) => read(userKey);

export const getMeeting = (userKey: string, roomId: string) =>
  read(userKey).find((meeting) => meeting.roomId === roomId);

export function saveMeeting(userKey: string, meeting: StoredMeeting) {
  const others = read(userKey).filter((item) => item.roomId !== meeting.roomId);
  write(userKey, [meeting, ...others]);
  if (userKey !== "guest") {
    axiosInstance.post(`/meeting/${userKey}`, meeting).catch(() => undefined);
  }
}

export function deleteMeeting(userKey: string, roomId: string) {
  write(
    userKey,
    read(userKey).filter((meeting) => meeting.roomId !== roomId),
  );
  if (userKey !== "guest") {
    axiosInstance
      .delete(`/meeting/${userKey}/${roomId}`)
      .catch(() => undefined);
  }
}

/** Called when someone enters a room: creates or updates the history entry. */
export function recordMeetingJoin(
  userKey: string,
  roomId: string,
  role: MeetingRole,
) {
  const existing = getMeeting(userKey, roomId);
  const now = new Date().toISOString();
  saveMeeting(userKey, {
    title: "Instant meeting",
    createdAt: now,
    ...existing,
    roomId,
    role: existing?.role ?? role,
    startedAt: now,
    endedAt: undefined,
  });
}

export function markMeetingEnded(userKey: string, roomId: string) {
  const meeting = getMeeting(userKey, roomId);
  if (!meeting || meeting.endedAt) return;
  saveMeeting(userKey, { ...meeting, endedAt: new Date().toISOString() });
}

export function meetingStatus(
  meeting: StoredMeeting,
  now = Date.now(),
): MeetingStatus {
  if (
    meeting.startedAt &&
    !meeting.endedAt &&
    now - new Date(meeting.startedAt).getTime() < LIVE_WINDOW_MS
  )
    return "live";
  if (!meeting.startedAt && meeting.scheduledFor) {
    const end =
      new Date(meeting.scheduledFor).getTime() +
      (meeting.durationMin ?? DEFAULT_DURATION_MIN) * 60000;
    if (end > now) return "upcoming";
  }
  return "past";
}

export function meetingDurationMin(meeting: StoredMeeting) {
  if (!meeting.startedAt || !meeting.endedAt) return null;
  const minutes =
    (new Date(meeting.endedAt).getTime() -
      new Date(meeting.startedAt).getTime()) /
    60000;
  return Math.max(1, Math.round(minutes));
}

export function googleCalendarLink(meeting: StoredMeeting) {
  if (!meeting.scheduledFor) return "";
  const start = new Date(meeting.scheduledFor);
  const end = new Date(
    start.getTime() + (meeting.durationMin ?? DEFAULT_DURATION_MIN) * 60000,
  );
  const stamp = (date: Date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: meeting.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: `Join on Yuutube: ${buildInviteLink(meeting.roomId)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
