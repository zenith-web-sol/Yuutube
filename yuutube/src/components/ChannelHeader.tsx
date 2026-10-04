import React, { useState } from "react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import axiosInstance from "@/lib/axiosinstance";
import { useEffect } from "react";
import { toast } from "sonner";

const ChannelHeader = ({ channel, user }: any) => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  useEffect(() => {
    if (user?._id && channel?._id)
      axiosInstance
        .get(`/subscription/channels/${user._id}`)
        .then((response) =>
          setIsSubscribed(
            response.data.some(
              (item: any) => String(item._id) === String(channel._id),
            ),
          ),
        )
        .catch(() => undefined);
  }, [user?._id, channel?._id]);
  const toggleSubscription = async () => {
    if (!user?._id || !channel?._id) return;
    try {
      const response = await axiosInstance.post(
        `/subscription/channels/${user._id}/${channel._id}`,
      );
      setIsSubscribed(response.data.subscribed);
      toast.success(
        response.data.subscribed
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
  return (
    <div className="w-full">
      {/* Banner */}
      <div className="relative h-32 md:h-48 lg:h-64 bg-gradient-to-r from-blue-400 to-purple-500 overflow-hidden"></div>

      {/* Channel Info */}
      <div className="px-4 py-6">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <Avatar className="w-20 h-20 md:w-32 md:h-32">
            <AvatarFallback className="text-2xl">
              {channel?.channelname[0]}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-2">
            <h1 className="text-2xl md:text-4xl font-bold">
              {channel?.channelname}
            </h1>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              <span>
                @{channel?.channelname.toLowerCase().replace(/\s+/g, "")}
              </span>
            </div>
            {channel?.description && (
              <p className="text-sm text-gray-700 max-w-2xl">
                {channel?.description}
              </p>
            )}
          </div>

          {user && user?._id !== channel?._id && (
            <div className="flex gap-2">
              <Button
                onClick={toggleSubscription}
                variant={isSubscribed ? "outline" : "default"}
                className={
                  isSubscribed ? "bg-gray-100" : "bg-red-600 hover:bg-red-700"
                }
              >
                {isSubscribed ? "Subscribed" : "Subscribe"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChannelHeader;
