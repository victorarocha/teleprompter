import { Suspense } from "react"
import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages, getTranslations } from "next-intl/server"

import { ControllerDocumentLang } from "@/components/controller-document-lang"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Controller")
  const title = t("title")
  return {
    title,
    manifest: "/controller.webmanifest",
    appleWebApp: {
      capable: true,
      title,
      statusBarStyle: "black-translucent",
    },
  }
}

export default function ControllerLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <ControllerIntl>{children}</ControllerIntl>
    </Suspense>
  )
}

async function ControllerIntl({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ControllerDocumentLang />
      {children}
    </NextIntlClientProvider>
  )
}
