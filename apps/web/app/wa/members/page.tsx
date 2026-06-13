import { createClient } from "@/lib/supabase";
import { WASeatMap } from "../components/WASeatMap";

export const revalidate = 3600;

export default async function WAMembersPage() {
  const supabase = createClient();

  const [{ data: laMembers }, { data: lcMembers }] = await Promise.all([
    supabase
      .from("members")
      .select("id, name_display, electorate, party_id, parties(short_name, colour_hex)")
      .eq("parliament_id", "wa_la")
      .order("name_last"),
    supabase
      .from("members")
      .select("id, name_display, electorate, party_id, parties(short_name, colour_hex)")
      .eq("parliament_id", "wa_lc")
      .order("name_last"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Members</h1>
      <WASeatMap
        laMembers={(laMembers ?? []) as Parameters<typeof WASeatMap>[0]["laMembers"]}
        lcMembers={(lcMembers ?? []) as Parameters<typeof WASeatMap>[0]["lcMembers"]}
      />
    </div>
  );
}
