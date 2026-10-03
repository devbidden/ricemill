const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    department: { type: String, default: '' },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['staff', 'admin'], default: 'staff' },
}, { timestamps: true });

const attendanceSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    clockIn: { type: Date, required: true },
    clockOut: { type: Date, default: null },
    lateStrike: { type: Boolean, default: false },
    missedClockOutStrike: { type: Boolean, default: false },
    photo: { type: String, select: false },
    latitude: Number,
    longitude: Number,
    distance: Number,
}, { timestamps: true });
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

// Single document holding the office location chosen by the admin.
const settingsSchema = new mongoose.Schema({
    key: { type: String, default: 'main', unique: true },
    officeLat: { type: Number, default: null },
    officeLng: { type: Number, default: null },
    radius: { type: Number, default: null },
    deadline: { type: String, default: null }, // HH:MM
});

module.exports = {
    User: mongoose.model('User', userSchema),
    Attendance: mongoose.model('Attendance', attendanceSchema),
    Settings: mongoose.model('Settings', settingsSchema),
};
