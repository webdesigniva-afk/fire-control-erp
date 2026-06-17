"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import {
  OBJECT_STATUS_OK,
  OBJECT_STATUS_OVERDUE,
  OBJECT_STATUS_UPCOMING,
  type DashboardMapObject,
  type ObjectStatus,
} from "../lib/map-objects";
export type { DashboardMapObject, ObjectStatus } from "../lib/map-objects";


type DashboardMapLeafletProps = {
  objects: DashboardMapObject[];
};

function FitMapBounds({ objects }: DashboardMapLeafletProps) {
  const map = useMap();

  useEffect(() => {
    if (!objects.length) return;

    const bounds = L.latLngBounds(objects.map((object) => object.position));
    map.fitBounds(bounds, {
      maxZoom: 15,
      padding: [36, 36],
    });
  }, [map, objects]);

  return null;
}

const statusClasses: Record<string, string> = {
  [OBJECT_STATUS_OK]: "bg-green-500 ring-green-100",
  [OBJECT_STATUS_UPCOMING]: "bg-orange-400 ring-orange-100",
  [OBJECT_STATUS_OVERDUE]: "bg-red-500 ring-red-100",
};

const popupStatusClasses: Record<string, string> = {
  [OBJECT_STATUS_OK]: "bg-green-50 text-green-700 ring-green-100",
  [OBJECT_STATUS_UPCOMING]: "bg-orange-50 text-orange-700 ring-orange-100",
  [OBJECT_STATUS_OVERDUE]: "bg-red-50 text-red-700 ring-red-100",
};

function markerIcon(status: ObjectStatus) {
  const className = statusClasses[status] ?? "bg-slate-500 ring-slate-100";

  return L.divIcon({
    className: "",
    html: `<span class="block h-5 w-5 rounded-full border-[3px] border-white ${className} shadow-lg ring-4"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  });
}

export function DashboardMapLeaflet({ objects }: DashboardMapLeafletProps) {
  const center = objects[0]?.position ?? [42.7339, 25.4858];
  const [tileProvider, setTileProvider] = useState<"osm" | "carto">("osm");
  const tileUrl =
    tileProvider === "osm"
      ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  const attribution =
    tileProvider === "osm"
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

  return (
    <MapContainer
      center={center}
      zoom={objects.length ? 13 : 7}
      scrollWheelZoom={false}
      className="h-full w-full"
      attributionControl={false}
    >
      <TileLayer
        key={tileProvider}
        attribution={attribution}
        url={tileUrl}
        eventHandlers={{
          tileerror: () => {
            if (tileProvider === "osm") setTileProvider("carto");
          },
        }}
      />
      <FitMapBounds objects={objects} />

      {objects.map((object) => (
        <Marker
          key={object.id}
          position={object.position}
          icon={markerIcon(object.status)}
        >
          <Popup className="firecontrol-map-popup" minWidth={220}>
            <div className="space-y-3 p-1">
              <div>
                <div className="text-base font-black text-slate-900">
                  {object.name}
                </div>
                <span
                  className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${
                    popupStatusClasses[object.status] ??
                    "bg-slate-50 text-slate-700 ring-slate-100"
                  }`}
                >
                  {object.status}
                </span>
              </div>
              <div className="text-sm font-semibold text-slate-600">
                Следваща проверка:{" "}
                <span className="font-black text-slate-900">
                  {object.nextInspection || "няма дата"}
                </span>
              </div>
              <Link
                href={object.href}
                className="inline-flex h-9 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
              >
                Отвори обекта
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
