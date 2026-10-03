import {
  Camera,
  CameraOff,
  Copy,
  Crown,
  Eraser,
  Hand,
  Lock,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  Pencil,
  PhoneOff,
  Power,
  Radio,
  Send,
  Shield,
  Smile,
  UserX,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/router";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/AuthContext";
import {
  buildInviteLink,
  getMeeting,
  markMeetingEnded,
  recordMeetingJoin,
  syncMeetingsFromServer,
  userKeyFor,
} from "@/lib/meetingStore";

/* ------------------------------------------------------------------ */
/* Types & constants                                                   */
/* ------------------------------------------------------------------ */

type RemoteParticipant = { id: string; name: string; stream: MediaStream };
type MediaFlags = { audio?: boolean; video?: boolean };
type PanelName = "chat" | "people" | null;
type ChatEntry = { name: string; message: string; at: number; own: boolean };
type FloatingReaction = {
  id: number;
  emoji: string;
  name: string;
  left: number;
};
type Point = { x: number; y: number };

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
const REACTION_EMOJIS = ["👍", "👏", "❤️", "😂", "🎉", "😮"];
const BOARD_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#111827"];

const CSS = `
@keyframes mtg-panel-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
@keyframes mtg-pop { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: none; } }
@keyframes mtg-float {
  0% { opacity: 0; transform: translateY(0) scale(.6); }
  12% { opacity: 1; transform: translateY(-24px) scale(1.15); }
  100% { opacity: 0; transform: translateY(-240px) scale(1); }
}
.mtg-panel-in { animation: mtg-panel-in .18s ease-out; }
.mtg-pop { animation: mtg-pop .14s ease-out; }
.mtg-float { animation: mtg-float 3s ease-out forwards; }
@media (prefers-reduced-motion: reduce) {
  .mtg-panel-in, .mtg-pop, .mtg-float { animation: none; }
}
`;

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

const timeLabel = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Ask for camera + mic, falling back to audio-only, video-only, then an
 * empty stream so the person can still join and watch.
 */
async function acquireMedia(
  cam?: string,
  mic?: string,
): Promise<{ stream: MediaStream; notice: string }> {
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia)
    return {
      stream: new MediaStream(),
      notice: "This browser can't access a camera or microphone.",
    };
  const video: MediaTrackConstraints | boolean = cam
    ? { deviceId: { exact: cam } }
    : true;
  const audio: MediaTrackConstraints | boolean = mic
    ? { deviceId: { exact: mic } }
    : true;
  const attempts: { constraints: MediaStreamConstraints; notice: string }[] = [
    { constraints: { video, audio }, notice: "" },
  ];
  if (cam || mic)
    attempts.push({
      constraints: { video: true, audio: true },
      notice: "The selected device wasn't available, so the default is used.",
    });
  attempts.push(
    {
      constraints: { video: false, audio: true },
      notice: "Camera unavailable. You'll join with audio only.",
    },
    {
      constraints: { video: true, audio: false },
      notice: "Microphone unavailable. You'll join without audio.",
    },
  );
  for (const attempt of attempts) {
    try {
      return {
        stream: await media.getUserMedia(attempt.constraints),
        notice: attempt.notice,
      };
    } catch {
      // try the next fallback
    }
  }
  return {
    stream: new MediaStream(),
    notice:
      "Camera and microphone are blocked. Allow access in your browser to be seen and heard, or join to watch and listen.",
  };
}

function paintSegment(
  canvas: HTMLCanvasElement | null,
  from: Point,
  to: Point,
  color: string,
) {
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(from.x * canvas.width, from.y * canvas.height);
  context.lineTo(to.x * canvas.width, to.y * canvas.height);
  context.stroke();
}

/* ------------------------------------------------------------------ */
/* Small presentational components                                     */
/* ------------------------------------------------------------------ */

function StreamVideo({
  stream,
  muted = false,
  mirror = false,
  hidden = false,
}: {
  stream: MediaStream;
  muted?: boolean;
  mirror?: boolean;
  hidden?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element && element.srcObject !== stream) element.srcObject = stream;
  }, [stream]);
  // The element stays mounted when hidden so remote audio keeps playing.
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`absolute inset-0 h-full w-full object-cover ${
        mirror ? "scale-x-[-1]" : ""
      } ${hidden ? "invisible" : ""}`}
    />
  );
}

function MicMeter({
  stream,
  active,
}: {
  stream: MediaStream | null;
  active: boolean;
}) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream || !active || !stream.getAudioTracks().length) {
      setLevel(0);
      return;
    }
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const context = new Ctx();
    void context.resume();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / data.length;
      setLevel(Math.min(1, average / 70));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
    };
  }, [stream, active]);
  return (
    <div className="flex items-end gap-0.5" aria-hidden>
      {Array.from({ length: 12 }, (_, index) => (
        <span
          key={index}
          className={`w-1.5 rounded-full transition-colors ${
            index < Math.round(level * 12) ? "bg-emerald-400" : "bg-zinc-500/40"
          }`}
          style={{ height: 6 + index }}
        />
      ))}
    </div>
  );
}

function Tile({
  name,
  stream,
  self = false,
  mirror = false,
  micOn = true,
  cameraOn = true,
  hand = false,
  role,
}: {
  name: string;
  stream: MediaStream | null;
  self?: boolean;
  mirror?: boolean;
  micOn?: boolean;
  cameraOn?: boolean;
  hand?: boolean;
  role?: "host" | "cohost";
}) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-zinc-800 ring-1 ring-white/10">
      {stream && (
        <StreamVideo
          stream={stream}
          muted={self}
          mirror={mirror}
          hidden={!cameraOn}
        />
      )}
      {!cameraOn && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-zinc-600 text-xl font-semibold sm:h-20 sm:w-20 sm:text-2xl">
            {initials(name)}
          </span>
        </div>
      )}
      {hand && (
        <span
          className="mtg-pop absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-amber-400 text-lg shadow-lg"
          role="img"
          aria-label={`${name} raised a hand`}
        >
          ✋
        </span>
      )}
      <div className="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs backdrop-blur sm:text-sm">
        {!micOn && <MicOff className="h-3.5 w-3.5 shrink-0 text-red-400" />}
        <span className="truncate">
          {name}
          {self ? " (You)" : ""}
        </span>
        {role === "host" && (
          <span className="shrink-0 rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">
            Host
          </span>
        )}
        {role === "cohost" && (
          <span className="shrink-0 rounded-full bg-sky-400/90 px-1.5 py-0.5 text-[10px] font-semibold text-sky-950">
            Co-host
          </span>
        )}
      </div>
    </div>
  );
}

