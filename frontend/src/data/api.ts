/**
 * API client — fetches live emergency cases from the backend.
 * Replaces mock data with real API calls.
 */

import { haversineKm } from "@/lib/geo";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────

export type SeverityLevel = "critical" | "severe" | "moderate" | "mild";

export interface Patient {
  patientAge: number;
  signsAndSymptoms: string[];
  severity: SeverityLevel;
  levelOfConsciousness: string;
  breathingStatus: string;
  traumaHistory: string;
  knownChronicDiseases: string[];
  painScore: number;
}

export interface EmergencyCase {
  id: string;
  timeOfReport: string;
  latitude: number;
  longitude: number;
  placeName: string;
  callerPhone: string;
  victimName: string | null;
  patients: Patient[];
  severity: SeverityLevel;
  numberOfPatients: number;
  patientAge: number;
  signsAndSymptoms: string[];
  levelOfConsciousness: string;
  breathingStatus: string;
  traumaHistory: string;
  knownChronicDiseases: string[];
  painScore: number;
  ambulanceStatus: "dispatched" | "en_route" | "on_scene" | "pending";
  assignedHospital: string | null;
}

export interface Hospital {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  emergencyBeds: { available: number; total: number };
  icuBeds: { available: number; total: number };
  traumaUnit: boolean;
  cardiology: boolean;
  pediatrics: boolean;
  neurosurgery: boolean;
  radiology: boolean;
  laboratory: boolean;
  pharmacy: boolean;
  burnUnit: boolean;
  orthopedics: boolean;
  ophthalmology: boolean;
  occupancyPercentage: number;
}

/** Keys of Hospital that represent medical services (boolean). */
export type HospitalServiceKey =
  | "traumaUnit"
  | "cardiology"
  | "pediatrics"
  | "neurosurgery"
  | "radiology"
  | "laboratory"
  | "pharmacy"
  | "burnUnit"
  | "orthopedics"
  | "ophthalmology";

