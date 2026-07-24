import type { TeamMember } from "./team-members";

export const teamSessionStorageKey = "firecontrol:team-session";
export const teamSessionUpdatedEvent = "firecontrol:team-session-updated";

function clearRememberedSession() {
  window.localStorage.removeItem(teamSessionStorageKey);
}

export function readTeamSession<T = TeamMember>(): T | null {
  if (typeof window === "undefined") return null;

  clearRememberedSession();

  try {
    const raw = window.sessionStorage.getItem(teamSessionStorageKey);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    window.sessionStorage.removeItem(teamSessionStorageKey);
    return null;
  }
}

export function writeTeamSession(member: unknown) {
  if (typeof window === "undefined") return;

  clearRememberedSession();
  window.sessionStorage.setItem(teamSessionStorageKey, JSON.stringify(member));
  window.dispatchEvent(new Event(teamSessionUpdatedEvent));
}

export function clearTeamSession() {
  if (typeof window === "undefined") return;

  window.sessionStorage.removeItem(teamSessionStorageKey);
  window.localStorage.removeItem(teamSessionStorageKey);
  window.dispatchEvent(new Event(teamSessionUpdatedEvent));
}
