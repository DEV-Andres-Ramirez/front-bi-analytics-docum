import type { Metadata, Viewport } from "next";
import { Montserrat, Poppins } from "next/font/google";
import { Providers } from "@/components/providers";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Docum BI · Positiva",
    template: "%s · Docum BI",
  },
  description:
    "Tableros de seguimiento de flujos documentales de Positiva Compañía de Seguros: facturación, PQRD, entes de control, SMART, tutelas, medicina laboral y correspondencia.",
  applicationName: "Docum BI",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1116" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      data-theme="light"
      suppressHydrationWarning
      className={`${montserrat.variable} ${poppins.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
