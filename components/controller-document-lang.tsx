"use client"

import { useEffect } from "react"
import { useLocale } from "next-intl"

export function ControllerDocumentLang() {
  const locale = useLocale()

  useEffect(() => {
    document.documentElement.lang = locale
    return () => {
      document.documentElement.lang = "en"
    }
  }, [locale])

  return null
}
