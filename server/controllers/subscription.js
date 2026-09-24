import crypto from "crypto";
import users from "../Modals/Auth.js";
import SubscriptionTransaction from "../Modals/Subscription.js";
import video from "../Modals/video.js";

export const PLANS = {
  Free: {
    name: "Free",
    price: 0,
    validityDays: 0,
    quality: "720p",
    downloadsPerDay: 1,
    benefits: ["Standard videos", "1 download per day", "Ads supported"],
  },
  Bronze: {
    name: "Bronze",
    price: 99,
    validityDays: 30,
    quality: "1080p",
    downloadsPerDay: 3,
    benefits: ["Premium videos", "3 downloads per day", "Higher quality"],
  },
  Silver: {
    name: "Silver",
    price: 199,
    validityDays: 30,
    quality: "1080p",
    downloadsPerDay: 10,
    benefits: ["All premium videos", "10 downloads per day", "Ad-free viewing"],
  },
  Gold: {
    name: "Gold",
    price: 399,
    validityDays: 30,
    quality: "4K",
    downloadsPerDay: 25,
    benefits: [
      "All platform features",
      "25 downloads per day",
      "Priority content",
    ],
  },
};

const validUser = (id) => /^[a-f\d]{24}$/i.test(String(id || ""));

const refreshSubscription = async (user) => {
  if (
    user.subscription?.plan !== "Free" &&
    user.subscription?.expiryDate &&
    new Date(user.subscription.expiryDate) <= new Date()
  ) {
    user.subscription = {
      plan: "Free",
      status: "expired",
      startDate: user.subscription.startDate,
      expiryDate: null,
      renewalDate: null,
      paymentId: "",
      orderId: "",
      amount: 0,
      currency: "INR",
      billingPeriod: "monthly",
    };
    await user.save();
  }
  return user;
};

export const getPlans = async (_req, res) =>
  res.status(200).json(Object.values(PLANS));

export const getSubscription = async (req, res) => {
  if (!validUser(req.params.userid))
    return res.status(400).json({ message: "Invalid user." });
  try {
    const user = await refreshSubscription(
      await users.findById(req.params.userid),
    );
    if (!user) return res.status(404).json({ message: "User not found." });
    const plan = PLANS[user.subscription?.plan || "Free"];
    return res
      .status(200)
      .json({
        subscription: user.subscription,
        plan,
        razorpayConfigured: Boolean(
          process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET,
        ),
        transactions: await SubscriptionTransaction.find({ userid: user._id })
          .sort({ createdAt: -1 })
          .limit(20),
      });
  } catch (error) {
    console.error("Subscription lookup error:", error);
    return res.status(500).json({ message: "Unable to load subscription." });
  }
};

export const createOrder = async (req, res) => {
  const { userid, plan: planName } = req.body;
  const plan = PLANS[planName];
  if (!validUser(userid) || !plan || plan.name === "Free")
    return res.status(400).json({ message: "Choose a paid plan." });
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)
    return res
      .status(503)
      .json({
        message:
          "Razorpay Test Mode is not configured. Use demo activation for local testing.",
      });
  try {
    const auth = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
    ).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: plan.price * 100,
        currency: "INR",
        receipt: `yuutube_${userid}_${Date.now()}`,
        notes: { userid, plan: planName },
      }),
    });
    const order = await response.json();
    if (!response.ok)
      return res
        .status(502)
        .json({
          message:
            order.error?.description || "Unable to create Razorpay order.",
        });
    await SubscriptionTransaction.create({
      userid,
      plan: planName,
      orderId: order.id,
      amount: plan.price,
      status: "created",
    });
    return res.status(200).json({ order, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error("Razorpay order error:", error);
    return res.status(502).json({ message: "Payment service unavailable." });
  }
};

const activateSubscription = async ({
  userid,
  planName,
  paymentId = "demo_payment",
  orderId = "demo_order",
}) => {
  const plan = PLANS[planName];
  const startDate = new Date();
  const expiryDate = new Date(
    startDate.getTime() + plan.validityDays * 86400000,
  );
  const user = await users.findById(userid);
  if (!user) throw new Error("User not found");
  user.subscription = {
    plan: planName,
    status: "active",
    startDate,
    expiryDate,
    renewalDate: expiryDate,
    paymentId,
    orderId,
    amount: plan.price,
    currency: "INR",
    billingPeriod: "monthly",
  };
  await user.save();
  await SubscriptionTransaction.findOneAndUpdate(
    { userid, orderId },
    {
      userid,
      plan: planName,
      paymentId,
      orderId,
      amount: plan.price,
      status: "paid",
      startDate,
      expiryDate,
    },
    { upsert: true, new: true },
  );
  return user;
};

