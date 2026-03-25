import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-revalidate-token");
  if (token !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { date, parliament } = await req.json();
  if (!date || !parliament) {
    return NextResponse.json({ error: "Missing date or parliament" }, { status: 400 });
  }

  revalidatePath(`/${date}`, "page");
  revalidatePath("/", "page");

  return NextResponse.json({ revalidated: true, date, parliament });
}
