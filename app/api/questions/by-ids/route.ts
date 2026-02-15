import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");
  if (!idsParam) return NextResponse.json({ error: "ids required" }, { status: 400 });

  const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("questions")
    .select("id, text, options, answer_index, explanation, round_type, audio_path")
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Preserve the incoming order
  const map = new Map((data ?? []).map(q => [q.id, q]));
  const ordered = ids.map(id => map.get(id)).filter(Boolean);

  return NextResponse.json({ questions: ordered });
}
