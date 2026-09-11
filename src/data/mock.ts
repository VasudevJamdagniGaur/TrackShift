import type {
  AnalyticsPoint,
  Area,
  Bus,
  City,
  CommonIssueStat,
  Detection,
  HealthBreakdown,
  IssueHistory,
  PlatformStats,
  ReportDraft,
  RoadIssue,
  RoadSegment,
} from "@/types";
import { yoloIssues } from "@/data/yolo-issues";
import { rankRepairPriorities } from "@/lib/scoring";

const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d: number) =>
  new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();

export const platformStats: PlatformStats = {
  citiesMonitored: 10,
  kilometersScanned: 52840,
  issuesDetected: 124532,
  continuousMonitoring: "24/7",
};

export const cities: City[] = [
  {
    id: "noida",
    name: "Noida",
    state: "Uttar Pradesh",
    latitude: 28.5355,
    longitude: 77.391,
    healthScore: 72,
    issuesDetected: 18420,
    kilometersScanned: 8420,
    busesActive: 48,
  },
  {
    id: "delhi",
    name: "Delhi",
    state: "Delhi",
    latitude: 28.6139,
    longitude: 77.209,
    healthScore: 68,
    issuesDetected: 31250,
    kilometersScanned: 12400,
    busesActive: 96,
  },
  {
    id: "bengaluru",
    name: "Bengaluru",
    state: "Karnataka",
    latitude: 12.9716,
    longitude: 77.5946,
    healthScore: 74,
    issuesDetected: 22110,
    kilometersScanned: 9800,
    busesActive: 72,
  },
  {
    id: "mumbai",
    name: "Mumbai",
    state: "Maharashtra",
    latitude: 19.076,
    longitude: 72.8777,
    healthScore: 66,
    issuesDetected: 26890,
    kilometersScanned: 11200,
    busesActive: 84,
  },
  {
    id: "hyderabad",
    name: "Hyderabad",
    state: "Telangana",
    latitude: 17.385,
    longitude: 78.4867,
    healthScore: 76,
    issuesDetected: 14200,
    kilometersScanned: 6400,
    busesActive: 40,
  },
  {
    id: "pune",
    name: "Pune",
    state: "Maharashtra",
    latitude: 18.5204,
    longitude: 73.8567,
    healthScore: 71,
    issuesDetected: 11662,
    kilometersScanned: 4620,
    busesActive: 36,
  },
];

export const areas: Area[] = [
  {
    id: "sector-62",
    name: "Sector 62",
    city: "Noida",
    pincode: "201301",
    healthScore: 68,
    totalRoads: 42,
    potholes: 86,
    cracks: 54,
    criticalSections: 7,
    lastScanned: hoursAgo(1.5),
    latitude: 28.628,
    longitude: 77.3649,
  },
  {
    id: "indiranagar",
    name: "Indiranagar",
    city: "Bengaluru",
    pincode: "560038",
    healthScore: 71,
    totalRoads: 38,
    potholes: 62,
    cracks: 48,
    criticalSections: 4,
    lastScanned: hoursAgo(3),
    latitude: 12.9784,
    longitude: 77.6408,
  },
  {
    id: "andheri-east",
    name: "Andheri East",
    city: "Mumbai",
    pincode: "400069",
    healthScore: 63,
    totalRoads: 51,
    potholes: 104,
    cracks: 71,
    criticalSections: 11,
    lastScanned: hoursAgo(2.2),
    latitude: 19.1136,
    longitude: 72.8697,
  },
  {
    id: "connaught-place",
    name: "Connaught Place",
    city: "Delhi",
    pincode: "110001",
    healthScore: 70,
    totalRoads: 28,
    potholes: 44,
    cracks: 39,
    criticalSections: 3,
    lastScanned: hoursAgo(4),
    latitude: 28.6315,
    longitude: 77.2167,
  },
  {
    id: "hitech-city",
    name: "Hitech City",
    city: "Hyderabad",
    pincode: "500081",
    healthScore: 78,
    totalRoads: 34,
    potholes: 31,
    cracks: 28,
    criticalSections: 2,
    lastScanned: hoursAgo(5),
    latitude: 17.4435,
    longitude: 78.3772,
  },
  {
    id: "koregaon-park",
    name: "Koregaon Park",
    city: "Pune",
    pincode: "411001",
    healthScore: 75,
    totalRoads: 26,
    potholes: 29,
    cracks: 22,
    criticalSections: 2,
    lastScanned: hoursAgo(6),
    latitude: 18.5362,
    longitude: 73.8937,
  },
];

