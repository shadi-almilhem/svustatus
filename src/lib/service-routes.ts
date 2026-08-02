export const SERVICE_ROUTE_IDS = [
  "svuis",
  "lms",
  "mail",
  "website",
  "requests",
] as const;

export type ServiceRouteId = (typeof SERVICE_ROUTE_IDS)[number];

const SERVICE_ROUTE_SET = new Set<string>(SERVICE_ROUTE_IDS);

export function isServiceRouteId(value: string): value is ServiceRouteId {
  return SERVICE_ROUTE_SET.has(value);
}

export function getMonitorPath(id: string) {
  return isServiceRouteId(id) ? `/${id}` : "/";
}

export function getMonitorIdFromPath(pathname: string) {
  const segment = pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  return isServiceRouteId(segment) ? segment : null;
}
