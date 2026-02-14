import { EmergencyCase, severityConfig } from "@/data/mockData";
import { X, MapPin, Clock, User, Stethoscope, Brain, Wind, Bone, Heart, Gauge, Hash, Ambulance, Building2, Phone, Users } from "lucide-react";

const ambulanceLabel: Record<string, string> = {
  dispatched: "Dispatched",
  en_route: "En Route",
  on_scene: "On Scene",
  pending: "Pending",
};

interface CaseDetailModalProps {
  caseData: EmergencyCase | null;
  onClose: () => void;
}

const DetailRow = ({ icon: Icon, label, value, valueClass }: { icon: any; label: string; value: string; valueClass?: string }) => (
  <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
    <Icon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
    <div className="flex-1 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">{label}</span>
      <span className={`text-sm font-medium ${valueClass || "text-foreground"}`}>{value}</span>
    </div>
  </div>
);

const CaseDetailModal = ({ caseData, onClose }: CaseDetailModalProps) => {
  if (!caseData) return null;
  const sev = severityConfig[caseData.severity];
  const time = new Date(caseData.timeOfReport);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg w-full max-w-md max-h-[85vh] overflow-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <span className={`${sev.className} px-2.5 py-1 rounded text-xs uppercase tracking-wider`}>
              {sev.emoji} {sev.label}
            </span>
            <span className="text-xs font-mono text-muted-foreground">{caseData.id}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-0">
          <DetailRow icon={Phone} label="Caller Phone" value={caseData.callerPhone} />
          <DetailRow icon={Clock} label="Time of Report" value={time.toLocaleString()} />
          <DetailRow icon={MapPin} label="Location" value={`${caseData.placeName} (${caseData.latitude.toFixed(4)}, ${caseData.longitude.toFixed(4)})`} />
          <DetailRow icon={Users} label="Number of Patients" value={`${caseData.numberOfPatients}`} />
          <DetailRow icon={User} label="Patient Age" value={`${caseData.patientAge} years`} />
          <DetailRow icon={Stethoscope} label="Signs & Symptoms" value={caseData.signsAndSymptoms.join(", ")} />
          <DetailRow icon={Brain} label="Level of Consciousness" value={caseData.levelOfConsciousness} />
          <DetailRow icon={Wind} label="Breathing Status" value={caseData.breathingStatus} />
          <DetailRow icon={Bone} label="Trauma History" value={caseData.traumaHistory} />
          <DetailRow icon={Heart} label="Chronic Diseases" value={caseData.knownChronicDiseases.join(", ")} />
          <DetailRow icon={Gauge} label="Pain Score" value={`${caseData.painScore}/10`} valueClass={caseData.painScore >= 8 ? "text-severity-critical" : caseData.painScore >= 5 ? "text-severity-severe" : "text-foreground"} />
          <DetailRow icon={Hash} label="Severity Classification" value={sev.label} />
          <DetailRow icon={Ambulance} label="Ambulance Status" value={ambulanceLabel[caseData.ambulanceStatus] || caseData.ambulanceStatus} />
          <DetailRow icon={Building2} label="Assigned Hospital" value={caseData.assignedHospital || "Not yet assigned"} />
        </div>
      </div>
    </div>
  );
};

export default CaseDetailModal;
