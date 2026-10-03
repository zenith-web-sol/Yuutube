import Meeting from "../Modals/Meeting.js";

const validId = (id) => /^[a-f\d]{24}$/i.test(String(id || ""));

export const getMeetings = async (req, res) => {
  const { userId } = req.params;
  if (!validId(userId))
    return res.status(400).json({ message: "Invalid user." });
  try {
    const meetings = await Meeting.find({ ownerId: userId }).sort({
      createdAt: -1,
    });
    return res.status(200).json(meetings);
  } catch (error) {
    console.error("Get meetings error:", error);
    return res.status(500).json({ message: "Unable to load meetings." });
  }
};

export const saveMeeting = async (req, res) => {
  const { userId } = req.params;
  const { roomId, title, role, scheduledFor, durationMin, startedAt, endedAt } =
    req.body;
  if (!validId(userId))
    return res.status(400).json({ message: "Invalid user." });
  if (!roomId) return res.status(400).json({ message: "roomId is required." });
  try {
    const meeting = await Meeting.findOneAndUpdate(
      { ownerId: userId, roomId },
      {
        $set: {
          title: title || "Yuutube meeting",
          role: role === "host" ? "host" : "guest",
          scheduledFor: scheduledFor || null,
          durationMin: durationMin ?? null,
          startedAt: startedAt || null,
          endedAt: endedAt || null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return res.status(200).json(meeting);
  } catch (error) {
    console.error("Save meeting error:", error);
    return res.status(500).json({ message: "Unable to save meeting." });
  }
};

export const deleteMeeting = async (req, res) => {
  const { userId, roomId } = req.params;
  if (!validId(userId))
    return res.status(400).json({ message: "Invalid user." });
  try {
    await Meeting.findOneAndDelete({ ownerId: userId, roomId });
    return res.status(200).json({ message: "Removed." });
  } catch (error) {
    console.error("Delete meeting error:", error);
    return res.status(500).json({ message: "Unable to remove meeting." });
  }
};

export const recordMeetingJoin = async (req, res) => {
  const { userId, roomId } = req.params;
  const { role } = req.body;
  if (!validId(userId))
    return res.status(400).json({ message: "Invalid user." });
  try {
    const existing = await Meeting.findOne({ ownerId: userId, roomId });
    const meeting = await Meeting.findOneAndUpdate(
      { ownerId: userId, roomId },
      {
        $set: {
          title: existing?.title || "Instant meeting",
          role: existing?.role || (role === "host" ? "host" : "guest"),
          startedAt: new Date(),
          endedAt: null,
        },
        $setOnInsert: { scheduledFor: null, durationMin: null },
      },
      { upsert: true, new: true },
    );
    return res.status(200).json(meeting);
  } catch (error) {
    console.error("Record meeting join error:", error);
    return res.status(500).json({ message: "Unable to record meeting." });
  }
};

export const markMeetingEnded = async (req, res) => {
  const { userId, roomId } = req.params;
  if (!validId(userId))
    return res.status(400).json({ message: "Invalid user." });
  try {
    const meeting = await Meeting.findOne({ ownerId: userId, roomId });
    if (!meeting || meeting.endedAt)
      return res.status(200).json({ message: "No change." });
    meeting.endedAt = new Date();
    await meeting.save();
    return res.status(200).json(meeting);
  } catch (error) {
    console.error("Mark meeting ended error:", error);
    return res.status(500).json({ message: "Unable to update meeting." });
  }
};
