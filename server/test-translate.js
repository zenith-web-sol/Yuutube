import translate from "google-translate-api-x";

translate("Hello, how are you?", { to: "hi" }).then((res) => {
  console.log(res.text);
});
