// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Allo Inventory",
  description: "Inventory reservation system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header className="border-b bg-white sticky top-0 z-10 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
            <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold text-sm">
              A
            </div>
            <span className="font-semibold text-gray-900">Allo Inventory</span>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
