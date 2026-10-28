export function canEditFavorites(role: string) {
  return role === "CUSTOMER";
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
