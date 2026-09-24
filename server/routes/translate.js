import express from "express";
import { translateText } from "../controllers/translate.js";

const routes = express.Router();
routes.post("/", translateText);
export default routes;