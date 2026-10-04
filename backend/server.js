require('dotenv').config();
if (process.env.DNS_SERVERS) require('dns').setServers(process.env.DNS_SERVERS.split(','));
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Attendance, Settings } = require('./models');

const PORT = process.env.PORT;
const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function distanceM(lat1, lng1, lat2, lng2) {
    const R = 6371000, rad = (x) => (x * Math.PI) / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
        Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

const getSettings = async () =>
    (await Settings.findOne({ key: 'main' })) || (await Settings.create({ key: 'main' }));

// A past day without clock-out counts as a strike.
const sweepMissingClockOuts = () =>
    Attendance.updateMany(
        { date: { $lt: dateKey(new Date()) }, clockOut: null, missedClockOutStrike: false },
        { missedClockOutStrike: true });

async function strikesFor(userId) {
    const recs = await Attendance.find({ user: userId }, 'lateStrike missedClockOutStrike');
    return recs.reduce((n, r) => n + (r.lateStrike ? 1 : 0) + (r.missedClockOutStrike ? 1 : 0), 0);
}

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, department: u.department, role: u.role });
const sign = (u) => jwt.sign({ id: u._id }, JWT_SECRET, { expiresIn: '1h' });

async function auth(req, res, next) {
    try {
        const payload = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET);
        const user = await User.findById(payload.id);
        if (!user) throw new Error();
        req.user = user;
        next();
    } catch {
        res.status(401).json({ message: 'Unauthorized' });
    }
}
const adminOnly = (req, res, next) =>
    req.user.role === 'admin' ? next() : res.status(403).json({ message: 'Admin access required' });

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
});

async function locationCheck(body) {
    const s = await getSettings();
    if (s.officeLat == null || !s.radius || !s.deadline)
        return { ok: false, message: 'Office location has not been set by the admin yet' };
    const { latitude, longitude } = body || {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number')
        return { ok: false, message: 'Location required' };
    const distance = Math.round(distanceM(latitude, longitude, s.officeLat, s.officeLng));
    return distance <= s.radius
        ? { ok: true, distance, radius: s.radius, settings: s }
        : { ok: false, distance, radius: s.radius, message: `You are ${distance} m from the office; the allowed radius is ${s.radius} m` };
}

const app = express();
app.use(cors(CORS_ORIGINS.length ? { origin: CORS_ORIGINS } : undefined));
app.use(express.json({ limit: '5mb' }));

app.post('/api/auth/register', wrap(async (req, res) => {
    const { name, email, password, department } = req.body || {};
    if (!name || !email || !password || password.length < 6)
        return res.status(400).json({ message: 'Name, email and a password of 6+ characters are required' });
    if (await User.findOne({ email: String(email).toLowerCase().trim() }))
        return res.status(409).json({ message: 'Email already registered' });
    const role = ADMIN_EMAILS.includes(String(email).toLowerCase().trim()) ? 'admin' : 'staff';
    const user = await User.create({ name, email, department, role, passwordHash: await bcrypt.hash(password, 10) });
    res.status(201).json({ token: sign(user), user: publicUser(user) });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
    const { email, password } = req.body || {};
    const user = await User.findOne({ email: String(email || '').toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash)))
        return res.status(401).json({ message: 'Invalid email or password' });
    if (user.role !== 'admin' && ADMIN_EMAILS.includes(user.email)) { user.role = 'admin'; await user.save(); }
    res.json({ token: sign(user), user: publicUser(user) });
}));

app.get('/api/attendance/status', auth, wrap(async (req, res) => {
    await sweepMissingClockOuts();
    const today = await Attendance.findOne({ user: req.user._id, date: dateKey(new Date()) });
    const s = await getSettings();
    res.json({
        user: publicUser(req.user),
        today: today ? { clockIn: today.clockIn, clockOut: today.clockOut, late: today.lateStrike } : null,
        strikes: await strikesFor(req.user._id),
        officeSet: s.officeLat != null && !!s.radius && !!s.deadline,
        deadline: s.deadline,
    });
}));

app.post('/api/attendance/verify-location', auth, wrap(async (req, res) => {
    const r = await locationCheck(req.body);
    res.json({ verified: r.ok, distance: r.distance, radius: r.radius, message: r.ok ? 'Location verified' : r.message });
}));

app.post('/api/attendance/clock-in', auth, wrap(async (req, res) => {
    const now = new Date();
    if (await Attendance.findOne({ user: req.user._id, date: dateKey(now) }))
        return res.status(400).json({ message: 'Already clocked in today' });
    const loc = await locationCheck(req.body);
    if (!loc.ok) return res.status(403).json({ message: loc.message });
    const { photo, latitude, longitude } = req.body;
    if (!photo || !String(photo).startsWith('data:image/'))
        return res.status(400).json({ message: 'Photo is required' });
    const [h, m] = loc.settings.deadline.split(':').map(Number);
    const late = now.getHours() * 60 + now.getMinutes() > h * 60 + m;
    await Attendance.create({
        user: req.user._id, date: dateKey(now), clockIn: now, lateStrike: late,
        photo, latitude, longitude, distance: loc.distance,
    });
    res.json({
        message: late ? 'Clocked in late. A strike has been recorded.' : 'Clocked in successfully',
        late, strikes: await strikesFor(req.user._id),
    });
}));

