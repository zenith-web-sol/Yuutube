import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    roomId: { type: String, required: true },
    title: { type: String, default: "Yuutube meeting" },
    role: { type: String, enum: ["host", "guest"], default: "guest" },
    scheduledFor: { type: Date, default: null },
    durationMin: { type: Number, default: null },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

meetingSchema.index({ ownerId: 1, roomId: 1 }, { unique: true });

export default mongoose.model("meeting", meetingSchema);
