import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import VideoPlayer from "@/components/Videoplayer";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

export default function DownloadPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useUser();
  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!user?._id || !id) return;
    setLoading(true);
    setNotFound(false);
    axiosInstance
      .get(`/download/${user._id}`)
      .then((response) => {
        const match = (response.data?.downloads || []).find(
          (downloadedVideo: any) => String(downloadedVideo._id) === String(id),
        );
        if (match) {
          setVideo(match);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [user?._id, id]);

  if (!user)
    return (
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        <h1 className="text-2xl font-bold">Downloads</h1>
        <p className="mt-2 text-muted-foreground">
          Sign in to watch your downloaded videos.
        </p>
      </main>
    );

  if (loading)
    return (
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        <p>Loading video...</p>
      </main>
    );

  if (notFound || !video)
    return (
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        <h1 className="text-2xl font-bold">Video not found</h1>
        <p className="mt-2 text-muted-foreground">
          This video isn't in your downloads. It may have been removed.
        </p>
      </main>
    );

  return (
    <main className="min-w-0 flex-1 p-3 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <VideoPlayer video={video} />

        <h1 className="text-lg font-semibold sm:text-xl">
          {video.videotitle}
        </h1>

        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback>{video.videochanel?.[0]}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-medium">{video.videochanel}</h3>
          </div>
        </div>

        <div className="rounded-lg bg-gray-100 p-4">
          <p className="text-sm">
            {video.description ||
              "No description available for this video."}
          </p>
        </div>
      </div>
    </main>
  );
}