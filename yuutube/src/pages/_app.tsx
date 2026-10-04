import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Script from "next/script";
import { UserProvider } from "../lib/AuthContext";
import OtpModal from "@/components/OtpModal"

export default function App({ Component, pageProps }: AppProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const labelButtons = () => {
      document.querySelectorAll<HTMLButtonElement>("button:not([title]):not([data-no-auto-tooltip])").forEach((button) => {
        const label = button.getAttribute("aria-label") || button.textContent?.trim();
        if (label) button.title = label.replace(/\s+/g, " ");
      });
    };
    labelButtons();
    const observer = new MutationObserver(labelButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <UserProvider>
      <div className="min-h-screen bg-background text-foreground transition-colors">
        <title>YuuTube Clone</title>
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
        <Header onMenuClick={() => setIsSidebarOpen((open) => !open)} />
        <Toaster />
        <OtpModal />
        <div className="flex min-w-0">
          <Sidebar
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
          />
          <main className="min-w-0 flex-1 overflow-x-hidden">
            <Component {...pageProps} />
          </main>
        </div>
      </div>
    </UserProvider>
  );
}
