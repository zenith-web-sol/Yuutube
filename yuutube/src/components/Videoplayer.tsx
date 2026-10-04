"use client";

import {
  Captions,
  ChevronRight,
  Maximize,
  Minimize,
  Pause,
  PanelTop,
  PictureInPicture2,
  Play,
  RotateCcw,
  Settings2,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

interface VideoPlayerProps {
  video: {
    _id: string;
    videotitle: string;
    filepath: string;
    subtitlesUrl?: string;
  };
}

const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2];
const CONTROLS_TIMEOUT = 3000;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");

  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds}`
    : `${minutes}:${remainingSeconds}`;
};

export default function VideoPlayer({ video }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backendBase =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
  const progressKey = `yuutube-video-progress-${video._id}`;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isPictureInPicture, setIsPictureInPicture] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [hasError, setHasError] = useState(false);

  const videoSrc = useMemo(() => {
    if (!video?.filepath) return "";

    const cleanedPath = String(video.filepath).replace(/\\/g, "/");
    const uploadsPath = cleanedPath.includes("/uploads/")
      ? cleanedPath.replace(/^.*\/uploads\//, "uploads/")
      : cleanedPath.replace(/^\/+/, "");
    const normalizedPath = uploadsPath.startsWith("uploads/")
      ? uploadsPath
      : `uploads/${uploadsPath.replace(/^uploads\//, "")}`;

    return `${backendBase}/${normalizedPath.replace(/^\/+/, "")}`;
  }, [backendBase, video?.filepath]);

  const clearControlsTimer = useCallback(() => {
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
      hideControlsTimer.current = null;
    }
  }, []);

  const scheduleControlsToHide = useCallback(() => {
    clearControlsTimer();
    if (!isPlaying) return;
    hideControlsTimer.current = setTimeout(
      () => setShowControls(false),
      CONTROLS_TIMEOUT,
    );
  }, [clearControlsTimer, isPlaying]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleControlsToHide();
  }, [scheduleControlsToHide]);

  const togglePlay = useCallback(async () => {
    const player = videoRef.current;
    if (!player) return;

    if (player.paused) {
      try {
        window.dispatchEvent(
          new CustomEvent("yuutube:video-playing", { detail: video._id }),
        );
        await player.play();
      } catch {
        setHasError(true);
      }
    } else {
      player.pause();
    }
  }, [video._id]);

  const seekBy = useCallback((amount: number) => {
    const player = videoRef.current;
    if (!player) return;
    player.currentTime = Math.max(
      0,
      Math.min(player.duration || 0, player.currentTime + amount),
    );
  }, []);

  const updateVolume = useCallback((nextVolume: number) => {
    const player = videoRef.current;
    const safeVolume = Math.max(0, Math.min(1, nextVolume));
    setVolume(safeVolume);
    if (!player) return;
    player.volume = safeVolume;
    player.muted = safeVolume === 0;
    setIsMuted(player.muted);
  }, []);

  const toggleMute = useCallback(() => {
    const player = videoRef.current;
    if (!player) return;
    player.muted = !player.muted;
    setIsMuted(player.muted);
    if (!player.muted && player.volume === 0) updateVolume(0.5);
  }, [updateVolume]);

  const toggleFullscreen = useCallback(async () => {
    const container = playerRef.current;
    if (!container) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch {
      setHasError(true);
    }
  }, []);

  const togglePictureInPicture = useCallback(async () => {
    const player = videoRef.current;
    if (!player || !document.pictureInPictureEnabled) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await player.requestPictureInPicture();
      }
    } catch {
      setHasError(true);
    }
  }, []);

  const toggleCaptions = useCallback(() => {
    const player = videoRef.current;
    const track = player?.textTracks?.[0];
    if (!track) return;
    const nextValue = !captionsEnabled;
    track.mode = nextValue ? "showing" : "hidden";
    setCaptionsEnabled(nextValue);
  }, [captionsEnabled]);

  const runKeyboardShortcut = useCallback(
    (key: string, shiftKey = false) => {
      const shortcuts: Record<string, () => void> = {
        " ": () => void togglePlay(),
        k: () => void togglePlay(),
        ArrowLeft: () => seekBy(shiftKey ? -30 : -10),
        j: () => seekBy(-10),
        ArrowRight: () => seekBy(shiftKey ? 30 : 10),
        l: () => seekBy(10),
        ArrowUp: () => updateVolume(volume + 0.05),
        ArrowDown: () => updateVolume(volume - 0.05),
        Home: () => seekBy(-(videoRef.current?.currentTime || 0)),
        End: () =>
          seekBy(
            (videoRef.current?.duration || 0) -
              (videoRef.current?.currentTime || 0),
          ),
        m: toggleMute,
        f: () => void toggleFullscreen(),
        p: () => void togglePictureInPicture(),
        t: () => setIsTheaterMode((value) => !value),
        c: toggleCaptions,
      };
      if (/^[0-9]$/.test(key) && videoRef.current?.duration) {
        videoRef.current.currentTime =
          (Number(key) / 10) * videoRef.current.duration;
        return true;
      }
      const action = shortcuts[key];
      if (!action) return false;
      action();
      return true;
    },
    [
      seekBy,
      toggleCaptions,
      toggleFullscreen,
      toggleMute,
      togglePictureInPicture,
      togglePlay,
      updateVolume,
      volume,
    ],
  );

  const handlePlayerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))
        return;

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (runKeyboardShortcut(key, event.shiftKey)) {
        event.preventDefault();
        revealControls();
      }
    },
    [revealControls, runKeyboardShortcut],
  );

  useEffect(() => {
    const handlePageShortcut = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(
          target?.tagName || "",
        )
      )
        return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (runKeyboardShortcut(key, event.shiftKey)) {
        event.preventDefault();
        revealControls();
      }
    };
    window.addEventListener("keydown", handlePageShortcut);
    return () => window.removeEventListener("keydown", handlePageShortcut);
  }, [revealControls, runKeyboardShortcut]);

  useEffect(() => {
    const pauseOtherVideos = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail !== video._id) videoRef.current?.pause();
    };
    const handleFullscreenChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));

    window.addEventListener("yuutube:video-playing", pauseOtherVideos);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      window.removeEventListener("yuutube:video-playing", pauseOtherVideos);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      clearControlsTimer();
    };
  }, [clearControlsTimer, video._id]);

  useEffect(() => {
    const player = videoRef.current;
    if (!player) return;

    const handlePlay = () => {
      setIsPlaying(true);
      setHasError(false);
      window.dispatchEvent(
        new CustomEvent("yuutube:video-playing", { detail: video._id }),
      );
      clearControlsTimer();
      hideControlsTimer.current = setTimeout(
        () => setShowControls(false),
        CONTROLS_TIMEOUT,
      );
    };
    const handlePause = () => {
      setIsPlaying(false);
      clearControlsTimer();
      setShowControls(true);
    };
    const handleTimeUpdate = () => {
      setCurrentTime(player.currentTime);
      if (player.duration > 0) {
        if (player.currentTime / player.duration >= 0.9) {
          localStorage.removeItem(progressKey);
        } else {
          localStorage.setItem(progressKey, String(player.currentTime));
        }
      }
    };
    const handleProgress = () => {
      if (!player.duration || !player.buffered.length) return;
      const bufferedEnd = player.buffered.end(player.buffered.length - 1);
      setBufferedPercent(Math.min(100, (bufferedEnd / player.duration) * 100));
    };
    const handleLoadedMetadata = () => {
      setDuration(player.duration);
      const savedPosition = Number(localStorage.getItem(progressKey));
      if (
        Number.isFinite(savedPosition) &&
        savedPosition > 0 &&
        savedPosition < player.duration - 5
      ) {
        player.currentTime = savedPosition;
        setCurrentTime(savedPosition);
      }
    };
    const handleRateChange = () => setPlaybackRate(player.playbackRate);
    const handleEnterPictureInPicture = () => setIsPictureInPicture(true);
    const handleLeavePictureInPicture = () => setIsPictureInPicture(false);
    const handleError = () => setHasError(true);

    player.addEventListener("play", handlePlay);
    player.addEventListener("pause", handlePause);
    player.addEventListener("timeupdate", handleTimeUpdate);
    player.addEventListener("progress", handleProgress);
    player.addEventListener("loadedmetadata", handleLoadedMetadata);
    player.addEventListener("ratechange", handleRateChange);
    player.addEventListener(
      "enterpictureinpicture",
      handleEnterPictureInPicture,
    );
    player.addEventListener(
      "leavepictureinpicture",
      handleLeavePictureInPicture,
    );
    player.addEventListener("error", handleError);

    return () => {
      player.removeEventListener("play", handlePlay);
      player.removeEventListener("pause", handlePause);
      player.removeEventListener("timeupdate", handleTimeUpdate);
      player.removeEventListener("progress", handleProgress);
      player.removeEventListener("loadedmetadata", handleLoadedMetadata);
      player.removeEventListener("ratechange", handleRateChange);
      player.removeEventListener(
        "enterpictureinpicture",
        handleEnterPictureInPicture,
      );
      player.removeEventListener(
        "leavepictureinpicture",
        handleLeavePictureInPicture,
      );
      player.removeEventListener("error", handleError);
    };
  }, [clearControlsTimer, progressKey, scheduleControlsToHide, video._id]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const remainingTime = Math.max(0, duration - currentTime);

  return (
    <div
      ref={playerRef}
      className={`relative aspect-video overflow-hidden rounded-lg bg-black text-white shadow-sm outline-none ${
        isTheaterMode
          ? "lg:fixed lg:inset-x-0 lg:top-14 lg:z-40 lg:h-[calc(100vh-3.5rem)] lg:rounded-none"
          : ""
      }`}
      onMouseMove={revealControls}
      onMouseLeave={scheduleControlsToHide}
      onFocus={revealControls}
      onKeyDown={handlePlayerKeyDown}
      tabIndex={0}
      aria-label="Video player"
    >
      <video
        ref={videoRef}
        className="h-full w-full"
        poster="/placeholder.svg?height=480&width=854"
        preload="metadata"
        onClick={() => void togglePlay()}
      >
        <source src={videoSrc} type="video/mp4" />
        {video.subtitlesUrl && (
          <track
            kind="subtitles"
            src={video.subtitlesUrl}
            srcLang="en"
            label="English"
          />
        )}
        Your browser does not support the video tag.
      </video>

      {hasError && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center">
          <div>
            <p className="font-medium">This video could not be played.</p>
            <p className="mt-1 text-sm text-gray-300">
              Check your connection, then try again.
            </p>
            <button
              onClick={() => {
                setHasError(false);
                videoRef.current?.load();
              }}
              className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {!isPlaying && !hasError && (
        <button
          type="button"
          onClick={() => void togglePlay()}
          className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/70 transition hover:scale-105 hover:bg-black/85"
          aria-label="Play video"
        >
          <Play className="ml-1 h-7 w-7 fill-current" />
        </button>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-3 pb-3 pt-12 transition-opacity duration-200 ${showControls ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <div className="group relative mb-3 h-1.5 cursor-pointer rounded-full bg-white/30 hover:h-2.5">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/30"
            style={{ width: `${bufferedPercent}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-red-600"
            style={{ width: `${progressPercent}%` }}
          />
          <input
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={currentTime}
            onChange={(event) => {
              const nextTime = Number(event.target.value);
              if (videoRef.current) videoRef.current.currentTime = nextTime;
              setCurrentTime(nextTime);
            }}
            aria-label="Seek video"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => void togglePlay()}
              className="rounded p-1.5 hover:bg-white/20"
              aria-label={isPlaying ? "Pause video" : "Play video"}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 fill-current" />
              )}
            </button>
            <button
              type="button"
              onClick={() => seekBy(-10)}
              className="hidden rounded p-1.5 hover:bg-white/20 sm:block"
              aria-label="Rewind 10 seconds"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => seekBy(10)}
              className="hidden rounded p-1.5 hover:bg-white/20 sm:block"
              aria-label="Forward 10 seconds"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="rounded p-1.5 hover:bg-white/20"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </button>
            <input
              className="hidden h-1 w-16 accent-white sm:block"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(event) => updateVolume(Number(event.target.value))}
              aria-label="Volume"
            />
            <span className="whitespace-nowrap text-xs tabular-nums sm:text-sm">
              {formatTime(currentTime)}{" "}
              <span className="text-white/70">
                / {formatTime(duration)} ({formatTime(remainingTime)} left)
              </span>
            </span>
          </div>

          <div className="flex items-center gap-1">
            {video.subtitlesUrl && (
              <button
                type="button"
                onClick={toggleCaptions}
                className={`rounded p-1.5 hover:bg-white/20 ${captionsEnabled ? "bg-white/20" : ""}`}
                aria-label="Toggle captions"
              >
                <Captions className="h-5 w-5" />
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSettings((value) => !value)}
                className="rounded p-1.5 hover:bg-white/20"
                aria-label="Playback settings"
              >
                <Settings2 className="h-5 w-5" />
              </button>
              {showSettings && (
                <div className="absolute bottom-10 right-0 w-40 rounded-md bg-zinc-900 p-2 text-sm shadow-xl">
                  <p className="px-2 pb-1 text-xs text-gray-300">
                    Playback speed
                  </p>
                  {PLAYBACK_RATES.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => {
                        if (videoRef.current)
                          videoRef.current.playbackRate = rate;
                        setPlaybackRate(rate);
                        setShowSettings(false);
                      }}
                      className={`block w-full rounded px-2 py-1.5 text-left hover:bg-white/15 ${playbackRate === rate ? "bg-white/15" : ""}`}
                    >
                      {rate === 1 ? "Normal" : `${rate}×`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsTheaterMode((value) => !value)}
              className="hidden rounded p-1.5 hover:bg-white/20 sm:block"
              aria-label="Toggle theater mode"
            >
              {isTheaterMode ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <PanelTop className="h-5 w-5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void togglePictureInPicture()}
              className={`hidden rounded p-1.5 hover:bg-white/20 sm:block ${isPictureInPicture ? "bg-white/20" : ""}`}
              aria-label="Picture in picture"
            >
              <PictureInPicture2 className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="rounded p-1.5 hover:bg-white/20"
              aria-label="Toggle fullscreen"
            >
              {isFullscreen ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <Maximize className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
