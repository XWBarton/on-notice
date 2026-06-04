import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-revalidate-token");
  if (token !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { date, parliament } = body;

  // WA pages live under /wa (via the host rewrite in middleware). They share
  // this deployment's path cache, so purging the /wa routes here works even
  // though the call comes in on the federal domain.
  if (typeof parliament === "string" && parliament.startsWith("wa_")) {
    revalidatePath("/wa", "page");
    revalidatePath("/wa/[date]", "page");
    return NextResponse.json({ revalidated: true, date, parliament });
  }

  if (date && parliament) {
    revalidatePath(`/${date}`, "page");
    revalidatePath("/", "page");
  }

  // Always revalidate bills section so backfills show immediately
  revalidatePath("/bills", "page");
  revalidatePath("/bills/[id]", "page");

  return NextResponse.json({ revalidated: true, date, parliament });
}
