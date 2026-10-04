import { UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Videocard from "@/components/videocard";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

export default function SubscriptionsPage() {
  const { user } = useUser();
  const [channels, setChannels] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user?._id) {
      setLoading(false);
      return;
    }
    Promise.all([
      axiosInstance.get(`/subscription/channels/${user._id}`),
      axiosInstance.get("/video/getall"),
    ])
      .then(([channelResponse, videoResponse]) => {
        setChannels(channelResponse.data || []);
        setVideos(videoResponse.data || []);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [user?._id]);
  const channelIds = useMemo(
    () => new Set(channels.map((channel) => String(channel._id))),
    [channels],
  );
  const subscribedVideos = videos.filter((video) =>
    channelIds.has(String(video.uploader)),
  );
  if (!user)
    return (
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        <h1 className="text-2xl font-bold">Subscriptions</h1>
        <p className="mt-2 text-muted-foreground">
          Sign in to see videos from your subscribed channels.
        </p>
      </main>
    );
  return (
    <main className="min-w-0 flex-1 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Subscriptions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Latest videos from channels you follow.
          </p>
        </div>
        <div className="flex gap-5 overflow-x-auto border-b pb-4">
          {channels.length ? (
            channels.map((channel) => (
              <Link
                key={channel._id}
                href={`/channel/${channel._id}`}
                className="flex min-w-20 flex-col items-center gap-2 text-center"
              >
                <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-muted">
                  {channel.image ? (
                    <img
                      src={channel.image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRound className="h-6 w-6" />
                  )}
                </div>
                <span className="max-w-24 truncate text-xs">
                  {channel.channelname || channel.name}
                </span>
              </Link>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              You are not subscribed to any channels yet.
            </p>
          )}
        </div>
        {loading ? (
          <p>Loading subscriptions...</p>
        ) : subscribedVideos.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {subscribedVideos.map((video) => (
              <Videocard key={video._id} video={video} />
            ))}
          </div>
        ) : (
          <section className="rounded-lg border p-8 text-center">
            <p className="font-medium">Your subscription feed is empty.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Subscribe to a channel to see its latest videos here.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Explore videos
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
