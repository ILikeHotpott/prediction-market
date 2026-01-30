import "./globals.css";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PortfolioProvider } from "@/components/PortfolioProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import MobileBottomNav from "@/components/MobileBottomNav";
import JsonLd from "./JsonLd";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata = {
  title: "Monofuture - Prediction Market",
  description: "Trade on your beliefs. Monofuture is a prediction market platform where you can bet on real-world events.",
  keywords: ["prediction market",  "forecasting", "trading"],
  authors: [{ name: "Monofuture" }],
  creator: "Monofuture",
  publisher: "Monofuture",
  metadataBase: new URL("https://www.monofuture.com"),
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.monofuture.com",
    siteName: "Monofuture",
    title: "Monofuture - Prediction Market",
    description: "Trade on your beliefs. Monofuture is a decentralized prediction market platform where you can bet on real-world events using crypto.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Monofuture - Prediction Market",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Monofuture - Prediction Market",
    description: "Trade on your beliefs. Decentralized prediction market platform.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    // google: "your-google-verification-code", // 添加 Google Search Console 验证码
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <JsonLd />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider>
            <AuthProvider>
              <PortfolioProvider>
                {children}
                <MobileBottomNav />
              </PortfolioProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
