import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PortfolioProvider } from "@/components/PortfolioProvider";
import { LanguageProvider } from "@/components/LanguageProvider";

export const metadata = {
  title: "Monofuture - Prediction Market",
  description: "Bet on your beliefs",
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
              <PortfolioProvider>{children}</PortfolioProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
