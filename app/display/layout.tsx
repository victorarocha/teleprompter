import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Display",
  manifest: "/display.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Display",
    statusBarStyle: "black-translucent",
  },
}

export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return children
}
