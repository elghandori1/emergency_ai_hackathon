import { useState, useCallback } from "react";
import { mockCases, mockHospitals, severityConfig, type SeverityLevel } from "@/data/mockData";
import CaseCard from "@/components/CaseCard";
import CaseDetailModal from "@/components/CaseDetailModal";
import MapView from "@/components/MapView";
import type { EmergencyCase } from "@/data/mockData";
import { Activity } from "lucide-react";

const countBySeverity = (sev: SeverityLevel) => mockCases.filter(c => c.severity === sev).length;

const Index = () => {
  const [selectedCase, setSelectedCase] = useState<EmergencyCase | null>(null);

  const handleCaseClick = useCallback((c: EmergencyCase) => {
    setSelectedCase(c);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* Header stats */}
      <div className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Live Emergency Cases</h1>
            <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
              {mockCases.length} ACTIVE
            </span>
          </div>
          <div className="flex items-center gap-4">
            {(["critical", "severe", "moderate", "mild"] as SeverityLevel[]).map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className={`${severityConfig[s].className} w-5 h-5 rounded flex items-center justify-center text-[10px]`}>
                  {countBySeverity(s)}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase">{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Cases list */}
        <div className="w-80 flex-shrink-0 border-r border-border overflow-auto p-3 space-y-2 bg-surface-overlay">
          {mockCases.map((c) => (
            <CaseCard key={c.id} caseData={c} hospitals={mockHospitals} onClick={handleCaseClick} />
          ))}
        </div>

        {/* Map */}
        <div className="flex-1">
          <MapView cases={mockCases} hospitals={mockHospitals} onCaseClick={handleCaseClick} />
        </div>
      </div>

      <CaseDetailModal caseData={selectedCase} onClose={() => setSelectedCase(null)} />
    </div>
  );
};

export default Index;
