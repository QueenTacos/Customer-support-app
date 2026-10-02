import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Customer Support", template: "%s · Customer Support" },
  description: "Jessica's customer-support ticket workspace",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0c16",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            style: { background: "#141726", border: "1px solid #262b42", color: "#f4f5fb" },
          }}
        />
      </body>
    </html>
  );
}