function DockButton({
  label,
  onClick,
  tone = "default",
  disabled,
  badge,
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "active" | "danger";
  disabled?: boolean;
  badge?: boolean;
  children: ReactNode;
}) {
  const tones = {
    default: "bg-zinc-700/70 text-white hover:bg-zinc-600",
    active: "bg-white text-zinc-900 hover:bg-zinc-200",
    danger: "bg-red-600 text-white hover:bg-red-500",
  };
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={tone === "active" ? true : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40 sm:h-12 sm:w-12 [&>svg]:h-5 [&>svg]:w-5 ${tones[tone]}`}
    >
      {children}
      {badge && (
        <span
          className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-zinc-900"
          aria-hidden
        />
      )}
    </button>
  );
}

function PanelShell({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="mtg-panel-in fixed inset-x-0 bottom-0 top-20 z-40 flex flex-col overflow-hidden rounded-t-3xl bg-zinc-900 text-white shadow-2xl ring-1 ring-white/10 sm:sticky sm:top-3 sm:z-auto sm:h-[min(70vh,40rem)] sm:w-80 sm:shrink-0 sm:self-start sm:rounded-2xl">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="flex items-center gap-2 font-medium">
          {icon}
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      {children}
    </aside>
  );
}

function EndMeetingDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="End meeting for everyone"
        className="mtg-pop w-full max-w-sm rounded-2xl bg-zinc-900 p-6 text-white shadow-2xl ring-1 ring-white/10"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-600/20 text-red-400">
            <Power className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-semibold">End meeting for everyone?</h2>
        </div>
        <p className="mt-3 text-sm text-zinc-300">
          Everyone currently in the call will be disconnected immediately.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="bg-red-600 text-white hover:bg-red-500"
            onClick={onConfirm}
          >
            End for everyone
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function MeetingRoom() {
  const router = useRouter();
  const { user } = useUser();
  const roomId =
    typeof router.query.roomId === "string" ? router.query.roomId : "";
  const hostRequested = router.query.host === "1";
  const userKey = userKeyFor(user?._id);

  // identity
  const [guestName, setGuestName] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const displayName = guestName.trim() || user?.name || "";

  // pre-join hardware
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [mediaNotice, setMediaNotice] = useState("");
  const [devices, setDevices] = useState<{
    cams: MediaDeviceInfo[];
    mics: MediaDeviceInfo[];
  }>({ cams: [], mics: [] });
  const [camId, setCamId] = useState("");
  const [micId, setMicId] = useState("");

  // call state
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remotes, setRemotes] = useState<RemoteParticipant[]>([]);
  const [remoteMedia, setRemoteMedia] = useState<Record<string, MediaFlags>>(
    {},
  );
  const [hands, setHands] = useState<Record<string, boolean>>({});
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [isCohost, setIsCohost] = useState(false);
  const [locked, setLocked] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [recording, setRecording] = useState(false);
  const [remoteRoles, setRemoteRoles] = useState<
    Record<string, { isHost?: boolean; isCohost?: boolean }>
  >({});

  // UI state
  const [panel, setPanel] = useState<PanelName>(null);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [message, setMessage] = useState("");
  const [unread, setUnread] = useState(0);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [boardColor, setBoardColor] = useState(BOARD_COLORS[0]);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  // refs
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const namesRef = useRef(new Map<string, string>());
  const removedRef = useRef(new Set<string>());
  const streamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<MediaStream | null>(null);
  const previewReq = useRef(0);
  const unmountedRef = useRef(false);
  const screenRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const panelRef = useRef<PanelName>(null);
  const lockedRef = useRef(false);
  const selfNameRef = useRef("");
  const joinedRoomRef = useRef<string | null>(null);
  const userKeyRef = useRef(userKey);
  const reactionIdRef = useRef(0);
  const whiteboardRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const reactionsWrapRef = useRef<HTMLDivElement>(null);

  selfNameRef.current = displayName;
  userKeyRef.current = userKey;

  const activeStream = joined ? localStream : previewStream;
  const hasAudio = Boolean(activeStream?.getAudioTracks().length);
  const hasVideo = Boolean(activeStream?.getVideoTracks().length);
  const canModerate = isHost || isCohost;

  /* ---------------- identity ---------------- */

  useEffect(() => {
    const saved = localStorage.getItem("yuutube-meeting-name");
    if (saved) setGuestName(saved);
  }, []);

  useEffect(() => {
    const name = user?.name;
    if (name) setGuestName((current) => current || name);
  }, [user?.name]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    void syncMeetingsFromServer(userKey).then(() => {
      if (!cancelled) setMeetingTitle(getMeeting(userKey, roomId)?.title ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [roomId, userKey]);

  /* ---------------- media lifecycle ---------------- */

  const clearCall = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive")
      recorderRef.current.stop();
    screenRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    pendingCandidatesRef.current.clear();
    socketRef.current?.disconnect();
    socketRef.current = null;
    if (joinedRoomRef.current) {
      markMeetingEnded(userKeyRef.current, joinedRoomRef.current);
      joinedRoomRef.current = null;
    }
  }, []);

  const startPreview = useCallback(async (cam?: string, mic?: string) => {
    const request = ++previewReq.current;
    const { stream, notice } = await acquireMedia(cam, mic);
    if (request !== previewReq.current || unmountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    previewRef.current?.getTracks().forEach((track) => track.stop());
    previewRef.current = stream;
    setPreviewStream(stream);
    setMediaNotice(notice);
    setCamId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? "");
    setMicId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? "");
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      if (request === previewReq.current)
        setDevices({
          cams: list.filter((device) => device.kind === "videoinput"),
          mics: list.filter((device) => device.kind === "audioinput"),
        });
    } catch {
      // device labels are optional
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    void startPreview();
    return () => {
      unmountedRef.current = true;
      previewReq.current += 1;
      previewRef.current?.getTracks().forEach((track) => track.stop());
      previewRef.current = null;
      clearCall();
    };
  }, [startPreview, clearCall]);

  // one place applies the mic/camera switches, before and during the call
  useEffect(() => {
    activeStream?.getAudioTracks().forEach((track) => {
      track.enabled = micOn;
    });
    activeStream?.getVideoTracks().forEach((track) => {
      track.enabled = cameraOn;
    });
  }, [activeStream, micOn, cameraOn]);

  /* ---------------- participants & peers ---------------- */

  const upsertRemote = useCallback(
    (id: string, patch: { name?: string; stream?: MediaStream }) => {
      setRemotes((current) => {
        const index = current.findIndex((item) => item.id === id);
        if (index === -1)
          return [
            ...current,
            {
              id,
              name: patch.name ?? namesRef.current.get(id) ?? "Guest",
              stream: patch.stream ?? new MediaStream(),
            },
          ];
        const next = [...current];
        next[index] = {
          ...next[index],
          ...(patch.name ? { name: patch.name } : {}),
          ...(patch.stream ? { stream: patch.stream } : {}),
        };
        return next;
      });
    },
    [],
  );

  const removeParticipant = useCallback((id: string) => {
    peersRef.current.get(id)?.close();
    peersRef.current.delete(id);
    pendingCandidatesRef.current.delete(id);
    namesRef.current.delete(id);
    setRemotes((current) => current.filter((item) => item.id !== id));
    setHands((current) => {
      const { [id]: _removed, ...rest } = current;
      return rest;
    });
    setRemoteMedia((current) => {
      const { [id]: _removed, ...rest } = current;
      return rest;
    });
    setRemoteRoles((current) => {
      const { [id]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const createPeer = useCallback(
    (id: string, name?: string) => {
      if (name) namesRef.current.set(id, name);
      const existing = peersRef.current.get(id);
      if (existing) return existing;
      const peer = new RTCPeerConnection(rtcConfig);
      const stream = streamRef.current;
      const audioTrack = stream?.getAudioTracks()[0];
      const videoTrack =
        screenRef.current?.getVideoTracks()[0] ?? stream?.getVideoTracks()[0];
      if (audioTrack && stream) peer.addTrack(audioTrack, stream);
      else peer.addTransceiver("audio", { direction: "recvonly" });
      if (videoTrack && stream) peer.addTrack(videoTrack, stream);
      else peer.addTransceiver("video", { direction: "recvonly" });
      peer.onicecandidate = (event) => {
        if (event.candidate)
          socketRef.current?.emit("meeting:ice-candidate", {
            target: id,
            candidate: event.candidate,
          });
      };
      peer.ontrack = (event) =>
        upsertRemote(id, {
          stream: event.streams[0] ?? new MediaStream([event.track]),
        });
      peer.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(peer.connectionState))
          removeParticipant(id);
      };
      peersRef.current.set(id, peer);
      upsertRemote(id, { name });
      return peer;
    },
    [removeParticipant, upsertRemote],
  );

  const flushCandidates = useCallback(
    async (id: string, peer: RTCPeerConnection) => {
      const queued = pendingCandidatesRef.current.get(id) ?? [];
      pendingCandidatesRef.current.delete(id);
      for (const candidate of queued) {
        try {
          await peer.addIceCandidate(candidate);
        } catch {
          // stale candidate
        }
      }
    },
    [],
  );

  const pushReaction = useCallback((emoji: string, name: string) => {
    const id = ++reactionIdRef.current;
    const left = 8 + Math.random() * 78;
    setReactions((current) => [
      ...current.slice(-11),
      { id, emoji, name, left },
    ]);
    setTimeout(
      () => setReactions((current) => current.filter((item) => item.id !== id)),
      3000,
    );
  }, []);

  /* ---------------- screen share ---------------- */

  const stopScreenShare = useCallback(() => {
    const screen = screenRef.current;
    if (!screen) return;
    screen.getTracks().forEach((track) => track.stop());
    screenRef.current = null;
    setScreenStream(null);
    const cameraTrack = streamRef.current?.getVideoTracks()[0] ?? null;
    peersRef.current.forEach((peer) => {
      peer
        .getSenders()
        .find((sender) => sender.track?.kind === "video")
        ?.replaceTrack(cameraTrack)
        .catch(() => undefined);
    });
  }, []);

  const toggleScreenShare = async () => {
    if (screenRef.current) return stopScreenShare();
    if (!navigator.mediaDevices?.getDisplayMedia)
      return toast.error("Screen sharing isn't supported on this device.");
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const track = display.getVideoTracks()[0];
      screenRef.current = display;
      setScreenStream(display);
      track.onended = () => stopScreenShare();
      peersRef.current.forEach((peer) => {
        peer
          .getSenders()
          .find((sender) => sender.track?.kind === "video")
          ?.replaceTrack(track)
          .catch(() => undefined);
      });
    } catch {
      toast.info("Screen sharing was cancelled.");
    }
  };

  /* ---------------- socket ---------------- */

  const connectSocket = (room: string, name: string) => {
    const baseURL =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
    const socket = io(baseURL);
    socketRef.current = socket;

    socket.on("connect", () =>
      socket.emit("meeting:join", {
        roomId: room,
        name,
        userId: user?._id,
        isHost: hostRequested,
        audio: micOn,
        video: cameraOn,
      }),
    );

    socket.on(
      "meeting:participants",
      async (
        participants: {
          id: string;
          name?: string;
          audio?: boolean;
          video?: boolean;
          hand?: boolean;
          isHost?: boolean;
          isCohost?: boolean;
        }[],
      ) => {
        // Start from what the server already knows about each person.
        setRemoteMedia((current) => {
          const next = { ...current };
          for (const participant of participants)
            next[participant.id] = {
              audio: participant.audio,
              video: participant.video,
            };
          return next;
        });
        setHands((current) => {
          const next = { ...current };
          for (const participant of participants)
            if (participant.hand) next[participant.id] = true;
          return next;
        });
        setRemoteRoles((current) => {
          const next = { ...current };
          for (const participant of participants)
            next[participant.id] = {
              isHost: participant.isHost,
              isCohost: participant.isCohost,
            };
          return next;
        });
        for (const participant of participants) {
          try {
            const peer = createPeer(participant.id, participant.name);
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            socket.emit("meeting:offer", { target: participant.id, offer });
          } catch (error) {
            console.error("Could not call participant", error);
          }
        }
      },
    );

    socket.on(
      "meeting:offer",
      async ({
        from,
        name: senderName,
        offer,
      }: {
        from: string;
        name?: string;
        offer: RTCSessionDescriptionInit;
      }) => {
        try {
          const isNew = !peersRef.current.has(from);
          const peer = createPeer(from, senderName);
          await peer.setRemoteDescription(offer);
          await flushCandidates(from, peer);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit("meeting:answer", { target: from, answer });
          if (isNew && senderName) toast(`${senderName} joined the meeting`);
        } catch (error) {
          console.error("Could not answer offer", error);
        }
      },
    );

    socket.on(
      "meeting:answer",
      async ({
        from,
        name: senderName,
        answer,
      }: {
        from: string;
        name?: string;
        answer: RTCSessionDescriptionInit;
      }) => {
        const peer = peersRef.current.get(from);
        if (!peer) return;
        try {
          if (senderName) {
            namesRef.current.set(from, senderName);
            upsertRemote(from, { name: senderName });
          }
          await peer.setRemoteDescription(answer);
          await flushCandidates(from, peer);
        } catch (error) {
          console.error("Could not apply answer", error);
        }
      },
    );

    socket.on(
      "meeting:ice-candidate",
      async ({
        from,
        candidate,
      }: {
        from: string;
        candidate: RTCIceCandidateInit;
      }) => {
        const peer = peersRef.current.get(from);
        if (!peer || !peer.remoteDescription) {
          const queue = pendingCandidatesRef.current.get(from) ?? [];
          queue.push(candidate);
          pendingCandidatesRef.current.set(from, queue);
          return;
        }
        try {
          await peer.addIceCandidate(candidate);
        } catch {
          // stale candidate
        }
      },
    );

    socket.on(
      "meeting:user-joined",
      (participant: {
        id: string;
        name: string;
        isHost?: boolean;
        isCohost?: boolean;
        audio?: boolean;
        video?: boolean;
      }) => {
        namesRef.current.set(participant.id, participant.name);
        setRemoteRoles((current) => ({
          ...current,
          [participant.id]: {
            isHost: participant.isHost,
            isCohost: participant.isCohost,
          },
        }));
        setRemoteMedia((current) => ({
          ...current,
          [participant.id]: {
            audio: participant.audio,
            video: participant.video,
          },
        }));
      },
    );

    socket.on(
      "meeting:user-left",
      (payload: string | { id: string; name?: string }) => {
        const id = typeof payload === "string" ? payload : payload.id;
        const leftName =
          (typeof payload === "object" && payload.name) ||
          namesRef.current.get(id);
        removeParticipant(id);
        // wait briefly: a removal announcement replaces the "left" toast
        setTimeout(() => {
          if (removedRef.current.delete(id)) return;
          if (leftName) toast(`${leftName} left the meeting`);
        }, 400);
      },
    );

    socket.on(
      "meeting:chat",
      (entry: {
        name?: string;
        message: string;
        at?: number;
        senderId?: string;
        from?: string;
      }) => {
        const senderId = entry.senderId ?? entry.from;
        const own = senderId
          ? senderId === socket.id
          : entry.name === selfNameRef.current;
        setChat((current) => [
          ...current,
          {
            name: entry.name ?? "Guest",
            message: entry.message,
            at: entry.at ?? Date.now(),
            own,
          },
        ]);
        if (!own && panelRef.current !== "chat")
          setUnread((count) => count + 1);
      },
    );

    socket.on(
      "meeting:role",
      (role: { isHost?: boolean; isCohost?: boolean; locked?: boolean }) => {
        setIsHost(Boolean(role.isHost));
        if (role.isCohost !== undefined) setIsCohost(Boolean(role.isCohost));
        lockedRef.current = Boolean(role.locked);
        setLocked(Boolean(role.locked));
      },
    );

    socket.on("meeting:lock", (payload: boolean | { locked: boolean }) => {
      const next = typeof payload === "boolean" ? payload : payload.locked;
      if (lockedRef.current !== next)
        toast(
          next
            ? "🔒 The host locked the meeting. No one else can join."
            : "🔓 The host unlocked the meeting.",
        );
      lockedRef.current = next;
      setLocked(next);
    });

    socket.on(
      "meeting:cohost-changed",
      ({ id, isCohost }: { id: string; isCohost: boolean }) => {
        if (id === socketRef.current?.id) return; // self is tracked via isCohost state already
        setRemoteRoles((current) => ({
          ...current,
          [id]: { ...current[id], isCohost },
        }));
      },
    );

    socket.on(
      "meeting:hand",
      ({
        id,
        name: handName,
        raised,
      }: {
        id?: string;
        name?: string;
        raised: boolean;
      }) => {
        if (!id || id === socket.id) return;
        setHands((current) => ({ ...current, [id]: raised }));
        if (raised)
          toast(
            `✋ ${handName ?? namesRef.current.get(id) ?? "Someone"} raised their hand`,
          );
      },
    );

    socket.on(
      "meeting:media",
      ({ id, audio, video }: { id?: string } & MediaFlags) => {
        if (!id || id === socket.id) return;
        setRemoteMedia((current) => {
          const flags: MediaFlags = { ...current[id] };
          if (audio !== undefined) flags.audio = audio;
          if (video !== undefined) flags.video = video;
          return { ...current, [id]: flags };
        });
      },
    );

    socket.on("meeting:force-mute", () => {
      setMicOn(false);
      socket.emit("meeting:media", { audio: false });
      toast.info("The host muted your microphone.", { id: "host-mute" });
    });

    socket.on("meeting:force-video-off", () => {
      setCameraOn(false);
      socket.emit("meeting:media", { video: false });
      toast.info("The host stopped your camera.", { id: "host-video" });
    });

    socket.on(
      "meeting:host-muted",
      ({
        id,
        name: targetName,
        kind,
      }: {
        id?: string;
        name?: string;
        kind?: "audio" | "video" | "all";
      }) => {
        if (id && id === socket.id) return;
        const who = targetName ?? (id ? namesRef.current.get(id) : undefined);
        if (kind === "all")
          toast.info("🔇 The host muted everyone.", { id: "host-mute" });
        else if (kind === "video")
          toast.info(`📷 The host stopped ${who ?? "a participant"}'s camera.`);
        else toast.info(`🔇 The host muted ${who ?? "a participant"}.`);
      },
    );

    socket.on("meeting:cohost", (enabled: boolean) => {
      setIsCohost(Boolean(enabled));
      toast.info(
        enabled ? "You are now a co-host." : "Co-host access removed.",
      );
    });

    socket.on(
      "meeting:removed",
      ({ id, name: removedName }: { id?: string; name?: string }) => {
        if (id) {
          if (id === socket.id) return;
          removedRef.current.add(id);
        }
        toast.warning(
          `${removedName ?? (id ? namesRef.current.get(id) : undefined) ?? "A participant"} was removed from the meeting.`,
        );
      },
    );

    socket.on("meeting:locked", () => {
      toast.error("This meeting is locked by the host.");
      clearCall();
      void router.push("/meetings");
    });

    socket.on(
      "meeting:whiteboard-history",
      (
        segments: {
          x: number;
          y: number;
          previousX: number;
          previousY: number;
          color?: string;
        }[],
      ) => {
        const replay = () =>
          segments.forEach((segment) =>
            paintSegment(
              whiteboardRef.current,
              { x: segment.previousX, y: segment.previousY },
              { x: segment.x, y: segment.y },
              segment.color ?? "#ef4444",
            ),
          );
        // the canvas mounts right after joining; wait a beat if it isn't there yet
        if (whiteboardRef.current) replay();
        else setTimeout(replay, 300);
      },
    );

    socket.on("meeting:kicked", () => {
      toast.error("You were removed from this meeting.");
      clearCall();
      void router.push("/meetings");
    });

    socket.on(
      "meeting:reaction",
      ({
        emoji,
        id,
        name: reactor,
      }: {
        emoji: string;
        id?: string;
        name?: string;
      }) => {
        if (id && id === socket.id) return;
        pushReaction(
          emoji,
          reactor ?? (id ? namesRef.current.get(id) : "") ?? "",
        );
      },
    );

    socket.on(
      "meeting:whiteboard",
      ({
        x,
        y,
        previousX,
        previousY,
        color = "#ef4444",
      }: {
        x: number;
        y: number;
        previousX: number;
        previousY: number;
        color?: string;
      }) =>
        paintSegment(
          whiteboardRef.current,
          { x: previousX, y: previousY },
          { x, y },
          color,
        ),
    );

    socket.on("meeting:whiteboard-clear", () => {
      const canvas = whiteboardRef.current;
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    });

    socket.on("meeting:ended", () => {
      toast.error("The host ended the meeting for everyone.");
      clearCall();
      void router.push("/meetings");
    });
  };

  const joinCall = async () => {
    if (joining) return;
    if (!displayName) return toast.error("Enter a display name to join.");
    if (!roomId) return;
    setJoining(true);
    previewReq.current += 1;
    try {
      let stream = previewRef.current;
      if (!stream)
        stream = (await acquireMedia(camId || undefined, micId || undefined))
          .stream;
      previewRef.current = null;
      setPreviewStream(null);
      streamRef.current = stream;
      setLocalStream(stream);
      localStorage.setItem("yuutube-meeting-name", displayName);
      localStorage.setItem("yuutube-last-meeting", roomId);
      userKeyRef.current = userKey;
      joinedRoomRef.current = roomId;
      recordMeetingJoin(userKey, roomId, hostRequested ? "host" : "guest");
      connectSocket(roomId, displayName);
      setJoined(true);
    } catch {
      toast.error("Couldn't join the meeting. Please try again.");
      clearCall();
    } finally {
      setJoining(false);
    }
  };

  /* ---------------- panels, keyboard, scrolling ---------------- */

  useEffect(() => {
    panelRef.current = panel;
    if (panel === "chat") setUnread(0);
    setConfirmRemove(null);
  }, [panel]);

  useEffect(() => {
    if (panel === "chat")
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat, panel]);

  useEffect(() => {
    if (!joined) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (reactionsOpen) setReactionsOpen(false);
      else if (whiteboardOpen) setWhiteboardOpen(false);
      else if (panel) setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [joined, reactionsOpen, whiteboardOpen, panel]);

  useEffect(() => {
    if (!reactionsOpen) return;
    const onDown = (event: PointerEvent) => {
      if (!reactionsWrapRef.current?.contains(event.target as Node))
        setReactionsOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [reactionsOpen]);

  const togglePanel = (name: Exclude<PanelName, null>) => {
    setPanel((current) => (current === name ? null : name));
    setReactionsOpen(false);
  };

  /* ---------------- actions ---------------- */

  const leaveCall = () => {
    clearCall();
    void router.push("/meetings");
  };

  const toggleMic = () => {
    if (!hasAudio) return toast.info("No microphone is available.");
    const next = !micOn;
    setMicOn(next);
    socketRef.current?.emit("meeting:media", { audio: next });
  };

  const toggleCamera = () => {
    if (!hasVideo) return toast.info("No camera is available.");
    const next = !cameraOn;
    setCameraOn(next);
    socketRef.current?.emit("meeting:media", { video: next });
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(buildInviteLink(roomId));
      toast.success("Invite link copied.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const sendChat = () => {
    const text = message.trim();
    if (!text) return;
    socketRef.current?.emit("meeting:chat", { message: text });
    setMessage("");
  };

  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    socketRef.current?.emit("meeting:hand", { raised: next });
    toast(next ? "✋ You raised your hand" : "You lowered your hand", {
      id: "own-hand",
    });
  };

  const sendReaction = (emoji: string) => {
    socketRef.current?.emit("meeting:reaction", { emoji });
    pushReaction(emoji, "You");
    setReactionsOpen(false);
  };

  const toggleLock = () => socketRef.current?.emit("meeting:toggle-lock");
  const muteAll = () => socketRef.current?.emit("meeting:mute-all");
  const kick = (id: string) => {
    socketRef.current?.emit("meeting:kick", { socketId: id });
    setConfirmRemove(null);
  };
  const endMeetingForEveryone = () => {
    setConfirmEndOpen(true);
  };
  const confirmEndMeeting = () => {
    setConfirmEndOpen(false);
    socketRef.current?.emit("meeting:end");
  };
  const muteParticipant = (id: string) =>
    socketRef.current?.emit("meeting:stop-audio", { socketId: id });
  const stopParticipantVideo = (id: string) =>
    socketRef.current?.emit("meeting:stop-video", { socketId: id });
  const toggleCohost = (id: string) =>
    socketRef.current?.emit("meeting:cohost", { socketId: id });

  /* ---------------- whiteboard ---------------- */

  const boardPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const emitStroke = (from: Point, to: Point) =>
    socketRef.current?.emit("meeting:whiteboard", {
      x: to.x,
      y: to.y,
      previousX: from.x,
      previousY: from.y,
      color: boardColor,
    });

  const startStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = boardPoint(event);
    drawingRef.current = true;
    lastPointRef.current = point;
    paintSegment(whiteboardRef.current, point, point, boardColor);
    emitStroke(point, point);
  };

  const continueStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastPointRef.current) return;
    const point = boardPoint(event);
    paintSegment(
      whiteboardRef.current,
      lastPointRef.current,
      point,
      boardColor,
    );
    emitStroke(lastPointRef.current, point);
    lastPointRef.current = point;
  };

  const endStroke = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearBoard = () => {
    const canvas = whiteboardRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    socketRef.current?.emit("meeting:whiteboard-clear");
  };

  /* ---------------- recording ---------------- */

  const toggleRecording = () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    const videoTrack = (
      screenRef.current ?? streamRef.current
    )?.getVideoTracks()[0];
    const audioTracks = streamRef.current?.getAudioTracks() ?? [];
    if (!videoTrack && !audioTracks.length)
      return toast.error(
        "Turn on your camera or microphone, or share your screen, to record.",
      );
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(
        new MediaStream([...(videoTrack ? [videoTrack] : []), ...audioTracks]),
      );
    } catch {
      return toast.error("Recording isn't supported in this browser.");
    }
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const url = URL.createObjectURL(
        new Blob(chunksRef.current, {
          type: recorder.mimeType || "video/webm",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `yuutube-meeting-${roomId}.webm`;
      link.click();
      URL.revokeObjectURL(url);
      recorderRef.current = null;
      setRecording(false);
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
    toast.success("Recording your side of the call. It saves to this device.");
  };

  /* ================================================================ */
  /* Pre-join: hardware setup                                          */
  /* ================================================================ */

  if (!joined) {
    const previewCameraOn = cameraOn && hasVideo;
    return (
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        <style>{CSS}</style>
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <section>
            <div className="relative aspect-video overflow-hidden rounded-3xl bg-zinc-900 text-white shadow-lg ring-1 ring-black/10">
              {previewStream && (
                <StreamVideo
                  stream={previewStream}
                  muted
                  mirror
                  hidden={!previewCameraOn}
                />
              )}
              {!previewCameraOn && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-zinc-700 text-2xl font-semibold">
                      {initials(displayName || "You")}
                    </span>
                    <p className="mt-3 text-sm text-zinc-300">
                      {hasVideo ? "Camera is off" : "No camera available"}
                    </p>
                  </div>
                </div>
              )}
              <div className="absolute right-3 top-3 rounded-full bg-black/50 px-3 py-2 backdrop-blur">
                <MicMeter stream={previewStream} active={micOn && hasAudio} />
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent p-4">
                <DockButton
                  label={micOn ? "Turn microphone off" : "Turn microphone on"}
                  tone={micOn && hasAudio ? "default" : "danger"}
                  disabled={!hasAudio}
                  onClick={toggleMic}
                >
                  {micOn && hasAudio ? <Mic /> : <MicOff />}
                </DockButton>
                <DockButton
                  label={cameraOn ? "Turn camera off" : "Turn camera on"}
                  tone={previewCameraOn ? "default" : "danger"}
                  disabled={!hasVideo}
                  onClick={toggleCamera}
                >
                  {previewCameraOn ? <Camera /> : <CameraOff />}
                </DockButton>
              </div>
            </div>
            {mediaNotice && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                <span>{mediaNotice}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void startPreview(camId || undefined, micId || undefined)
                  }
                >
                  Try again
                </Button>
              </div>
            )}
          </section>

          <section className="rounded-3xl border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              {hostRequested ? "You're hosting" : "You're joining"}
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              {meetingTitle || "Ready to join?"}
            </h1>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              {roomId || "Loading…"}
            </p>

            <label className="mt-5 block text-sm font-medium">
              Your name
              <Input
                className="mt-1.5"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void joinCall()}
                placeholder="Display name"
                maxLength={40}
              />
            </label>

            <div className="mt-5 space-y-4 rounded-2xl bg-muted/50 p-4">
              <p className="text-sm font-medium">Hardware check</p>
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Camera className="h-4 w-4" /> Camera
                  </span>
                  <span
                    className={
                      previewCameraOn ? "text-emerald-600" : "text-red-600"
                    }
                  >
                    {!hasVideo ? "Unavailable" : cameraOn ? "On" : "Off"}
                  </span>
                </div>
                {devices.cams.length > 1 && (
                  <select
                    aria-label="Camera"
                    className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={camId}
                    onChange={(event) => {
                      setCamId(event.target.value);
                      void startPreview(event.target.value, micId || undefined);
                    }}
                  >
                    {devices.cams.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${index + 1}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Mic className="h-4 w-4" /> Microphone
                  </span>
                  <span
                    className={
                      micOn && hasAudio ? "text-emerald-600" : "text-red-600"
                    }
                  >
                    {!hasAudio ? "Unavailable" : micOn ? "On" : "Off"}
                  </span>
                </div>
                {devices.mics.length > 1 && (
                  <select
                    aria-label="Microphone"
                    className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={micId}
                    onChange={(event) => {
                      setMicId(event.target.value);
                      void startPreview(camId || undefined, event.target.value);
                    }}
                  >
                    {devices.mics.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${index + 1}`}
                      </option>
                    ))}
                  </select>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Say something. The bars in the preview should move.
                </p>
              </div>
            </div>

            <Button
              className="mt-5 w-full"
              disabled={!roomId || joining}
              onClick={() => void joinCall()}
            >
              {joining
                ? "Joining…"
                : hostRequested
                  ? "Start meeting"
                  : "Join now"}
            </Button>
            <Button
              variant="outline"
              className="mt-3 w-full text-foreground"
              onClick={() => void copyInvite()}
            >
              <Copy className="mr-2 h-4 w-4" />
              Share invite link
            </Button>
            <Button
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => void router.push("/meetings")}
            >
              Back to Meetings
            </Button>
          </section>
        </div>
      </main>
    );
  }

  /* ================================================================ */
  /* In-call                                                           */
  /* ================================================================ */

  const totalTiles = remotes.length + 1;
  const gridCols =
    totalTiles <= 1
      ? "mx-auto max-w-3xl grid-cols-1"
      : totalTiles === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : totalTiles <= 4
          ? "grid-cols-2"
          : "grid-cols-2 lg:grid-cols-3";
  const sharing = Boolean(screenStream);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-zinc-950 p-3 text-white sm:p-5">
      <style>{CSS}</style>

      <header className="mx-auto mb-3 flex w-full max-w-7xl flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs text-zinc-400">
            Yuutube Meeting
            {recording && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600/20 px-2 py-0.5 text-red-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                Recording
              </span>
            )}
          </p>
          <h1 className="flex items-center gap-2 truncate font-semibold">
            {meetingTitle || "Meeting"}
            <span className="font-mono text-sm font-normal text-zinc-400">
              {roomId}
            </span>
            {locked && (
              <Lock className="h-4 w-4 text-amber-300" aria-label="Locked" />
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs">
            <Users className="h-3.5 w-3.5" />
            {totalTiles}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-600 bg-zinc-800 text-white hover:bg-zinc-700"
            onClick={() => void copyInvite()}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy invite
          </Button>
        </div>
      </header>

      <div className="mx-auto flex min-h-[55vh] w-full max-w-7xl flex-1 gap-3">
        <div className="relative min-h-[50vh] min-w-0 flex-1">
          <div className={`grid content-center gap-3 ${gridCols}`}>
            <Tile
              self
              name={sharing ? `${displayName} · screen` : displayName}
              stream={screenStream ?? localStream}
              mirror={!sharing}
              micOn={micOn && hasAudio}
              cameraOn={sharing || (cameraOn && hasVideo)}
              hand={handRaised}
              role={isHost ? "host" : isCohost ? "cohost" : undefined}
            />
            {remotes.map((participant) => (
              <Tile
                key={participant.id}
                name={participant.name}
                stream={participant.stream}
                micOn={remoteMedia[participant.id]?.audio !== false}
                cameraOn={remoteMedia[participant.id]?.video !== false}
                hand={Boolean(hands[participant.id])}
                role={
                  remoteRoles[participant.id]?.isHost
                    ? "host"
                    : remoteRoles[participant.id]?.isCohost
                      ? "cohost"
                      : undefined
                }
              />
            ))}
          </div>

          {/* whiteboard stays mounted so strokes keep arriving while closed */}
          <div
            className={`absolute inset-0 z-20 flex-col rounded-2xl bg-white p-3 text-zinc-900 shadow-2xl ${
              whiteboardOpen ? "mtg-pop flex" : "hidden"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <strong>Whiteboard</strong>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  {BOARD_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Pen color ${color}`}
                      onClick={() => setBoardColor(color)}
                      className={`h-6 w-6 rounded-full ring-offset-2 ${
                        boardColor === color ? "ring-2 ring-zinc-900" : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <Button size="sm" variant="outline" onClick={clearBoard}>
                  <Eraser className="mr-1.5 h-4 w-4" />
                  Clear
                </Button>
                <Button size="sm" onClick={() => setWhiteboardOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
            <canvas
              ref={whiteboardRef}
              width={1200}
              height={675}
              className="min-h-0 w-full flex-1 touch-none rounded-lg border bg-white"
              onPointerDown={startStroke}
              onPointerMove={continueStroke}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
            />
          </div>

          {/* floating reactions */}
          <div
            className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
            aria-hidden
          >
            {reactions.map((reaction) => (
              <div
                key={reaction.id}
                className="mtg-float absolute bottom-6 flex flex-col items-center"
                style={{ left: `${reaction.left}%` }}
              >
                <span className="text-5xl drop-shadow-lg">
                  {reaction.emoji}
                </span>
                {reaction.name && (
                  <span className="mt-1 rounded-full bg-black/60 px-2 py-0.5 text-xs">
                    {reaction.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {panel === "chat" && (
          <PanelShell
            title="Chat"
            icon={<MessageCircle className="h-4 w-4" />}
            onClose={() => setPanel(null)}
          >
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
              {chat.length ? (
                chat.map((entry, index) => (
                  <div
                    key={`${entry.at}-${index}`}
                    className={`flex flex-col ${entry.own ? "items-end" : "items-start"}`}
                  >
                    <span className="mb-0.5 text-[11px] text-zinc-400">
                      {entry.own ? "You" : entry.name} · {timeLabel(entry.at)}
                    </span>
                    <p
                      className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 ${
                        entry.own
                          ? "rounded-br-md bg-red-600"
                          : "rounded-bl-md bg-zinc-800"
                      }`}
                    >
                      {entry.message}
                    </p>
                  </div>
                ))
              ) : (
                <div className="grid h-full place-items-center text-center text-zinc-400">
                  <div>
                    <MessageCircle className="mx-auto h-8 w-8" />
                    <p className="mt-2">No messages yet. Say hello!</p>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2 border-t border-white/10 p-3">
              <Input
                className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-400"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && sendChat()}
                placeholder="Send a message"
                maxLength={500}
              />
              <Button
                size="icon"
                onClick={sendChat}
                disabled={!message.trim()}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </PanelShell>
        )}

        {panel === "people" && (
          <PanelShell
            title={`People (${totalTiles})`}
            icon={<Users className="h-4 w-4" />}
            onClose={() => setPanel(null)}
          >
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-sm">
              <li className="flex items-center gap-3 rounded-xl bg-zinc-800/60 p-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-600 text-xs font-semibold">
                  {initials(displayName)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {displayName} (You)
                  {isHost && <span className="ml-1 text-amber-300">Host</span>}
                  {!isHost && isCohost && (
                    <span className="ml-1 text-amber-300">Co-host</span>
                  )}
                </span>
                {handRaised && <span aria-label="Hand raised">✋</span>}
                {micOn && hasAudio ? (
                  <Mic className="h-4 w-4 text-zinc-400" />
                ) : (
                  <MicOff className="h-4 w-4 text-red-400" />
                )}
              </li>
              {remotes.map((participant) => {
                const flags = remoteMedia[participant.id];
                return (
                  <li
                    key={participant.id}
                    className="rounded-xl bg-zinc-800/60 p-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-600 text-xs font-semibold">
                        {initials(participant.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {participant.name}
                        {remoteRoles[participant.id]?.isHost && (
                          <span className="ml-1 text-amber-300">Host</span>
                        )}
                        {!remoteRoles[participant.id]?.isHost &&
                          remoteRoles[participant.id]?.isCohost && (
                            <span className="ml-1 text-amber-300">Co-host</span>
                          )}
                      </span>
                      {hands[participant.id] && (
                        <span aria-label="Hand raised">✋</span>
                      )}
                      {flags?.video === false && (
                        <CameraOff className="h-4 w-4 text-red-400" />
                      )}
                      {flags?.audio === false ? (
                        <MicOff className="h-4 w-4 text-red-400" />
                      ) : (
                        <Mic className="h-4 w-4 text-zinc-400" />
                      )}
                    </div>
                    {canModerate && (
                      <div className="mt-2 flex items-center gap-1.5 pl-12">
                        <button
                          type="button"
                          title="Mute"
                          aria-label={`Mute ${participant.name}`}
                          onClick={() => muteParticipant(participant.id)}
                          className="rounded-full bg-zinc-700 p-2 hover:bg-zinc-600"
                        >
                          <MicOff className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Stop video"
                          aria-label={`Stop video for ${participant.name}`}
                          onClick={() => stopParticipantVideo(participant.id)}
                          className="rounded-full bg-zinc-700 p-2 hover:bg-zinc-600"
                        >
                          <CameraOff className="h-3.5 w-3.5" />
                        </button>
                        {isHost && (
                          <button
                            type="button"
                            title="Toggle co-host"
                            aria-label={`Toggle co-host for ${participant.name}`}
                            onClick={() => toggleCohost(participant.id)}
                            className="rounded-full bg-zinc-700 p-2 hover:bg-zinc-600"
                          >
                            <Crown className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {confirmRemove === participant.id ? (
                          <span className="ml-auto flex items-center gap-1.5 text-xs">
                            Remove?
                            <button
                              type="button"
                              onClick={() => kick(participant.id)}
                              className="rounded-full bg-red-600 px-2.5 py-1 hover:bg-red-500"
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemove(null)}
                              className="rounded-full bg-zinc-700 px-2.5 py-1 hover:bg-zinc-600"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            title="Remove from meeting"
                            aria-label={`Remove ${participant.name}`}
                            onClick={() => setConfirmRemove(participant.id)}
                            className="ml-auto rounded-full bg-red-600/80 p-2 hover:bg-red-600"
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </PanelShell>
        )}
      </div>

      <div className="sticky bottom-3 z-30 mx-auto mt-4 flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 rounded-3xl bg-zinc-900/90 p-2 shadow-2xl ring-1 ring-white/10 backdrop-blur sm:gap-2">
        <DockButton
          label={micOn ? "Mute microphone" : "Unmute microphone"}
          tone={micOn && hasAudio ? "default" : "danger"}
          disabled={!hasAudio}
          onClick={toggleMic}
        >
          {micOn && hasAudio ? <Mic /> : <MicOff />}
        </DockButton>
        <DockButton
          label={cameraOn ? "Turn camera off" : "Turn camera on"}
          tone={cameraOn && hasVideo ? "default" : "danger"}
          disabled={!hasVideo}
          onClick={toggleCamera}
        >
          {cameraOn && hasVideo ? <Camera /> : <CameraOff />}
        </DockButton>
        <DockButton
          label={sharing ? "Stop sharing" : "Share screen"}
          tone={sharing ? "active" : "default"}
          disabled={!hasVideo}
          onClick={() => void toggleScreenShare()}
        >
          <MonitorUp />
        </DockButton>

        <span className="mx-1 hidden h-8 w-px bg-white/10 sm:block" />

        <DockButton
          label={handRaised ? "Lower hand" : "Raise hand"}
          tone={handRaised ? "active" : "default"}
          onClick={toggleHand}
        >
          <Hand />
        </DockButton>
        <div ref={reactionsWrapRef} className="relative">
          <DockButton
            label="Reactions"
            tone={reactionsOpen ? "active" : "default"}
            onClick={() => setReactionsOpen((open) => !open)}
          >
            <Smile />
          </DockButton>
          {reactionsOpen && (
            <div
              role="menu"
              aria-label="Send a reaction"
              className="mtg-pop absolute bottom-full left-1/2 z-40 mb-3 flex -translate-x-1/2 gap-1 rounded-full bg-zinc-800/95 p-2 shadow-2xl ring-1 ring-white/10 backdrop-blur"
            >
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  role="menuitem"
                  aria-label={`Send ${emoji} reaction`}
                  onClick={() => sendReaction(emoji)}
                  className="grid h-11 w-11 place-items-center rounded-full text-2xl transition-transform hover:scale-125 hover:bg-white/10 focus-visible:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <DockButton
          label={recording ? "Stop recording" : "Record meeting"}
          tone={recording ? "danger" : "default"}
          onClick={toggleRecording}
        >
          <Radio />
        </DockButton>
        <DockButton
          label={whiteboardOpen ? "Close whiteboard" : "Open whiteboard"}
          tone={whiteboardOpen ? "active" : "default"}
          onClick={() => setWhiteboardOpen((open) => !open)}
        >
          <Pencil />
        </DockButton>

        <span className="mx-1 hidden h-8 w-px bg-white/10 sm:block" />

        <DockButton
          label={unread ? "Chat, new messages" : "Chat"}
          tone={panel === "chat" ? "active" : "default"}
          badge={unread > 0}
          onClick={() => togglePanel("chat")}
        >
          <MessageCircle />
        </DockButton>
        <DockButton
          label="People"
          tone={panel === "people" ? "active" : "default"}
          onClick={() => togglePanel("people")}
        >
          <Users />
        </DockButton>

        {canModerate && (
          <>
            <span className="mx-1 hidden h-8 w-px bg-white/10 sm:block" />
            <DockButton
              label={locked ? "Unlock meeting" : "Lock meeting"}
              tone={locked ? "danger" : "default"}
              onClick={toggleLock}
            >
              <Shield />
            </DockButton>
            <DockButton label="Mute everyone" onClick={muteAll}>
              <MicOff />
            </DockButton>
            {isHost && (
              <DockButton
                label="End meeting for everyone"
                tone="danger"
                onClick={endMeetingForEveryone}
              >
                <Power />
              </DockButton>
            )}
          </>
        )}

        <span className="mx-1 hidden h-8 w-px bg-white/10 sm:block" />
        <button
          type="button"
          title="Leave meeting"
          aria-label="Leave meeting"
          onClick={leaveCall}
          className="grid h-11 w-14 shrink-0 place-items-center rounded-full bg-red-600 text-white transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:h-12 sm:w-16 [&>svg]:h-5 [&>svg]:w-5"
        >
          <PhoneOff />
        </button>
      </div>
      {confirmEndOpen && (
        <EndMeetingDialog
          onCancel={() => setConfirmEndOpen(false)}
          onConfirm={confirmEndMeeting}
        />
      )}
    </main>
  );
}
