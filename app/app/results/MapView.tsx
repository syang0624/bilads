"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import type { Billboard } from "@/lib/types";
import "leaflet/dist/leaflet.css";

// Custom pin icon with rank number
function createPinIcon(rank: number, isSelected: boolean) {
  return L.divIcon({
    className: "custom-pin",
    html: `<div style="
      background: ${isSelected ? "#F5D400" : "#F5D400CC"};
      color: #0B0B0B;
      width: 32px;
      height: 32px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      border: 2px solid ${isSelected ? "#fff" : "#0B0B0B"};
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    "><span style="transform: rotate(45deg)">${rank}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}

// Auto-fit map bounds to pins
function FitBounds({ boards }: { boards: Billboard[] }) {
  const map = useMap();
  useEffect(() => {
    if (boards.length === 0) return;
    const bounds = L.latLngBounds(
      boards.map((b) => [b.lat, b.lng] as [number, number])
    );
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
  }, [boards, map]);
  return null;
}

export default function MapView({
  boards,
  selectedBoard,
  onSelectBoard,
}: {
  boards: Billboard[];
  rankings?: unknown;
  selectedBoard: string | null;
  onSelectBoard: (id: string | null) => void;
}) {
  return (
    <MapContainer
      center={[37.775, -122.418]}
      zoom={13}
      className="w-full h-full"
      zoomControl={false}
      style={{ background: "#1a1a1a" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <FitBounds boards={boards} />
      {boards.map((board, i) => {
        const rank = i + 1;
        return (
          <Marker
            key={board.id}
            position={[board.lat, board.lng]}
            icon={createPinIcon(rank, selectedBoard === board.id)}
            eventHandlers={{
              click: () =>
                onSelectBoard(
                  selectedBoard === board.id ? null : board.id
                ),
            }}
          />
        );
      })}
    </MapContainer>
  );
}
