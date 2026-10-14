import "./globals.css";
import { ToastProvider } from "../components/Toast";

export const metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "VakilKaro Marketing Panel",
    template: "%s · VakilKaro Marketing Panel",
  },
  description:
    "VakilKaro internal ERP — Marketing operations, campaigns, creatives, lead capture and remarketing for VakilKaro.",
  applicationName: "VakilKaro Marketing Panel",
  authors: [{ name: "VakilKaro" }],
  keywords: ["VakilKaro", "Marketing", "Campaigns", "Lead Capture", "Remarketing", "Internal Panel"],
  robots: { index: false, follow: false }, // internal panel — search engines se chhupa
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
    ],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "VakilKaro Marketing Panel",
    description: "Marketing operations, campaigns and remarketing — one internal system.",
    siteName: "VakilKaro Marketing Panel",
    type: "website",
  },
};

export const viewport = {
  themeColor: "#0B0B0E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
        />
      </head>
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
