import {
  ShieldAlert,
  ShieldCheck,
  MonitorSmartphone,
  MapPin,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

interface LoginRecord {
  _id: string;
  loginAt: string;
  ipAddress: string;
  browser: string;
  browserVersion?: string;
  operatingSystem: string;
  deviceType: string;
  deviceModel?: string;
  city: string;
  state: string;
  country: string;
  isNewDevice: boolean;
  trusted: boolean;
  trustedUntil?: string | null;
  isCurrentDevice: boolean;
}

export default function SecurityPage() {
  const { user, theme, setTheme } = useUser();
  const [records, setRecords] = useState<LoginRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user?._id) {
      setLoading(false);
      return;
    }
    axiosInstance
      .get(`/user/${user._id}/security`)
      .then((response) => setRecords(response.data.loginHistory || []))
      .catch(() => setMessage("Unable to load security history."))
      .finally(() => setLoading(false));
  }, [user?._id]);

  if (!user)
    return (
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        Sign in to view account security.
      </main>
    );

  return (
    <main className="min-w-0 flex-1 p-3 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Account security</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review recent logins and control your appearance preference.
          </p>
        </div>

        {message && (
          <p className="rounded-md bg-muted p-3 text-sm">{message}</p>
        )}

        <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-6">
          <h2 className="font-semibold">Theme preference</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["system", "light", "dark"] as const).map((option) => (
              <Button
                key={option}
                variant={theme === option ? "default" : "outline"}
                onClick={() => setTheme(option)}
                className="capitalize"
              >
                {option === "system" ? "Auto" : option}
              </Button>
            ))}
          </div>
          {theme === "system" && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
              Auto is on — light theme 5:00 AM–12:00 PM IST, dark theme the rest
              of the day.
            </p>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-green-600" />
            <div>
              <h2 className="font-semibold">Devices signed in</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                One entry per device. Signing in from a new browser, device, IP,
                or location requires a one-time code sent to your email.
              </p>
            </div>
          </div>
          {loading ? (
            <p className="mt-6 text-sm">Loading activity...</p>
          ) : records.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              No login activity recorded yet.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {records.map((record) => (
                <div
                  key={record._id}
                  className={`flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between ${
                    record.isCurrentDevice
                      ? "border-green-600/40 bg-green-50 dark:bg-green-950/20"
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-muted p-2">
                      {record.isCurrentDevice ? (
                        <MonitorSmartphone className="h-4 w-4 text-green-600" />
                      ) : record.isNewDevice ? (
                        <ShieldAlert className="h-4 w-4 text-amber-600" />
                      ) : (
                        <ShieldCheck className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {record.browser}
                        {record.browserVersion
                          ? ` ${record.browserVersion}`
                          : ""}{" "}
                        · {record.operatingSystem}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {record.deviceType}
                        {record.deviceModel
                          ? ` (${record.deviceModel})`
                          : ""} · {record.ipAddress}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {[record.city, record.state, record.country]
                          .filter((part) => part && part !== "Unavailable")
                          .join(", ") || "Location unavailable"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {record.isCurrentDevice
                          ? "Active now"
                          : `Last active ${formatDistanceToNow(new Date(record.loginAt))} ago`}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`self-start rounded-full px-2 py-1 text-xs ${
                      record.isCurrentDevice
                        ? "bg-green-600 text-white"
                        : record.isNewDevice
                          ? "bg-amber-100 text-amber-800"
                          : "bg-green-100 text-green-800"
                    }`}
                  >
                    {record.isCurrentDevice
                      ? "This device"
                      : record.isNewDevice
                        ? "New device noticed"
                        : "Recognized device"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
