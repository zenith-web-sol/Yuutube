import ChannelHeader from "@/components/ChannelHeader";
import Channeltabs from "@/components/Channeltabs";
import ChannelVideos from "@/components/ChannelVideos";
import VideoUploader from "@/components/VideoUploader";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import axios from "axios";

const index = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useUser();
  const [channel, setChannel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState<any[]>([]);

  useEffect(() => {
    const fetchChannel = async () => {
      if (!id || typeof id !== "string") {
        setLoading(false);
        return;
      }

      try {
        const res = await axiosInstance.get(`/user/${id}`);
        setChannel(res.data);
        const videoResponse = await axiosInstance.get("/video/getall");
        setVideos(
          (videoResponse.data || []).filter(
            (video: any) => String(video.uploader) === String(id),
          ),
        );
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setChannel(null);
        } else {
          console.error("Failed to fetch channel:", err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchChannel();
  }, [id]);

  if (loading)
    return <main className="min-w-0 flex-1 p-6">Loading channel...</main>;
  if (!channel)
    return <main className="min-w-0 flex-1 p-6">Channel not found.</main>;

  return (
    <div className="flex-1 min-h-screen bg-white">
      <div className="max-w-full mx-auto">
        <ChannelHeader channel={channel} user={user} />
        <Channeltabs />
        <div className="px-4 pb-8">
          {user?._id === channel._id && (
            <VideoUploader channelId={id} channelName={channel.channelname} />
          )}
        </div>
        <div className="px-4 pb-8">
          <ChannelVideos videos={videos} />
        </div>
      </div>
    </div>
  );
};

export default index;
