"use client";

import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  useMap,
  Marker,
  Popup,
} from "react-leaflet";
import L from "leaflet";

export type SequenceMapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  compassAngle: number | null;
};

function headingIcon(angle: number | null) {
  const deg = angle ?? 0;
  return L.divIcon({
    className: "",
    iconSize: [54, 54],
    iconAnchor: [27, 27],
    html: `<div style="width:54px;height:54px;transform:rotate(${deg}deg);">
      <svg viewBox="0 0 54 54" width="54" height="54">
        <path d="M27 27 L10 48 L27 42 L44 48 Z" fill="rgba(245,158,11,0.35)" stroke="rgba(245,158,11,0.9)" stroke-width="1"/>
        <circle cx="27" cy="27" r="6" fill="#F59E0B" stroke="#fff" stroke-width="2"/>
      </svg>
    </div>`,
  });
}

function FollowCurrent({
  point,
}: {
  point: SequenceMapPoint | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!point) return;
    map.panTo([point.latitude, point.longitude], { animate: true });
  }, [point, map]);
  return null;
}

function FitSequence({ points }: { points: SequenceMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(
      points.map((p) => [p.latitude, p.longitude] as [number, number])
    );
    map.fitBounds(bounds.pad(0.18));
    // Only fit once when the sequence first arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length, map]);
  return null;
}

export function SequenceRoadMap({
  points,
  currentId,
  onSelect,
}: {
  points: SequenceMapPoint[];
  currentId: string | null;
  onSelect: (id: string) => void;
}) {
  const current = useMemo(
    () => points.find((p) => p.id === currentId) ?? null,
    [points, currentId]
  );

  const line = useMemo(
    () => points.map((p) => [p.latitude, p.longitude] as [number, number]),
    [points]
  );

  const center = current
    ? ([current.latitude, current.longitude] as [number, number])
    : points[0]
      ? ([points[0].latitude, points[0].longitude] as [number, number])
      : ([28.6139, 77.209] as [number, number]);

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-xs text-cream/60">
        Loading road sequence…
      </div>
    );
  }

  return (
    <div className="h-full min-h-[220px] overflow-hidden rounded-2xl border border-white/10">
      <MapContainer
        center={center}
        zoom={18}
        scrollWheelZoom
        className="h-full w-full"
        zoomControl={false}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitSequence points={points} />
        <FollowCurrent point={current} />
        <Polyline
          positions={line}
          pathOptions={{ color: "#10B981", weight: 3, opacity: 0.75 }}
        />
        {points.map((point) => {
          const active = point.id === currentId;
          return (
            <CircleMarker
              key={point.id}
              center={[point.latitude, point.longitude]}
              radius={active ? 5 : 3.5}
              pathOptions={{
                color: active ? "#F59E0B" : "#059669",
                fillColor: active ? "#FBBF24" : "#34D399",
                fillOpacity: 0.95,
                weight: active ? 2 : 1,
              }}
              eventHandlers={{
                click: () => onSelect(point.id),
              }}
            >
              <Popup>
                <button
                  type="button"
                  className="text-xs font-medium text-forest"
                  onClick={() => onSelect(point.id)}
                >
                  Open this frame
                </button>
              </Popup>
            </CircleMarker>
          );
        })}
        {current && (
          <Marker
            position={[current.latitude, current.longitude]}
            icon={headingIcon(current.compassAngle)}
            zIndexOffset={500}
          />
        )}
      </MapContainer>
    </div>
  );
}
