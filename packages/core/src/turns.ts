export type TurnStatus = "BOOKED" | "CHECKED_IN" | "IN_SERVICE" | "READY" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export interface TurnVisit {
  id: string;
  status: TurnStatus;
  start: Date;
  clientName: string;
  technicianName: string;
  serviceName: string;
  supplies: string[];
}

export interface TurnBoard {
  current: TurnVisit | null;
  next: TurnVisit | null;
  queue: TurnVisit[];
  supplies: string[];
}

const STATUS_RANK: Record<TurnStatus, number> = {
  IN_SERVICE: 0,
  CHECKED_IN: 1,
  BOOKED: 2,
  READY: 3,
  COMPLETED: 4,
  CANCELLED: 5,
  NO_SHOW: 6,
};

export function buildTurnBoard(visits: TurnVisit[]): TurnBoard {
  const ordered = visits
    .filter((visit) => visit.status === "IN_SERVICE" || visit.status === "CHECKED_IN" || visit.status === "BOOKED")
    .slice()
    .sort((a, b) => {
      const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (byStatus !== 0) return byStatus;
      return a.start.getTime() - b.start.getTime();
    });

  const current = ordered[0] ?? null;
  const next = ordered[1] ?? null;
  return {
    current,
    next,
    queue: ordered.slice(2),
    supplies: current?.supplies ?? [],
  };
}
