import express from "express";
import {
  deletecomment,
  editcomment,
  getallcomment,
  postcomment,
  reactToComment,
  reportComment,
} from "../controllers/comment.js";

const routes = express.Router();

routes.get("/:videoid", getallcomment);
routes.post("/postcomment", postcomment);
routes.post("/:id/reaction", reactToComment);
routes.post("/:id/report", reportComment);
routes.post("/editcomment/:id", editcomment);
routes.delete("/deletecomment/:id", deletecomment);

export default routes;
