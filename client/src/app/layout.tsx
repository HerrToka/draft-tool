'use client'

import './globals.css'

export const metadata = {
  title: 'Predecessor | Custom Drafts',
  description: 'Custom Game Drafts for your Predecessor tournaments,scrims or fun!',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
