"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

type AddressPreviewMapProps = {
  latitude: number;
  longitude: number;
  label: string;
  marker?: boolean;
  zoom?: number;
  onPick?: (point: { latitude: number; longitude: number }) => void;
};

function markerIcon() {
  return L.divIcon({
    className: "",
    html: '<span class="block h-5 w-5 rounded-full border-[3px] border-white bg-orange-500 shadow-lg ring-4 ring-orange-100"></span>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function RecenterMap({
  latitude,
  longitude,
  zoom,
}: {
  latitude: number;
  longitude: number;
  zoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    map.setView([latitude, longitude], zoom, { animate: true });
  }, [latitude, longitude, map, zoom]);

  return null;
}

function PickLocation({
  onPick,
}: {
  onPick?: (point: { latitude: number; longitude: number }) => void;
}) {
  useMapEvents({
    click(event) {
      onPick?.({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });

  return null;
}

export function AddressPreviewMap({
  latitude,
  longitude,
  label,
  marker = true,
  zoom = 16,
  onPick,
}: AddressPreviewMapProps) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={zoom}
      scrollWheelZoom={false}
      className="h-full w-full"
      attributionControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <RecenterMap latitude={latitude} longitude={longitude} zoom={zoom} />
      <PickLocation onPick={onPick} />
      {marker ? (
        <Marker position={[latitude, longitude]} icon={markerIcon()} title={label} />
      ) : null}
    </MapContainer>
  );
}