export const roadSegments: RoadSegment[] = [
  {
    id: "seg-sector62-main",
    name: "Sector 62 Main Road",
    city: "Noida",
    area: "Sector 62",
    healthScore: 54,
    lengthKm: 3.2,
    issueCount: 14,
    lastScanned: hoursAgo(1),
    coordinates: [
      [28.625, 77.36],
      [28.628, 77.365],
      [28.631, 77.37],
    ],
  },
  {
    id: "seg-mg-road",
    name: "MG Road",
    city: "Bengaluru",
    area: "Central",
    healthScore: 61,
    lengthKm: 4.1,
    issueCount: 11,
    lastScanned: hoursAgo(2),
    coordinates: [
      [12.973, 77.606],
      [12.975, 77.61],
      [12.978, 77.616],
    ],
  },
  {
    id: "seg-station-road",
    name: "Station Road",
    city: "Noida",
    area: "Sector 15",
    healthScore: 58,
    lengthKm: 2.4,
    issueCount: 9,
    lastScanned: hoursAgo(3),
    coordinates: [
      [28.58, 77.315],
      [28.584, 77.32],
      [28.588, 77.325],
    ],
  },
  {
    id: "seg-outer-ring",
    name: "Outer Ring Road",
    city: "Bengaluru",
    area: "ORR",
    healthScore: 66,
    lengthKm: 12.5,
    issueCount: 18,
    lastScanned: hoursAgo(1.5),
    coordinates: [
      [12.935, 77.62],
      [12.95, 77.64],
      [12.97, 77.65],
    ],
  },
  {
    id: "seg-whitefield",
    name: "Whitefield Main Road",
    city: "Bengaluru",
    area: "Whitefield",
    healthScore: 69,
    lengthKm: 5.6,
    issueCount: 8,
    lastScanned: hoursAgo(5),
    coordinates: [
      [12.969, 77.749],
      [12.972, 77.752],
      [12.975, 77.756],
    ],
  },
  {
    id: "seg-sv-road",
    name: "S.V. Road",
    city: "Mumbai",
    area: "Andheri",
    healthScore: 52,
    lengthKm: 6.8,
    issueCount: 16,
    lastScanned: hoursAgo(2.5),
    coordinates: [
      [19.11, 72.84],
      [19.12, 72.845],
      [19.13, 72.85],
    ],
  },
  {
    id: "seg-cp-inner",
    name: "Inner Circle, CP",
    city: "Delhi",
    area: "Connaught Place",
    healthScore: 73,
    lengthKm: 2.1,
    issueCount: 5,
    lastScanned: hoursAgo(4),
    coordinates: [
      [28.631, 77.216],
      [28.632, 77.218],
      [28.633, 77.22],
    ],
  },
  {
    id: "seg-hitec",
    name: "Cyberabad Road",
    city: "Hyderabad",
    area: "Hitech City",
    healthScore: 79,
    lengthKm: 4.4,
    issueCount: 4,
    lastScanned: hoursAgo(5),
    coordinates: [
      [17.44, 77.37],
      [17.445, 77.375],
      [17.45, 77.38],
    ],
  },
];