export const verifyPayment = async (req, res) => {
  const {
    userid,
    plan: planName,
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
  } = req.body;
  if (
    !validUser(userid) ||
    !PLANS[planName] ||
    !razorpay_payment_id ||
    !razorpay_order_id ||
    !razorpay_signature
  )
    return res.status(400).json({ message: "Incomplete payment details." });
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  if (!process.env.RAZORPAY_KEY_SECRET || expected !== razorpay_signature)
    return res.status(400).json({ message: "Payment verification failed." });
  try {
    const user = await activateSubscription({
      userid,
      planName,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });
    return res.status(200).json({ subscription: user.subscription });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const activateDemo = async (req, res) => {
  const { userid, plan: planName } = req.body;
  if (!validUser(userid) || !PLANS[planName] || planName === "Free")
    return res.status(400).json({ message: "Choose a paid plan." });
  try {
    const user = await activateSubscription({ userid, planName });
    return res
      .status(200)
      .json({ subscription: user.subscription, demo: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const cancelSubscription = async (req, res) => {
  if (!validUser(req.params.userid))
    return res.status(400).json({ message: "Invalid user." });
  try {
    const user = await users.findById(req.params.userid);
    if (!user) return res.status(404).json({ message: "User not found." });
    user.subscription.status = "cancelled";
    user.subscription.renewalDate = null;
    await user.save();
    return res.status(200).json({ subscription: user.subscription });
  } catch (error) {
    return res.status(500).json({ message: "Unable to cancel subscription." });
  }
};

export const getSubscribedChannels = async (req, res) => {
  if (!validUser(req.params.userid))
    return res.status(400).json({ message: "Invalid user." });
  try {
    const user = await users
      .findById(req.params.userid)
      .populate("subscribedChannels", "name channelname image description");
    if (!user) return res.status(404).json({ message: "User not found." });
    return res.status(200).json(user.subscribedChannels || []);
  } catch (error) {
    return res.status(500).json({ message: "Unable to load subscriptions." });
  }
};

export const toggleChannelSubscription = async (req, res) => {
  const { userid, channelid } = req.params;
  if (!validUser(userid))
    return res.status(400).json({ message: "Invalid user." });
  try {
    const user = await users.findById(userid);
    if (!user) return res.status(404).json({ message: "User not found." });

    let resolvedChannelId = channelid;
    if (!validUser(resolvedChannelId) && req.body?.videoId) {
      const uploadedVideo = await video.findById(req.body.videoId);
      const matchedChannel = uploadedVideo
        ? await users.findOne({ channelname: uploadedVideo.videochanel })
        : null;
      if (uploadedVideo && matchedChannel) {
        resolvedChannelId = String(matchedChannel._id);
        uploadedVideo.uploader = resolvedChannelId;
        await uploadedVideo.save();
      }
    }

    if (!validUser(resolvedChannelId)) {
      return res
        .status(400)
        .json({ message: "This video is not linked to a channel yet." });
    }
    if (String(userid) === String(resolvedChannelId)) {
      return res
        .status(400)
        .json({ message: "You cannot subscribe to your own channel." });
    }

    const channel = await users.findById(resolvedChannelId);
    if (!channel)
      return res.status(404).json({ message: "Channel not found." });
    const currentChannels = user.subscribedChannels || [];
    const subscribed = currentChannels.some(
      (id) => String(id) === String(resolvedChannelId),
    );
    user.subscribedChannels = subscribed
      ? currentChannels.filter((id) => String(id) !== String(resolvedChannelId))
      : [...currentChannels, resolvedChannelId];
    await user.save();
    return res
      .status(200)
      .json({ subscribed: !subscribed, channelId: resolvedChannelId });
  } catch (error) {
    console.error("Channel subscription error:", error);
    return res.status(500).json({ message: "Unable to update subscription." });
  }
};
