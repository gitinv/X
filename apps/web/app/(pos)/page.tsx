"use client";

import { useEffect, useState } from "react";

export default function POSDashboard() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/appointments").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
    ])
      .then(([appts, prods]) => {
        setAppointments(appts);
        setProducts(prods);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-6">Manager POS</h1>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="border rounded-lg p-6 bg-white">
            <h2 className="text-lg font-medium mb-4">Appointments</h2>
            {appointments.length === 0 ? (
              <p className="text-neutral-500">No appointments</p>
            ) : (
              <ul className="space-y-2">
                {appointments.map((a) => (
                  <li key={a.id} className="text-sm border-b pb-2">
                    {a.time} — {a.clientName} ({a.serviceName})
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border rounded-lg p-6 bg-white">
            <h2 className="text-lg font-medium mb-4">Inventory</h2>
            {products.length === 0 ? (
              <p className="text-neutral-500">No products</p>
            ) : (
              <ul className="space-y-2">
                {products.map((p) => (
                  <li key={p.id} className="text-sm border-b pb-2">
                    {p.name} — Stock: {p.stock}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
