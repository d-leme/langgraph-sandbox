import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { SidebarProvider, SidebarTrigger } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/app-sidebar";
import { ReactQueryProvider } from "~/components/providers/react-query-provider";

export const metadata: Metadata = {
  title: "Langgraph Demos",
  description: "Next.js Langgraph demos",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        <ReactQueryProvider>
          <SidebarProvider>
            <AppSidebar />
            <main className="w-full">
              <div className="flex items-center justify-between border-b px-4 py-2">
                <SidebarTrigger />
                <h1 className="text-lg font-semibold">LangGraph Demos</h1>
                <div />
              </div>
              <div className="p-6">{children}</div>
            </main>
          </SidebarProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
