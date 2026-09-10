"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import Link from "next/link";
import type { Bus, RoadIssue, RoadSegment } from "@/types";
import { issueTypeLabel, relativeTime, severityColor } from "@/lib/utils";
import { SeverityBadge } from "@/components/ui/badge";
import { DEFAULT_ZOOM, MAP_CENTER } from "@/lib/constants";

function markerIcon(severity: RoadIssue["severity"]) {
  const color = severityColor(severity);
  return L.divIcon({
    className: "",
    html: `<div class="severity-dot" style="background:${color}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function FitBounds({
  issues,
  focus,
}: {
  issues: RoadIssue[];
  focus?: [number, number] | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (focus) {
      map.setView(focus, 14, { animate: true });
      return;
    }
    if (issues.length === 0) return;
    const bounds = L.latLngBounds(
      issues.map((issue) => [issue.latitude, issue.longitude] as [number, number])
    );
    map.fitBounds(bounds.pad(0.2));
  }, [issues, focus, map]);
  return null;
}

export function RoadMap({
  issues,
  segments = [],
  buses = [],
  focus,
  className,
  onSelectIssue,
}: {
  issues: RoadIssue[];
  segments?: RoadSegment[];
  buses?: Bus[];
  focus?: [number, number] | null;
  className?: string;
  onSelectIssue?: (issue: RoadIssue) => void;
}) {
  const center = useMemo(() => {
    if (focus) return focus;
    if (issues[0]) return [issues[0].latitude, issues[0].longitude] as [number, number];
    return MAP_CENTER;
  }, [focus, issues]);

  return (
    <div className={className ?? "h-full min-h-[420px] w-full overflow-hidden rounded-[1.25rem]"}>
      <MapContainer
        center={center}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds issues={issues} focus={focus} />
        {segments.map((segment) => (
          <Polyline
            key={segment.id}
            positions={segment.coordinates}
            pathOptions={{
              color: "#1B3A2F",
              weight: 3,
              opacity: 0.45,
              dashArray: "6 8",
            }}
          />
        ))}
        {buses.map((bus) => (
          <Polyline
            key={`route-${bus.id}`}
            positions={bus.routeCoordinates}
            pathOptions={{ color: "#B8975A", weight: 3, opacity: 0.7 }}
          />
        ))}
        {issues.map((issue) => (
          <Marker
            key={issue.id}
            position={[issue.latitude, issue.longitude]}
            icon={markerIcon(issue.severity)}
            eventHandlers={{
              click: () => onSelectIssue?.(issue),
            }}
          >
            <Popup>
              <div className="p-4">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
                  {issueTypeLabel(issue.type)}
                </div>
                <div className="font-serif text-lg text-charcoal">{issue.roadName}</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-muted">Severity</div>
                    <div className="mt-1">
                      <SeverityBadge severity={issue.severity} />
                    </div>
                  </div>
                  <div>
                    <div className="text-muted">Confidence</div>
                    <div className="mt-1 font-semibold text-charcoal">
                      {Math.round(issue.confidence * 100)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted">Detected</div>
                    <div className="mt-1 font-medium">{relativeTime(issue.lastDetectedAt)}</div>
                  </div>
                  <div>
                    <div className="text-muted">Source</div>
                    <div className="mt-1 font-medium">{issue.sourceRoute}</div>
                  </div>
                </div>
                <Link
                  href={`/issues/${issue.id}`}
                  className="mt-4 inline-flex text-sm font-medium text-forest underline-offset-4 hover:underline"
                >
                  View Evidence →
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
