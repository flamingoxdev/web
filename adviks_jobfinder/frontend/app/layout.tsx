import type { Metadata } from "next";
import { Syne, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AuthGuard from "./components/AuthGuard";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "InternMatch AI — Find Your Perfect Internship",
  description:
    "Upload your resume and get AI-ranked internship matches in seconds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
