import translate from "google-translate-api-x";

const MAX_LENGTH = 1000;

export const translateText = async (req, res) => {
  const { text, targetLang } = req.body;

  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ message: "Text to translate is required." });
  }
  if (!targetLang || typeof targetLang !== "string") {
    return res.status(400).json({ message: "Target language is required." });
  }
  if (text.length > MAX_LENGTH) {
    return res.status(400).json({ message: "Text is too long to translate." });
  }

  try {
    const result = await translate(text, { to: targetLang });
    return res.status(200).json({
      translatedText: result.text,
      detectedSourceLanguage: result.from?.language?.iso || null,
    });
  } catch (error) {
    console.error("Translation error:", error);
    return res
      .status(502)
      .json({ message: "Unable to translate text right now." });
  }
};
