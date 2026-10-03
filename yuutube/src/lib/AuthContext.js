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
  otpChallenge: null,
  submitOtp: async (_code) => ({ success: false }),
  cancelOtpChallenge: () => {},
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
  const [otpChallenge, setOtpChallenge] = useState(null);
  const autoCheckInterval = useRef(null);
  const loginInFlight = useRef(false);

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
    setOtpChallenge(null);
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  };

  const completeLogin = async (firebaseuser) => {
    if (loginInFlight.current) return;
    loginInFlight.current = true;
    try {
      const response = await axiosInstance.post("/user/login", {
        email: firebaseuser.email,
        name: firebaseuser.displayName,
        image: firebaseuser.photoURL || "https://github.com/shadcn.png",
      });
      if (response.data?.otpRequired) {
        setOtpChallenge({
          email: firebaseuser.email,
          message: response.data.message,
        });
        return;
      }
      login(response.data.result);
    } catch (error) {
      console.error("Error completing login:", error);
    } finally {
      loginInFlight.current = false;
    }
  };

  const submitOtp = async (code) => {
    if (!otpChallenge?.email)
      return { success: false, message: "No pending verification." };
    try {
      const response = await axiosInstance.post("/user/verify-otp", {
        email: otpChallenge.email,
        code,
      });
      login(response.data.result);
      setOtpChallenge(null);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || "Verification failed.",
      };
    }
  };

  const cancelOtpChallenge = () => setOtpChallenge(null);

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
        // Intentional close — no action needed.
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
      value={{
        user,
        login,
        logout,
        handlegooglesignin,
        theme,
        setTheme,
        otpChallenge,
        submitOtp,
        cancelOtpChallenge,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
