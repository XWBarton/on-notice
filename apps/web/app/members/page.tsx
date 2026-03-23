import { createClient } from "@/lib/supabase";
import { SeatMap } from "@/components/Members/SeatMap";

export const revalidate = 3600;

export default async function MembersPage() {
  const supabase = createClient();

  const [{ data: horMembers }, { data: senMembers }] = await Promise.all([
    supabase
      .from("members")
      .select("id, name_display, electorate, role, party_id, parties(name, short_name, colour_hex)")
      .eq("parliament_id", "fed_hor")
      .order("name_last"),
    supabase
      .from("members")
      .select("id, name_display, electorate, role, party_id, parties(name, short_name, colour_hex)")
      .eq("parliament_id", "fed_sen")
      .order("name_last"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Members</h1>
      <SeatMap
        horMembers={(horMembers ?? []) as Parameters<typeof SeatMap>[0]["horMembers"]}
        senMembers={(senMembers ?? []) as Parameters<typeof SeatMap>[0]["senMembers"]}
      />
    </div>
  );
}
