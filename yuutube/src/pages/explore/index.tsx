import {
  Compass,
  Flame,
  Play,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import axiosInstance from "@/lib/axiosinstance";
import VideoCard from "@/components/videocard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const topics = [
  "All",
  "Trending",
  "Music",
  "Gaming",
  "Technology",
  "Education",
  "Travel",
  "Food",
  "Comedy",
];

const matchesTopic = (video: any, topic: string) => {
  if (topic === "All" || topic === "Trending") return true;
  const text =
    `${video?.videotitle || ""} ${video?.videochanel || ""}`.toLowerCase();
  const keywords: Record<string, string[]> = {
    Music: ["music", "song", "cover", "concert"],
    Gaming: ["game", "gaming", "play", "stream"],
    Technology: ["tech", "code", "computer", "phone", "javascript"],
    Education: ["learn", "course", "tutorial", "education", "guide"],
    Travel: ["travel", "trip", "tour", "city", "journey"],
    Food: ["food", "cook", "recipe", "kitchen"],
    Comedy: ["comedy", "funny", "standup", "laugh"],
  };
  return keywords[topic]?.some((keyword) => text.includes(keyword)) || false;
};

export default function ExplorePage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [topic, setTopic] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axiosInstance
      .get("/video/getall")
      .then((response) =>
        setVideos(Array.isArray(response.data) ? response.data : []),
      )
      .catch(() => toast.error("Explore videos could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const visibleVideos = useMemo(() => {
    const query = search.trim().toLowerCase();
    return videos
      .filter((video) => matchesTopic(video, topic))
      .filter(
        (video) =>
          !query ||
          `${video.videotitle} ${video.videochanel}`
            .toLowerCase()
            .includes(query),
      )
      .sort((a, b) =>
        topic === "Trending" ? (b.views || 0) - (a.views || 0) : 0,
      );
  }, [search, topic, videos]);

  const featured = visibleVideos[0];

  return (
    <main className="min-w-0 flex-1 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-red-600">
              <Compass className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-wider">
                Explore
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Find your next favourite video.
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Browse what is popular, discover new channels, and explore the
              Yuutube community.
            </p>
          </div>
          <div className="flex w-full max-w-sm items-center gap-2 rounded-full border bg-background px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Explore"
              className="border-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="mt-7 flex gap-2 overflow-x-auto pb-2">
          {topics.map((item) => (
            <Button
              key={item}
              size="sm"
              variant={topic === item ? "default" : "secondary"}
              className="shrink-0 rounded-full"
              onClick={() => setTopic(item)}
            >
              {item === "Trending" && <Flame className="mr-1 h-4 w-4" />}
              {item}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="grid place-items-center rounded-2xl border border-dashed py-24 text-muted-foreground">
            Loading Explore…
          </div>
        ) : featured ? (
          <>
            <section className="relative mt-3 overflow-hidden rounded-3xl bg-zinc-950 text-white shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
              <video
                src={`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000"}/${String(featured.filepath || "").replace(/^\/+/, "")}`}
                muted
                playsInline
                className="h-64 w-full object-cover opacity-70 sm:h-80"
              />
              <div className="absolute inset-0 flex max-w-xl flex-col justify-end p-6 sm:p-9">
                <div className="flex items-center gap-2 text-sm text-red-300">
                  <Sparkles className="h-4 w-4" />
                  Featured on Yuutube
                </div>
                <h2 className="mt-2 line-clamp-2 text-2xl font-bold sm:text-3xl">
                  {featured.videotitle}
                </h2>
                <p className="mt-2 text-sm text-zinc-300">
                  {featured.videochanel} ·{" "}
                  {(featured.views || 0).toLocaleString()} views
                </p>
                <Link href={`/watch/${featured._id}`} className="mt-5">
                  <Button className="bg-white text-black hover:bg-zinc-200">
                    <Play className="mr-2 h-4 w-4 fill-current" />
                    Watch now
                  </Button>
                </Link>
              </div>
            </section>
            <section className="mt-9">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-red-600" />
                <h2 className="text-xl font-semibold">
                  {topic === "Trending" ? "Trending now" : "Videos for you"}
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleVideos.map((video) => (
                  <VideoCard key={video._id} video={video} />
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="grid place-items-center rounded-2xl border border-dashed py-24 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">No videos match this search</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try another topic or clear your search.
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                setTopic("All");
                setSearch("");
              }}
            >
              Show all videos
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
