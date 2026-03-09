import React, { useEffect, useState } from "react";
import type { Meter } from "../app/App";

interface BillingRate {
  id: number;
  meter_id: string;
  rate_name: string;
  rate_per_kwh: number;
  start_date: string | null;
  end_date: string | null;
}

interface PowerBill {
  id: number;
  meter_id: string;
  start_date: string;
  end_date: string;
  total_kwh: number;
  total_cost: number;
  document_path: string | null;
  created_at: string;
}

interface Props {
  meters: Meter[];
}

export const BillingTab: React.FC<Props> = ({ meters }) => {
  const [rates, setRates] = useState<BillingRate[]>([]);
  const [bills, setBills] = useState<PowerBill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bill Form State
  const [billMeterId, setBillMeterId] = useState<string>(meters[0]?.meter_id || "");
  const [billStartDate, setBillStartDate] = useState<string>("");
  const [billEndDate, setBillEndDate] = useState<string>("");
  const [billKwh, setBillKwh] = useState<string>("");
  const [billCost, setBillCost] = useState<string>("");

  // Rate Form State
  const [rateMeterId, setRateMeterId] = useState<string>(meters[0]?.meter_id || "");
  const [rateName, setRateName] = useState<string>("Standard");
  const [ratePerKwh, setRatePerKwh] = useState<string>("0.15");

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [ratesRes, billsRes] = await Promise.all([
        fetch("/api/rates"),
        fetch("/api/bills")
      ]);
      
      if (!ratesRes.ok) throw new Error("Failed to load rates");
      if (!billsRes.ok) throw new Error("Failed to load bills");

      setRates(await ratesRes.json());
      setBills(await billsRes.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleAddBill(e: React.FormEvent) {
    e.preventDefault();
    if (!billMeterId || !billStartDate || !billEndDate || !billKwh || !billCost) return;
    
    // Make sure we have iso format with time
    const startIso = new Date(billStartDate + "T00:00:00").toISOString();
    const endIso = new Date(billEndDate + "T23:59:59").toISOString();

    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meter_id: billMeterId,
          start_date: startIso,
          end_date: endIso,
          total_kwh: parseFloat(billKwh),
          total_cost: parseFloat(billCost)
        })
      });
      if (!res.ok) throw new Error("Failed to add bill");
      
      // Reset form
      setBillStartDate("");
      setBillEndDate("");
      setBillKwh("");
      setBillCost("");
      
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDeleteBill(id: number) {
    if (!confirm("Are you sure you want to delete this bill?")) return;
    try {
      const res = await fetch(`/api/bills/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete bill");
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleAddRate(e: React.FormEvent) {
    e.preventDefault();
    if (!rateMeterId || !rateName || !ratePerKwh) return;

    try {
      const res = await fetch("/api/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meter_id: rateMeterId,
          rate_name: rateName,
          rate_per_kwh: parseFloat(ratePerKwh)
        })
      });
      if (!res.ok) throw new Error("Failed to add rate");
      
      setRateName("Standard");
      setRatePerKwh("");
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDeleteRate(id: number) {
    if (!confirm("Are you sure you want to delete this rate?")) return;
    try {
      const res = await fetch(`/api/rates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete rate");
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="billing-tab">
      {error && <div className="error card">{error}</div>}
      
      <div className="billing-grid">
        {/* Left Column - Power Bills */}
        <section className="card">
          <div className="card-header">
            <h2>Power Bills {loading && <span className="spinner"></span>}</h2>
          </div>
          <div className="card-body">
            <form onSubmit={handleAddBill} className="billing-form">
              <h3>Add New Bill</h3>
              <div className="form-row">
                <label>
                  <span>Meter</span>
                  <select value={billMeterId} onChange={e => setBillMeterId(e.target.value)} required>
                    {meters.map(m => (
                      <option key={m.meter_id} value={m.meter_id}>
                        {m.label ? `${m.label} (${m.meter_id})` : m.meter_id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span>Start Date</span>
                  <input type="date" value={billStartDate} onChange={e => setBillStartDate(e.target.value)} required />
                </label>
                <label>
                  <span>End Date</span>
                  <input type="date" value={billEndDate} onChange={e => setBillEndDate(e.target.value)} required />
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span>Total Use (kWh)</span>
                  <input type="number" step="0.1" value={billKwh} onChange={e => setBillKwh(e.target.value)} required placeholder="e.g. 520.5" />
                </label>
                <label>
                  <span>Total Cost ($)</span>
                  <input type="number" step="0.01" value={billCost} onChange={e => setBillCost(e.target.value)} required placeholder="e.g. 75.50" />
                </label>
              </div>
              <button type="submit" className="range-btn active">Add Bill</button>
            </form>

            <div className="billing-list">
              <h3>History</h3>
              {bills.length === 0 ? (
                <p className="empty-state">No bills added yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Meter</th>
                      <th>Use (kWh)</th>
                      <th>Cost</th>
                      <th>Apparent Rate</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map(b => {
                      const meter = meters.find(m => m.meter_id === b.meter_id);
                      const name = meter?.label || b.meter_id;
                      const apparentRate = b.total_kwh > 0 ? (b.total_cost / b.total_kwh) : 0;
                      return (
                        <tr key={b.id}>
                          <td>{new Date(b.start_date).toLocaleDateString()} - {new Date(b.end_date).toLocaleDateString()}</td>
                          <td>{name}</td>
                          <td>{b.total_kwh.toFixed(1)}</td>
                          <td>${b.total_cost.toFixed(2)}</td>
                          <td>${apparentRate.toFixed(3)}/kWh</td>
                          <td>
                            <button className="delete-btn" onClick={() => handleDeleteBill(b.id)} title="Delete bill">×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>

        {/* Right Column - Billing Rates */}
        <section className="card">
          <div className="card-header">
            <h2>Billing Rates</h2>
          </div>
          <div className="card-body">
            <form onSubmit={handleAddRate} className="billing-form">
              <h3>Add Rate</h3>
              <div className="form-row">
                <label>
                  <span>Meter</span>
                  <select value={rateMeterId} onChange={e => setRateMeterId(e.target.value)} required>
                    {meters.map(m => (
                      <option key={m.meter_id} value={m.meter_id}>
                        {m.label ? `${m.label} (${m.meter_id})` : m.meter_id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span>Rate Name</span>
                  <input type="text" value={rateName} onChange={e => setRateName(e.target.value)} required placeholder="e.g. Standard, Summer" />
                </label>
                <label>
                  <span>Price ($/kWh)</span>
                  <input type="number" step="0.001" value={ratePerKwh} onChange={e => setRatePerKwh(e.target.value)} required placeholder="e.g. 0.150" />
                </label>
              </div>
              <button type="submit" className="range-btn active">Add Rate</button>
            </form>

            <div className="billing-list">
              <h3>Configured Rates</h3>
              {rates.length === 0 ? (
                <p className="empty-state">No rates configured. This will be used to project future costs on the dashboard.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Meter</th>
                      <th>Name</th>
                      <th>Rate ($/kWh)</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map(r => {
                      const meter = meters.find(m => m.meter_id === r.meter_id);
                      const name = meter?.label || r.meter_id;
                      return (
                        <tr key={r.id}>
                          <td>{name}</td>
                          <td>{r.rate_name}</td>
                          <td>${r.rate_per_kwh.toFixed(3)}</td>
                          <td>
                            <button className="delete-btn" onClick={() => handleDeleteRate(r.id)} title="Delete rate">×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
