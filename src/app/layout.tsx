import type { Metadata } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const sans = Source_Sans_3({ variable: "--font-ui", subsets: ["latin"] });
const serif = Source_Serif_4({
  variable: "--font-reading",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Review Copilot",
  description: "A reviewing copilot that helps you read the paper and draws out your own judgment.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
