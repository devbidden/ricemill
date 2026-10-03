import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { api } from '../auth.jsx';

L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

const dateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmt = (t) => (t ? new Date(t).toLocaleTimeString('en-US') : '—');
const field = 'rounded-lg border border-gray-300 p-2';

function Attendance() {
    const [date, setDate] = useState(dateStr(new Date()));
    const [rows, setRows] = useState([]);
    const [photo, setPhoto] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        api('/admin/attendance' + (date ? `?date=${date}` : '')).then(setRows).catch((e) => setError(e.message));
    }, [date]);

    const showPhoto = async (id) => {
        try { setPhoto((await api(`/admin/attendance/${id}/photo`)).photo); } catch (e) { setError(e.message); }
    };

    return (
        <div>
            <div className="flex items-center gap-3 mb-4">
                <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
                <button onClick={() => setDate('')} className="text-sm text-jumia underline">All dates</button>
                <span className="text-sm text-gray-500">{rows.length} record(s)</span>
            </div>
            {error && <p className="text-red-600 mb-2">{error}</p>}
            <div className="overflow-x-auto bg-white rounded-xl shadow">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500">
                        <tr>{['Staff', 'Date', 'Clock In', 'Clock Out', 'Distance', 'Strikes', 'Photo'].map((h) => <th key={h} className="p-3">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r._id} className="border-t">
                                <td className="p-3">{r.user?.name}<div className="text-xs text-gray-500">{r.user?.department || r.user?.email}</div></td>
                                <td className="p-3">{r.date}</td>
                                <td className="p-3">{fmt(r.clockIn)} {r.lateStrike && <span className="text-red-600 text-xs">(late)</span>}</td>
                                <td className="p-3">{fmt(r.clockOut)} {r.missedClockOutStrike && <span className="text-red-600 text-xs">(missed)</span>}</td>
                                <td className="p-3">{r.distance != null ? `${r.distance} m` : '—'}</td>
                                <td className="p-3">{(r.lateStrike ? 1 : 0) + (r.missedClockOutStrike ? 1 : 0)}</td>
                                <td className="p-3"><button onClick={() => showPhoto(r._id)} className="text-jumia underline">View</button></td>
                            </tr>
                        ))}
                        {!rows.length && <tr><td colSpan={7} className="p-6 text-center text-gray-500">No records</td></tr>}
                    </tbody>
                </table>
            </div>
            {photo && (
                <div className="fixed inset-0 bg-black/60 grid place-items-center p-5" onClick={() => setPhoto(null)}>
                    <img src={photo} alt="Clock-in" className="max-h-[80vh] rounded-lg" />
                </div>
            )}
        </div>
    );
}

