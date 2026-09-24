import mongoose from "mongoose";
import users from "../Modals/Auth.js";

const getClientIp = (req) =>
  String(
    req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",
  )
    .split(",")[0]
    .trim();
const parseBrowser = (userAgent = "") =>
  /Edg\//i.test(userAgent)
    ? "Microsoft Edge"
    : /Chrome\//i.test(userAgent)
      ? "Google Chrome"
      : /Firefox\//i.test(userAgent)
        ? "Mozilla Firefox"
        : /Safari\//i.test(userAgent)
          ? "Safari"
          : "Unknown browser";
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

const deviceSignature = (record) =>
  `${record.browser}|${record.operatingSystem}|${record.deviceType}`;

const buildLoginRecord = (req, existingUser) => {
  const userAgent = String(req.headers["user-agent"] || "");
  const browser = parseBrowser(userAgent);
  const operatingSystem = parseOS(userAgent);
  const deviceType = parseDeviceType(userAgent);
  const known = existingUser?.loginHistory?.some(
    (record) =>
      record.browser === browser &&
      record.operatingSystem === operatingSystem &&
      record.deviceType === deviceType,
  );
  return {
    loginAt: new Date(),
    ipAddress: getClientIp(req),
    browser,
    operatingSystem,
    deviceType,
    userAgent,
    isNewDevice: !known,
    trusted: Boolean(known),
  };
};

export const login = async (req, res) => {
  const { email, name, image } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required." });
  try {
    let existingUser = await users.findOne({ email });
    if (!existingUser)
      existingUser = await users.create({ email, name, image });
    const loginRecord = buildLoginRecord(req, existingUser);
    const previousLogins = existingUser.loginHistory || [];
    const deviceIndex = previousLogins.findIndex(
      (record) =>
        record.browser === loginRecord.browser &&
        record.operatingSystem === loginRecord.operatingSystem &&
        record.deviceType === loginRecord.deviceType,
    );
    if (deviceIndex >= 0) {
      const previousRecord = previousLogins[deviceIndex];
      previousLogins[deviceIndex] = {
        ...loginRecord,
        _id: previousRecord._id,
        isNewDevice: false,
        trusted: previousRecord.trusted,
      };
    } else {
      previousLogins.unshift(loginRecord);
    }
    existingUser.loginHistory = previousLogins
      .sort(
        (a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime(),
      )
      .slice(0, 25);
    if (name) existingUser.name = name;
    if (image) existingUser.image = image;
    await existingUser.save();
    return res.status(200).json({
      result: existingUser,
      securityNotice: loginRecord.isNewDevice
        ? "New browser or device detected."
        : null,
    });
  } catch (error) {
    console.error("Login error:", error);
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
    const userdata = await users.findById(id).select("-loginHistory.userAgent");
    if (!userdata) return res.status(404).json({ message: "User not found." });
    return res.status(200).json(userdata);
  } catch (error) {
    console.error("Get user error:", error);
    return res.status(500).json({ message: "Something went wrong." });
  }
};

export const getSecurityHistory = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid user." });
  try {
    const userdata = await users
      .findById(id)
      .select("email loginHistory themePreference");
    if (!userdata) return res.status(404).json({ message: "User not found." });

    const requestUserAgent = String(req.headers["user-agent"] || "");
    const requestSignature = `${parseBrowser(requestUserAgent)}|${parseOS(requestUserAgent)}|${parseDeviceType(requestUserAgent)}`;

    const latestPerDevice = new Map();
    for (const record of userdata.loginHistory || []) {
      const signature = deviceSignature(record);
      const existing = latestPerDevice.get(signature);
      if (!existing || new Date(record.loginAt) > new Date(existing.loginAt)) {
        latestPerDevice.set(signature, record);
      }
    }

    const loginHistory = Array.from(latestPerDevice.entries())
      .map(([signature, record]) => ({
        _id: record._id,
        loginAt: record.loginAt,
        ipAddress: record.ipAddress,
        browser: record.browser,
        operatingSystem: record.operatingSystem,
        deviceType: record.deviceType,
        city: record.city,
        state: record.state,
        country: record.country,
        isNewDevice: record.isNewDevice,
        trusted: record.trusted,
        isCurrentDevice: signature === requestSignature,
      }))
      .sort((a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime());

    return res
      .status(200)
      .json({
        email: userdata.email,
        themePreference: userdata.themePreference,
        loginHistory,
      });
  } catch (error) {
    console.error("Security history error:", error);
    return res
      .status(500)
      .json({ message: "Unable to load security history." });
  }
};
