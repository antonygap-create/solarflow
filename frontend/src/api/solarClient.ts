/**
 * SolarFlow API Client (solarClient.ts)
 * -------------------------------------
 * TypeScript API client interfacing with FastAPI backend on Cloud Run.
 */

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 
  import.meta.env.VITE_API_URL || 
  'https://solarflow-backend-gbzl7cxmxq-uc.a.run.app'
).replace(/\/$/, '');

export interface SolarGenerationRequest {
  latitude: number;
  longitude: number;
  roof_area_sqm: number;
  azimuth?: number;
  tilt?: number;
}

export interface SolarGenerationResponse {
  estimated_annual_kwh: number;
  assumptions: {
    system_efficiency: number;
    performance_ratio: number;
    insolation_kwh_m2: number;
    azimuth: number;
    tilt: number;
  };
}

export interface EconomicsRequest {
  system_capacity_kw: number;
  annual_energy_kwh: number;
  annual_consumption_kwh: number;
  tariff_type?: 'FLAT' | 'TOU' | 'NEM3';
  system_architecture?: 'GRID_TIED' | 'HYBRID_BATTERY' | 'OFF_GRID';
  battery_capacity_kwh?: number;
  ev_charger_enabled?: boolean;
}

export interface EconomicsResponse {
  total_system_cost: number;
  battery_cost_usd?: number;
  estimated_annual_savings: number;
  payback_period_years: number;
  roi_25_years_percent: number;
  self_consumption_ratio: number;
  assumptions: Record<string, any>;
}

export interface ProposalCreate {
  customer_email?: string;
  latitude: number;
  longitude: number;
  system_capacity_kw: number;
  annual_generation_kwh: number;
  total_system_cost: number;
  estimated_annual_savings: number;
  roi_25_years_percent: number;
}

export interface ProposalRead extends ProposalCreate {
  id: string;
  created_at: string;
}

export interface SolarInsightsResponse {
  latitude: number;
  longitude: number;
  roof_area_sqm: number;
  max_panels_count: number;
  pitch_degrees: number;
  azimuth_degrees: number;
  estimated_annual_kwh: number;
  is_fallback: boolean;
  solar_imagery_urls?: Record<string, any>;
}

export interface GeocodeResponse {
  latitude: number;
  longitude: number;
  formatted_address: string;
}

/**
 * 0. GET /api/v1/solar/geocode?address={address}
 */
export async function geocodeAddress(address: string): Promise<GeocodeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/solar/geocode?address=${encodeURIComponent(address)}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Geocoding API failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * 1. GET /api/v1/solar/insights?lat={lat}&lng={lng}
 */
export async function getSolarInsights(lat: number, lng: number): Promise<SolarInsightsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/solar/insights?lat=${lat}&lng=${lng}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Solar Insights API failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * 2. POST /api/v1/estimate/generation
 */
export async function estimateGeneration(data: SolarGenerationRequest): Promise<SolarGenerationResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/estimate/generation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      azimuth: 180.0,
      tilt: 20.0,
      ...data
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Generation API failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * 3. POST /api/v1/estimate/economics
 */
export async function estimateEconomics(data: EconomicsRequest): Promise<EconomicsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/estimate/economics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tariff_type: 'NEM3',
      ...data
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Economics API failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * 4. POST /api/v1/proposals/
 */
export async function saveProposal(data: ProposalCreate): Promise<ProposalRead> {
  const response = await fetch(`${API_BASE_URL}/api/v1/proposals/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Proposal save failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * 5. GET /api/v1/proposals/{id}
 */
export async function getProposalById(id: string): Promise<ProposalRead> {
  const response = await fetch(`${API_BASE_URL}/api/v1/proposals/${id}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Get proposal failed with status ${response.status}`);
  }
  return response.json();
}
