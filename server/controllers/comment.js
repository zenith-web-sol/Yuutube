import mongoose from "mongoose";
import comment from "../Modals/comment.js";
import users from "../Modals/Auth.js";

const BLOCKED_WORDS = ["fuck", "shit", "bitch", "asshole"];
const REPORT_REASONS = ["Spam", "Harassment", "Offensive content", "Other"];
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MS = 15 * 1000;
const MAX_STRIKES = 3;
const CAPTCHA_EXPIRY_MINUTES = 5;

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const validateCommentText = (value) => {
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  if (text.length < 1 || text.length > 1000)
    return "Comments must be between 1 and 1000 characters.";
  if (/https?:\/\/|www\./i.test(text))
    return "Links are not allowed in comments.";
  return null;
};

const containsProfanity = (value) =>
  BLOCKED_WORDS.some((word) =>
    new RegExp(`\\b${word}\\b`, "i").test(String(value || "")),
  );

const generateCaptcha = () => {
  const operators = ["+", "-", "*"];
  const operator = operators[Math.floor(Math.random() * operators.length)];
  let a, b, answer;
  if (operator === "+") {
    a = Math.floor(Math.random() * 20) + 1;
    b = Math.floor(Math.random() * 20) + 1;
    answer = a + b;
  } else if (operator === "-") {
    a = Math.floor(Math.random() * 20) + 10;
    b = Math.floor(Math.random() * 10) + 1;
    answer = a - b;
  } else {
    a = Math.floor(Math.random() * 10) + 1;
    b = Math.floor(Math.random() * 10) + 1;
    answer = a * b;
  }
  return {
    question: `${a} ${operator} ${b}`,
    answer,
    expiresAt: new Date(Date.now() + CAPTCHA_EXPIRY_MINUTES * 60000),
  };
};

export const postcomment = async (req, res) => {
  const {
    videoid,
    userid,
    parentid = null,
    commentbody,
    usercommented,
    userimage,
    language,
    captchaAnswer,
  } = req.body;

  if (
    !isValidId(videoid) ||
    !isValidId(userid) ||
    (parentid && !isValidId(parentid))
  ) {
    return res.status(400).json({ message: "Invalid comment details." });
  }

  try {
    const commentingUser = await users.findById(userid);
    if (!commentingUser)
      return res.status(404).json({ message: "User not found." });

    // Gate: if this account is flagged, a correctly-solved CAPTCHA must
    // accompany every comment from here on.
    if (commentingUser.requiresCaptcha) {
      if (
        captchaAnswer === undefined ||
        captchaAnswer === null ||
        captchaAnswer === ""
      ) {
        const challenge = generateCaptcha();
        commentingUser.pendingCommentCaptcha = challenge;
        await commentingUser.save();
        return res.status(428).json({
          captchaRequired: true,
          question: challenge.question,
          message: "Please solve this to continue commenting.",
        });
      }

      const pending = commentingUser.pendingCommentCaptcha;
      const expired = !pending || new Date(pending.expiresAt) < new Date();
      const wrong = !expired && Number(captchaAnswer) !== pending.answer;

      if (expired || wrong) {
        const challenge = generateCaptcha();
        commentingUser.pendingCommentCaptcha = challenge;
        await commentingUser.save();
        return res.status(400).json({
          captchaRequired: true,
          question: challenge.question,
          message: expired
            ? "That expired. Solve this one instead."
            : "That wasn't right. Try this one instead.",
        });
      }

      commentingUser.pendingCommentCaptcha = null;
      await commentingUser.save();
    }

    const textError = validateCommentText(commentbody);
    if (textError) return res.status(400).json({ message: textError });

    if (containsProfanity(commentbody)) {
      commentingUser.profanityStrikes += 1;
      let message = `Please keep comments respectful. (Strike ${commentingUser.profanityStrikes}/${MAX_STRIKES})`;
      if (
        commentingUser.profanityStrikes >= MAX_STRIKES &&
        !commentingUser.requiresCaptcha
      ) {
        commentingUser.requiresCaptcha = true;
        message =
          "Your account has been flagged for repeated inappropriate language. You'll need to solve a quick check before your next comment.";
      }
      await commentingUser.save();
      return res.status(400).json({
        message,
        flagged: commentingUser.requiresCaptcha,
        strikes: commentingUser.profanityStrikes,
      });
    }

    if (parentid) {
      const parent = await comment.findOne({ _id: parentid, videoid });
      if (!parent)
        return res
          .status(404)
          .json({ message: "Parent comment was not found." });
    }

    const normalizedBody = commentbody.trim().replace(/\s+/g, " ");
    const duplicate = await comment.findOne({
      videoid,
      userid,
      parentid,
      commentbody: normalizedBody,
    });
    if (duplicate)
      return res
        .status(409)
        .json({ message: "You have already posted this comment." });

    const recent = await comment.findOne({
      videoid,
      userid,
      createdAt: { $gte: new Date(Date.now() - RATE_LIMIT_MS) },
    });
    if (recent)
      return res.status(429).json({
        message: "Please wait a few seconds before commenting again.",
      });

    const savedComment = await comment.create({
      videoid,
      userid,
      parentid,
      commentbody: normalizedBody,
      usercommented: String(usercommented || "User").trim(),
      userimage: userimage || "",
      language: language || "",
    });
    return res.status(201).json({ comment: true, commentData: savedComment });
  } catch (error) {
    console.error("Create comment error:", error);
    return res.status(500).json({ message: "Unable to post your comment." });
  }
};

