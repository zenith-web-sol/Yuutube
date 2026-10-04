import mongoose from "mongoose";
import nodemailer from "nodemailer";
import users from "../Modals/Auth.js";

const TRUSTED_DEVICE_DAYS = 30;
const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;

const getTransporter = () =>
  nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

const getClientIp = (req) =>
  String(
    req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",
  )
    .split(",")[0]
    .trim();

const parseBrowserInfo = (userAgent = "") => {
  const edge = userAgent.match(/Edg\/([\d.]+)/i);
  if (edge) return { name: "Microsoft Edge", version: edge[1] };
  const chrome = userAgent.match(/Chrome\/([\d.]+)/i);
  if (chrome) return { name: "Google Chrome", version: chrome[1] };
  const firefox = userAgent.match(/Firefox\/([\d.]+)/i);
  if (firefox) return { name: "Mozilla Firefox", version: firefox[1] };
  const safari = userAgent.match(/Version\/([\d.]+).*Safari/i);
  if (safari) return { name: "Safari", version: safari[1] };
  return { name: "Unknown browser", version: "" };
};

const parseOS = (userAgent = "") =>
  /Windows/i.test(userAgent)
    ? "Windows"
    : /Android/i.test(userAgent)
      ? "Android"
      : /iPhone|iPad/i.test(userAgent)
        ? "iOS"
        : /Mac OS/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "Unknown OS";

const parseDeviceType = (userAgent = "") =>
  /Mobi|Android|iPhone/i.test(userAgent)
    ? "Mobile"
    : /Tablet|iPad/i.test(userAgent)
      ? "Tablet"
      : "Desktop";

const parseDeviceModel = (userAgent = "") => {
  const androidModel = userAgent.match(/Android[^;]*;\s*([^;)]+)\)/i);
  if (androidModel) return androidModel[1].trim();
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  return "";
};

const isPrivateOrLocalIp = (ip) =>
  !ip ||
  ip === "unknown" ||
  ip === "::1" ||
  ip === "127.0.0.1" ||
  ip.startsWith("192.168.") ||
  ip.startsWith("10.");

const getGeoLocation = async (ip) => {
  if (isPrivateOrLocalIp(ip)) {
    return {
      city: "Unavailable",
      state: "Unavailable",
      country: "Unavailable",
      lat: null,
      lon: null,
    };
  }
  try {
    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,city,regionName,country,lat,lon`,
    );
    const data = await response.json();
    if (data.status !== "success") {
      return {
        city: "Unavailable",
        state: "Unavailable",
        country: "Unavailable",
        lat: null,
        lon: null,
      };
    }
    return {
      city: data.city || "Unavailable",
      state: data.regionName || "Unavailable",
      country: data.country || "Unavailable",
      lat: data.lat ?? null,
      lon: data.lon ?? null,
    };
  } catch (error) {
    console.error("Geolocation lookup failed:", error);
    return {
      city: "Unavailable",
      state: "Unavailable",
      country: "Unavailable",
      lat: null,
      lon: null,
    };
  }
};

const deviceSignature = (record) =>
  `${record.ipAddress}|${record.browser}|${record.operatingSystem}|${record.deviceType}|${record.city}|${record.state}`;

const isRecordTrusted = (record) =>
  !record.trustedUntil || new Date(record.trustedUntil) > new Date();

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const sendOtpEmail = async (toEmail, code) => {
  await getTransporter().sendMail({
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: "Your YuuTube sign-in code",
    text: `Your verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes. If you didn't request this, you can safely ignore this email.`,
  });
};

const maskEmail = (email) => email.replace(/^(.{2}).+(@.+)$/, "$1***$2");

