import express from "express";
import { activateDemo, cancelSubscription, createOrder, getPlans, getSubscription, verifyPayment, getSubscribedChannels, toggleChannelSubscription } from "../controllers/subscription.js";

const routes = express.Router();
routes.get("/plans", getPlans);
routes.get("/channels/:userid", getSubscribedChannels);
routes.post("/channels/:userid/:channelid", toggleChannelSubscription);
routes.get("/:userid", getSubscription);
routes.post("/create-order", createOrder);
routes.post("/verify", verifyPayment);
routes.post("/demo-activate", activateDemo);
routes.post("/:userid/cancel", cancelSubscription);
export default routes;
