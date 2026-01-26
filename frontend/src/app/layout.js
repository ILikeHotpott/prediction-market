import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PortfolioProvider } from "@/components/PortfolioProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import MobileBottomNav from "@/components/MobileBottomNav";

export const metadata = {
  title: "Monofuture - Prediction Market",
  description: "Bet on your beliefs",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
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
