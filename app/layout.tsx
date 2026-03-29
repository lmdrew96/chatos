import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const superBakery = localFont({
  src: "../public/SuperBakery.ttf",
  variable: "--font-super-bakery",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://chatos.adhdesigns.dev"),
  title: "Cha(t)os",
  description:
    "A shared AI workspace where multiple users bring their own Claude into the same conversation.",
  icons: {
    icon: [{ url: "/chatos-t-logo.svg", type: "image/svg+xml" }],
    shortcut: "/chatos-t-logo.svg",
    apple: "/chatos-t-logo.svg",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Cha(t)os",
    title: "Cha(t)os",
    description:
      "A shared AI workspace where multiple users bring their own Claude into the same conversation.",
    images: [
      {
        url: "/homepage.png",
        width: 3024,
        height: 1402,
        alt: "Cha(t)os homepage preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cha(t)os",
    description:
      "A shared AI workspace where multiple users bring their own Claude into the same conversation.",
    images: ["/homepage.png"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${superBakery.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
