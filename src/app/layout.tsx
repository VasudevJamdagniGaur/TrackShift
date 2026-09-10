import type { Metadata } from "next";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import { AppToaster } from "@/components/ui/toaster";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Hayagriva — Smarter Roads. A Wiser Tomorrow.",
  description:
    "AI-powered road intelligence and infrastructure monitoring from public bus journeys.",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }, { url: "/favicon.svg" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