function Staff() {
    const [rows, setRows] = useState([]);
    useEffect(() => { api('/admin/staff').then(setRows).catch(() => { }); }, []);
    const toggleRole = async (u) => {
        const role = u.role === 'admin' ? 'staff' : 'admin';
        try {
            await api(`/admin/staff/${u.id}/role`, { method: 'PUT', body: { role } });
            setRows((r) => r.map((x) => (x.id === u.id ? { ...x, role } : x)));
        } catch (e) { alert(e.message); }
    };
    return (
        <div className="overflow-x-auto bg-white rounded-xl shadow">
            <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500">
                    <tr>{['Name', 'Email', 'Department', 'Role', 'Days worked', 'Strikes', ''].map((h) => <th key={h} className="p-3">{h}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.map((u) => (
                        <tr key={u.id} className="border-t">
                            <td className="p-3">{u.name}</td><td className="p-3">{u.email}</td><td className="p-3">{u.department || '—'}</td>
                            <td className="p-3 capitalize">{u.role}</td><td className="p-3">{u.daysWorked}</td>
                            <td className={`p-3 ${u.strikes ? 'text-red-600 font-semibold' : ''}`}>{u.strikes}</td>
                            <td className="p-3"><button onClick={() => toggleRole(u)} className="text-jumia underline">{u.role === 'admin' ? 'Remove admin' : 'Make admin'}</button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Office() {
    const mapEl = useRef(null);
    const map = useRef(null);
    const marker = useRef(null);
    const circle = useRef(null);
    const [form, setForm] = useState({ lat: '', lng: '', radius: 100, deadline: '08:10' });
    const [msg, setMsg] = useState({ text: '', ok: true });

    const place = (lat, lng, radius, pan = false) => {
        if (!marker.current) marker.current = L.marker([lat, lng]).addTo(map.current);
        else marker.current.setLatLng([lat, lng]);
        if (!circle.current) circle.current = L.circle([lat, lng], { radius }).addTo(map.current);
        else circle.current.setLatLng([lat, lng]).setRadius(radius);
        if (pan) map.current.setView([lat, lng], 17);
    };

    useEffect(() => {
        map.current = L.map(mapEl.current).setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map.current);
        map.current.on('click', (e) => {
            setForm((f) => { place(e.latlng.lat, e.latlng.lng, Number(f.radius) || 100); return { ...f, lat: e.latlng.lat.toFixed(6), lng: e.latlng.lng.toFixed(6) }; });
        });
        api('/admin/settings').then((s) => {
            setForm({ lat: s.officeLat ?? '', lng: s.officeLng ?? '', radius: s.radius, deadline: s.deadline });
            if (s.officeLat != null) place(s.officeLat, s.officeLng, s.radius, true);
        }).catch(() => { });
        return () => map.current.remove();
    }, []);

    useEffect(() => {
        if (form.lat !== '' && form.lng !== '' && map.current && marker.current) {
            place(Number(form.lat), Number(form.lng), Number(form.radius) || 100);
        }
    }, [form.radius]);

    const useMyLocation = () =>
        navigator.geolocation.getCurrentPosition(
            (p) => {
                const { latitude: lat, longitude: lng } = p.coords;
                place(lat, lng, Number(form.radius) || 100, true);
                setForm((f) => ({ ...f, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
            },
            () => setMsg({ text: 'Could not get your location', ok: false }),
            { enableHighAccuracy: true });

    const save = async () => {
        try {
            await api('/admin/settings', {
                method: 'PUT', body: {
                    officeLat: Number(form.lat), officeLng: Number(form.lng), radius: Number(form.radius), deadline: form.deadline,
                }
            });
            setMsg({ text: 'Office settings saved', ok: true });
        } catch (e) { setMsg({ text: e.message, ok: false }); }
    };

    return (
        <div className="grid gap-4">
            <p className="text-sm text-gray-600">Click on the map to pick your office location, or use your current position.</p>
            <div ref={mapEl} className="h-96 rounded-xl shadow z-0" />
            <div className="bg-white rounded-xl shadow p-4 grid sm:grid-cols-4 gap-3">
                <label className="grid text-sm">Latitude<input className={field} value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} /></label>
                <label className="grid text-sm">Longitude<input className={field} value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} /></label>
                <label className="grid text-sm">Allowed radius (m)<input type="number" className={field} value={form.radius} onChange={(e) => setForm({ ...form, radius: e.target.value })} /></label>
                <label className="grid text-sm">Clock-in deadline<input type="time" className={field} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></label>
            </div>
            <div className="flex items-center gap-3">
                <button onClick={useMyLocation} className="px-4 py-2 rounded-lg border border-jumia text-jumia hover:bg-jumia-light font-medium uppercase">Use my current location</button>
                <button onClick={save} className="px-4 py-2 rounded-lg bg-jumia hover:bg-jumia-dark text-white font-medium uppercase">Save</button>
                <span className={msg.ok ? 'text-green-600' : 'text-red-600'}>{msg.text}</span>
            </div>
        </div>
    );
}

export default function Admin() {
    const [tab, setTab] = useState('attendance');
    const tabs = { attendance: 'Attendance', staff: 'Staff', office: 'Office Location' };
    return (
        <main className="max-w-5xl mx-auto p-5">
            <h2 className="text-xl font-semibold mb-4">Admin Dashboard</h2>
            <div className="flex gap-2 mb-5">
                {Object.entries(tabs).map(([k, label]) => (
                    <button key={k} onClick={() => setTab(k)}
                        className={`px-4 py-2 rounded-lg font-medium uppercase ${tab === k ? 'bg-jumia text-white' : 'bg-white text-jumia hover:bg-jumia-light'}`}>
                        {label}
                    </button>
                ))}
            </div>
            {tab === 'attendance' && <Attendance />}
            {tab === 'staff' && <Staff />}
            {tab === 'office' && <Office />}
        </main>
    );
}
