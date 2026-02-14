import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { EmergencyCase, Hospital, severityConfig } from "@/data/mockData";
import { getDangerColor, VICTIM_COLORS, type DangerColorKey } from "@/lib/dangerColors";
import CriticalCasesBox from "@/components/CriticalCasesBox";

interface MapViewProps {
  cases: EmergencyCase[];
  hospitals: Hospital[];
  onCaseClick: (c: EmergencyCase) => void;
}

interface PlaceGroup {
  placeName: string;
  lat: number;
  lng: number;
  cases: EmergencyCase[];
  totalVictims: number;
}

function groupCasesByPlace(cases: EmergencyCase[]): PlaceGroup[] {
  const byPlace = new Map<string, EmergencyCase[]>();
  for (const c of cases) {
    const list = byPlace.get(c.placeName) ?? [];
    list.push(c);
    byPlace.set(c.placeName, list);
  }
  return Array.from(byPlace.entries()).map(([placeName, caseList]) => {
    const totalVictims = caseList.reduce((sum, c) => sum + c.numberOfPatients, 0);
    const lat = caseList.reduce((s, c) => s + c.latitude, 0) / caseList.length;
    const lng = caseList.reduce((s, c) => s + c.longitude, 0) / caseList.length;
    return { placeName, lat, lng, cases: caseList, totalVictims };
  });
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestHospital(lat: number, lng: number, hospitals: Hospital[]): Hospital | null {
  if (hospitals.length === 0) return null;
  let nearest = hospitals[0];
  let minDist = haversineKm(lat, lng, nearest.latitude, nearest.longitude);
  for (let i = 1; i < hospitals.length; i++) {
    const d = haversineKm(lat, lng, hospitals[i].latitude, hospitals[i].longitude);
    if (d < minDist) {
      minDist = d;
      nearest = hospitals[i];
    }
  }
  return nearest;
}

// Hospital color = worst danger among regions that assign cases to it (same as victims in that area)
function getHospitalColor(hospital: Hospital, placeGroups: PlaceGroup[]): DangerColorKey {
  let maxVictims = 0;
  for (const g of placeGroups) {
    const assignsToThis = g.cases.some((c) => c.assignedHospital === hospital.name);
    if (assignsToThis && g.totalVictims > maxVictims) maxVictims = g.totalVictims;
  }
  if (maxVictims > 0) return getDangerColor(maxVictims);
  let nearestGroup: PlaceGroup | null = null;
  let minDist = Infinity;
  for (const g of placeGroups) {
    const d = haversineKm(hospital.latitude, hospital.longitude, g.lat, g.lng);
    if (d < minDist) {
      minDist = d;
      nearestGroup = g;
    }
  }
  return nearestGroup ? getDangerColor(nearestGroup.totalVictims) : "green";
}

function createHospitalIcon(colorKey: DangerColorKey) {
  const { stroke } = VICTIM_COLORS[colorKey];
  return L.divIcon({
    className: "hospital-marker",
    html: `<div style="
      width:14px;height:14px;
      background:${stroke};
      border:2px solid ${stroke}cc;
      border-radius:2px;
      box-shadow:0 0 10px ${stroke}66;
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function createCaseIcon(colorKey: DangerColorKey) {
  const { stroke } = VICTIM_COLORS[colorKey];
  return L.divIcon({
    className: "case-marker",
    html: `<div style="
      width:10px;height:10px;border-radius:50%;
      background:${stroke};
      border:2px solid white;
      box-shadow:0 0 6px ${stroke};
    "></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

const MapView = ({ cases, hospitals, onCaseClick }: MapViewProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [31.6295, -7.9811],
      zoom: 9,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const overlayGroup = L.featureGroup();
    map.addLayer(overlayGroup);

    const placeGroups = groupCasesByPlace(cases);

    // 1. Colored regions (circles) by victim count
    placeGroups.forEach((group) => {
      const colorKey = getDangerColor(group.totalVictims);
      const { fill, stroke } = VICTIM_COLORS[colorKey];
      const radius = 400 + Math.min(group.totalVictims * 80, 600);

      const nearestHospital = findNearestHospital(group.lat, group.lng, hospitals);
      const hospitalName = nearestHospital?.name ?? "None nearby";

      const circle = L.circle([group.lat, group.lng], {
        radius,
        color: stroke,
        weight: 2,
        fillColor: fill,
        fillOpacity: 1,
      });

      circle.bindPopup(
        `<div style="font-family:Inter,sans-serif;min-width:220px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;">📍 ${group.placeName}</div>
          <div style="font-size:12px;margin-bottom:4px;"><strong>${group.totalVictims}</strong> victim${group.totalVictims !== 1 ? "s" : ""}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:6px;">
            <strong>Nearest hospital:</strong><br/>${hospitalName}
          </div>
        </div>`
      );

      overlayGroup.addLayer(circle);
    });

    // 2. Hospital markers – colored by region danger (hospital + injured in that area share color)
    hospitals.forEach((h) => {
      const colorKey = getHospitalColor(h, placeGroups);
      const marker = L.marker([h.latitude, h.longitude], { icon: createHospitalIcon(colorKey) });
      marker.bindPopup(
        `<div style="font-family:Inter,sans-serif;min-width:180px;">
          <div style="font-size:12px;font-weight:700;margin-bottom:4px;">🏥 ${h.name}</div>
          <div style="font-size:11px;color:#94a3b8;">Emergency: ${h.emergencyBeds.available}/${h.emergencyBeds.total} beds</div>
          <div style="font-size:11px;color:#94a3b8;">ICU: ${h.icuBeds.available}/${h.icuBeds.total} beds</div>
        </div>`
      );
      overlayGroup.addLayer(marker);
    });

    // 3. Case markers (injured people) – colored by their region's danger level
    const placeColorMap = new Map<string, DangerColorKey>();
    placeGroups.forEach((g) => placeColorMap.set(g.placeName, getDangerColor(g.totalVictims)));
    cases.forEach((c) => {
      const colorKey = placeColorMap.get(c.placeName) ?? "green";
      const marker = L.marker([c.latitude, c.longitude], { icon: createCaseIcon(colorKey) });
      const sev = severityConfig[c.severity];
      const hospitalInfo = c.assignedHospital ?? "None assigned";
      marker.bindPopup(
        `<div style="font-family:Inter,sans-serif;min-width:200px;">
          <div style="font-size:11px;font-weight:700;margin-bottom:6px;">${sev.emoji} ${sev.label.toUpperCase()}</div>
          <div style="font-size:12px;font-weight:600;margin-bottom:4px;">${c.placeName}</div>
          <div style="font-size:11px;margin-bottom:2px;"><strong>${c.numberOfPatients}</strong> victim${c.numberOfPatients !== 1 ? "s" : ""}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:4px;"><strong>Hospital:</strong> ${hospitalInfo}</div>
          <div style="font-size:10px;color:#64748b;margin-top:4px;">${c.id}</div>
        </div>`
      );
      marker.on("click", () => onCaseClick(c));
      overlayGroup.addLayer(marker);
    });

    return () => {
      map.removeLayer(overlayGroup);
    };
  }, [cases, hospitals, onCaseClick]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full rounded-lg" />
      <CriticalCasesBox cases={cases} hospitals={hospitals} onCaseClick={onCaseClick} />
      <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur border border-border rounded-lg px-3 py-2 shadow-lg z-[1000]">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Danger level
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500" />9+ critical</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500" />6–8 high</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-500" />3–5 moderate</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500" />1–2 low</span>
        </div>
        <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground">
          ■ Hospital · ● Injured (same color = same area)
        </div>
      </div>
    </div>
  );
};

export default MapView;
