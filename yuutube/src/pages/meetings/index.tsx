import {
  CalendarClock,
  CalendarPlus,
  Camera,
  Check,
  Clock,
  Copy,
  History,
  Link as LinkIcon,
  Play,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/AuthContext";
import {
  buildInviteLink,
  deleteMeeting,
  googleCalendarLink,
  listMeetings,
  meetingDurationMin,
  meetingStatus,
  newRoomId,
  saveMeeting,
  type MeetingStatus,
  type StoredMeeting,
  userKeyFor,
  syncMeetingsFromServer,
} from "@/lib/meetingStore";

const DURATIONS = [15, 30, 45, 60, 90, 120];

const pad = (value: number) => String(value).padStart(2, "0");
const toDateInput = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toTimeInput = (date: Date) =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const formatWhen = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

const formatDuration = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`
    : `${minutes} min`;

async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error("Couldn't copy. Select the link and copy it manually.");
  }
}

function ScheduleDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (meeting: StoredMeeting) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [created, setCreated] = useState<StoredMeeting | null>(null);

  useEffect(() => {
    const next = new Date();
    next.setMinutes(next.getMinutes() < 30 ? 30 : 60, 0, 0);
    setDate(toDateInput(next));
    setTime(toTimeInput(next));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    const when = new Date(`${date}T${time}`);
    if (Number.isNaN(when.getTime()))
      return toast.error("Pick a valid date and time.");
    if (when.getTime() < Date.now() - 60000)
      return toast.error("Pick a time in the future.");
    const meeting: StoredMeeting = {
      roomId: newRoomId(),
      title: title.trim() || "Yuutube meeting",
      role: "host",
      createdAt: new Date().toISOString(),
      scheduledFor: when.toISOString(),
      durationMin: duration,
    };
    onCreate(meeting);
    setCreated(meeting);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/50 p-0 sm:place-items-center sm:p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Schedule a meeting"
        className="w-full max-w-md rounded-t-3xl bg-background p-6 shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {created ? "Meeting scheduled" : "Schedule a meeting"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {created
                ? "Share the link with your guests. You can start it from the list any time."
                : "Pick a time and get a link to share right away."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {created ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border bg-muted/40 p-4">
              <p className="font-medium">{created.title}</p>
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                {formatWhen(created.scheduledFor!)} ·{" "}
                {formatDuration(created.durationMin!)}
              </p>
              <p className="mt-3 break-all rounded-lg bg-background px-3 py-2 font-mono text-xs">
                {buildInviteLink(created.roomId)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  copyText(
                    buildInviteLink(created.roomId),
                    "Invite link copied.",
                  )
                }
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy invite link
              </Button>
              <a
                href={googleCalendarLink(created)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
              >
                <CalendarPlus className="mr-2 h-4 w-4" />
                Add to Google Calendar
              </a>
            </div>
            <Button variant="ghost" className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label className="block text-sm font-medium">
              Title
              <Input
                className="mt-1.5"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Weekly sync"
                maxLength={80}
                autoFocus
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Date
                <Input
                  className="mt-1.5"
                  type="date"
                  value={date}
                  min={toDateInput(new Date())}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </label>
              <label className="block text-sm font-medium">
                Time
                <Input
                  className="mt-1.5"
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  required
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Duration
              <select
                className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
              >
                {DURATIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDuration(minutes)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">
                <CalendarClock className="mr-2 h-4 w-4" />
                Schedule
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<
  MeetingStatus,
  { label: string; className: string }
> = {
  live: {
    label: "Live",
    className: "bg-red-600 text-white",
  },
  upcoming: {
    label: "Scheduled",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  },
  past: {
    label: "Ended",
    className: "bg-muted text-muted-foreground",
  },
};

function MeetingRow({
  meeting,
  status,
  onStart,
  onCopy,
  onDelete,
}: {
  meeting: StoredMeeting;
  status: MeetingStatus;
  onStart: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const anchor = meeting.scheduledFor ?? meeting.startedAt ?? meeting.createdAt;
  const date = new Date(anchor);
  const minutes = meetingDurationMin(meeting);
  const badge = STATUS_BADGE[status];
  const primaryLabel =
    status === "live"
      ? "Rejoin"
      : status === "upcoming"
        ? "Start"
        : meeting.role === "host"
          ? "Start again"
          : "Join again";

  return (
    <li className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-muted text-center leading-tight">
        <div>
          <p className="text-[11px] font-medium uppercase text-muted-foreground">
            {date.toLocaleString(undefined, { month: "short" })}
          </p>
          <p className="text-lg font-bold">{date.getDate()}</p>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold">{meeting.title}</p>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
            {meeting.role === "host" ? "Host" : "Guest"}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatWhen(anchor)}
          </span>
          {status === "past" && minutes ? (
            <span>Lasted {formatDuration(minutes)}</span>
          ) : meeting.durationMin ? (
            <span>{formatDuration(meeting.durationMin)}</span>
          ) : null}
          <span className="font-mono text-xs">{meeting.roomId}</span>
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" onClick={onStart}>
          <Play className="mr-1.5 h-3.5 w-3.5" />
          {primaryLabel}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onCopy}
          aria-label="Copy invite link"
          title="Copy invite link"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          aria-label="Remove from list"
          title="Remove from list"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

export default function MeetingsPage() {
  const { user } = useUser();
  const router = useRouter();
  const userKey = userKeyFor(user?._id);
  const [roomCode, setRoomCode] = useState("");
  const [meetings, setMeetings] = useState<StoredMeeting[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [scheduleOpen, setScheduleOpen] = useState(false);

const refresh = useCallback(
  () => setMeetings(listMeetings(userKey)),
  [userKey],
);

useEffect(() => {
  refresh();
  window.addEventListener("focus", refresh);
  window.addEventListener("storage", refresh);
  return () => {
    window.removeEventListener("focus", refresh);
    window.removeEventListener("storage", refresh);
  };
}, [refresh]);

useEffect(() => {
  void syncMeetingsFromServer(userKey).then(refresh);
}, [userKey, refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const { upcoming, past } = useMemo(() => {
    const rows = meetings.map((meeting) => ({
      meeting,
      status: meetingStatus(meeting, now),
    }));
    const time = (iso?: string) => (iso ? new Date(iso).getTime() : 0);
    const upcomingRows = rows
      .filter((row) => row.status !== "past")
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "live" ? -1 : 1;
        return time(a.meeting.scheduledFor) - time(b.meeting.scheduledFor);
      });
    const pastRows = rows
      .filter((row) => row.status === "past")
      .sort(
        (a, b) =>
          time(
            b.meeting.endedAt ?? b.meeting.startedAt ?? b.meeting.scheduledFor,
          ) -
          time(
            a.meeting.endedAt ?? a.meeting.startedAt ?? a.meeting.scheduledFor,
          ),
      );
    return { upcoming: upcomingRows, past: pastRows };
  }, [meetings, now]);

  const requireSignIn = () => {
    if (user?._id) return true;
    toast.info("Sign in to host or schedule a meeting.");
    return false;
  };

  const hostMeeting = () => {
    if (!requireSignIn()) return;
    void router.push(`/meetings/${newRoomId()}?host=1`);
  };

  const openSchedule = () => {
    if (requireSignIn()) setScheduleOpen(true);
  };

  const joinMeeting = () => {
    const last = roomCode.trim().split("?")[0].split("/").filter(Boolean).pop();
    const roomId = (last ?? "").replace(/[^a-zA-Z0-9-]/g, "");
    if (!roomId) return toast.error("Enter a valid meeting code or link.");
    void router.push(`/meetings/${roomId}`);
  };

  const startMeeting = (meeting: StoredMeeting) => {
    const host = meeting.role === "host" ? "?host=1" : "";
    void router.push(`/meetings/${meeting.roomId}${host}`);
  };

  const removeMeeting = (meeting: StoredMeeting) => {
    deleteMeeting(userKey, meeting.roomId);
    refresh();
    toast.success("Removed from your list.");
  };

  const rows = tab === "upcoming" ? upcoming : past;

  return (
    <main className="min-w-0 flex-1 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-3xl bg-gradient-to-br from-red-600 via-red-500 to-orange-500 px-6 py-12 text-white shadow-lg sm:px-12">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm">
              <Camera className="h-4 w-4" /> Yuutube Meetings
            </span>
            <h1 className="mt-5 text-3xl font-bold sm:text-5xl">
              Meet, talk, and collaborate live.
            </h1>
            <p className="mt-4 text-white/90">
              Host a secure video call with your Yuutube account, or join an
              invite link as a guest—no second account required.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={hostMeeting}
                className="bg-white text-red-700 hover:bg-white/90"
              >
                <Camera className="mr-2 h-4 w-4" />
                New meeting
              </Button>
              <Button
                onClick={openSchedule}
                variant="outline"
                className="border-white/60 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <CalendarClock className="mr-2 h-4 w-4" />
                Schedule
              </Button>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <Users className="h-7 w-7 text-red-600" />
            <h2 className="mt-4 text-xl font-semibold">Join with a code</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste the meeting code or the whole invite link.
            </p>
            <div className="mt-5 flex gap-2">
              <Input
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && joinMeeting()}
                placeholder="Meeting code or link"
              />
              <Button onClick={joinMeeting}>Join</Button>
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <LinkIcon className="h-7 w-7 text-red-600" />
            <h2 className="mt-4 text-xl font-semibold">Invite anyone</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Guests only need the invite link and a display name. Their camera
              and microphone remain under their control.
            </p>
            <p className="mt-5 text-sm font-medium">
              Schedule a meeting to get a shareable link ahead of time.
            </p>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label="Meetings"
              className="inline-flex rounded-full bg-muted p-1"
            >
              {(
                [
                  ["upcoming", "Upcoming", CalendarClock, upcoming.length],
                  ["past", "Past meetings", History, past.length],
                ] as const
              ).map(([key, label, Icon, count]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                    tab === key
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  <span className="rounded-full bg-muted-foreground/15 px-1.5 text-xs">
                    {count}
                  </span>
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={openSchedule}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Schedule meeting
            </Button>
          </div>

          {rows.length ? (
            <ul className="mt-4 space-y-3">
              {rows.map(({ meeting, status }) => (
                <MeetingRow
                  key={meeting.roomId}
                  meeting={meeting}
                  status={status}
                  onStart={() => startMeeting(meeting)}
                  onCopy={() =>
                    copyText(
                      buildInviteLink(meeting.roomId),
                      "Invite link copied.",
                    )
                  }
                  onDelete={() => removeMeeting(meeting)}
                />
              ))}
            </ul>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed p-10 text-center">
              <Check className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">
                {tab === "upcoming"
                  ? "Nothing scheduled"
                  : "No past meetings yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tab === "upcoming"
                  ? "Schedule a meeting and it will show up here with a Start button."
                  : "Meetings you host or join will be listed here."}
              </p>
            </div>
          )}
        </section>
      </div>

      {scheduleOpen && (
        <ScheduleDialog
          onClose={() => setScheduleOpen(false)}
          onCreate={(meeting) => {
            saveMeeting(userKey, meeting);
            refresh();
            setTab("upcoming");
          }}
        />
      )}
    </main>
  );
}
