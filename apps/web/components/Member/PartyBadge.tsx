interface PartyBadgeProps {
  party: {
    short_name: string;
    colour_hex: string | null;
  };
}

export function PartyBadge({ party }: PartyBadgeProps) {
  return (
    <span
      className="inline-block text-xs font-semibold px-1.5 py-0.5 rounded text-white"
      style={{ backgroundColor: party.colour_hex ?? "#757575" }}
    >
      {party.short_name}
    </span>
  );
}
