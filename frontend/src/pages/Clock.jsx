import { useEffect, useRef, useState } from 'react';
import { api, useAuth } from '../auth.jsx';

const btn = 'w-full rounded-lg py-3 font-medium uppercase tracking-wide text-white shadow disabled:opacity-60';
const input = 'w-full rounded-lg border border-gray-300 p-3';

function AuthModal({ mode, onClose }) {
    const { authenticate } = useAuth();
    const [form, setForm] = useState({ name: '', department: '', email: '', password: '' });
    const [error, setError] = useState('');
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const submit = async (e) => {
        e.preventDefault();
        try {
            await authenticate(mode, mode === 'register' ? form : { email: form.email, password: form.password });
            onClose();
        } catch (err) { setError(err.message); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 grid place-items-center p-5">
            <form onSubmit={submit} className="bg-white rounded-xl p-6 w-full max-w-sm grid gap-3">
                <h3 className="text-lg font-semibold capitalize">{mode}</h3>
                {mode === 'register' && (
                    <>
                        <input className={input} placeholder="Full name" value={form.name} onChange={set('name')} required />
                        <input className={input} placeholder="Department (optional)" value={form.department} onChange={set('department')} />
                    </>
                )}
                <input className={input} type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
                <input className={input} type="password" placeholder="Password" minLength={6} value={form.password} onChange={set('password')} required />
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <button className={btn + ' bg-jumia hover:bg-jumia-dark'}>Submit</button>
                <button type="button" onClick={onClose} className="rounded-lg py-3 uppercase font-medium text-jumia hover:bg-jumia-light">Cancel</button>
            </form>
        </div>
    );
}

function getPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
        navigator.geolocation.getCurrentPosition(
            (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
            () => reject(new Error('Please turn on location services (GPS)')),
            { enableHighAccuracy: true, timeout: 15000 });
    });
}

export default function Clock() {
    const { user } = useAuth();
    const [now, setNow] = useState(new Date());
    const [modal, setModal] = useState(null);
    const [info, setInfo] = useState(null);
    const [status, setStatus] = useState({ msg: '', ok: null });
    const [busy, setBusy] = useState(false);
    const [cameraOn, setCameraOn] = useState(false);
    const [coords, setCoords] = useState(null);
    const videoRef = useRef(null);
    const streamRef = useRef(null);

    useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
    useEffect(() => () => stopCamera(), []);

    const refresh = async () => {
        if (!user) return setInfo(null);
        try { setInfo(await api('/attendance/status')); } catch (e) { setStatus({ msg: e.message, ok: false }); }
    };
    useEffect(() => {
        if (!user) { stopCamera(); setStatus({ msg: '', ok: null }); }
        refresh();
    }, [user]);

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCameraOn(false);
    };

    const run = (fn) => async () => {
        setBusy(true);
        try { await fn(); } catch (e) { setStatus({ msg: e.message, ok: false }); }
        setBusy(false);
    };

    const verify = run(async () => {
        setStatus({ msg: 'Verifying location...', ok: null });
        const pos = await getPosition();
        const r = await api('/attendance/verify-location', { method: 'POST', body: pos });
        if (!r.verified) throw new Error(r.message);
        streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        setCoords(pos);
        setCameraOn(true);
        setStatus({ msg: 'Location verified. Face the camera and click Clock In.', ok: true });
    });

    useEffect(() => {
        if (cameraOn && videoRef.current) videoRef.current.srcObject = streamRef.current;
    }, [cameraOn]);

    const clockIn = run(async () => {
        const v = videoRef.current;
        const c = document.createElement('canvas');
        c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0);
        const r = await api('/attendance/clock-in', { method: 'POST', body: { ...coords, photo: c.toDataURL('image/jpeg', 0.7) } });
        stopCamera();
        setStatus({ msg: r.message, ok: !r.late });
        await refresh();
    });

    const clockOut = run(async () => {
        const pos = await getPosition();
        const r = await api('/attendance/clock-out', { method: 'POST', body: pos });
        setStatus({ msg: r.message, ok: true });
        await refresh();
    });

    const h = now.getHours();
    const greeting = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
    const today = info?.today;
    const statusColor = status.ok === true ? 'text-green-600' : status.ok === false ? 'text-red-600' : '';

    return (
        <main className="max-w-lg mx-auto p-5 grid gap-5">
            <section className="text-center bg-gradient-to-br from-jumia to-jumia-dark text-white rounded-xl p-6 shadow">
                <div className="size-[72px] rounded-full bg-white text-jumia grid place-items-center text-2xl font-bold mx-auto mb-3">RM</div>
                <h2 className="text-xl font-semibold">Welcome to RiceMill Staff Portal</h2>
                <p className="opacity-90">{greeting}</p>
                <p>Ready to Clock-in?</p>
                {user ? (
                    <p className="text-sm opacity-90 mt-2">Signed in as {user.name}</p>
                ) : (
                    <div className="flex gap-2 justify-center mt-3">
                        <button onClick={() => setModal('register')} className="px-5 py-2 rounded-lg border border-white text-white hover:bg-white/20 font-medium uppercase">Register</button>
                        <button onClick={() => setModal('login')} className="px-5 py-2 rounded-lg bg-white text-jumia hover:bg-jumia-light font-medium uppercase">Login</button>
                    </div>
                )}
            </section>

            <section className="bg-white rounded-xl p-5 shadow text-center">
                <h3 className="font-semibold text-lg">Time Clock</h3>
                <p className="text-sm text-gray-500">Manage your work time</p>
                <p className="mt-4 text-xs text-gray-500">Current Time</p>
                <div className="text-4xl font-bold text-jumia">{now.toLocaleTimeString('en-US')}</div>
                <div className="text-sm text-gray-500">
                    {now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>

                {cameraOn && <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg mt-3 bg-black" />}
                <p className={`mt-3 font-semibold ${statusColor}`}>{status.msg}</p>
                {info && <p className="text-sm text-gray-500">Strikes: {info.strikes}</p>}
                {info && !info.officeSet && (
                    <p className="text-sm text-amber-600 mt-2">The admin has not set the office location yet.</p>
                )}

                {user && info && !today && !cameraOn && (
                    <button disabled={busy} onClick={verify} className={btn + ' bg-jumia hover:bg-jumia-dark mt-3'}>Verify Location</button>
                )}
                {cameraOn && <button disabled={busy} onClick={clockIn} className={btn + ' bg-jumia hover:bg-jumia-dark mt-3'}>Clock In</button>}
                {today && !today.clockOut && <button disabled={busy} onClick={clockOut} className={btn + ' bg-red-600 mt-3'}>Clock Out</button>}
                {today?.clockOut && <p className="mt-3 text-green-600 font-semibold">You have completed your day.</p>}
            </section>

            <section className="bg-white rounded-xl p-5 shadow">
                <h3 className="font-semibold text-lg">Clock Instructions</h3>
                <p className="text-sm text-gray-500">Welcome! Please note the following:</p>
                <ul className="my-3 leading-8">
                    <li>✅ Clock-in deadline: {info?.deadline || '08:10'} daily.</li>
                    <li>🚫 Late clock-ins after the deadline will automatically result in a strike.</li>
                    <li>🚫 No clock-Out will automatically result in a strike.</li>
                    <li>📍 This system is location-sensitive — you must be physically present in the office to clock in.</li>
                    <li>🕓 Ensure your device's location services (GPS) are turned on before clocking in.</li>
                </ul>
                <p>Click "Clock In" once you are in the office and ready to begin work.</p>
            </section>

            {modal && <AuthModal mode={modal} onClose={() => setModal(null)} />}
        </main>
    );
}
