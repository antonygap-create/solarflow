import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Zap, Sun, DollarSign, MapPin, UserCheck, CheckCircle2, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SolarMap } from './SolarMap';
import type { ProjectDetailResponse, GeoJSONFeatureCollection, PanelItem } from '../types/solar';

export const ProjectManagerView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getAuthHeader } = useAuth();

  // Task 3: Generate a stable Proposal ID initialized once that never changes across re-renders
  const proposalId = useMemo(() => {
    if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `PROP-${window.crypto.randomUUID().substring(0, 8).toUpperCase()}`;
    }
    return `PROP-${Math.floor(10000000 + Math.random() * 90000000)}`;
  }, []);

  const [projectData, setProjectData] = useState<ProjectDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Layout editing state
  const [features, setFeatures] = useState<GeoJSONFeatureCollection | null>(null);
  const [costPerWatt, setCostPerWatt] = useState<number>(2.50);

  const fetchProject = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { ...getAuthHeader(), 'Content-Type': 'application/json' };
      const response = await fetch(`http://localhost:8000/api/dashboard/projects/${id}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to load project details.');
      }

      const data: ProjectDetailResponse = await response.json();
      setProjectData(data);

      if (data.layout?.geojson) {
        setFeatures(data.layout.geojson);
      }

      if (data.layout?.financial_metrics?.cost_per_watt) {
        setCostPerWatt(data.layout.financial_metrics.cost_per_watt);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchProject();
    }
  }, [id]);

  // Convert GeoJSON features into PanelItem list for SolarMap
  const panels: PanelItem[] = (features?.features || []).map((feat, idx) => {
    const coords = (feat.geometry.coordinates[0] || []).map(c => [c[0], c[1]] as [number, number]);
    return {
      id: feat.properties.panel_id || `P_${idx}`,
      segmentId: feat.properties.segment_id || 0,
      orientation: feat.properties.orientation || 'Portrait',
      pitchDeg: feat.properties.pitch_deg || 22.5,
      azimuthDeg: feat.properties.azimuth_deg || 180,
      annualYieldKwh: feat.properties.annual_yield_kwh || 442,
      capacityKwp: feat.properties.capacity_kwp || 0.4,
      active: feat.properties.active !== false,
      coordinates: coords,
    };
  });

  const handleTogglePanel = (panelId: string) => {
    if (!features) return;

    const updatedFeatures = features.features.map(feat => {
      if (feat.properties.panel_id === panelId) {
        const currentActive = feat.properties.active !== false;
        return {
          ...feat,
          properties: {
            ...feat.properties,
            active: !currentActive,
          },
        };
      }
      return feat;
    });

    setFeatures({
      type: 'FeatureCollection',
      features: updatedFeatures,
    });
  };

  const handleSaveChanges = async () => {
    if (!id || !features) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const headers = { ...getAuthHeader(), 'Content-Type': 'application/json' };
      const response = await fetch(`http://localhost:8000/api/dashboard/projects/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          toggled_geojson: features,
          custom_cost_per_watt: costPerWatt,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save layout modifications.');
      }

      setSuccessMsg('Layout and custom pricing saved successfully!');
      fetchProject();
    } catch (err: any) {
      setError(err.message || 'Error saving layout.');
    } finally {
      setSaving(false);
    }
  };

  const activePanelsCount = panels.filter(p => p.active).length;
  const totalCapacityKwp = (activePanelsCount * 0.4).toFixed(1);
  const totalAnnualYield = Math.round(panels.filter(p => p.active).reduce((sum, p) => sum + p.annualYieldKwh, 0));

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        <span>Loading solar project layout...</span>
      </div>
    );
  }

  if (!projectData) {
    return (
      <div className="p-8 text-center text-rose-400">
        Project not found or access denied.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/dashboard/leads')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Leads Inbox</span>
          </button>

          {/* Task 3 Stable Proposal Identifier Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-amber-400 font-mono">
            <FileText className="w-3.5 h-3.5" />
            <span>Proposal Ref: {proposalId}</span>
          </div>
        </div>

        <button
          onClick={handleSaveChanges}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Save Proposal Changes</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/80 border border-rose-500/50 rounded-xl text-rose-300 text-sm">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Grid Layout: Map View & Side Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Interactive Satellite Vector Map */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden min-h-[500px] flex flex-col">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-400" />
              <span>Interactive Roof Plan (Click panel to toggle active status)</span>
            </h2>
            <span className="text-xs text-slate-400">
              Active: <strong className="text-amber-400">{activePanelsCount}</strong> / {panels.length}
            </span>
          </div>

          <div className="flex-1 relative min-h-[450px]">
            <SolarMap
              latitude={projectData.latitude}
              longitude={projectData.longitude}
              panels={panels}
              onTogglePanel={handleTogglePanel}
            />
          </div>
        </div>

        {/* Right Column: Project Summary & Financial Controls */}
        <div className="space-y-6">
          {/* Homeowner Lead Card */}
          {projectData.lead && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs uppercase font-semibold text-slate-400 tracking-wider flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-sky-400" />
                <span>Homeowner Lead Profile</span>
              </h3>
              <div className="text-lg font-bold text-white">
                {projectData.lead.first_name} {projectData.lead.last_name}
              </div>
              <div className="text-xs text-slate-400 space-y-1">
                <div>Email: <span className="text-slate-200">{projectData.lead.email}</span></div>
                <div>Phone: <span className="text-slate-200">{projectData.lead.phone}</span></div>
                <div>Address: <span className="text-slate-200">{projectData.address}</span></div>
              </div>
            </div>
          )}

          {/* System Yield Summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
              System Specifications
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
                <Zap className="w-4 h-4 text-amber-400 mb-1" />
                <div className="text-xl font-black text-white">{totalCapacityKwp} kWp</div>
                <div className="text-[11px] text-slate-400">Total Capacity</div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
                <Sun className="w-4 h-4 text-sky-400 mb-1" />
                <div className="text-xl font-black text-white">{totalAnnualYield.toLocaleString()}</div>
                <div className="text-[11px] text-slate-400">kWh / Year</div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Installer Custom Price per Watt ($/Wp)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="number"
                  step="0.05"
                  value={costPerWatt}
                  onChange={(e) => setCostPerWatt(parseFloat(e.target.value) || 2.50)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
