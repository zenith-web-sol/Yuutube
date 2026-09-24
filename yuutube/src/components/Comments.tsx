import {
  Flag,
  Languages,
  MessageCircle,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

interface Comment {
  _id: string;
  videoid: string;
  userid: string;
  parentid?: string | null;
  commentbody: string;
  usercommented: string;
  userimage?: string;
  commentedon: string;
  createdAt: string;
  editedAt?: string | null;
  isDeleted?: boolean;
  likes?: string[];
  dislikes?: string[];
}

const TRANSLATE_LANGUAGES = [
  { code: "sq", label: "Albanian" },
  { code: "am", label: "Amharic" },
  { code: "ar", label: "Arabic" },
  { code: "hy", label: "Armenian" },
  { code: "as", label: "Assamese" },
  { code: "az", label: "Azerbaijani" },
  { code: "eu", label: "Basque" },
  { code: "be", label: "Belarusian" },
  { code: "bn", label: "Bengali" },
  { code: "bs", label: "Bosnian" },
  { code: "bg", label: "Bulgarian" },
  { code: "my", label: "Burmese" },
  { code: "ca", label: "Catalan" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "zh-TW", label: "Chinese (Traditional)" },
  { code: "hr", label: "Croatian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "nl", label: "Dutch" },
  { code: "en", label: "English" },
  { code: "eo", label: "Esperanto" },
  { code: "et", label: "Estonian" },
  { code: "fi", label: "Finnish" },
  { code: "fr", label: "French" },
  { code: "gl", label: "Galician" },
  { code: "ka", label: "Georgian" },
  { code: "de", label: "German" },
  { code: "el", label: "Greek" },
  { code: "gu", label: "Gujarati" },
  { code: "ht", label: "Haitian Creole" },
  { code: "ha", label: "Hausa" },
  { code: "he", label: "Hebrew" },
  { code: "hi", label: "Hindi" },
  { code: "hu", label: "Hungarian" },
  { code: "is", label: "Icelandic" },
  { code: "ig", label: "Igbo" },
  { code: "id", label: "Indonesian" },
  { code: "ga", label: "Irish" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "jv", label: "Javanese" },
  { code: "kn", label: "Kannada" },
  { code: "kk", label: "Kazakh" },
  { code: "km", label: "Khmer" },
  { code: "ko", label: "Korean" },
  { code: "ku", label: "Kurdish" },
  { code: "ky", label: "Kyrgyz" },
  { code: "lo", label: "Lao" },
  { code: "lv", label: "Latvian" },
  { code: "lt", label: "Lithuanian" },
  { code: "lb", label: "Luxembourgish" },
  { code: "mk", label: "Macedonian" },
  { code: "mg", label: "Malagasy" },
  { code: "ms", label: "Malay" },
  { code: "ml", label: "Malayalam" },
  { code: "mt", label: "Maltese" },
  { code: "mi", label: "Maori" },
  { code: "mr", label: "Marathi" },
  { code: "mn", label: "Mongolian" },
  { code: "ne", label: "Nepali" },
  { code: "no", label: "Norwegian" },
  { code: "or", label: "Odia" },
  { code: "ps", label: "Pashto" },
  { code: "fa", label: "Persian" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Portuguese" },
  { code: "pa", label: "Punjabi" },
  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "sm", label: "Samoan" },
  { code: "gd", label: "Scots Gaelic" },
  { code: "sr", label: "Serbian" },
  { code: "sn", label: "Shona" },
  { code: "sd", label: "Sindhi" },
  { code: "si", label: "Sinhala" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "so", label: "Somali" },
  { code: "es", label: "Spanish" },
  { code: "su", label: "Sundanese" },
  { code: "sw", label: "Swahili" },
  { code: "sv", label: "Swedish" },
  { code: "tl", label: "Tagalog" },
  { code: "tg", label: "Tajik" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "th", label: "Thai" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
  { code: "ur", label: "Urdu" },
  { code: "uz", label: "Uzbek" },
  { code: "vi", label: "Vietnamese" },
  { code: "cy", label: "Welsh" },
  { code: "xh", label: "Xhosa" },
  { code: "yi", label: "Yiddish" },
  { code: "yo", label: "Yoruba" },
  { code: "zu", label: "Zulu" },
];

const Comments = ({ videoId }: { videoId: string }) => {
  const { user } = useUser();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [sort, setSort] = useState("newest");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<Record<string, boolean>>({});
  const [translateLangFor, setTranslateLangFor] = useState<
    Record<string, string>
  >({});

  const loadComments = async () => {
    try {
      const res = await axiosInstance.get(`/comment/${videoId}?sort=${sort}`);
      setComments(res.data);
    } catch {
      setMessage("Unable to load comments.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setLoading(true);
    loadComments();
  }, [videoId, sort]);
  const roots = useMemo(
    () => comments.filter((comment) => !comment.parentid),
    [comments],
  );
  const replies = (id: string) =>
    comments.filter((comment) => String(comment.parentid) === id);
  const error = (err: any) =>
    err?.response?.data?.message || "Something went wrong. Please try again.";

  const submit = async (parentid: string | null = null) => {
    if (!user || !text.trim()) return;
    try {
      const res = await axiosInstance.post("/comment/postcomment", {
        videoid: videoId,
        userid: user._id,
        parentid,
        commentbody: text,
        usercommented: user.name,
        userimage: user.image,
        language: navigator.language,
      });
      setComments((previous) => [res.data.commentData, ...previous]);
      setText("");
      setReplyTo(null);
      setMessage("");
    } catch (err) {
      setMessage(error(err));
    }
  };
  const react = async (id: string, reaction: "like" | "dislike") => {
    if (!user) return setMessage("Sign in to react.");
    try {
      const res = await axiosInstance.post(`/comment/${id}/reaction`, {
        userid: user._id,
        reaction,
      });
      setComments((all) =>
        all.map((item) => (item._id === id ? res.data.comment : item)),
      );
    } catch (err) {
      setMessage(error(err));
    }
  };
  const remove = async (id: string) => {
    if (!user) return;
    try {
      const res = await axiosInstance.delete(`/comment/deletecomment/${id}`, {
        data: { userid: user._id },
      });
      if (res.data.keptForReplies)
        setComments((all) =>
          all.map((item) =>
            item._id === id
              ? {
                  ...item,
                  isDeleted: true,
                  commentbody: "Comment deleted by author.",
                }
              : item,
          ),
        );
      else setComments((all) => all.filter((item) => item._id !== id));
    } catch (err) {
      setMessage(error(err));
    }
  };
  const saveEdit = async (id: string) => {
    if (!user || !text.trim()) return;
    try {
      const res = await axiosInstance.post(`/comment/editcomment/${id}`, {
        userid: user._id,
        commentbody: text,
      });
      setComments((all) =>
        all.map((item) => (item._id === id ? res.data.comment : item)),
      );
      setEditing(null);
      setText("");
    } catch (err) {
      setMessage(error(err));
    }
  };
  const report = async (id: string) => {
    if (!user) return setMessage("Sign in to report.");
    const reason = window.prompt(
      "Reason: Spam, Harassment, Offensive content, or Other",
      "Spam",
    );
    if (!reason) return;
    try {
      await axiosInstance.post(`/comment/${id}/report`, {
        userid: user._id,
        reason,
      });
      setMessage("Thanks. The comment has been flagged for review.");
    } catch (err) {
      setMessage(error(err));
    }
  };
  const startEdit = (comment: Comment) => {
    setEditing(comment._id);
    setReplyTo(null);
    setText(comment.commentbody);
  };

  const translateComment = async (comment: Comment) => {
    const targetLang = translateLangFor[comment._id] || "hi";
    setTranslating((prev) => ({ ...prev, [comment._id]: true }));
    try {
      const res = await axiosInstance.post("/translate", {
        text: comment.commentbody,
        targetLang,
      });
      setTranslations((prev) => ({
        ...prev,
        [comment._id]: res.data.translatedText,
      }));
    } catch (err) {
      setMessage(error(err));
    } finally {
      setTranslating((prev) => ({ ...prev, [comment._id]: false }));
    }
  };
  const clearTranslation = (id: string) => {
    setTranslations((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const writeBox = (action: () => void, placeholder: string) => (
    <div className="mt-2 space-y-2">
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        className="min-h-20"
        maxLength={1000}
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            setText("");
            setReplyTo(null);
            setEditing(null);
          }}
        >
          Cancel
        </Button>
        <Button onClick={action} disabled={!text.trim()}>
          Post
        </Button>
      </div>
    </div>
  );
  const item = (comment: Comment, nested = false) => (
    <div
      key={comment._id}
      className={nested ? "ml-5 border-l pl-4 sm:ml-10" : ""}
    >
      <div className="flex gap-3 py-3">
        <Avatar className="h-9 w-9">
          <AvatarImage src={comment.userimage || ""} />
          <AvatarFallback>{comment.usercommented?.[0] || "U"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{comment.usercommented}</span>
            <span className="text-muted-foreground">
              {formatDistanceToNow(
                new Date(comment.createdAt || comment.commentedon),
              )}{" "}
              ago
            </span>
            {comment.editedAt && (
              <span className="text-muted-foreground">(edited)</span>
            )}
          </div>
          {editing === comment._id ? (
            writeBox(() => saveEdit(comment._id), "Edit comment")
          ) : (
            <p
              className={`mt-1 break-words text-sm ${comment.isDeleted ? "italic text-muted-foreground" : ""}`}
            >
              {translations[comment._id] || comment.commentbody}
            </p>
          )}
          {!comment.isDeleted && editing !== comment._id && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => react(comment._id, "like")}
              >
                <ThumbsUp />
                {comment.likes?.length || 0}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => react(comment._id, "dislike")}
              >
                <ThumbsDown />
                {comment.dislikes?.length || 0}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReplyTo(comment._id);
                  setEditing(null);
                  setText("");
                }}
              >
                <MessageCircle />
                Reply
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => report(comment._id)}
              >
                <Flag />
                Report
              </Button>
              {String(comment.userid) === String(user?._id) && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(comment)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(comment._id)}
                  >
                    Delete
                  </Button>
                </>
              )}
              <select
                value={translateLangFor[comment._id] || "hi"}
                onChange={(event) =>
                  setTranslateLangFor((prev) => ({
                    ...prev,
                    [comment._id]: event.target.value,
                  }))
                }
                className="rounded-md border bg-background px-1.5 py-1 text-xs"
                aria-label="Translate to"
              >
                {TRANSLATE_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
              {translations[comment._id] ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearTranslation(comment._id)}
                >
                  <Languages />
                  Show original
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => translateComment(comment)}
                  disabled={translating[comment._id]}
                >
                  <Languages />
                  {translating[comment._id] ? "Translating..." : "Translate"}
                </Button>
              )}
            </div>
          )}
          {replyTo === comment._id &&
            writeBox(
              () => submit(comment._id),
              `Reply to ${comment.usercommented}`,
            )}
        </div>
      </div>
      {replies(comment._id).map((reply) => item(reply, true))}
    </div>
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{roots.length} Comments</h2>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="mostliked">Most liked</option>
        </select>
      </div>
      {message && <p className="rounded-md bg-muted p-2 text-sm">{message}</p>}
      {user ? (
        writeBox(() => submit(), "Add a comment...")
      ) : (
        <p className="text-sm text-muted-foreground">
          Sign in to join the conversation.
        </p>
      )}
      {loading ? (
        <p className="text-sm">Loading comments...</p>
      ) : roots.length ? (
        <div>{roots.map((comment) => item(comment))}</div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No comments yet. Be the first to comment!
        </p>
      )}
    </section>
  );
};

export default Comments;
