import {
  Home,
  Compass,
  PlaySquare,
  Clock,
  ThumbsUp,
  History,
  User,
  Crown,
  ArrowDownToLine,
  VideoIcon,
  X,
} from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import { useRouter } from "next/router";
import { Button } from "./ui/button";
import Channeldialogue from "./channeldialogue";
import { useUser } from "@/lib/AuthContext";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const router = useRouter();
  const { user } = useUser();
  const [isdialogeopen, setIsDialogeOpen] = useState(false);

  const navLinkClasses = "w-full justify-start";

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 overflow-y-auto border-r bg-background p-2 transition-transform duration-200 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
        md:static md:z-auto md:min-h-screen md:w-56 md:translate-x-0 lg:w-64`}
      >
        <div className="mb-2 flex items-center justify-between px-2 md:hidden">
          <span className="text-sm font-medium text-muted-foreground">
            Menu
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="space-y-1">
          <Link href="/" onClick={onClose}>
            <Button variant="ghost" className={navLinkClasses}>
              <Home className="w-5 h-5 mr-3" />
              Home
            </Button>
          </Link>
          <Link href="/explore" onClick={onClose}>
            <Button variant="ghost" className={navLinkClasses}>
              <Compass className="w-5 h-5 mr-3" />
              Explore
            </Button>
          </Link>
          <Link href="/subscriptions" onClick={onClose}>
            <Button variant="ghost" className={navLinkClasses}>
              <PlaySquare className="w-5 h-5 mr-3" />
              Subscriptions
            </Button>
          </Link>
          <Link href="/membership" onClick={onClose}>
            <Button variant="ghost" className={navLinkClasses}>
              <Crown className="w-5 h-5 mr-3" />
              Membership
            </Button>
          </Link>
          <Link href="/download" onClick={onClose}>
            <Button variant="ghost" className={navLinkClasses}>
              <ArrowDownToLine className="w-5 h-5 mr-3" />
              Downloads
            </Button>
          </Link>
          <Link href="/meetings" onClick={onClose}>
            <Button variant="ghost" className={navLinkClasses}>
              <VideoIcon className="w-5 h-5 mr-3" />
              Meetings
            </Button>
          </Link>

          {user && (
            <div className="mt-2 border-t pt-2">
              <Link href="/history" onClick={onClose}>
                <Button variant="ghost" className={navLinkClasses}>
                  <History className="w-5 h-5 mr-3" />
                  History
                </Button>
              </Link>
              <Link href="/liked" onClick={onClose}>
                <Button variant="ghost" className={navLinkClasses}>
                  <ThumbsUp className="w-5 h-5 mr-3" />
                  Liked videos
                </Button>
              </Link>
              <Link href="/watch-later" onClick={onClose}>
                <Button variant="ghost" className={navLinkClasses}>
                  <Clock className="w-5 h-5 mr-3" />
                  Watch later
                </Button>
              </Link>
              {user?.channelname ? (
                <Link href={`/channel/${user?._id}`} onClick={onClose}>
                  <Button variant="ghost" className={navLinkClasses}>
                    <User className="w-5 h-5 mr-3" />
                    Your channel
                  </Button>
                </Link>
              ) : (
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setIsDialogeOpen(true);
                      onClose();
                    }}
                  >
                    Create channel
                  </Button>
                </div>
              )}
            </div>
          )}
        </nav>
        <Channeldialogue
          isopen={isdialogeopen}
          onclose={() => setIsDialogeOpen(false)}
          mode="create"
        />
      </aside>
    </>
  );
};

export default Sidebar;
