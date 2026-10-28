export function canEditFavorites(role: string) {
  return role === "CUSTOMER";
}

export function favoriteCardClass(active: boolean) {
  return active ? "border-2 border-gold bg-white" : "border border-line bg-white";
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export function samePhone(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizePhone(left ?? "");
  const b = normalizePhone(right ?? "");
  return a.length >= 10 && a === b;
}

export function sortByFavorite<T extends { id: string; name: string }>(people: T[], favoriteIds: Iterable<string>) {
  const favorites = new Set(favoriteIds);
  return [...people].sort((left, right) => {
    const leftRank = favorites.has(left.id) ? 0 : 1;
    const rightRank = favorites.has(right.id) ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.name.localeCompare(right.name);
  });
}

export function favoriteNote(clientName: string, technicianNames: string[]) {
  const names = [...new Set(technicianNames.filter(Boolean))];
  if (!clientName || names.length === 0) return null;
  return `${clientName}'s favorite: ${names.join(", ")}`;
}
