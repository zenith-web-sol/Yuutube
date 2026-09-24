import users from "../Modals/Auth.js";
import Download from "../Modals/Download.js";
import video from "../Modals/video.js";
import { PLANS } from "./subscription.js";

const validId = (id) => /^[a-f\d]{24}$/i.test(String(id || ""));

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const getQuotaForUser = async (user) => {
  const plan = PLANS[user.subscription?.plan || "Free"];
  const usedToday = await Download.countDocuments({
    userid: user._id,
    createdAt: { $gte: startOfToday() },
  });
  return {
    plan: plan.name,
    quality: plan.quality,
    downloadsPerDay: plan.downloadsPerDay,
    usedToday,
    remainingToday: Math.max(plan.downloadsPerDay - usedToday, 0),
  };
};

export const getDownloads = async (req, res) => {
  if (!validId(req.params.userid))
    return res.status(400).json({ message: "Invalid user." });
  try {
    const user = await users.findById(req.params.userid);
    if (!user) return res.status(404).json({ message: "User not found." });

    const downloads = await Download.find({ userid: user._id })
      .sort({ createdAt: -1 })
      .populate("videoid");

    const downloadedVideos = downloads
      .filter((entry) => entry.videoid)
      .map((entry) => ({
        ...entry.videoid.toObject(),
        downloadedAt: entry.createdAt,
        downloadStatus: "Downloaded",
      }));

    const quota = await getQuotaForUser(user);
    return res.status(200).json({ downloads: downloadedVideos, quota });
  } catch (error) {
    console.error("Downloads lookup error:", error);
    return res.status(500).json({ message: "Unable to load downloads." });
  }
};

export const addDownload = async (req, res) => {
  const { userid, videoid } = req.params;
  if (!validId(userid) || !validId(videoid))
    return res.status(400).json({ message: "Invalid request." });
  try {
    const user = await users.findById(userid);
    if (!user) return res.status(404).json({ message: "User not found." });

    const targetVideo = await video.findById(videoid);
    if (!targetVideo)
      return res.status(404).json({ message: "Video not found." });

    const alreadyDownloaded = await Download.findOne({ userid, videoid });
    if (alreadyDownloaded) {
      const quota = await getQuotaForUser(user);
      return res
        .status(200)
        .json({
          message: "Already downloaded.",
          quota,
          alreadyDownloaded: true,
        });
    }

    const quota = await getQuotaForUser(user);
    if (quota.remainingToday <= 0) {
      return res.status(403).json({
        message: `Daily download limit reached for the ${quota.plan} plan. Upgrade your membership for more downloads.`,
        quota,
      });
    }

    await Download.create({ userid, videoid });
    const updatedQuota = await getQuotaForUser(user);
    return res
      .status(201)
      .json({ message: "Video downloaded.", quota: updatedQuota });
  } catch (error) {
    console.error("Add download error:", error);
    return res.status(500).json({ message: "Unable to download video." });
  }
};

export const removeDownload = async (req, res) => {
  const { userid, videoid } = req.params;
  if (!validId(userid) || !validId(videoid))
    return res.status(400).json({ message: "Invalid request." });
  try {
    await Download.findOneAndDelete({ userid, videoid });
    const user = await users.findById(userid);
    if (!user) return res.status(404).json({ message: "User not found." });
    const quota = await getQuotaForUser(user);
    return res.status(200).json({ message: "Download removed.", quota });
  } catch (error) {
    console.error("Remove download error:", error);
    return res.status(500).json({ message: "Unable to remove download." });
  }
};
