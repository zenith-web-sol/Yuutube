import React, { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  Clock,
  Download,
  MoreHorizontal,
  Share,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { toast } from "sonner";

const VideoInfo = ({ video }: any) => {
  const [likes, setlikes] = useState(video.Like || 0);
  const [dislikes, setDislikes] = useState(video.Dislike || 0);
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const { user } = useUser();
  const [isWatchLater, setIsWatchLater] = useState(false);
  const [isChannelSubscribed, setIsChannelSubscribed] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [downloadWorking, setDownloadWorking] = useState(false);
  const isOwnChannel = Boolean(
    user?._id && String(video?.uploader) === String(user._id),
  );

  useEffect(() => {
    setlikes(video.Like || 0);
    setDislikes(video.Dislike || 0);
    setIsLiked(false);
    setIsDisliked(false);
  }, [video]);

  useEffect(() => {
    if (!user?._id || !video?._id) return;
    axiosInstance
      .get(`/like/${user._id}/video/${video._id}`)
      .then((res) => {
        setlikes(res.data.likes || 0);
        setDislikes(res.data.dislikes || 0);
        setIsLiked(Boolean(res.data.liked));
        setIsDisliked(Boolean(res.data.disliked));
      })
      .catch(() => undefined);
  }, [user?._id, video?._id]);

  useEffect(() => {
    if (!user?._id || !video?.uploader) return;
    axiosInstance
      .get(`/subscription/channels/${user._id}`)
      .then((res) =>
        setIsChannelSubscribed(
          res.data.some(
            (channel: any) => String(channel._id) === String(video.uploader),
          ),
        ),
      )
      .catch(() => undefined);
  }, [user?._id, video?.uploader]);

  useEffect(() => {
    if (!user?._id || !video?._id) return;
    axiosInstance
      .get(`/download/${user._id}`)
      .then((res) =>
        setIsDownloaded(
          (res.data?.downloads || []).some(
            (downloadedVideo: any) =>
              String(downloadedVideo._id) === String(video._id),
          ),
        ),
      )
      .catch(() => undefined);
  }, [user?._id, video?._id]);

  const toggleChannelSubscription = async () => {
    if (!user?._id) {
      toast.info("Sign in to subscribe to channels.");
      return;
    }
    if (isOwnChannel) return;
    try {
      const res = await axiosInstance.post(
        `/subscription/channels/${user._id}/${video.uploader}`,
        { videoId: video._id },
      );
      setIsChannelSubscribed(Boolean(res.data.subscribed));
      toast.success(
        res.data.subscribed
          ? "Subscribed to channel."
          : "Subscription removed.",
      );
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ||
          "Unable to update this channel subscription.",
      );
    }
  };

  useEffect(() => {
    const handleviews = async () => {
      if (user) {
        try {
          return await axiosInstance.post(`/history/${video._id}`, {
            userId: user?._id,
          });
        } catch (error) {
          return console.log(error);
        }
      } else {
        return await axiosInstance.post(`/history/views/${video?._id}`);
      }
    };
    handleviews();
  }, [user]);

  const handleLike = async () => {
    if (!user) {
      toast.info("Sign in to like or dislike videos.");
      return;
    }
    try {
      const res = await axiosInstance.post(`/like/${video._id}`, {
        userId: user?._id,
        reaction: "like",
      });
      setlikes(res.data.likes || 0);
      setDislikes(res.data.dislikes || 0);
      setIsLiked(Boolean(res.data.liked));
      setIsDisliked(Boolean(res.data.disliked));
    } catch (error) {
      console.log(error);
    }
  };

  const handleWatchLater = async () => {
    if (!user) {
      toast.info("Sign in to save videos to Watch Later.");
      return;
    }
    try {
      const res = await axiosInstance.post(`/watch/${video._id}`, {
        userId: user?._id,
      });
      if (res.data.watchlater) {
        setIsWatchLater(!isWatchLater);
      } else {
        setIsWatchLater(false);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleDislike = async () => {
    if (!user) {
      toast.info("Sign in to like or dislike videos.");
      return;
    }
    try {
      const res = await axiosInstance.post(`/like/${video._id}`, {
        userId: user?._id,
        reaction: "dislike",
      });
      setlikes(res.data.likes || 0);
      setDislikes(res.data.dislikes || 0);
      setIsLiked(Boolean(res.data.liked));
      setIsDisliked(Boolean(res.data.disliked));
    } catch (error) {
      console.log(error);
    }
  };

  const handleDownload = async () => {
    if (!user) {
      toast.info("Sign in to download the video.");
      return;
    }
    if (downloadWorking) return;
    setDownloadWorking(true);
    try {
      if (isDownloaded) {
        await axiosInstance.delete(`/download/${user._id}/${video._id}`);
        setIsDownloaded(false);
        toast.success("Removed from downloads.");
      } else {
        const res = await axiosInstance.post(
          `/download/${user._id}/${video._id}`,
        );
        setIsDownloaded(true);
        toast.success(res.data?.message || "Video downloaded.");
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Unable to update download.",
      );
    } finally {
      setDownloadWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold sm:text-xl">{video.videotitle}</h1>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <Avatar className="w-10 h-10">
            <AvatarFallback>{video.videochanel[0]}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-medium">{video.videochanel}</h3>
            <p className="text-sm text-gray-600">1.2M subscribers</p>
          </div>
          <Button
            className="sm:ml-2"
            variant={
              isChannelSubscribed || isOwnChannel ? "outline" : "default"
            }
            onClick={toggleChannelSubscription}
            disabled={isOwnChannel}
          >
            {isOwnChannel
              ? "Your channel"
              : isChannelSubscribed
                ? "Subscribed"
                : "Subscribe"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-full">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-l-full"
              onClick={handleLike}
            >
              <ThumbsUp
                className={`w-5 h-5 mr-2 ${
                  isLiked ? "fill-black text-black" : ""
                }`}
              />
              {likes.toLocaleString()}
            </Button>
            <div className="w-px h-6 bg-gray-300" />
            <Button
              variant="ghost"
              size="sm"
              className="rounded-r-full"
              onClick={handleDislike}
            >
              <ThumbsDown
                className={`w-5 h-5 mr-2 ${
                  isDisliked ? "fill-black text-black" : ""
                }`}
              />
              {dislikes.toLocaleString()}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={`bg-gray-100 rounded-full ${
              isWatchLater ? "text-primary" : ""
            }`}
            onClick={handleWatchLater}
          >
            <Clock className="w-5 h-5 mr-2" />
            {isWatchLater ? "Saved" : "Watch Later"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="bg-gray-100 rounded-full"
          >
            <Share className="w-5 h-5 mr-2" />
            Share
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`bg-gray-100 rounded-full ${
              isDownloaded ? "text-primary" : ""
            }`}
            onClick={handleDownload}
            disabled={downloadWorking}
          >
            <Download className="w-5 h-5 mr-2" />
            {downloadWorking
              ? "Working..."
              : isDownloaded
                ? "Downloaded"
                : "Download"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="bg-gray-100 rounded-full"
          >
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </div>
      </div>
      <div className="bg-gray-100 rounded-lg p-4">
        <div className="flex gap-4 text-sm font-medium mb-2">
          <span>{video.views.toLocaleString()} views</span>
          <span>{formatDistanceToNow(new Date(video.createdAt))} ago</span>
        </div>
        <div className={`text-sm ${showFullDescription ? "" : "line-clamp-3"}`}>
          <p>
            Sample video description. This would contain the actual video
            description from the database.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 p-0 h-auto font-medium"
          onClick={() => setShowFullDescription(!showFullDescription)}
        >
          {showFullDescription ? "Show less" : "Show more"}
        </Button>
      </div>
    </div>
  );
};

export default VideoInfo;