/** Infer required hospital services from case symptoms (e.g. Cardiac arrest → cardiology). */
export function getRequiredServicesForCase(c: EmergencyCase): HospitalServiceKey[] {
  const text = [
    ...(c.signsAndSymptoms ?? []),
    c.traumaHistory ?? "",
    ...(c.knownChronicDiseases ?? []),
    ...(c.patients?.flatMap((p) => [...(p.signsAndSymptoms ?? []), p.traumaHistory ?? ""]) ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const out = new Set<HospitalServiceKey>();
  if (/\b(cardiac|heart|pulse|arrest|chest)\b/.test(text)) out.add("cardiology");
  if (/\b(bleeding|trauma|unconscious|severe\s+injury|hemorrhage)\b/.test(text)) out.add("traumaUnit");
  if (/\b(fracture|bone|ortho|broken)\b/.test(text)) out.add("orthopedics");
  if (/\b(child|pediatric|baby|infant)\b/.test(text)) out.add("pediatrics");
  if (/\b(brain|neuro|stroke|head\s+injury|coma)\b/.test(text)) out.add("neurosurgery");
  if (/\b(burn)\b/.test(text)) out.add("burnUnit");
  if (/\b(eye|ophthal|vision)\b/.test(text)) out.add("ophthalmology");
  return [...out];
}

/** Occupancy percentage derived from emergency beds (single source of truth). */
export function computeEmergencyOccupancyPercentage(h: Hospital): number {
  const { available, total } = h.emergencyBeds;
  if (total <= 0) return 0;
  return Math.round(((total - available) / total) * 100);
}

/** Nearest hospital that has required beds, optional services, and required service keys. */
function findNearestHospitalWithCapacityAndServices(
  lat: number,
  lng: number,
  hospitals: Hospital[],
  usedCapacity: Map<string, number>,
  requiredBeds: number,
  requiredServices: HospitalServiceKey[]
): Hospital | null {
  const hasServices = (h: Hospital) =>
    requiredServices.every((key) => h[key] === true);
  const byDist = [...hospitals].sort(
    (a, b) =>
      haversineKm(lat, lng, a.latitude, a.longitude) -
      haversineKm(lat, lng, b.latitude, b.longitude)
  );
  // Prefer nearest with capacity + all required services
  for (const h of byDist) {
    const used = usedCapacity.get(h.name) ?? 0;
    const available = Math.max(0, h.emergencyBeds.available - used);
    if (available >= requiredBeds && hasServices(h)) return h;
  }
  // Fallback: nearest with capacity (may lack some services)
  for (const h of byDist) {
    const used = usedCapacity.get(h.name) ?? 0;
    const available = Math.max(0, h.emergencyBeds.available - used);
    if (available >= requiredBeds) return h;
  }
  return byDist[0] ?? null;
}

/** Group cases by place and assign each group to nearest hospital with capacity and required services. */
export function assignCasesToHospitals(
  cases: EmergencyCase[],
  hospitals: Hospital[]
): EmergencyCase[] {
  if (hospitals.length === 0) return cases.map((c) => ({ ...c, assignedHospital: null }));

  const byPlace = new Map<string, EmergencyCase[]>();
  for (const c of cases) {
    const list = byPlace.get(c.placeName) ?? [];
    list.push(c);
    byPlace.set(c.placeName, list);
  }

  const severityOrder: Record<SeverityLevel, number> = {
    critical: 0,
    severe: 1,
    moderate: 2,
    mild: 3,
  };
  const placeGroups = Array.from(byPlace.entries()).map(([placeName, caseList]) => {
    const lat =
      caseList.reduce((s, c) => s + c.latitude, 0) / caseList.length;
    const lng =
      caseList.reduce((s, c) => s + c.longitude, 0) / caseList.length;
    const totalVictims = caseList.reduce((s, c) => s + c.numberOfPatients, 0);
    const allServices = new Set<HospitalServiceKey>();
    caseList.forEach((c) => getRequiredServicesForCase(c).forEach((k) => allServices.add(k)));
    const requiredServices = [...allServices];
    const sorted = [...caseList].sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );
    return {
      placeName,
      lat,
      lng,
      caseList: sorted,
      totalVictims,
      requiredServices,
    };
  });

  placeGroups.sort(
    (a, b) => {
      const worstA = Math.min(...a.caseList.map((c) => severityOrder[c.severity]));
      const worstB = Math.min(...b.caseList.map((c) => severityOrder[c.severity]));
      if (worstA !== worstB) return worstA - worstB;
      return b.totalVictims - a.totalVictims;
    }
  );

  const usedCapacity = new Map<string, number>();
  const placeToHospital = new Map<string, string>();

  for (const g of placeGroups) {
    const assigned = findNearestHospitalWithCapacityAndServices(
      g.lat,
      g.lng,
      hospitals,
      usedCapacity,
      g.totalVictims,
      g.requiredServices
    );
    if (assigned) {
      const used = usedCapacity.get(assigned.name) ?? 0;
      usedCapacity.set(assigned.name, used + g.totalVictims);
      placeToHospital.set(g.placeName, assigned.name);
    }
  }

  return cases.map((c) => ({
    ...c,
    assignedHospital: placeToHospital.get(c.placeName) ?? null,
  }));
}

export interface PlaceSeverity {
  placeName: string;
  latitude: number;
  longitude: number;
  totalActiveCases: number;
  critical: number;
  severe: number;
  moderate: number;
  mild: number;
  avgResponseTimeMinutes: number;
  isAlertZone: boolean;
}

// ── Severity mapping (backend → frontend) ──────────────────
function mapSeverity(backendSev: string): SeverityLevel {
  const s = backendSev?.toUpperCase() || "MODERATE";
  if (s === "CRITICAL") return "critical";
  if (s === "HIGH") return "severe";
  if (s === "MODERATE") return "moderate";
  return "mild";
}

// ── Backend report → frontend EmergencyCase ────────────────
interface BackendReport {
  report_id: string;
  timestamp: string;
  latitude?: number | null;
  longitude?: number | null;
  location?: string | null;
  caller_phone?: string | null;
  severity: string;
  patient_name?: string | null;
  age?: number | null;
  gender?: string | null;
  is_conscious?: boolean | null;
  is_breathing?: boolean | null;
  has_heavy_bleeding?: boolean | null;
  situation_description?: string;
  disaster_type?: string | null;
  num_victims?: number | null;
  detected_risk_factors?: string[];
  vital_signs_reported?: Record<string, string>;
  callback_status?: string;
  is_trapped?: boolean | null;
  indoor_outdoor?: string | null;
  environmental_dangers?: string | null;
}

function mapReportToCase(r: BackendReport): EmergencyCase {
  const sev = mapSeverity(r.severity);
  const age = r.age ?? 0;
  const symptoms = r.detected_risk_factors ?? [];
  if (r.situation_description && symptoms.length === 0) {
    symptoms.push(r.situation_description.slice(0, 80));
  }

  const consciousness = r.is_conscious === true
    ? "Alert"
    : r.is_conscious === false
      ? "Unresponsive"
      : r.vital_signs_reported?.conscious === "yes"
        ? "Alert"
        : r.vital_signs_reported?.conscious === "no"
          ? "Unresponsive"
          : "Unknown";

  const breathing = r.is_breathing === true
    ? "Normal"
    : r.is_breathing === false
      ? "Absent"
      : r.vital_signs_reported?.breathing === "yes"
        ? "Normal"
        : r.vital_signs_reported?.breathing === "no"
          ? "Absent"
          : "Unknown";

  const trauma = r.disaster_type ?? r.environmental_dangers ?? "Unknown";
  const chronic: string[] = [];
  const painScore = sev === "critical" ? 9 : sev === "severe" ? 7 : sev === "moderate" ? 5 : 3;
  const numPatients = r.num_victims ?? 1;

  const patient: Patient = {
    patientAge: age,
    signsAndSymptoms: symptoms,
    severity: sev,
    levelOfConsciousness: consciousness,
    breathingStatus: breathing,
    traumaHistory: trauma,
    knownChronicDiseases: chronic,
    painScore,
  };

  const callbackMap: Record<string, EmergencyCase["ambulanceStatus"]> = {
    pending: "pending",
    in_progress: "dispatched",
    resolved: "on_scene",
    completed: "on_scene",
  };

  return {
    id: r.report_id.slice(0, 13).toUpperCase(),
    timeOfReport: r.timestamp,
    latitude: r.latitude ?? 31.6295,
    longitude: r.longitude ?? -7.9811,
    placeName: r.location ?? "Unknown",
    callerPhone: r.caller_phone ?? "N/A",
    victimName: r.patient_name ?? null,
    patients: Array.from({ length: numPatients }, () => ({ ...patient })),
    severity: sev,
    numberOfPatients: numPatients,
    patientAge: age,
    signsAndSymptoms: symptoms,
    levelOfConsciousness: consciousness,
    breathingStatus: breathing,
    traumaHistory: trauma,
    knownChronicDiseases: chronic,
    painScore,
    ambulanceStatus: callbackMap[r.callback_status ?? "pending"] ?? "pending",
    assignedHospital: null,
  };
}

// ── Hospitals (static — real Morocco hospitals) ────────────
export const hospitals: Hospital[] = [
  {
    id: "h1", name: "CHU Mohammed VI", latitude: 31.6340, longitude: -8.0150,
    emergencyBeds: { available: 3, total: 30 }, icuBeds: { available: 1, total: 12 },
    traumaUnit: true, cardiology: true, pediatrics: true, neurosurgery: true,
    radiology: true, laboratory: true, pharmacy: true, burnUnit: true, orthopedics: true, ophthalmology: true,
    occupancyPercentage: 92,
  },
  {
    id: "h2", name: "Hôpital Ibn Tofail", latitude: 31.6280, longitude: -7.9920,
    emergencyBeds: { available: 8, total: 25 }, icuBeds: { available: 3, total: 8 },
    traumaUnit: true, cardiology: true, pediatrics: true, neurosurgery: false,
    radiology: true, laboratory: true, pharmacy: true, burnUnit: false, orthopedics: true, ophthalmology: false,
    occupancyPercentage: 74,
  },
  {
    id: "h3", name: "Clinique Al Farabi", latitude: 31.6400, longitude: -8.0050,
    emergencyBeds: { available: 5, total: 15 }, icuBeds: { available: 2, total: 5 },
    traumaUnit: false, cardiology: true, pediatrics: false, neurosurgery: false,
    radiology: true, laboratory: true, pharmacy: true, burnUnit: false, orthopedics: false, ophthalmology: true,
    occupancyPercentage: 65,
  },
  {
    id: "h4", name: "Hôpital Régional Essaouira", latitude: 31.5100, longitude: -9.7600,
    emergencyBeds: { available: 10, total: 20 }, icuBeds: { available: 4, total: 6 },
    traumaUnit: true, cardiology: false, pediatrics: true, neurosurgery: false,
    radiology: true, laboratory: true, pharmacy: true, burnUnit: false, orthopedics: true, ophthalmology: false,
    occupancyPercentage: 48,
  },
  {
    id: "h5", name: "Hôpital Provincial Chichaoua", latitude: 31.5340, longitude: -8.7660,
    emergencyBeds: { available: 12, total: 18 }, icuBeds: { available: 5, total: 5 },
    traumaUnit: false, cardiology: false, pediatrics: true, neurosurgery: false,
    radiology: false, laboratory: true, pharmacy: true, burnUnit: false, orthopedics: false, ophthalmology: false,
    occupancyPercentage: 35,
  },
  {
    id: "h6", name: "Clinique Yasmine", latitude: 31.6380, longitude: -7.9950,
    emergencyBeds: { available: 1, total: 10 }, icuBeds: { available: 0, total: 3 },
    traumaUnit: false, cardiology: true, pediatrics: false, neurosurgery: false,
    radiology: true, laboratory: false, pharmacy: true, burnUnit: false, orthopedics: false, ophthalmology: false,
    occupancyPercentage: 96,
  },
];

// ── Severity config (display) ──────────────────────────────
export const severityConfig: Record<SeverityLevel, { label: string; emoji: string; className: string; color: string }> = {
  critical: { label: "Critical", emoji: "🔴", className: "severity-badge-critical", color: "hsl(0 85% 50%)" },
  severe:   { label: "Severe",   emoji: "🟠", className: "severity-badge-severe",   color: "hsl(28 95% 55%)" },
  moderate: { label: "Moderate", emoji: "🟡", className: "severity-badge-moderate", color: "hsl(48 95% 50%)" },
  mild:     { label: "Mild",     emoji: "🟢", className: "severity-badge-mild",     color: "hsl(142 65% 42%)" },
};

const severityOrder: Record<SeverityLevel, number> = { critical: 0, severe: 1, moderate: 2, mild: 3 };

export function sortCasesBySeverity(cases: EmergencyCase[]): EmergencyCase[] {
  return [...cases].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

// ── Demo cases (2 critical, 1 severe, 1 moderate, 1 mild) for showcasing the dashboard ──
function makeDemoCase(
  id: string,
  severity: SeverityLevel,
  victimName: string,
  placeName: string,
  minutesAgo: number,
  symptoms: string[]
): EmergencyCase {
  const timeOfReport = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
  const painScore = severity === "critical" ? 9 : severity === "severe" ? 7 : severity === "moderate" ? 5 : 3;
  const patient: Patient = {
    patientAge: 34,
    signsAndSymptoms: symptoms,
    severity,
    levelOfConsciousness: severity === "critical" ? "Unresponsive" : "Alert",
    breathingStatus: severity === "critical" ? "Absent" : "Normal",
    traumaHistory: "Trauma",
    knownChronicDiseases: [],
    painScore,
  };
  return {
    id,
    timeOfReport,
    latitude: 31.6295 + (Math.random() - 0.5) * 0.02,
    longitude: -7.9811 + (Math.random() - 0.5) * 0.02,
    placeName,
    callerPhone: "+212 6XX XXX XXX",
    victimName,
    patients: [patient],
    severity,
    numberOfPatients: 1,
    patientAge: 34,
    signsAndSymptoms: symptoms,
    levelOfConsciousness: patient.levelOfConsciousness,
    breathingStatus: patient.breathingStatus,
    traumaHistory: patient.traumaHistory,
    knownChronicDiseases: [],
    painScore,
    ambulanceStatus: "pending",
    assignedHospital: null,
  };
}

export const DEMO_CASES: EmergencyCase[] = sortCasesBySeverity([
  makeDemoCase("DEMO-CRIT-01", "critical", "Ahmed B.", "Rue Mohammed V, Marrakech", 12, ["Cardiac arrest", "No pulse"]),
  makeDemoCase("DEMO-CRIT-02", "critical", "Fatima K.", "Place Jemaa el-Fna", 8, ["Severe bleeding", "Unconscious"]),
  makeDemoCase("DEMO-SEV-01", "severe", "Youssef M.", "Guéliz District", 25, ["Fracture", "Possible internal injury"]),
  makeDemoCase("DEMO-MOD-01", "moderate", "Aisha T.", "Médina, Souk Smarine", 45, ["Ankle injury", "Pain"]),
  makeDemoCase("DEMO-MILD-01", "mild", "Omar H.", "Hivernage", 62, ["Minor cut", "Stable"]),

]);

// ── API: Fetch live cases ──────────────────────────────────
export async function fetchCases(): Promise<EmergencyCase[]> {
  try {
    const res = await fetch(`${API_BASE}/api/reports?limit=100`);
    if (!res.ok) throw new Error(`${res.status}`);
    const reports: BackendReport[] = await res.json();
    const cases = reports.map(mapReportToCase);
    return cases.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  } catch (e) {
    console.warn("Failed to fetch cases from API, using empty list:", e);
    return [];
  }
}

// ── SSE: Live event stream ─────────────────────────────────
export function subscribeToCases(onNewCase: (c: EmergencyCase) => void): () => void {
  let es: EventSource | null = null;
  try {
    es = new EventSource(`${API_BASE}/api/events`);

    es.addEventListener("new_report", (evt) => {
      try {
        const report = JSON.parse(evt.data) as BackendReport;
        onNewCase(mapReportToCase(report));
      } catch { /* ignore parse errors */ }
    });

    es.addEventListener("report_update", (evt) => {
      try {
        const report = JSON.parse(evt.data) as BackendReport;
        onNewCase(mapReportToCase(report));
      } catch { /* ignore */ }
    });

    es.onerror = () => {
      console.warn("SSE connection error, will retry automatically");
    };
  } catch (e) {
    console.warn("SSE not available:", e);
  }

  return () => { es?.close(); };
}

// ── Place severity aggregation ─────────────────────────────
export function computePlaceSeverities(cases: EmergencyCase[]): PlaceSeverity[] {
  const byPlace = new Map<string, EmergencyCase[]>();
  for (const c of cases) {
    const list = byPlace.get(c.placeName) ?? [];
    list.push(c);
    byPlace.set(c.placeName, list);
  }

  return Array.from(byPlace.entries()).map(([placeName, caseList]) => {
    const critical = caseList.filter(c => c.severity === "critical").length;
    const severe = caseList.filter(c => c.severity === "severe").length;
    const moderate = caseList.filter(c => c.severity === "moderate").length;
    const mild = caseList.filter(c => c.severity === "mild").length;
    const total = caseList.length;
    const avgResponse = 4 + Math.floor(Math.random() * 15);
    const isAlert = critical / Math.max(total, 1) > 0.3 || total > 4;
    const lat = caseList.reduce((s, c) => s + c.latitude, 0) / total;
    const lng = caseList.reduce((s, c) => s + c.longitude, 0) / total;

    return {
      placeName, latitude: lat, longitude: lng,
      totalActiveCases: total,
      critical, severe, moderate, mild,
      avgResponseTimeMinutes: avgResponse,
      isAlertZone: isAlert,
    };
  });
}
