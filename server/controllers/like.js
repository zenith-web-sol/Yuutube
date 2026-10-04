import video from "../Modals/video.js";
import like from "../Modals/like.js";

export const handlelike = async (req, res) => {
  const { userId, reaction = "like" } = req.body;
  const { videoId } = req.params;
  if (!userId || !["like", "dislike"].includes(reaction))
    return res.status(400).json({ message: "Invalid reaction." });
  try {
    const existingRows = await like
      .find({ viewer: userId, videoid: videoId })
      .sort({ createdAt: -1 });
    const existing = existingRows[0];
    if (existingRows.length > 1)
      await like.deleteMany({
        _id: { $in: existingRows.slice(1).map((row) => row._id) },
      });
    if (existing?.reaction === reaction)
      await like.findByIdAndDelete(existing._id);
    else if (existing) {
      existing.reaction = reaction;
      await existing.save();
    } else await like.create({ viewer: userId, videoid: videoId, reaction });
    const [likes, dislikes, current] = await Promise.all([
      like.countDocuments({
        videoid: videoId,
        $or: [{ reaction: "like" }, { reaction: { $exists: false } }],
      }),
      like.countDocuments({ videoid: videoId, reaction: "dislike" }),
      like.findOne({ viewer: userId, videoid: videoId }).lean(),
    ]);
    await video.findByIdAndUpdate(videoId, { Like: likes, Dislike: dislikes });
    return res
      .status(200)
      .json({
        liked: (current?.reaction || "like") === "like",
        disliked: current?.reaction === "dislike",
        likes,
        dislikes,
      });
  } catch (error) {
    console.error("Reaction error:", error);
    return res.status(500).json({ message: "Unable to save reaction." });
  }
};

export const getallLikedVideo = async (req, res) => {
  const { userId } = req.params;
  try {
    const likevideo = await like
      .find({ viewer: userId, reaction: "like" })
      .populate({ path: "videoid", model: "videofiles" })
      .exec();
    return res.status(200).json(likevideo);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getReaction = async (req, res) => {
  const { userId, videoId } = req.params;
  const reaction = await like
    .findOne({ viewer: userId, videoid: videoId })
    .lean();
  const likes = await like.countDocuments({
    videoid: videoId,
    $or: [{ reaction: "like" }, { reaction: { $exists: false } }],
  });
  const dislikes = await like.countDocuments({
    videoid: videoId,
    reaction: "dislike",
  });
  return res
    .status(200)
    .json({
      liked: (reaction?.reaction || "like") === "like",
      disliked: reaction?.reaction === "dislike",
      likes,
      dislikes,
    });
};
