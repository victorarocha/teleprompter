import type { Metadata } from "next"

import { ControllerPanel } from "@/components/controller-panel"

export const metadata: Metadata = {
  title: "Controller",
  manifest: "/controller.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Controller",
    statusBarStyle: "black-translucent",
  },
}

export default function ControllerPage() {
  return <ControllerPanel />
}
