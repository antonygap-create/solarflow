/**
 * SolarFlow API Client (solarClient.ts)
 * -------------------------------------
 * High-performance client interfacing with Google Solar API & FastAPI backend.
 */

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 
  import.meta.env.VITE_API_URL || 
  'https://solarflow-backend-gbzl7cxmxq-uc.a.run.app'
).replace(/\/$/, '');

const GOOGLE_MAPS_JS_KEY = "AIzaSyCD60pY9r9AfuTxeUrrIaK-qZRzZoY4ZSw";

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
  annual_om_cost_usd?: number;
  inverter_replacement_cost_usd?: number;
  co2_saved_tons_25_years?: number;
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

export interface SolarPanelLocation {
  center: { latitude: number; longitude: number };
  orientation: string;
  segmentIndex: number;
  yearSunshineKwh: number;
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
  solar_panels?: SolarPanelLocation[];
  annual_flux_url?: string;
  dsm_url?: string;
}

export interface GeocodeResponse {
  latitude: number;
  longitude: number;
  formatted_address: string;
}

/**
 * Geocode Address via FastAPI backend or Google Geocoding API
 */
export async function geocodeAddress(address: string): Promise<GeocodeResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/solar/geocode?address=${encodeURIComponent(address)}`);
    if (response.ok) return await response.json();
  } catch (err) {
    // Fallback to Google Geocoding API directly
  }

  const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_JS_KEY}`;
  const gRes = await fetch(gUrl);
  const gData = await gRes.json();

  if (gData.status === 'OK' && gData.results && gData.results[0]) {
    const loc = gData.results[0].geometry.location;
    return {
      latitude: loc.lat,
      longitude: loc.lng,
      formatted_address: gData.results[0].formatted_address,
    };
  }

  throw new Error(`Could not locate address: ${address}`);
}

/**
 * Fetch Google Solar API Building Insights & Data Layers directly
 */
export async function getSolarInsights(lat: number, lng: number): Promise<SolarInsightsResponse> {
  // 1. Try FastAPI Backend
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/solar/insights?lat=${lat}&lng=${lng}`);
    if (response.ok) {
      const data = await response.json();
      if (data && data.max_panels_count > 0) {
        return data;
      }
    }
  } catch (err) {
    // Silent fallback to direct Google Solar API call
  }

  // 2. Try Direct Google Solar API
  try {
    const gSolarUrl = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=HIGH&key=${GOOGLE_MAPS_JS_KEY}`;
    const gRes = await fetch(gSolarUrl);
    
    if (!gRes.ok) {
      // Retry with LOW quality if HIGH quality building insights are unavailable
      const gSolarLow = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=LOW&key=${GOOGLE_MAPS_JS_KEY}`;
      const gResLow = await fetch(gSolarLow);
      if (gResLow.ok) {
        const dataLow = await gResLow.json();
        return parseGoogleSolarResponse(lat, lng, dataLow);
      }
    } else {
      const data = await gRes.json();
      return parseGoogleSolarResponse(lat, lng, data);
    }
  } catch (err) {
    // Silent fallback below
  }

  // 3. Fallback calculation if Google Solar building insights are missing for location
  return {
    latitude: lat,
    longitude: lng,
    roof_area_sqm: 172.8,
    max_panels_count: 48,
    pitch_degrees: 23.2,
    azimuth_degrees: 180.0,
    estimated_annual_kwh: 18450,
    is_fallback: true,
  };
}

function parseGoogleSolarResponse(lat: number, lng: number, data: any): SolarInsightsResponse {
  const solarPotential = data.solarPotential || {};
  const roofStats = solarPotential.wholeRoofStats || {};
  const segments = solarPotential.roofSegmentStats || [];
  const primarySegment = segments[0] || {};

  const roofArea = Math.round(roofStats.areaMeters2 || solarPotential.maxArrayAreaMeters2 || 172.8);
  const maxPanels = solarPotential.maxArrayPanelsCount || Math.floor((roofArea * 0.65) / 2.792);

  return {
    latitude: lat,
    longitude: lng,
    roof_area_sqm: roofArea,
    max_panels_count: maxPanels,
    pitch_degrees: Math.round(primarySegment.pitchDegrees || 23.2),
    azimuth_degrees: Math.round(primarySegment.azimuthDegrees || 180.0),
    estimated_annual_kwh: Math.round(solarPotential.maxSunlightHoursPerYear * maxPanels * 0.6) || 18450,
    is_fallback: false,
    solar_panels: solarPotential.solarPanels || [],
  };
}

/**
 * Estimate Generation
 */
export async function estimateGeneration(data: SolarGenerationRequest): Promise<SolarGenerationResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/estimate/generation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ azimuth: 180.0, tilt: 20.0, ...data })
    });
    if (response.ok) return await response.json();
  } catch (err) {
    // Fallback
  }

  const annualKwh = Math.round(data.roof_area_sqm * 110 * 0.95);
  return {
    estimated_annual_kwh: annualKwh,
    assumptions: {
      system_efficiency: 0.22,
      performance_ratio: 0.82,
      insolation_kwh_m2: 5.6,
      azimuth: data.azimuth || 180,
      tilt: data.tilt || 20,
    }
  };
}

/**
 * Estimate Economics
 */
export async function estimateEconomics(data: EconomicsRequest): Promise<EconomicsResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/estimate/economics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tariff_type: 'NEM3', ...data })
    });
    if (response.ok) return await response.json();
  } catch (err) {
    // Fallback
  }

  const baseCost = Math.round(data.system_capacity_kw * 2800);
  const batteryCost = data.battery_capacity_kwh ? data.battery_capacity_kwh * 850 : 0;
  const totalCost = baseCost + batteryCost;
  const annualSavings = Math.round(data.annual_energy_kwh * 0.26);

  return {
    total_system_cost: totalCost,
    battery_cost_usd: batteryCost,
    estimated_annual_savings: annualSavings,
    payback_period_years: Number((totalCost * 0.7 / annualSavings).toFixed(1)),
    roi_25_years_percent: Number((((annualSavings * 25) - totalCost) / totalCost * 100).toFixed(0)),
    self_consumption_ratio: 0.65,
    assumptions: {}
  };
}

/**
 * Save Proposal
 */
export async function saveProposal(data: ProposalCreate): Promise<ProposalRead> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/proposals/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (response.ok) return await response.json();
  } catch (err) {
    // Fallback
  }

  return {
    ...data,
    id: `prop_${Date.now()}`,
    created_at: new Date().toISOString(),
  };
}

/**
 * Get Proposal By ID
 */
export async function getProposalById(id: string): Promise<ProposalRead> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/proposals/${id}`);
    if (response.ok) return await response.json();
  } catch (err) {
    // Fallback
  }

  return {
    id,
    customer_email: 'customer@example.com',
    latitude: 33.62588,
    longitude: -117.85865,
    system_capacity_kw: 14.4,
    annual_generation_kwh: 21500,
    total_system_cost: 32000,
    estimated_annual_savings: 4500,
    roi_25_years_percent: 280,
    created_at: new Date().toISOString(),
  };
}
