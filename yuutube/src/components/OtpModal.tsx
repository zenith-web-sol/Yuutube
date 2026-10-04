import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useUser } from "@/lib/AuthContext";

export default function OtpModal() {
  const { otpChallenge, submitOtp, cancelOtpChallenge } = useUser();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!otpChallenge) return null;

  const otpMessage =
    typeof otpChallenge === "object" &&
    otpChallenge !== null &&
    "message" in otpChallenge &&
    typeof (otpChallenge as { message?: string }).message === "string"
      ? (otpChallenge as { message: string }).message
      : "Enter the verification code.";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    setError("");
    const result = await submitOtp(code.trim());
    setSubmitting(false);
    if (!result.success) {
      const errorMessage =
        "message" in result && typeof result.message === "string"
          ? result.message
          : "Verification failed.";
      setError(errorMessage);
      setCode("");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Verify it's you</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {otpMessage}
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <Input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-lg tracking-widest"
            autoFocus
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={cancelOtpChallenge}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={submitting || code.length !== 6}
            >
              {submitting ? "Verifying..." : "Verify"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
