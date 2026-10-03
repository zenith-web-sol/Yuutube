import mongoose from "mongoose";

const loginRecordSchema = new mongoose.Schema(
  {
    loginAt: { type: Date, default: Date.now },
    ipAddress: { type: String, default: "unknown" },
    browser: { type: String, default: "Unknown browser" },
    browserVersion: { type: String, default: "" },
    operatingSystem: { type: String, default: "Unknown OS" },
    deviceType: { type: String, default: "Desktop" },
    deviceModel: { type: String, default: "" },
    city: { type: String, default: "Unavailable" },
    state: { type: String, default: "Unavailable" },
    country: { type: String, default: "Unavailable" },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    userAgent: { type: String, default: "" },
    isNewDevice: { type: Boolean, default: false },
    trusted: { type: Boolean, default: false },
    trustedUntil: { type: Date, default: null },
  },
  { _id: true },
);

const failedOtpAttemptSchema = new mongoose.Schema(
  {
    attemptedAt: { type: Date, default: Date.now },
    ipAddress: { type: String, default: "unknown" },
    browser: { type: String, default: "" },
    operatingSystem: { type: String, default: "" },
    reason: { type: String, default: "" },
  },
  { _id: false },
);

const pendingOtpSchema = new mongoose.Schema(
  {
    code: { type: String },
    expiresAt: { type: Date },
    attempts: { type: Number, default: 0 },
    deviceSnapshot: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

const pendingCommentCaptchaSchema = new mongoose.Schema(
  {
    question: { type: String },
    answer: { type: Number },
    expiresAt: { type: Date },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String },
  channelname: { type: String },
  description: { type: String },
  image: { type: String },
  themePreference: {
    type: String,
    enum: ["light", "dark", "system"],
    default: "system",
  },
  subscription: {
    plan: {
      type: String,
      enum: ["Free", "Bronze", "Silver", "Gold"],
      default: "Free",
    },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled"],
      default: "active",
    },
    startDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    renewalDate: { type: Date, default: null },
    paymentId: { type: String, default: "" },
    orderId: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    billingPeriod: { type: String, default: "monthly" },
  },
  subscribedChannels: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
  loginHistory: { type: [loginRecordSchema], default: [] },
  failedOtpAttempts: { type: [failedOtpAttemptSchema], default: [] },
  pendingOtp: { type: pendingOtpSchema, default: null },
  profanityStrikes: { type: Number, default: 0 },
  requiresCaptcha: { type: Boolean, default: false },
  pendingCommentCaptcha: { type: pendingCommentCaptchaSchema, default: null },
  joinedon: { type: Date, default: Date.now },
});

export default mongoose.model("user", userSchema);