export const getallcomment = async (req, res) => {
  const { videoid } = req.params;
  const { sort = "newest" } = req.query;
  if (!isValidId(videoid))
    return res.status(400).json({ message: "Invalid video." });
  const sorting =
    sort === "oldest"
      ? { createdAt: 1 }
      : sort === "mostliked"
        ? { likes: -1, createdAt: -1 }
        : { createdAt: -1 };
  try {
    const comments = await comment.find({ videoid }).sort(sorting).lean();
    return res.status(200).json(comments);
  } catch (error) {
    console.error("Get comments error:", error);
    return res.status(500).json({ message: "Unable to load comments." });
  }
};

export const editcomment = async (req, res) => {
  const { id } = req.params;
  const { userid, commentbody } = req.body;
  const textError = validateCommentText(commentbody);
  if (textError) return res.status(400).json({ message: textError });
  if (containsProfanity(commentbody))
    return res
      .status(400)
      .json({ message: "Please keep comments respectful." });
  if (!isValidId(id) || !isValidId(userid))
    return res.status(400).json({ message: "Invalid comment." });
  try {
    const existing = await comment.findById(id);
    if (!existing)
      return res.status(404).json({ message: "Comment not found." });
    if (String(existing.userid) !== String(userid))
      return res
        .status(403)
        .json({ message: "You can only edit your own comments." });
    if (Date.now() - new Date(existing.createdAt).getTime() > EDIT_WINDOW_MS) {
      return res
        .status(403)
        .json({ message: "Comments can only be edited within 15 minutes." });
    }
    existing.commentbody = commentbody.trim().replace(/\s+/g, " ");
    existing.editedAt = new Date();
    await existing.save();
    return res.status(200).json({ comment: existing });
  } catch (error) {
    console.error("Edit comment error:", error);
    return res.status(500).json({ message: "Unable to edit your comment." });
  }
};

export const deletecomment = async (req, res) => {
  const { id } = req.params;
  const { userid } = req.body;
  if (!isValidId(id) || !isValidId(userid))
    return res.status(400).json({ message: "Invalid comment." });
  try {
    const existing = await comment.findById(id);
    if (!existing)
      return res.status(404).json({ message: "Comment not found." });
    if (String(existing.userid) !== String(userid))
      return res
        .status(403)
        .json({ message: "You can only delete your own comments." });
    const hasReplies = await comment.exists({ parentid: id });
    if (hasReplies) {
      existing.commentbody = "Comment deleted by author.";
      existing.isDeleted = true;
      await existing.save();
    } else {
      await comment.findByIdAndDelete(id);
    }
    return res
      .status(200)
      .json({ comment: true, keptForReplies: Boolean(hasReplies) });
  } catch (error) {
    console.error("Delete comment error:", error);
    return res.status(500).json({ message: "Unable to delete your comment." });
  }
};

export const reactToComment = async (req, res) => {
  const { id } = req.params;
  const { userid, reaction } = req.body;
  if (
    !isValidId(id) ||
    !isValidId(userid) ||
    !["like", "dislike"].includes(reaction)
  ) {
    return res.status(400).json({ message: "Invalid reaction." });
  }
  try {
    const existing = await comment.findById(id);
    if (!existing)
      return res.status(404).json({ message: "Comment not found." });
    const field = reaction === "like" ? "likes" : "dislikes";
    const otherField = reaction === "like" ? "dislikes" : "likes";
    const alreadyReacted = existing[field].some(
      (idValue) => String(idValue) === String(userid),
    );
    existing[otherField] = existing[otherField].filter(
      (idValue) => String(idValue) !== String(userid),
    );
    existing[field] = alreadyReacted
      ? existing[field].filter((idValue) => String(idValue) !== String(userid))
      : [...existing[field], userid];
    await existing.save();
    return res.status(200).json({ comment: existing });
  } catch (error) {
    console.error("React to comment error:", error);
    return res.status(500).json({ message: "Unable to save reaction." });
  }
};

export const reportComment = async (req, res) => {
  const { id } = req.params;
  const { userid, reason } = req.body;
  if (
    !isValidId(id) ||
    !isValidId(userid) ||
    !REPORT_REASONS.includes(reason)
  ) {
    return res.status(400).json({ message: "Invalid report." });
  }
  try {
    const existing = await comment.findById(id);
    if (!existing)
      return res.status(404).json({ message: "Comment not found." });
    if (
      existing.reports.some(
        (report) => String(report.userid) === String(userid),
      )
    ) {
      return res
        .status(409)
        .json({ message: "You have already reported this comment." });
    }
    existing.reports.push({ userid, reason });
    existing.isFlagged = true;
    await existing.save();
    return res.status(200).json({ reported: true });
  } catch (error) {
    console.error("Report comment error:", error);
    return res.status(500).json({ message: "Unable to report this comment." });
  }
};
