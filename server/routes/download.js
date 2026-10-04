import express from "express";
import {
  getDownloads,
  addDownload,
  removeDownload,
} from "../controllers/download.js";

const routes = express.Router();
routes.get("/:userid", getDownloads);
routes.post("/:userid/:videoid", addDownload);
routes.delete("/:userid/:videoid", removeDownload);
export default routes;
