import Comments from "@/components/Comments";
import RelatedVideos from "@/components/RelatedVideos";
import VideoInfo from "@/components/VideoInfo";
import Videoplayer from "@/components/Videoplayer";
import axiosInstance from "@/lib/axiosinstance";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

const index = () => {
  const router = useRouter();
  const { id } = router.query;
  const [videos, setVideo] = useState<any>(null);
  const [relatedVideos, setRelatedVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVideo = async () => {
      if (!id || typeof id !== "string") {
        setLoading(false);
        return;
      }

      try {
        const res = await axiosInstance.get("/video/getall");
        const currentVideo = (res.data || []).find(
          (video: any) => video._id === id,
        );
        setVideo(currentVideo || null);
        setRelatedVideos(res.data || []);
      } catch (error) {
        console.error("Failed to load video:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [id]);

  if (loading) return <main className="flex-1 p-4">Loading...</main>;
  if (!videos) return <main className="flex-1 p-4">Video not found.</main>;

  return (
    <main className="min-w-0 flex-1 bg-background">
      <div className="mx-auto max-w-7xl p-3 sm:p-4 lg:p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Videoplayer video={videos} />
            <VideoInfo video={videos} />
            <Comments videoId={videos._id} />
          </div>
          <div className="space-y-4">
            <RelatedVideos videos={relatedVideos} />
          </div>
        </div>
      </div>
    </main>
  );
};

export default index;
