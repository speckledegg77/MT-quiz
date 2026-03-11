import { NextResponse } from "next/server"

export function isAuthorisedAdminRequest(req: Request) {
  const token = req.headers.get("x-admin-token")
  return !!token && token === process.env.ADMIN_TOKEN
}

export function unauthorisedAdminResponse() {
  return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
}