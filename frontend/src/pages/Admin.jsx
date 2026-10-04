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

function Pager({ page, pages, onChange }) {
    return (
        <div className="flex items-center justify-end gap-3 mt-3 text-sm">
            <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="px-3 py-1 rounded-lg bg-white shadow disabled:opacity-40">Prev</button>
            <span>Page {page} of {pages}</span>
            <button disabled={page >= pages} onClick={() => onChange(page + 1)} className="px-3 py-1 rounded-lg bg-white shadow disabled:opacity-40">Next</button>
        </div>
    );
}

function Attendance() {
    const [filters, setFilters] = useState({ search: '', from: dateStr(new Date()), to: dateStr(new Date()), status: '' });
    const [query, setQuery] = useState(filters);
    const [page, setPage] = useState(1);
    const [data, setData] = useState({ items: [], total: 0, pages: 1 });
    const [photo, setPhoto] = useState(null);
    const [error, setError] = useState('');

    // Debounce typing so each keystroke doesn't hit the API.
    useEffect(() => {
        const t = setTimeout(() => { setQuery(filters); setPage(1); }, 400);
        return () => clearTimeout(t);
    }, [filters]);

    const load = () => {
        const p = new URLSearchParams({ page, limit: 20 });
        Object.entries(query).forEach(([k, v]) => v && p.set(k, v));
        api('/admin/attendance?' + p).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
    };
    useEffect(load, [query, page]);

    const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

    const showPhoto = async (id) => {
        try { setPhoto((await api(`/admin/attendance/${id}/photo`)).photo); } catch (e) { setError(e.message); }
    };

    const remove = async (r) => {
        if (!confirm(`Delete ${r.user?.name || 'this'} record for ${r.date}?`)) return;
        try {
            await api(`/admin/attendance/${r._id}`, { method: 'DELETE' });
            if (data.items.length === 1 && page > 1) setPage(page - 1); else load();
        } catch (e) { setError(e.message); }
    };

    return (
        <div>
            <div className="flex flex-wrap items-end gap-3 mb-4">
                <input placeholder="Search name, email, department" className={field + ' w-64'} value={filters.search} onChange={set('search')} />
                <label className="text-xs text-gray-500 grid">From<input type="date" className={field} value={filters.from} onChange={set('from')} /></label>
                <label className="text-xs text-gray-500 grid">To<input type="date" className={field} value={filters.to} onChange={set('to')} /></label>
                <select className={field} value={filters.status} onChange={set('status')}>
                    <option value="">All statuses</option>
                    <option value="ontime">On time</option>
                    <option value="late">Late</option>
                    <option value="missed">Missed clock-out</option>
                </select>
                <button onClick={() => setFilters({ search: '', from: '', to: '', status: '' })} className="text-sm text-jumia underline pb-2">Clear / all dates</button>
                <span className="text-sm text-gray-500 pb-2">{data.total} record(s)</span>
            </div>
            {error && <p className="text-red-600 mb-2">{error}</p>}
            <div className="overflow-x-auto bg-white rounded-xl shadow">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500">
                        <tr>{['Staff', 'Date', 'Clock In', 'Clock Out', 'Distance', 'Strikes', 'Photo', ''].map((h, i) => <th key={i} className="p-3">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                        {data.items.map((r) => (
                            <tr key={r._id} className="border-t">
                                <td className="p-3">{r.user?.name || 'Deleted user'}<div className="text-xs text-gray-500">{r.user?.department || r.user?.email}</div></td>
                                <td className="p-3">{r.date}</td>
                                <td className="p-3">{fmt(r.clockIn)} {r.lateStrike && <span className="text-red-600 text-xs">(late)</span>}</td>
                                <td className="p-3">{fmt(r.clockOut)} {r.missedClockOutStrike && <span className="text-red-600 text-xs">(missed)</span>}</td>
                                <td className="p-3">{r.distance != null ? `${r.distance} m` : '—'}</td>
                                <td className="p-3">{(r.lateStrike ? 1 : 0) + (r.missedClockOutStrike ? 1 : 0)}</td>
                                <td className="p-3"><button onClick={() => showPhoto(r._id)} className="text-jumia underline">View</button></td>
                                <td className="p-3"><button onClick={() => remove(r)} className="text-red-600 underline">Delete</button></td>
                            </tr>
                        ))}
                        {!data.items.length && <tr><td colSpan={8} className="p-6 text-center text-gray-500">No records</td></tr>}
                    </tbody>
                </table>
            </div>
            <Pager page={page} pages={data.pages} onChange={setPage} />
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
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const PER_PAGE = 15;
    useEffect(() => { api('/admin/staff').then(setRows).catch(() => { }); }, []);
    const toggleRole = async (u) => {
        const role = u.role === 'admin' ? 'staff' : 'admin';
        try {
            await api(`/admin/staff/${u.id}/role`, { method: 'PUT', body: { role } });
            setRows((r) => r.map((x) => (x.id === u.id ? { ...x, role } : x)));
        } catch (e) { alert(e.message); }
    };
    const remove = async (u) => {
        if (!confirm(`Delete ${u.name} and all their attendance records?`)) return;
        try {
            await api(`/admin/staff/${u.id}`, { method: 'DELETE' });
            setRows((r) => r.filter((x) => x.id !== u.id));
        } catch (e) { alert(e.message); }
    };
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((u) => !q || [u.name, u.email, u.department].some((v) => (v || '').toLowerCase().includes(q)));
    const pages = Math.max(Math.ceil(filtered.length / PER_PAGE), 1);
    const shown = filtered.slice((Math.min(page, pages) - 1) * PER_PAGE, Math.min(page, pages) * PER_PAGE);
    return (
        <div>
            <input placeholder="Search name, email, department" className={field + ' w-64 mb-4'} value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            <div className="overflow-x-auto bg-white rounded-xl shadow">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500">
                        <tr>{['Name', 'Email', 'Department', 'Role', 'Days worked', 'Strikes', '', ''].map((h, i) => <th key={i} className="p-3">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                        {shown.map((u) => (
                            <tr key={u.id} className="border-t">
                                <td className="p-3">{u.name}</td><td className="p-3">{u.email}</td><td className="p-3">{u.department || '—'}</td>
                                <td className="p-3 capitalize">{u.role}</td><td className="p-3">{u.daysWorked}</td>
                                <td className={`p-3 ${u.strikes ? 'text-red-600 font-semibold' : ''}`}>{u.strikes}</td>
                                <td className="p-3"><button onClick={() => toggleRole(u)} className="text-jumia underline">{u.role === 'admin' ? 'Remove admin' : 'Make admin'}</button></td>
                                <td className="p-3"><button onClick={() => remove(u)} className="text-red-600 underline">Delete</button></td>
                            </tr>
                        ))}
                        {!shown.length && <tr><td colSpan={8} className="p-6 text-center text-gray-500">No staff found</td></tr>}
                    </tbody>
                </table>
            </div>
            <Pager page={Math.min(page, pages)} pages={pages} onChange={setPage} />
        </div>
    );
}

function Office() {
    const mapEl = useRef(null);
    const map = useRef(null);
    const marker = useRef(null);
    const circle = useRef(null);
    const [form, setForm] = useState({ lat: '', lng: '', radius: '', deadline: '' });
    const [msg, setMsg] = useState({ text: '', ok: true });
    const [gpsAccuracy, setGpsAccuracy] = useState(null);

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
            setGpsAccuracy(null);
            setForm((f) => { place(e.latlng.lat, e.latlng.lng, Number(f.radius) || 100); return { ...f, lat: e.latlng.lat.toFixed(6), lng: e.latlng.lng.toFixed(6) }; });
        });
        api('/admin/settings').then((s) => {
            setForm({ lat: s.officeLat ?? '', lng: s.officeLng ?? '', radius: s.radius ?? '', deadline: s.deadline ?? '' });
            if (s.officeLat != null) place(s.officeLat, s.officeLng, s.radius || 100, true);
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
                setGpsAccuracy(p.coords.accuracy);
                place(lat, lng, Number(form.radius) || 100, true);
                setForm((f) => ({ ...f, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
            },
            () => setMsg({ text: 'Could not get your location', ok: false }),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });

    const save = async () => {
        if ([form.lat, form.lng, form.radius, form.deadline].some((v) => v === '' || v == null)) {
            return setMsg({ text: 'Pick a location and fill in radius and deadline', ok: false });
        }
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
            {gpsAccuracy != null && <p className={`text-sm ${Number(form.radius) < gpsAccuracy ? 'text-amber-700' : 'text-gray-600'}`}>Current GPS fix accuracy: about ±{Math.round(gpsAccuracy)} m{Number(form.radius) < gpsAccuracy ? ' (less precise than the allowed radius; choose the pin on the map or use a more accurate device)' : ''}.</p>}
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
