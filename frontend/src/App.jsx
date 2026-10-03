import { Link, Route, Routes, Navigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Clock from './pages/Clock.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
    const { user, logout } = useAuth();
    return (
        <div className="min-h-screen">
            <header className="bg-jumia text-white px-6 py-4 flex items-center justify-between shadow">
                <div>
                    <h1 className="text-xl font-bold">Clock In</h1>
                    <p className="text-sm opacity-90">Verify location &amp; capture photo</p>
                </div>
                <nav className="flex gap-4 text-sm items-center font-medium hover:*:underline">
                    <Link to="/" className="hover:underline">Clock</Link>
                    {user?.role === 'admin' && <Link to="/admin" className="hover:underline">Admin</Link>}
                    {user && <button onClick={logout} className="hover:underline">Logout</button>}
                </nav>
            </header>
            <Routes>
                <Route path="/" element={<Clock />} />
                <Route path="/admin" element={user?.role === 'admin' ? <Admin /> : <Navigate to="/" />} />
                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        </div>
    );
}
