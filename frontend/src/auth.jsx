import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const IDLE_LIMIT_MS = 60 * 60 * 1000;

export async function api(path, { method = 'GET', body } = {}) {
    const token = localStorage.getItem('token');
    const res = await fetch(API_BASE + '/api' + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (res.status === 401 && token) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.dispatchEvent(new Event('auth-expired'));
        }
        throw new Error(data.message || 'Request failed');
    }
    return data;
}

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
    const [roleChecked, setRoleChecked] = useState(false);

    const authenticate = async (mode, body) => {
        const r = await api('/auth/' + mode, { method: 'POST', body });
        localStorage.setItem('token', r.token);
        localStorage.setItem('user', JSON.stringify(r.user));
        localStorage.setItem('lastActivity', String(Date.now()));
        setUser(r.user);
        setRoleChecked(true);
    };
    const logout = useCallback(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('lastActivity');
        setUser(null);
        setRoleChecked(false);
    }, []);

    // The cached role is only trusted after the server confirms it.
    const loggedIn = !!user;
    useEffect(() => {
        if (!loggedIn) return;
        api('/attendance/status').then((s) => {
            localStorage.setItem('user', JSON.stringify(s.user));
            setUser((u) => (u && u.role !== s.user.role ? s.user : u));
            setRoleChecked(true);
        }).catch(() => { });
    }, [loggedIn]);

    useEffect(() => {
        if (!user) return;
        const touch = () => localStorage.setItem('lastActivity', String(Date.now()));
        const check = () => {
            const last = Number(localStorage.getItem('lastActivity')) || 0;
            if (Date.now() - last > IDLE_LIMIT_MS) logout();
        };
        const events = ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'];
        let lastTouch = 0;
        const throttled = () => { if (Date.now() - lastTouch > 5000) { lastTouch = Date.now(); touch(); } };
        events.forEach((e) => window.addEventListener(e, throttled, { passive: true }));
        window.addEventListener('auth-expired', logout);
        check();
        const timer = setInterval(check, 30000);
        return () => {
            events.forEach((e) => window.removeEventListener(e, throttled));
            window.removeEventListener('auth-expired', logout);
            clearInterval(timer);
        };
    }, [user, logout]);

    const isAdmin = roleChecked && user?.role === 'admin';
    return <Ctx.Provider value={{ user, isAdmin, roleChecked, authenticate, logout }}>{children}</Ctx.Provider>;
}
