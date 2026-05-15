import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { AudioBootstrap } from "@/components/audio-bootstrap";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "toolpa",
  description: "Transparent AI agents for sample-based music tools.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100" suppressHydrationWarning>
        {process.env.NODE_ENV === "development" ? (
          <Script id="extension-error-guard" strategy="beforeInteractive">
            {`
              window.addEventListener('error', function (event) {
                var source = event.filename || '';
                if (source.startsWith('chrome-extension://') || source.startsWith('moz-extension://')) {
                  event.preventDefault();
                  event.stopImmediatePropagation();
                }
              }, true);
              window.addEventListener('unhandledrejection', function (event) {
                var reason = event.reason;
                var stack = reason && typeof reason === 'object' ? String(reason.stack || '') : '';
                if (stack.includes('chrome-extension://') || stack.includes('moz-extension://')) {
                  event.preventDefault();
                  event.stopImmediatePropagation();
                }
              }, true);
            `}
          </Script>
        ) : null}
        {children}
        <AudioBootstrap />
      </body>
    </html>
  );
}
