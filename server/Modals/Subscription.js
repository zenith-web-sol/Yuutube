import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  userid: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  plan: { type: String, required: true },
  paymentId: { type: String, default: "" },
  orderId: { type: String, default: "" },
  amount: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  status: { type: String, enum: ["created", "paid", "failed", "cancelled"], default: "created" },
  startDate: { type: Date, default: null },
  expiryDate: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model("subscriptionTransaction", transactionSchema);
