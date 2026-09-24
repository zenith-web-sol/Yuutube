import express from "express";
import { handlelike, getallLikedVideo, getReaction } from "../controllers/like.js";

const routes = express.Router();
routes.get("/:userId", getallLikedVideo);
routes.get("/:userId/video/:videoId", getReaction);
routes.post("/:videoId", handlelike);
export default routes;
