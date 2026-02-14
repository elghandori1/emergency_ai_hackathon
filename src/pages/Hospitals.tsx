import { mockHospitals } from "@/data/mockData";
import { Building2, Bed, Heart, Brain, Baby, Bone, AlertTriangle, Scan, FlaskConical, Pill, Flame, Eye } from "lucide-react";

const Hospitals = () => {
  const sorted = [...mockHospitals].sort((a, b) => b.occupancyPercentage - a.occupancyPercentage);

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Hospital Availability</h1>
          <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
            MARRAKECH–SAFI
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((h) => {
            const isOverloaded = h.occupancyPercentage >= 90;
            const isWarning = h.occupancyPercentage >= 75;
            return (
              <div
                key={h.id}
                className={`card-glow rounded-lg bg-card p-5 ${
                  isOverloaded ? "border-severity-critical/50" : isWarning ? "border-severity-severe/30" : ""
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">{h.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {h.latitude.toFixed(4)}, {h.longitude.toFixed(4)}
                    </p>
                  </div>
                  {isOverloaded && (
                    <span className="severity-badge-critical px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> OVERLOADED
                    </span>
                  )}
                </div>

                {/* Occupancy bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-muted-foreground uppercase tracking-wider">Occupancy</span>
                    <span className={`font-mono font-bold ${
                      isOverloaded ? "text-severity-critical" : isWarning ? "text-severity-severe" : "text-severity-mild"
                    }`}>
                      {h.occupancyPercentage}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isOverloaded ? "bg-severity-critical" : isWarning ? "bg-severity-severe" : "bg-severity-mild"
                      }`}
                      style={{ width: `${h.occupancyPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Beds */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-secondary/50 rounded-md p-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Bed className="w-3 h-3 text-primary" />
                      <span className="text-[10px] text-muted-foreground uppercase">Emergency</span>
                    </div>
                    <span className="stat-value text-lg">
                      {h.emergencyBeds.available}<span className="text-muted-foreground text-xs">/{h.emergencyBeds.total}</span>
                    </span>
                  </div>
                  <div className="bg-secondary/50 rounded-md p-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Bed className="w-3 h-3 text-severity-critical" />
                      <span className="text-[10px] text-muted-foreground uppercase">ICU</span>
                    </div>
                    <span className="stat-value text-lg">
                      {h.icuBeds.available}<span className="text-muted-foreground text-xs">/{h.icuBeds.total}</span>
                    </span>
                  </div>
                </div>

                {/* Services */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { available: h.traumaUnit, label: "Trauma", icon: Bone },
                    { available: h.cardiology, label: "Cardio", icon: Heart },
                    { available: h.pediatrics, label: "Peds", icon: Baby },
                    { available: h.neurosurgery, label: "Neuro", icon: Brain },
                    { available: h.radiology, label: "Radiology", icon: Scan },
                    { available: h.laboratory, label: "Lab", icon: FlaskConical },
                    { available: h.pharmacy, label: "Pharmacy", icon: Pill },
                    { available: h.burnUnit, label: "Burn Unit", icon: Flame },
                    { available: h.orthopedics, label: "Ortho", icon: Bone },
                    { available: h.ophthalmology, label: "Ophthal", icon: Eye },
                  ].map((s) => (
                    <span
                      key={s.label}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                        s.available
                          ? "bg-severity-mild/10 text-severity-mild"
                          : "bg-severity-critical/10 text-severity-critical"
                      }`}
                    >
                      <s.icon className="w-3 h-3" />
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Hospitals;