const evidence =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#3d3a34"/>
          <stop offset="55%" stop-color="#5c564c"/>
          <stop offset="100%" stop-color="#2f2c27"/>
        </linearGradient>
      </defs>
      <rect width="640" height="400" fill="url(#g)"/>
      <path d="M0 260 Q160 220 320 250 T640 240 L640 400 L0 400 Z" fill="#4a453c"/>
      <ellipse cx="310" cy="265" rx="54" ry="28" fill="#1a1814" opacity="0.75"/>
      <rect x="250" y="210" width="120" height="90" fill="none" stroke="#C4A574" stroke-width="3" stroke-dasharray="6 4" rx="4"/>
      <text x="24" y="36" fill="#E8E0D4" font-family="Georgia, serif" font-size="18">AI Evidence Frame</text>
      <text x="24" y="58" fill="#B8975A" font-family="sans-serif" font-size="12">Demo detection overlay</text>
    </svg>`
  );

export const roadIssues: RoadIssue[] = [
  {
    id: "HYG-NOI-004821",
    type: "pothole",
    severity: "high",
    confidence: 0.94,
    latitude: 28.6282,
    longitude: 77.3648,
    roadName: "Sector 62 Main Road",
    city: "Noida",
    area: "Sector 62",
    pincode: "201301",
    detectedAt: daysAgo(14),
    lastDetectedAt: hoursAgo(2),
    sourceBus: "Bus #27",
    sourceRoute: "Noida → Botanical Garden",
    status: "verified",
    evidenceImage: evidence,
    occurrenceCount: 7,
    description: "Deep pothole near service lane junction with standing water risk.",
    roadSegmentId: "seg-sector62-main",
  },
  {
    id: "HYG-BLR-003112",
    type: "pothole",
    severity: "high",
    confidence: 0.91,
    latitude: 12.9754,
    longitude: 77.6063,
    roadName: "MG Road",
    city: "Bengaluru",
    area: "Central",
    detectedAt: daysAgo(8),
    lastDetectedAt: hoursAgo(2),
    sourceBus: "Bus #42",
    sourceRoute: "Kempegowda → Indiranagar",
    status: "under_review",
    evidenceImage: evidence,
    occurrenceCount: 5,
    roadSegmentId: "seg-mg-road",
  },
  {
    id: "HYG-BLR-003890",
    type: "crack",
    severity: "medium",
    confidence: 0.87,
    latitude: 12.9781,
    longitude: 77.6412,
    roadName: "100 Feet Road",
    city: "Bengaluru",
    area: "Indiranagar",
    detectedAt: daysAgo(5),
    lastDetectedAt: hoursAgo(3),
    sourceBus: "Bus #19",
    sourceRoute: "Indiranagar → Whitefield",
    status: "new",
    evidenceImage: evidence,
    occurrenceCount: 3,
    roadSegmentId: "seg-mg-road",
  },
  {
    id: "HYG-BLR-004201",
    type: "surface_damage",
    severity: "low",
    confidence: 0.82,
    latitude: 12.9718,
    longitude: 77.7506,
    roadName: "Whitefield Main Road",
    city: "Bengaluru",
    area: "Whitefield",
    detectedAt: daysAgo(3),
    lastDetectedAt: hoursAgo(5),
    sourceBus: "Bus #61",
    sourceRoute: "Marathahalli → Whitefield",
    status: "new",
    evidenceImage: evidence,
    occurrenceCount: 2,
    roadSegmentId: "seg-whitefield",
  },
  {
    id: "HYG-BLR-002778",
    type: "pothole",
    severity: "critical",
    confidence: 0.96,
    latitude: 12.9352,
    longitude: 77.6245,
    roadName: "Outer Ring Road",
    city: "Bengaluru",
    area: "ORR",
    detectedAt: daysAgo(21),
    lastDetectedAt: hoursAgo(1.5),
    sourceBus: "Bus #88",
    sourceRoute: "Silk Board → Hebbal",
    status: "verified",
    evidenceImage: evidence,
    occurrenceCount: 11,
    roadSegmentId: "seg-outer-ring",
  },
  {
    id: "HYG-NOI-005102",
    type: "manhole",
    severity: "high",
    confidence: 0.89,
    latitude: 28.5824,
    longitude: 77.3182,
    roadName: "Station Road",
    city: "Noida",
    area: "Sector 15",
    detectedAt: daysAgo(10),
    lastDetectedAt: hoursAgo(4),
    sourceBus: "Bus #12",
    sourceRoute: "Sector 18 → Botanical Garden",
    status: "verified",
    evidenceImage: evidence,
    occurrenceCount: 4,
    roadSegmentId: "seg-station-road",
  },
  {
    id: "HYG-MUM-006441",
    type: "surface_damage",
    severity: "high",
    confidence: 0.88,
    latitude: 19.1198,
    longitude: 72.8461,
    roadName: "S.V. Road",
    city: "Mumbai",
    area: "Andheri",
    detectedAt: daysAgo(12),
    lastDetectedAt: hoursAgo(2.5),
    sourceBus: "Bus #340",
    sourceRoute: "Andheri → Bandra",
    status: "under_review",
    evidenceImage: evidence,
    occurrenceCount: 6,
    roadSegmentId: "seg-sv-road",
  },
  {
    id: "HYG-MUM-006890",
    type: "crack",
    severity: "medium",
    confidence: 0.84,
    latitude: 19.1132,
    longitude: 72.8691,
    roadName: "Chakala Road",
    city: "Mumbai",
    area: "Andheri East",
    detectedAt: daysAgo(6),
    lastDetectedAt: hoursAgo(6),
    sourceBus: "Bus #340",
    sourceRoute: "Andheri → Bandra",
    status: "new",
    evidenceImage: evidence,
    occurrenceCount: 3,
    roadSegmentId: "seg-sv-road",
  },
  {
    id: "HYG-DEL-001980",
    type: "road_marking",
    severity: "low",
    confidence: 0.79,
    latitude: 28.6318,
    longitude: 77.2172,
    roadName: "Inner Circle, CP",
    city: "Delhi",
    area: "Connaught Place",
    detectedAt: daysAgo(4),
    lastDetectedAt: hoursAgo(8),
    sourceBus: "Bus #7",
    sourceRoute: "Kashmere Gate → AIIMS",
    status: "new",
    evidenceImage: evidence,
    occurrenceCount: 2,
    roadSegmentId: "seg-cp-inner",
  },
  {
    id: "HYG-DEL-002110",
    type: "debris",
    severity: "medium",
    confidence: 0.81,
    latitude: 28.6295,
    longitude: 77.2148,
    roadName: "Janpath",
    city: "Delhi",
    area: "Connaught Place",
    detectedAt: daysAgo(2),
    lastDetectedAt: hoursAgo(7),
    sourceBus: "Bus #7",
    sourceRoute: "Kashmere Gate → AIIMS",
    status: "resolved",
    evidenceImage: evidence,
    occurrenceCount: 1,
    roadSegmentId: "seg-cp-inner",
  },
  {
    id: "HYG-HYD-000754",
    type: "broken_section",
    severity: "critical",
    confidence: 0.93,
    latitude: 17.4439,
    longitude: 78.3778,
    roadName: "Cyberabad Road",
    city: "Hyderabad",
    area: "Hitech City",
    detectedAt: daysAgo(18),
    lastDetectedAt: hoursAgo(5),
    sourceBus: "Bus #218",
    sourceRoute: "Secunderabad → Hitech City",
    status: "verified",
    evidenceImage: evidence,
    occurrenceCount: 8,
    roadSegmentId: "seg-hitec",
  },
  {
    id: "HYG-NOI-005440",
    type: "crack",
    severity: "medium",
    confidence: 0.86,
    latitude: 28.6301,
    longitude: 77.3682,
    roadName: "Sector 62 Main Road",
    city: "Noida",
    area: "Sector 62",
    detectedAt: daysAgo(9),
    lastDetectedAt: hoursAgo(3.5),
    sourceBus: "Bus #27",
    sourceRoute: "Noida → Botanical Garden",
    status: "new",
    evidenceImage: evidence,
    occurrenceCount: 4,
    roadSegmentId: "seg-sector62-main",
  },
  {
    id: "HYG-PUN-000312",
    type: "pothole",
    severity: "medium",
    confidence: 0.85,
    latitude: 18.5368,
    longitude: 73.8942,
    roadName: "North Main Road",
    city: "Pune",
    area: "Koregaon Park",
    detectedAt: daysAgo(7),
    lastDetectedAt: hoursAgo(9),
    sourceBus: "Bus #5",
    sourceRoute: "Shivajinagar → Koregaon Park",
    status: "under_review",
    evidenceImage: evidence,
    occurrenceCount: 3,
    roadSegmentId: "seg-station-road",
  },
  {
    id: "HYG-NOI-005601",
    type: "other",
    severity: "low",
    confidence: 0.74,
    latitude: 28.6265,
    longitude: 77.3612,
    roadName: "Service Lane 4",
    city: "Noida",
    area: "Sector 62",
    detectedAt: daysAgo(1),
    lastDetectedAt: hoursAgo(12),
    sourceBus: "Bus #27",
    sourceRoute: "Noida → Botanical Garden",
    status: "new",
    evidenceImage: evidence,
    occurrenceCount: 1,
    roadSegmentId: "seg-sector62-main",
  },
  {
    id: "HYG-BLR-004550",
    type: "manhole",
    severity: "high",
    confidence: 0.9,
    latitude: 12.9521,
    longitude: 77.6418,
    roadName: "Outer Ring Road",
    city: "Bengaluru",
    area: "ORR",
    detectedAt: daysAgo(11),
    lastDetectedAt: hoursAgo(4.5),
    sourceBus: "Bus #88",
    sourceRoute: "Silk Board → Hebbal",
    status: "verified",
    evidenceImage: evidence,
    occurrenceCount: 5,
    roadSegmentId: "seg-outer-ring",
  },
];

export const issueHistories: Record<string, IssueHistory> = {
  "HYG-NOI-004821": {
    issueId: "HYG-NOI-004821",
    degradationDetected: true,
    summary:
      "The severity of this issue has increased over repeated observations.",
    entries: [
      { date: daysAgo(14), severity: "low", note: "Initial detection" },
      { date: daysAgo(8), severity: "medium", note: "Edge expansion observed" },
      { date: daysAgo(3), severity: "high", note: "Depth and diameter increased" },
    ],
  },
  "HYG-BLR-002778": {
    issueId: "HYG-BLR-002778",
    degradationDetected: true,
    summary:
      "Repeated high-confidence detections indicate accelerating surface failure.",
    entries: [
      { date: daysAgo(21), severity: "medium" },
      { date: daysAgo(12), severity: "high" },
      { date: daysAgo(4), severity: "critical" },
    ],
  },
  "HYG-HYD-000754": {
    issueId: "HYG-HYD-000754",
    degradationDetected: true,
    summary: "Broken section widened across successive bus passes.",
    entries: [
      { date: daysAgo(18), severity: "high" },
      { date: daysAgo(9), severity: "critical" },
    ],
  },
};

export const recentDetections: Detection[] = roadIssues
  .slice()
  .sort(
    (a, b) =>
      new Date(b.lastDetectedAt).getTime() - new Date(a.lastDetectedAt).getTime()
  )
  .slice(0, 8)
  .map((issue) => ({
    id: `det-${issue.id}`,
    issueId: issue.id,
    type: issue.type,
    location: `${issue.roadName}, ${issue.area}`,
    city: issue.city,
    detectedAt: issue.lastDetectedAt,
    severity: issue.severity,
    thumbnail: issue.evidenceImage,
    confidence: issue.confidence,
  }));

export const buses: Bus[] = [
  {
    id: "bus-27",
    number: "Bus #27",
    route: "Noida → Botanical Garden",
    routeFrom: "Noida",
    routeTo: "Botanical Garden",
    city: "Noida",
    status: "scanning",
    distanceScannedKm: 42.8,
    issuesDetected: 17,
    lastDetection: hoursAgo(0.03),
    latitude: 28.5672,
    longitude: 77.321,
    routeCoordinates: [
      [28.5355, 77.391],
      [28.55, 77.36],
      [28.5672, 77.321],
      [28.564, 77.325],
    ],
  },
  {
    id: "bus-42",
    number: "Bus #42",
    route: "Kempegowda → Indiranagar",
    routeFrom: "Kempegowda",
    routeTo: "Indiranagar",
    city: "Bengaluru",
    status: "scanning",
    distanceScannedKm: 31.4,
    issuesDetected: 11,
    lastDetection: hoursAgo(0.08),
    latitude: 12.976,
    longitude: 77.61,
    routeCoordinates: [
      [12.978, 77.572],
      [12.976, 77.59],
      [12.976, 77.61],
      [12.978, 77.64],
    ],
  },
  {
    id: "bus-88",
    number: "Bus #88",
    route: "Silk Board → Hebbal",
    routeFrom: "Silk Board",
    routeTo: "Hebbal",
    city: "Bengaluru",
    status: "scanning",
    distanceScannedKm: 58.2,
    issuesDetected: 23,
    lastDetection: hoursAgo(0.05),
    latitude: 12.95,
    longitude: 77.64,
    routeCoordinates: [
      [12.917, 77.623],
      [12.935, 77.62],
      [12.95, 77.64],
      [13.035, 77.597],
    ],
  },
  {
    id: "bus-340",
    number: "Bus #340",
    route: "Andheri → Bandra",
    routeFrom: "Andheri",
    routeTo: "Bandra",
    city: "Mumbai",
    status: "scanning",
    distanceScannedKm: 27.6,
    issuesDetected: 14,
    lastDetection: hoursAgo(0.12),
    latitude: 19.12,
    longitude: 72.845,
    routeCoordinates: [
      [19.119, 72.846],
      [19.1, 72.84],
      [19.06, 72.83],
    ],
  },
  {
    id: "bus-7",
    number: "Bus #7",
    route: "Kashmere Gate → AIIMS",
    routeFrom: "Kashmere Gate",
    routeTo: "AIIMS",
    city: "Delhi",
    status: "idle",
    distanceScannedKm: 19.3,
    issuesDetected: 6,
    lastDetection: hoursAgo(1.2),
    latitude: 28.63,
    longitude: 77.22,
    routeCoordinates: [
      [28.667, 77.228],
      [28.63, 77.22],
      [28.567, 77.21],
    ],
  },
  {
    id: "bus-218",
    number: "Bus #218",
    route: "Secunderabad → Hitech City",
    routeFrom: "Secunderabad",
    routeTo: "Hitech City",
    city: "Hyderabad",
    status: "scanning",
    distanceScannedKm: 36.1,
    issuesDetected: 9,
    lastDetection: hoursAgo(0.2),
    latitude: 17.44,
    longitude: 78.38,
    routeCoordinates: [
      [17.4399, 78.4983],
      [17.44, 78.42],
      [17.44, 78.38],
    ],
  },
];

export const healthBreakdown: HealthBreakdown = {
  good: 72,
  moderate: 18,
  poor: 7,
  critical: 3,
};

export const commonIssues: CommonIssueStat[] = [
  { type: "pothole", label: "Potholes", percentage: 46, count: 57284 },
  { type: "crack", label: "Road Cracks", percentage: 28, count: 34869 },
  { type: "surface_damage", label: "Surface Wear", percentage: 16, count: 19925 },
  { type: "manhole", label: "Manhole Issues", percentage: 6, count: 7472 },
  { type: "other", label: "Other", percentage: 4, count: 4982 },
];

function buildTrend(days: number): AnalyticsPoint[] {
  const points: AnalyticsPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const wave = Math.sin(i / 3) * 18 + Math.cos(i / 5) * 10;
    const total = Math.round(320 + wave + (days - i) * 1.2);
    const potholes = Math.round(total * 0.46);
    const cracks = Math.round(total * 0.28);
    const surfaceDamage = Math.round(total * 0.16);
    points.push({
      date: date.toISOString().slice(0, 10),
      total,
      potholes,
      cracks,
      surfaceDamage,
    });
  }
  return points;
}

export const analyticsTrends = {
  "7d": buildTrend(7),
  "30d": buildTrend(30),
  "3m": buildTrend(90),
  "1y": buildTrend(52).map((p, i) => ({
    ...p,
    date: `W${i + 1}`,
  })),
};

export const sampleReport: ReportDraft = {
  city: "Noida",
  periodLabel: "September 1–7",
  startDate: "2026-09-01",
  endDate: "2026-09-07",
  kilometersScanned: 1842,
  issuesDetected: 1264,
  criticalIssues: 47,
  newIssues: 312,
  resolvedIssues: 198,
  worstSegments: [
    "Sector 62 Main Road",
    "Station Road",
    "Golf Course Extension",
  ],
  recommendedRepairs: [
    "Prioritize Sector 62 Main Road resurfacing",
    "Secure raised manhole covers on Station Road",
    "Seal expanding transverse cracks near Sector 18 market",
  ],
};

export const repairPriorities = rankRepairPriorities(roadSegments, roadIssues);

/** Demo issues plus YOLO-classified Mapillary detections (with evidence images). */
export const allRoadIssues: RoadIssue[] = [...yoloIssues, ...roadIssues];

export function getIssueById(id: string): RoadIssue | undefined {
  return allRoadIssues.find((issue) => issue.id === id);
}

export function getIssueHistory(id: string): IssueHistory | undefined {
  return issueHistories[id];
}

export function filterIssues(params: {
  query?: string;
  type?: string;
  severity?: string;
  city?: string;
}): RoadIssue[] {
  const q = params.query?.toLowerCase().trim() ?? "";
  return allRoadIssues.filter((issue) => {
    const matchesQuery =
      !q ||
      issue.roadName.toLowerCase().includes(q) ||
      issue.city.toLowerCase().includes(q) ||
      issue.area.toLowerCase().includes(q) ||
      issue.id.toLowerCase().includes(q);
    const matchesType =
      !params.type || params.type === "all" || issue.type === params.type;
    const matchesSeverity =
      !params.severity ||
      params.severity === "all" ||
      issue.severity === params.severity;
    const matchesCity =
      !params.city || issue.city.toLowerCase() === params.city.toLowerCase();
    return matchesQuery && matchesType && matchesSeverity && matchesCity;
  });
}

export function searchAreas(query: string): Area[] {
  const q = query.toLowerCase().trim();
  if (!q) return areas;
  return areas.filter(
    (area) =>
      area.name.toLowerCase().includes(q) ||
      area.city.toLowerCase().includes(q) ||
      area.pincode.includes(q)
  );
}
