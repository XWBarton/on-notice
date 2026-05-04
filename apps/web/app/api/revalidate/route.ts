import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-revalidate-token");
  if (token !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { date, parliament } = body;

  if (date && parliament) {
    revalidatePath(`/${date}`, "page");
    revalidatePath("/", "page");
  }

  // Always revalidate bills section so backfills show immediately
  revalidatePath("/bills", "page");
  revalidatePath("/bills/[id]", "page");

  return NextResponse.json({ revalidated: true, date, parliament });
}
