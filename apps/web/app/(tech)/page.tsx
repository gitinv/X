"use client";

import { useEffect, useState } from "react";

export default function TechMonitor() {
  const [appointments, setAppointments] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/appointments")
      .then((res) => res.json())
      .then(setAppointments)
      .catch(() => {});
  }, []);

  return (
    <div className="p-8 bg-black text-white min-h-screen">
      <h1 className="text-3xl mb-6">Tech Turn Monitor</h1>
      <p className="text-neutral-400 mb-8">Live turn list</p>

      <div className="space-y-4">
        {appointments.length === 0 ? (
          <p className="text-neutral-500">No upcoming turns</p>
        ) : (
          appointments.map((a) => (
            <div key={a.id} className="border border-neutral-700 rounded p-4">
              <div className="text-xl">{a.time}</div>
              <div className="text-neutral-300">{a.clientName} — {a.serviceName}</div>
              {a.technician && (
                <div className="text-sm text-neutral-500 mt-1">Tech: {a.technician.name}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
