import { EmergencyCase, severityConfig } from "@/data/mockData";
import { Clock, MapPin, User, Stethoscope, Ambulance, Phone, Users } from "lucide-react";

const ambulanceLabel: Record<string, string> = {
  dispatched: "Dispatched",
  en_route: "En Route",
  on_scene: "On Scene",
  pending: "Pending",
};

interface CaseCardProps {
  caseData: EmergencyCase;
  onClick: (c: EmergencyCase) => void;
  compact?: boolean;
}

const CaseCard = ({ caseData, onClick, compact }: CaseCardProps) => {
  const sev = severityConfig[caseData.severity];
  const time = new Date(caseData.timeOfReport);
  const minutesAgo = Math.floor((Date.now() - time.getTime()) / 60000);

  return (
    <button
      onClick={() => onClick(caseData)}
      className={`w-full text-left card-glow rounded-lg bg-card p-3 transition-all hover:bg-secondary/50 ${
        caseData.severity === "critical" ? "pulse-critical" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`${sev.className} px-2 py-0.5 rounded text-[10px] uppercase tracking-wider`}>
          {sev.emoji} {sev.label}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {minutesAgo}m ago
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-foreground">
          <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
          <span className="truncate font-medium">{caseData.placeName}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="w-3 h-3 flex-shrink-0" />
          {caseData.callerPhone}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="w-3 h-3 flex-shrink-0" />
          {caseData.numberOfPatients} patient{caseData.numberOfPatients > 1 ? 's' : ''}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="w-3 h-3 flex-shrink-0" />
          Age {caseData.patientAge}
        </div>
        {!compact && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Stethoscope className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-2">{caseData.signsAndSymptoms.join(", ")}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs">
          <Ambulance className="w-3 h-3 flex-shrink-0" />
          <span className={`${
            caseData.ambulanceStatus === 'pending' ? 'text-severity-severe' :
            caseData.ambulanceStatus === 'on_scene' ? 'text-severity-mild' : 'text-primary'
          }`}>
            {ambulanceLabel[caseData.ambulanceStatus]}
          </span>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-border">
        <span className="text-[10px] font-mono text-muted-foreground">{caseData.id}</span>
      </div>
    </button>
  );
};

export default CaseCard;