export const login = async (req, res) => {
  const { email, name, image } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required." });
  try {
    let existingUser = await users.findOne({ email });
    if (!existingUser)
      existingUser = await users.create({ email, name, image });

    const userAgent = String(req.headers["user-agent"] || "");
    const { name: browser, version: browserVersion } =
      parseBrowserInfo(userAgent);
    const operatingSystem = parseOS(userAgent);
    const deviceType = parseDeviceType(userAgent);
    const deviceModel = parseDeviceModel(userAgent);
    const ipAddress = getClientIp(req);
    const geo = await getGeoLocation(ipAddress);

    const candidateRecord = {
      loginAt: new Date(),
      ipAddress,
      browser,
      browserVersion,
      operatingSystem,
      deviceType,
      deviceModel,
      city: geo.city,
      state: geo.state,
      country: geo.country,
      latitude: geo.lat,
      longitude: geo.lon,
      userAgent,
    };

    if (name) existingUser.name = name;
    if (image) existingUser.image = image;

    const signature = deviceSignature(candidateRecord);
    const previousLogins = existingUser.loginHistory || [];
    const trustedMatchIndex = previousLogins.findIndex(
      (record) =>
        deviceSignature(record) === signature && isRecordTrusted(record),
    );

    if (trustedMatchIndex >= 0) {
      // Known, still-trusted device — log straight in, refresh the record.
      previousLogins[trustedMatchIndex] = {
        ...candidateRecord,
        _id: previousLogins[trustedMatchIndex]._id,
        isNewDevice: false,
        trusted: true,
        trustedUntil: new Date(Date.now() + TRUSTED_DEVICE_DAYS * 86400000),
      };
      existingUser.loginHistory = previousLogins
        .sort(
          (a, b) =>
            new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime(),
        )
        .slice(0, 25);
      existingUser.pendingOtp = null;
      await existingUser.save();
      return res
        .status(200)
        .json({ result: existingUser, securityNotice: null });
    }

    // New or expired-trust device signature — require OTP before logging in.
    const code = generateOtp();
    existingUser.pendingOtp = {
      code,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000),
      attempts: 0,
      deviceSnapshot: candidateRecord,
    };
    await existingUser.save();

    try {
      await sendOtpEmail(email, code);
    } catch (mailError) {
      console.error("Failed to send OTP email:", mailError);
      return res
        .status(502)
        .json({
          message: "Unable to send verification code. Please try again.",
        });
    }

    return res.status(200).json({
      otpRequired: true,
      message: `We noticed a new sign-in. Enter the code sent to ${maskEmail(email)} to continue.`,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

export const verifyOtp = async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code)
    return res.status(400).json({ message: "Email and code are required." });
  try {
    const existingUser = await users.findOne({ email });
    if (!existingUser || !existingUser.pendingOtp?.code) {
      return res
        .status(400)
        .json({
          message: "No pending verification found. Please sign in again.",
        });
    }
    const pending = existingUser.pendingOtp;

    if (new Date(pending.expiresAt) < new Date()) {
      existingUser.pendingOtp = null;
      await existingUser.save();
      return res
        .status(400)
        .json({
          message:
            "This code has expired. Please sign in again to receive a new one.",
        });
    }

    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
      existingUser.pendingOtp = null;
      await existingUser.save();
      return res
        .status(429)
        .json({
          message:
            "Too many incorrect attempts. Please sign in again to receive a new code.",
        });
    }

    if (String(code).trim() !== pending.code) {
      pending.attempts += 1;
      existingUser.pendingOtp = pending;
      existingUser.failedOtpAttempts = [
        {
          attemptedAt: new Date(),
          ipAddress: pending.deviceSnapshot?.ipAddress || "unknown",
          browser: pending.deviceSnapshot?.browser || "",
          operatingSystem: pending.deviceSnapshot?.operatingSystem || "",
          reason: "Incorrect code",
        },
        ...(existingUser.failedOtpAttempts || []),
      ].slice(0, 25);
      await existingUser.save();
      return res.status(400).json({
        message: "Incorrect code. Please try again.",
        attemptsRemaining: MAX_OTP_ATTEMPTS - pending.attempts,
      });
    }

    // Correct code — finalize login and mark device trusted.
    const record = pending.deviceSnapshot;
    const signature = deviceSignature(record);
    const previousLogins = existingUser.loginHistory || [];
    const idx = previousLogins.findIndex(
      (r) => deviceSignature(r) === signature,
    );
    const finalRecord = {
      ...record,
      _id: idx >= 0 ? previousLogins[idx]._id : undefined,
      isNewDevice: idx < 0,
      trusted: true,
      trustedUntil: new Date(Date.now() + TRUSTED_DEVICE_DAYS * 86400000),
    };
    if (idx >= 0) previousLogins[idx] = finalRecord;
    else previousLogins.unshift(finalRecord);

    existingUser.loginHistory = previousLogins
      .sort(
        (a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime(),
      )
      .slice(0, 25);
    existingUser.pendingOtp = null;
    await existingUser.save();

    return res.status(200).json({
      result: existingUser,
      securityNotice: "New browser or device verified successfully.",
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

export const updateprofile = async (req, res) => {
  const { id: _id } = req.params;
  const { channelname, description, themePreference } = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id))
    return res.status(400).json({ message: "User unavailable." });
  const updates = { channelname, description };
  if (["light", "dark", "system"].includes(themePreference))
    updates.themePreference = themePreference;
  try {
    const updatedata = await users.findByIdAndUpdate(
      _id,
      { $set: updates },
      { new: true },
    );
    return res.status(200).json(updatedata);
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

export const getUserById = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid user." });
  try {
    const userdata = await users
      .findById(id)
      .select("-loginHistory.userAgent -pendingOtp -pendingCommentCaptcha.answer");
    if (!userdata) return res.status(404).json({ message: "User not found." });
    return res.status(200).json(userdata);
  } catch (error) {
    console.error("Get user error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

const sessionSignature = (record) =>
  `${record.ipAddress}|${record.browser}|${record.operatingSystem}|${record.deviceType}`;

export const getSecurityHistory = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid user." });
  try {
    const userdata = await users
      .findById(id)
      .select("email loginHistory failedOtpAttempts themePreference");
    if (!userdata) return res.status(404).json({ message: "User not found." });

    const requestUserAgent = String(req.headers["user-agent"] || "");
    const requestIp = getClientIp(req);
    const requestSignature = `${requestIp}|${parseBrowserInfo(requestUserAgent).name}|${parseOS(requestUserAgent)}|${parseDeviceType(requestUserAgent)}`;

    const latestPerDevice = new Map();
    for (const record of userdata.loginHistory || []) {
      const signature = deviceSignature(record);
      const existing = latestPerDevice.get(signature);
      if (!existing || new Date(record.loginAt) > new Date(existing.loginAt)) {
        latestPerDevice.set(signature, record);
      }
    }

    const loginHistory = Array.from(latestPerDevice.values())
      .map((record) => ({
        _id: record._id,
        loginAt: record.loginAt,
        ipAddress: record.ipAddress,
        browser: record.browser,
        browserVersion: record.browserVersion,
        operatingSystem: record.operatingSystem,
        deviceType: record.deviceType,
        deviceModel: record.deviceModel,
        city: record.city,
        state: record.state,
        country: record.country,
        isNewDevice: record.isNewDevice,
        trusted: record.trusted,
        trustedUntil: record.trustedUntil,
        isCurrentDevice: sessionSignature(record) === requestSignature,
      }))
      .sort(
        (a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime(),
      );

    return res.status(200).json({
      email: userdata.email,
      themePreference: userdata.themePreference,
      loginHistory,
      failedOtpAttempts: (userdata.failedOtpAttempts || []).sort(
        (a, b) =>
          new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime(),
      ),
    });
  } catch (error) {
    console.error("Security history error:", error);
    return res
      .status(500)
      .json({ message: "Unable to load security history." });
  }
};

