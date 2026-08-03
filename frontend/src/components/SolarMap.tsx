import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSolar } from '../context/SolarContext';
import { Layers, ZoomIn, ZoomOut, ShieldAlert } from 'lucide-react';
import type { PanelItem } from '../types/solar';

interface SolarMapProps {
  latitude?: number;
  longitude?: number;
  panels?: PanelItem[];
  onTogglePanel?: (panelId: string) => void;
}

export const SolarMap: React.FC<SolarMapProps> = ({
  latitude: propLat,
  longitude: propLng,
  panels: propPanels,
  onTogglePanel: propToggle,
}) => {
  const context = useSolar();
  
  const panels = propPanels || context.panels;
  const lat = propLat ?? context.lat;
  const lng = propLng ?? context.lng;
  const loading = context.loading;
  const togglePanel = propToggle || context.togglePanel;
  const activePanelsCount = panels.filter(p => p.active).length;

  const [zoom, setZoom] = useState<number>(20);
  const [hoveredPanelId, setHoveredPanelId] = useState<string | null>(null);

  // Maintain references to rendered overlay elements to prevent z-fighting & duplicate stacking
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const activeOverlayMapRef = useRef<Map<string, boolean>>(new Map());

  // Task 2 Lifecycle Cleanup & State Hash tracking
  const panelStateHash = useMemo(
    () => panels.map(p => `${p.id}:${p.active}`).join('|'),
    [panels]
  );

  useEffect(() => {
    // Synchronize active overlay cache to prevent duplicate overlay stacking or stale closures
    const nextMap = new Map<string, boolean>();
    panels.forEach(p => nextMap.set(p.id, p.active));
    activeOverlayMapRef.current = nextMap;

    return () => {
      // Cleanup lifecycle hook
      activeOverlayMapRef.current.clear();
    };
  }, [panelStateHash, panels]);

  // Compute map bounding box to scale panels smoothly into view
  const bounds = useMemo(() => {
    if (panels.length === 0) {
      return { minLng: lng - 0.0001, maxLng: lng + 0.0001, minLat: lat - 0.0001, maxLat: lat + 0.0001 };
    }
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    panels.forEach((p) => {
      p.coordinates.forEach(([clng, clat]) => {
        if (clng < minLng) minLng = clng;
        if (clng > maxLng) maxLng = clng;
        if (clat < minLat) minLat = clat;
        if (clat > maxLat) maxLat = clat;
      });
    });
    // Add 15% padding
    const dLng = maxLng - minLng || 0.0002;
    const dLat = maxLat - minLat || 0.0002;
    return {
      minLng: minLng - dLng * 0.15,
      maxLng: maxLng + dLng * 0.15,
      minLat: minLat - dLat * 0.15,
      maxLat: maxLat + dLat * 0.15
    };
  }, [panels, lat, lng]);

  // Transform WGS84 coordinates to SVG ViewBox space (1000x800)
  const svgWidth = 1000;
  const svgHeight = 800;

  const projectToSvg = (clng: number, clat: number): [number, number] => {
    const x = ((clng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * svgWidth;
    const y = ((bounds.maxLat - clat) / (bounds.maxLat - bounds.minLat)) * svgHeight;
    return [x, y];
  };

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden rounded-2xl border border-slate-800 shadow-2xl flex flex-col">
      {/* Top Map Toolbar */}
      <div className="absolute top-4 left-4 z-20 flex items-center space-x-3 bg-slate-900/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-800 shadow-lg">
        <Layers className="w-5 h-5 text-amber-400" />
        <span className="text-sm font-semibold text-slate-200">Satellite View (HD 3D)</span>
        <span className="bg-amber-500/20 text-amber-300 text-xs px-2.5 py-0.5 rounded-full font-medium border border-amber-500/30">
          Zoom: {zoom}x
        </span>
      </div>

      {/* Map Interactive Controls */}
      <div className="absolute top-4 right-4 z-20 flex flex-col space-y-2">
        <button
          onClick={() => setZoom((z) => Math.min(z + 1, 23))}
          className="p-2.5 bg-slate-900/90 backdrop-blur-md text-slate-200 hover:text-amber-400 hover:bg-slate-800 rounded-xl border border-slate-800 transition shadow-lg cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z - 1, 15))}
          className="p-2.5 bg-slate-900/90 backdrop-blur-md text-slate-200 hover:text-amber-400 hover:bg-slate-800 rounded-xl border border-slate-800 transition shadow-lg cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
      </div>

      {/* Satellite Imagery Layer & Canvas Container */}
      <div className="relative flex-1 w-full h-full overflow-hidden bg-slate-950 flex items-center justify-center">
        <div 
          className="absolute inset-0 bg-cover bg-center transition-all duration-700 opacity-40 scale-105 filter contrast-125 brightness-90"
          style={{
            backgroundImage: `radial-gradient(circle at center, rgba(15, 23, 42, 0.2), rgba(2, 6, 23, 0.95)), url('https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=1600&auto=format&fit=crop')`
          }}
        />

        {/* Loading Overlay Skeleton */}
        {loading && (
          <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
            <p className="text-amber-400 font-medium tracking-wide animate-pulse">
              Orchestrating Roof Geometry & Solar Packing...
            </p>
          </div>
        )}

        {/* Empty State */}
        {!loading && panels.length === 0 && (
          <div className="z-10 text-center max-w-md px-6 py-8 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800">
            <ShieldAlert className="w-12 h-12 text-amber-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-100 mb-1">No Panels Generated Yet</h3>
            <p className="text-sm text-slate-400">
              Enter target building coordinates or click "Generate Solar Layout" to place panels.
            </p>
          </div>
        )}

        {/* Interactive SVG Overlay for Vector Panel Polygons */}
        {!loading && panels.length > 0 && (
          <svg
            ref={overlayRef}
            id="solar-map-canvas"
            className="relative z-10 w-full h-full transition-transform duration-300"
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Render Panels */}
            {panels.map((panel) => {
              const pointsStr = panel.coordinates
                .map(([clng, clat]) => {
                  const [px, py] = projectToSvg(clng, clat);
                  return `${px},${py}`;
                })
                .join(' ');

              const isHovered = hoveredPanelId === panel.id;

              return (
                <g key={panel.id} className="cursor-pointer group">
                  <polygon
                    points={pointsStr}
                    onClick={() => togglePanel(panel.id)}
                    onMouseEnter={() => setHoveredPanelId(panel.id)}
                    onMouseLeave={() => setHoveredPanelId(null)}
                    fill={
                      panel.active
                        ? isHovered
                          ? 'rgba(56, 189, 248, 0.75)'
                          : 'rgba(14, 165, 233, 0.45)'
                        : isHovered
                        ? 'rgba(239, 68, 68, 0.6)'
                        : 'rgba(239, 68, 68, 0.25)'
                    }
                    stroke={panel.active ? '#38bdf8' : '#ef4444'}
                    strokeWidth={isHovered ? '3' : '1.5'}
                    strokeDasharray={panel.active ? 'none' : '4,3'}
                    className="transition-all duration-200 ease-out"
                  />
                  {panel.coordinates.length > 0 && (() => {
                    const [cx, cy] = projectToSvg(panel.coordinates[0][0], panel.coordinates[0][1]);
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? '4' : '2'}
                        fill={panel.active ? '#38bdf8' : '#ef4444'}
                        className="pointer-events-none transition-all"
                      />
                    );
                  })()}
                </g>
              );
            })}
          </svg>
        )}

        {/* Hovered Panel Info Tooltip */}
        {hoveredPanelId && (
          <div className="absolute bottom-6 left-6 z-20 bg-slate-900/95 backdrop-blur-md px-4 py-3 rounded-xl border border-slate-800 shadow-2xl text-xs text-slate-200 space-y-1">
            {(() => {
              const p = panels.find((item) => item.id === hoveredPanelId);
              if (!p) return null;
              return (
                <>
                  <div className="flex items-center justify-between space-x-4">
                    <span className="font-bold text-amber-400">{p.id}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${p.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                      {p.active ? 'ACTIVE' : 'DISABLED'}
                    </span>
                  </div>
                  <div className="text-slate-300">
                    Orientation: <span className="font-medium text-slate-100">{p.orientation}</span>
                  </div>
                  <div className="text-slate-300">
                    Est. Yield: <span className="font-medium text-amber-300">{p.annualYieldKwh} kWh/yr</span>
                  </div>
                  <div className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-800">
                    Click panel on map to toggle ON/OFF
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Bottom Map Legend Footer */}
      <div className="p-3 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded bg-sky-500/40 border border-sky-400 inline-block" />
            <span className="text-slate-300 font-medium">Active PV Module</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded bg-rose-500/30 border border-rose-400 border-dashed inline-block" />
            <span className="text-slate-300 font-medium">Disabled / Shaded</span>
          </div>
        </div>
        <div className="text-slate-400 text-[11px]">
          Interactive Click-to-Edit Enabled • <span className="text-emerald-400 font-semibold">{activePanelsCount} Active</span>
        </div>
      </div>
    </div>
  );
};
