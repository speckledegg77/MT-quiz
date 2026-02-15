import { NextResponse } from "next/server"

export async function GET() {
  const tokenSet = Boolean(process.env.ADMIN_TOKEN)
  console.log("ADMIN_TOKEN set?", tokenSet)
  return NextResponse.json({ adminTokenSet: tokenSet })
}
