"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import Link from "next/link";
import type { Bus, RoadIssue, RoadSegment } from "@/types";
import { issueTypeLabel, relativeTime, severityColor } from "@/lib/utils";
import { SeverityBadge } from "@/components/ui/badge";
import { DEFAULT_ZOOM, MAP_CENTER } from "@/lib/constants";
import {
  useMapillaryCoverage,
  type MapillaryCoverage,
} from "@/hooks/use-mapillary-coverage";
import { MapillaryPhotoModal } from "@/components/map/mapillary-photo-modal";

function markerIcon(severity: RoadIssue["severity"], mapillary?: MapillaryCoverage) {
  const color = severityColor(severity);
  const ring =
    mapillary == null
      ? "transparent"
      : mapillary.available
        ? "#059669"
        : "#9CA3AF";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:18px;height:18px;">
      <div style="position:absolute;inset:0;border-radius:999px;border:2px solid ${ring};box-shadow:0 0 0 1px rgba(255,255,255,0.85);"></div>
      <div class="severity-dot" style="background:${color};position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);"></div>
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
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
  showMapillary = true,
}: {
  issues: RoadIssue[];
  segments?: RoadSegment[];
  buses?: Bus[];
  focus?: [number, number] | null;
  className?: string;
  onSelectIssue?: (issue: RoadIssue) => void;
  showMapillary?: boolean;
}) {
  const center = useMemo(() => {
    if (focus) return focus;
    if (issues[0]) return [issues[0].latitude, issues[0].longitude] as [number, number];
    return MAP_CENTER;
  }, [focus, issues]);

  const { coverage, loading, error } = useMapillaryCoverage(issues, showMapillary);
  const [viewer, setViewer] = useState<{
    imageId: string;
    roadName: string;
  } | null>(null);

  const availableCount = Object.values(coverage).filter((c) => c.available).length;
  const checkedCount = Object.keys(coverage).length;

  return (
    <div className={className ?? "h-full min-h-[420px] w-full overflow-hidden rounded-[1.25rem]"}>
      <div className="relative h-full w-full">
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
          {showMapillary &&
            issues.map((issue) => {
              const status = coverage[issue.id];
              if (!status) return null;
              return (
                <CircleMarker
                  key={`mly-${issue.id}`}
                  center={[issue.latitude, issue.longitude]}
                  radius={status.available ? 16 : 12}
                  pathOptions={{
                    color: status.available ? "#059669" : "#9CA3AF",
                    fillColor: status.available ? "#10B981" : "#D1D5DB",
                    fillOpacity: status.available ? 0.18 : 0.12,
                    weight: 1.5,
                    opacity: 0.85,
                  }}
                />
              );
            })}
          {issues.map((issue) => {
            const status = showMapillary ? coverage[issue.id] : undefined;
            return (
              <Marker
                key={issue.id}
                position={[issue.latitude, issue.longitude]}
                icon={markerIcon(issue.severity, status)}
                eventHandlers={{
                  click: () => onSelectIssue?.(issue),
                }}
              >
                <Popup>
                  <div className="p-4">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
                      {issueTypeLabel(issue.type)}
                    </div>
                    <div className="font-serif text-lg text-charcoal">
                      {issue.roadName}
                    </div>
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
                        <div className="mt-1 font-medium">
                          {relativeTime(issue.lastDetectedAt)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted">Source</div>
                        <div className="mt-1 font-medium">{issue.sourceRoute}</div>
                      </div>
                    </div>

                    {showMapillary && (
                      <div className="mt-3 rounded-xl border border-[var(--border)] bg-beige-soft/50 px-3 py-2 text-xs">
                        <div className="text-muted">Mapillary street photo</div>
                        {status == null ? (
                          <div className="mt-1 font-medium text-charcoal">Checking…</div>
                        ) : status.available && status.imageId ? (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              Available
                            </span>
                            <button
                              type="button"
                              className="font-medium text-forest underline-offset-2 hover:underline"
                              onClick={() =>
                                setViewer({
                                  imageId: status.imageId!,
                                  roadName: issue.roadName,
                                })
                              }
                            >
                              Open photo →
                            </button>
                          </div>
                        ) : (
                          <div className="mt-1 inline-flex items-center gap-1.5 font-semibold text-stone-500">
                            <span className="h-2 w-2 rounded-full bg-stone-400" />
                            Not available
                          </div>
                        )}
                      </div>
                    )}

                    <Link
                      href={`/issues/${issue.id}`}
                      className="mt-4 inline-flex text-sm font-medium text-forest underline-offset-4 hover:underline"
                    >
                      View Evidence →
                    </Link>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {showMapillary && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] max-w-[240px] rounded-2xl border border-[var(--border-strong)] bg-cream/95 px-3 py-2 text-[11px] shadow-[var(--shadow-soft)] backdrop-blur">
            <div className="font-semibold text-charcoal">Mapillary coverage</div>
            <div className="mt-1.5 flex items-center gap-2 text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Available
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-stone-400" />
                Not available
              </span>
            </div>
            <div className="mt-1 text-muted">
              {loading
                ? "Checking street photography…"
                : error
                  ? "Coverage check failed"
                  : checkedCount > 0
                    ? `${availableCount}/${checkedCount} locations covered`
                    : "No locations checked yet"}
            </div>
          </div>
        )}
      </div>

      <MapillaryPhotoModal
        open={!!viewer}
        imageId={viewer?.imageId ?? null}
        roadName={viewer?.roadName}
        onOpenChange={(open) => {
          if (!open) setViewer(null);
        }}
      />
    </div>
  );
}
