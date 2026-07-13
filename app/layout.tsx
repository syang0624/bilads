// Minimal placeholder — Steven owns the real layout (fonts, wordmark, theme).
import type { ReactNode } from "react";

export const metadata = {
  title: "Bilads",
  description: "Billboards, decided.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
