// ============================================================
// Local days and weeks
// ------------------------------------------------------------
// "Today" for daily limits (coins, resources, trades, AI drafting) and
// "this week" for participation points follow the app's time zone, so
// limits reset at local midnight - not at 8am, which is when UTC midnight
// falls in Singapore. The dashboard uses the same helpers with each
// class's own zone.
//
// APP_TIMEZONE (an IANA name such as Asia/Singapore) sets the app's zone;
// it defaults to Singapore.
// ============================================================

const DAY = 86400000;
const DEFAULT_TZ = 'Asia/Singapore';

function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const APP_TZ = isValidTimeZone(process.env.APP_TIMEZONE) ? process.env.APP_TIMEZONE : DEFAULT_TZ;

// The wall-clock time in `tz` at instant t, written as if it were UTC
const formatters = new Map();
function wallClock(t, tz) {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
  }
  const p = Object.fromEntries(formatters.get(tz).formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}
const offset = (t, tz) => wallClock(t, tz) - Math.floor(t / 1000) * 1000;

// A "local date" is the calendar date in `tz`, encoded as UTC midnight of
// that date, so date arithmetic is plain day steps.
const localDate = (t, tz = APP_TZ) => Math.floor(wallClock(t, tz) / DAY) * DAY;
// local midnight of a local date -> the real instant
function instantOf(date, tz = APP_TZ) {
  const guess = date - offset(date, tz);
  return date - offset(guess, tz);
}
const mondayOf = (date) => date - ((new Date(date).getUTCDay() + 6) % 7) * DAY;

// Day of week (0 = Monday) and hour (0-23) on the local clock
function weekdayHour(t, tz = APP_TZ) {
  const w = new Date(wallClock(t, tz));
  return { weekday: (w.getUTCDay() + 6) % 7, hour: w.getUTCHours() };
}

// 'YYYY-MM-DD' keys for "same day" / "same week" checks
const iso = (date) => new Date(date).toISOString().slice(0, 10);
const dayKey = (t, tz = APP_TZ) => iso(localDate(t, tz));
const weekKey = (t, tz = APP_TZ) => iso(mondayOf(localDate(t, tz))); // the Monday that starts the week

module.exports = { DAY, DEFAULT_TZ, APP_TZ, isValidTimeZone, localDate, instantOf, mondayOf, weekdayHour, dayKey, weekKey };
