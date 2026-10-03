import {
  Bell,
  Menu,
  Mic,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  User,
  VideoIcon,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import Link from "next/link";
import { Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import Channeldialogue from "./channeldialogue";
import { useRouter } from "next/router";
import { useUser } from "@/lib/AuthContext";
import { toast } from "sonner";

interface HeaderProps {
  onMenuClick: () => void;
}

const Header = ({ onMenuClick }: HeaderProps) => {
  const { user, logout, handlegooglesignin, theme, setTheme } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [isdialogeopen, setisdialogeopen] = useState(false);
  const router = useRouter();
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };
  const handleKeypress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch(e as any);
    }
  };
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    setSpeechSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript.trim()) {
        router.push(`/search?q=${encodeURIComponent(transcript.trim())}`);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      toast.error("Couldn't hear that. Try again.");
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    return () => recognition.abort();
  }, [router]);

  const toggleVoiceSearch = () => {
    if (!speechSupported) {
      toast.info(
        "Voice search isn't supported in this browser. Try Chrome or Edge.",
      );
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    try {
      recognitionRef.current?.start();
      setListening(true);
    } catch {
      // start() throws if already running; ignore.
    }
  };
  return (
    <TooltipProvider delay={200}>
      <header className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b bg-background px-3 py-2 sm:px-4">
        <div className="flex shrink-0 items-center gap-1 sm:gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onMenuClick}
            aria-label="Toggle menu"
          >
            <Menu className="w-6 h-6" />
          </Button>
          <Link href="/" className="flex items-center gap-1">
            <div className="bg-red-600 p-1 rounded">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </div>
            <span className="hidden text-xl font-medium sm:inline">
              Yuutube
            </span>
            <span className="ml-1 hidden text-xs text-gray-400 lg:inline">
              IN
            </span>
          </Link>
        </div>
        <form
          onSubmit={handleSearch}
          className="mx-2 hidden max-w-2xl flex-1 items-center gap-2 sm:flex"
        >
          <div className="flex flex-1 items-center rounded-full border bg-background transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
            <Input
              type="search"
              placeholder="Search"
              value={searchQuery}
              onKeyPress={handleKeypress}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-full border-0 shadow-none focus-visible:ring-0"
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="mr-1 shrink-0 rounded-full hover:bg-muted"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`shrink-0 rounded-full ${listening ? "bg-red-100 text-red-600 dark:bg-red-950" : ""}`}
            onClick={toggleVoiceSearch}
            aria-label={
              speechSupported
                ? listening
                  ? "Stop voice search (listening…)"
                  : "Search by voice"
                : "Voice search not supported in this browser"
            }
          >
            <Mic className={`w-5 h-5 ${listening ? "animate-pulse" : ""}`} />
          </Button>
        </form>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full sm:hidden"
            onClick={() => router.push("/search")}
            aria-label="Search videos"
          >
            <Search className="h-5 w-5" />
          </Button>
          {user ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="hidden sm:inline-flex"
                onClick={() => router.push("/meetings")}
                aria-label="Start or join a meeting"
              >
                <VideoIcon className="w-6 h-6" />
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-60"
                      aria-label="Notifications"
                      data-no-auto-tooltip="true"
                    >
                      <Bell className="w-6 h-6" />
                    </Button>
                  }
                />
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-8 w-8 rounded-full"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.image} />
                      <AvatarFallback>{user.name?.[0] || "U"}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  {user?.channelname ? (
                    <DropdownMenuItem asChild>
                      <Link href={`/channel/${user?._id}`}>Your channel</Link>
                    </DropdownMenuItem>
                  ) : (
                    <div className="px-2 py-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => setisdialogeopen(true)}
                      >
                        Create Channel
                      </Button>
                    </div>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href="/history">History</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/liked">Liked videos</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/watch-later">Watch later</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/download">Downloads</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/meetings">
                      <VideoIcon className="mr-2 h-4 w-4" />
                      Meetings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/security">
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Account security
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button
                className="flex items-center gap-2"
                onClick={handlegooglesignin}
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">Sign in</span>
              </Button>
            </>
          )}{" "}
        </div>
        <Channeldialogue
          isopen={isdialogeopen}
          onclose={() => setisdialogeopen(false)}
          mode="create"
        />
      </header>
    </TooltipProvider>
  );
};

export default Header;
