"use client";

import { useEffect, useState } from "react";

export default function CustomerHome() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    clientName: "",
    clientPhone: "",
    serviceName: "",
    date: "",
    time: "",
  });

  const loadAppointments = () => {
    fetch("/api/appointments")
      .then((res) => res.json())
      .then((data) => {
        setAppointments(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadAppointments();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, price: 85 }),
    });
    setForm({ clientName: "", clientPhone: "", serviceName: "", date: "", time: "" });
    loadAppointments();
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-serif italic">The Red Lady Spa</h1>
      <p className="text-neutral-600 mt-2 mb-8">Book your appointment</p>

      <form onSubmit={handleSubmit} className="border rounded-lg p-6 bg-white mb-8 space-y-4">
        <input
          className="w-full border p-2 rounded"
          placeholder="Your name"
          value={form.clientName}
          onChange={(e) => setForm({ ...form, clientName: e.target.value })}
          required
        />
        <input
          className="w-full border p-2 rounded"
          placeholder="Phone"
          value={form.clientPhone}
          onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
        />
        <input
          className="w-full border p-2 rounded"
          placeholder="Service (e.g. Gel Manicure)"
          value={form.serviceName}
          onChange={(e) => setForm({ ...form, serviceName: e.target.value })}
          required
        />
        <input
          type="date"
          className="w-full border p-2 rounded"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          required
        />
        <input
          type="time"
          className="w-full border p-2 rounded"
          value={form.time}
          onChange={(e) => setForm({ ...form, time: e.target.value })}
          required
        />
        <button type="submit" className="bg-black text-white px-4 py-2 rounded">
          Book Appointment
        </button>
      </form>

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
