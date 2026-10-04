import express from "express";
import {
  getMeetings,
  saveMeeting,
  deleteMeeting,
  recordMeetingJoin,
  markMeetingEnded,
} from "../controllers/meeting.js";

const routes = express.Router();
routes.get("/:userId", getMeetings);
routes.post("/:userId", saveMeeting);
routes.delete("/:userId/:roomId", deleteMeeting);
routes.post("/:userId/:roomId/join", recordMeetingJoin);
routes.post("/:userId/:roomId/end", markMeetingEnded);
export default routes;