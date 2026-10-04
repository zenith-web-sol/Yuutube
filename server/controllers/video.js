import path from "path";
import video from "../Modals/video.js";
import users from "../Modals/Auth.js";

const validUser = (id) => /^[a-f\d]{24}$/i.test(String(id || ""));

export const uploadvideo = async (req, res) => {
  if (req.file === undefined) {
    return res
      .status(404)
      .json({ message: "plz upload a mp4 video file only" });
  } else {
    try {
      if (!validUser(req.body.uploader)) {
        return res
          .status(400)
          .json({ message: "Please upload from a valid channel." });
      }
      const channel = await users.findById(req.body.uploader);
      if (!channel)
        return res.status(404).json({ message: "Channel not found." });
      const relativePath = path
        .join("uploads", req.file.filename)
        .replace(/\\/g, "/");

      const file = new video({
        videotitle: req.body.videotitle,
        filename: req.file.originalname,
        filepath: relativePath,
        filetype: req.file.mimetype,
        filesize: req.file.size,
        videochanel: channel.channelname || req.body.videochanel,
        uploader: String(channel._id),
      });
      await file.save();
      return res.status(201).json("file uploaded successfully");
    } catch (error) {
      console.error(" error:", error);
      return res.status(500).json({ message: "Something went wrong" });
    }
  }
};
export const getallvideo = async (req, res) => {
  try {
    const files = await video.find();
    return res.status(200).send(files);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
