import { createContext, useContext, useEffect, useRef, useState } from "react";
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { auth, provider } from "./firebase";
import axiosInstance from "./axiosinstance";

const UserContext = createContext({
  /** @type {any} */ user: null,
  login: (_userdata) => {},
  logout: async () => {},
  handlegooglesignin: async () => {},
  theme: "system",
  setTheme: async (_theme) => {},
});

const normaliseTheme = (theme) =>
  ["light", "dark", "system"].includes(theme) ? theme : "system";

const getISTHour = () => {
  const hourString = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hour12: false,
  });
  return parseInt(hourString, 10) % 24;
};

const isDaytimeIST = () => {
  const hour = getISTHour();
  return hour >= 5 && hour < 12;
};

const resolveTheme = (preference) => {
  if (preference === "system") return isDaytimeIST() ? "light" : "dark";
  return preference === "dark" ? "dark" : "light";
};

const applyTheme = (preference) => {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(preference);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
};

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [theme, setThemeState] = useState("system");
  const autoCheckInterval = useRef(null);

  const startAutoThemeWatch = (preference) => {
    if (autoCheckInterval.current) {
      clearInterval(autoCheckInterval.current);
      autoCheckInterval.current = null;
    }
    if (preference === "system") {
      autoCheckInterval.current = setInterval(() => {
        applyTheme("system");
      }, 60000);
    }
  };

  const login = (userdata) => {
    const savedTheme = normaliseTheme(
      userdata?.themePreference || localStorage.getItem("yuutube-theme"),
    );
    setUser(userdata);
    setThemeState(savedTheme);
    localStorage.setItem("user", JSON.stringify(userdata));
    localStorage.setItem("yuutube-theme", savedTheme);
    applyTheme(savedTheme);
    startAutoThemeWatch(savedTheme);
  };

  const setTheme = async (nextTheme) => {
    const savedTheme = normaliseTheme(nextTheme);
    setThemeState(savedTheme);
    localStorage.setItem("yuutube-theme", savedTheme);
    applyTheme(savedTheme);
    startAutoThemeWatch(savedTheme);
    if (user?._id) {
      try {
        const response = await axiosInstance.patch(`/user/update/${user._id}`, {
          themePreference: savedTheme,
        });
        setUser(response.data);
        localStorage.setItem("user", JSON.stringify(response.data));
      } catch (error) {
        console.error("Unable to save theme preference:", error);
      }
    }
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem("user");
    setThemeState("system");
    localStorage.removeItem("yuutube-theme");
    applyTheme("system");
    startAutoThemeWatch("system");
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  };

  const completeLogin = async (firebaseuser) => {
    try {
      const response = await axiosInstance.post("/user/login", {
        email: firebaseuser.email,
        name: firebaseuser.displayName,
        image: firebaseuser.photoURL || "https://github.com/shadcn.png",
      });
      login(response.data.result);
    } catch (error) {
      console.error("Error completing login:", error);
    }
  };

  const handlegooglesignin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      if (result?.user) {
        await completeLogin(result.user);
      }
    } catch (error) {
      if (error?.code === "auth/popup-blocked") {
        console.error(
          "Sign-in popup was blocked. Please allow popups for this site and try again.",
        );
      } else if (error?.code === "auth/popup-closed-by-user") {
        // User closed the popup intentionally — no action needed.
      } else {
        console.error("Error during sign-in:", error);
      }
    }
  };

  useEffect(() => {
    const savedTheme = normaliseTheme(localStorage.getItem("yuutube-theme"));
    setThemeState(savedTheme);
    applyTheme(savedTheme);
    startAutoThemeWatch(savedTheme);

    const unsub = onAuthStateChanged(auth, async (firebaseuser) => {
      if (!firebaseuser) return;
      await completeLogin(firebaseuser);
    });

    return () => {
      unsub();
      if (autoCheckInterval.current) clearInterval(autoCheckInterval.current);
    };
  }, []);

  return (
    <UserContext.Provider
      value={{ user, login, logout, handlegooglesignin, theme, setTheme }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