app.post('/api/attendance/clock-out', auth, wrap(async (req, res) => {
    const rec = await Attendance.findOne({ user: req.user._id, date: dateKey(new Date()) });
    if (!rec) return res.status(400).json({ message: 'You have not clocked in today' });
    if (rec.clockOut) return res.status(400).json({ message: 'Already clocked out today' });
    const loc = await locationCheck(req.body);
    if (!loc.ok) return res.status(403).json({ message: loc.message });
    rec.clockOut = new Date();
    await rec.save();
    res.json({ message: 'Clocked out successfully' });
}));

app.get('/api/attendance/history', auth, wrap(async (req, res) => {
    await sweepMissingClockOuts();
    res.json(await Attendance.find({ user: req.user._id }).sort({ date: -1 }));
}));

// ---- Admin ----
app.get('/api/admin/settings', auth, adminOnly, wrap(async (req, res) => res.json(await getSettings())));

app.put('/api/admin/settings', auth, adminOnly, wrap(async (req, res) => {
    const { officeLat, officeLng, radius, deadline } = req.body || {};
    if (typeof officeLat !== 'number' || typeof officeLng !== 'number' ||
        Math.abs(officeLat) > 90 || Math.abs(officeLng) > 180)
        return res.status(400).json({ message: 'Valid office coordinates are required' });
    if (!(radius >= 10 && radius <= 5000)) return res.status(400).json({ message: 'Radius must be 10-5000 m' });
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(deadline || '')) return res.status(400).json({ message: 'Deadline must be HH:MM' });
    const s = await getSettings();
    Object.assign(s, { officeLat, officeLng, radius, deadline });
    await s.save();
    res.json(s);
}));

app.get('/api/admin/attendance', auth, adminOnly, wrap(async (req, res) => {
    await sweepMissingClockOuts();
    const { date, from, to, search, status } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const filter = {};
    if (date) filter.date = String(date);
    else if (from || to) filter.date = { ...(from && { $gte: String(from) }), ...(to && { $lte: String(to) }) };
    if (status === 'late') filter.lateStrike = true;
    else if (status === 'missed') filter.missedClockOutStrike = true;
    else if (status === 'ontime') Object.assign(filter, { lateStrike: false, missedClockOutStrike: false });
    if (search && String(search).trim()) {
        const rx = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const ids = await User.find({ $or: [{ name: rx }, { email: rx }, { department: rx }] }).distinct('_id');
        filter.user = { $in: ids };
    }
    const [items, total] = await Promise.all([
        Attendance.find(filter).populate('user', 'name email department')
            .sort({ clockIn: -1 }).skip((page - 1) * limit).limit(limit),
        Attendance.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
}));

app.delete('/api/admin/attendance/:id', auth, adminOnly, wrap(async (req, res) => {
    const rec = await Attendance.findByIdAndDelete(req.params.id);
    if (!rec) return res.status(404).json({ message: 'Record not found' });
    res.json({ message: 'Record deleted' });
}));

app.delete('/api/admin/staff/:id', auth, adminOnly, wrap(async (req, res) => {
    if (String(req.user._id) === req.params.id) return res.status(400).json({ message: 'You cannot delete your own account' });
    const u = await User.findByIdAndDelete(req.params.id);
    if (!u) return res.status(404).json({ message: 'User not found' });
    await Attendance.deleteMany({ user: u._id });
    res.json({ message: 'User and their records deleted' });
}));

app.get('/api/admin/attendance/:id/photo', auth, adminOnly, wrap(async (req, res) => {
    const rec = await Attendance.findById(req.params.id).select('+photo');
    if (!rec) return res.status(404).json({ message: 'Not found' });
    res.json({ photo: rec.photo });
}));

app.get('/api/admin/staff', auth, adminOnly, wrap(async (req, res) => {
    await sweepMissingClockOuts();
    const users = await User.find().sort({ name: 1 });
    const recs = await Attendance.find({}, 'user lateStrike missedClockOutStrike');
    res.json(users.map((u) => {
        const mine = recs.filter((r) => String(r.user) === String(u._id));
        return {
            ...publicUser(u), daysWorked: mine.length,
            strikes: mine.reduce((n, r) => n + (r.lateStrike ? 1 : 0) + (r.missedClockOutStrike ? 1 : 0), 0),
        };
    }));
}));

app.put('/api/admin/staff/:id/role', auth, adminOnly, wrap(async (req, res) => {
    const { role } = req.body || {};
    if (!['staff', 'admin'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
    if (String(req.user._id) === req.params.id) return res.status(400).json({ message: 'You cannot change your own role' });
    const u = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!u) return res.status(404).json({ message: 'User not found' });
    res.json(publicUser(u));
}));

const dist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
        app.listen(PORT, () => console.log(`Portal running on http://localhost:${PORT}`));
    })
    .catch((e) => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
