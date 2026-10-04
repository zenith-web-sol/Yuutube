import mongoose from "mongoose";

const downloadSchema = new mongoose.Schema(
  {
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    videoid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
    },
  },
  { timestamps: true },
);

downloadSchema.index({ userid: 1, videoid: 1 }, { unique: true });

export default mongoose.model("download", downloadSchema);
