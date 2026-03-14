"use client"

import { QRCodeSVG } from "qrcode.react"

type Props = {
  value: string
  size?: number
}

export default function QRTile({ value, size = 112 }: Props) {
  return (
    <div className="rounded-xl border border-border bg-white p-2">
      <QRCodeSVG
        value={value}
        size={size}
        includeMargin={true}
        level="M"
        bgColor="#ffffff"
        fgColor="#000000"
      />
    </div>
  )
}
