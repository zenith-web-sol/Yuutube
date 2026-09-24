import { CheckCircle2, Download, HardDrive } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import Videocard from "@/components/videocard";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

interface DownloadQuota {
  plan: string;
  quality: string;
  downloadsPerDay: number;
  usedToday: number;
  remainingToday: number;
}

const formatFileSize = (rawSize: unknown) => {
  const bytes = Number(rawSize);
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown size";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

export default function DownloadsPage() {
  const { user } = useUser();
  const [videos, setVideos] = useState<any[]>([]);
  const [quota, setQuota] = useState<DownloadQuota | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?._id) {
      setLoading(false);
      return;
    }
    axiosInstance
      .get(`/download/${user._id}`)
      .then((response) => {
        setVideos(response.data?.downloads || []);
        setQuota(response.data?.quota || null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [user?._id]);

  if (!user)
    return (
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        <h1 className="text-2xl font-bold">Downloads</h1>
        <p className="mt-2 text-muted-foreground">
          Sign in to see the videos you have downloaded for offline viewing.
        </p>
      </main>
    );

  return (
    <main className="min-w-0 flex-1 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Downloads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Videos you've saved for offline viewing.
          </p>
        </div>

        {quota && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4 shadow-sm sm:p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-100 p-2 text-red-600">
                <HardDrive className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {quota.plan} plan · {quota.quality}
                </p>
                <p className="font-medium">
                  {quota.usedToday} of {quota.downloadsPerDay} downloads used
                  today
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm text-muted-foreground">Remaining today</p>
              <p className="text-xl font-semibold">{quota.remainingToday}</p>
            </div>
          </div>
        )}

        {loading ? (
          <p>Loading downloads...</p>
        ) : videos.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((video) => (
              <div key={video._id} className="space-y-2">
                <Videocard
                  video={video}
                  linkTo={`/download/${video._id}`}
                  showMeta={false}
                />
                <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                  <span>
                    Downloaded{" "}
                    {video.downloadedAt
                      ? formatDistanceToNow(new Date(video.downloadedAt))
                      : "recently"}{" "}
                    ago
                  </span>
                  <span className="flex items-center gap-1">
                    {formatFileSize(video.filesize)}
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <section className="rounded-lg border p-8 text-center">
            <Download className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 font-medium">
              You haven't downloaded any videos yet.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Download videos to watch them offline, based on your membership
              plan.
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