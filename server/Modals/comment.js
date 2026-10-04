import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    reason: { type: String, required: true },
  },
  { timestamps: true, _id: false },
);

const commentSchema = new mongoose.Schema(
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
    parentid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "comment",
      default: null,
    },
    commentbody: { type: String, required: true, trim: true, maxlength: 1000 },
    usercommented: { type: String, required: true, trim: true },
    userimage: { type: String, default: "" },
    language: { type: String, default: "" },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    reports: [reportSchema],
    isFlagged: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    commentedon: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

commentSchema.index({ videoid: 1, parentid: 1, createdAt: -1 });

export default mongoose.model("comment", commentSchema);
