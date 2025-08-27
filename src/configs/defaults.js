import path from "path";

export const DEFAULTS = {
  days: 14, start: "20:00", end: "23:00", step: 30, duration: 2,
  unit: 11, type: 1, concurrency: 6, statePath: path.join(process.cwd(), "data", "auth.json"),
  headlessIfAuthed: true, timeout: 120000
};

export const BASE = "https://center.tennis.org.il";
export const LOGIN_URL = `${BASE}/self_services/login`;
export const INVITE_URL = `${BASE}/self_services/court_invitation`;