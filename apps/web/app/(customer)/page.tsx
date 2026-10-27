"use client";

import { useEffect, useState } from "react";

export default function CustomerHome() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/appointments")
      .then((res) => res.json())
      .then((data) => {
        setAppointments(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-serif italic">The Red Lady Spa</h1>
      <p className="text-neutral-600 mt-2 mb-8">Book your appointment</p>

      <div className="border rounded-lg p-6 bg-white">
        <h2 className="text-lg font-medium mb-4">Upcoming Appointments</h2>
        {loading ? (
          <p className="text-neutral-500">Loading...</p>
        ) : appointments.length === 0 ? (
          <p className="text-neutral-500">No appointments yet.</p>
        ) : (
          <ul className="space-y-3">
            {appointments.map((appt) => (
              <li key={appt.id} className="border-b pb-2">
                <div className="font-medium">{appt.serviceName}</div>
                <div className="text-sm text-neutral-600">
                  {appt.date} at {appt.time} — {appt.clientName}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
