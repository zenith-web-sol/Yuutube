import video from "../Modals/video.js";
import history from "../Modals/history.js";

export const handlehistory = async (req, res) => {
  const { userId } = req.body;
  const { videoId } = req.params;
  try {
    await history.findOneAndUpdate(
      { viewer: userId, videoid: videoId },
      { $set: { likedon: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });
    return res.status(200).json({ history: true });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const handleview = async (req, res) => {
  const { videoId } = req.params;
  try {
    await video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });
    return res.status(200).json({ history: true });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const getallhistoryVideo = async (req, res) => {
  const { userId } = req.params;
  try {
    const historyvideo = await history
      .find({ viewer: userId })
      .populate({
        path: "videoid",
        model: "videofiles",
      })
      .sort({ likedon: -1 })
      .exec();
    // Older versions created duplicates. Keep only each video's newest entry
    // while leaving existing database data untouched.
    const uniqueHistory = Array.from(
      new Map(
        historyvideo.map((item) => [
          String(item.videoid?._id || item.videoid),
          item,
        ]),
      ).values(),
    );
    return res.status(200).json(uniqueHistory);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
