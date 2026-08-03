export interface GeoJSONGeometry {
  type: 'Polygon';
  coordinates: number[][][]; // Array of linear rings, each coordinate is [longitude, latitude]
}

export interface PanelProperties {
  panel_id: string;
  segment_id?: number;
  orientation?: 'Portrait' | 'Landscape';
  pitch_deg?: number;
  azimuth_deg?: number;
  annual_yield_kwh: number;
  capacity_kwp: number;
  active?: boolean;
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: GeoJSONGeometry;
  properties: PanelProperties;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface SolarSummary {
  total_panels: number;
  total_capacity_kwp: number;
  total_annual_generation_kwh: number;
  system_performance_ratio: number;
  pruned_panels_count: number;
}

export interface SolarApiResponse {
  status: string;
  summary: SolarSummary;
  geojson: GeoJSONFeatureCollection;
}

export interface PanelItem {
  id: string;
  segmentId: number;
  orientation: 'Portrait' | 'Landscape';
  pitchDeg: number;
  azimuthDeg: number;
  annualYieldKwh: number;
  capacityKwp: number;
  active: boolean;
  coordinates: [number, number][]; // [lng, lat]
}

export interface FinancialConfig {
  costPerWatt: number;        // Cost in USD per Watt DC (Default $2.50)
  electricityRate: number;    // Tariff in USD/kWh (Default $0.15)
  rateInflation: number;      // Annual tariff inflation (Default 3.0%)
  panelDegradation: number;   // Annual efficiency degradation (Default 0.5%)
  federalTaxCreditItc: number;// US Federal ITC percentage (Default 30%)
}

export interface YearlyCashFlow {
  year: number;
  annualSavings: number;
  cumulativeCashFlow: number;
  degradedYieldKwh: number;
  electricityTariff: number;
}

// B2C & B2B Dual-Interface Schemas

export interface B2CEstimateRequest {
  tenant_slug: string;
  address: string;
  latitude: number;
  longitude: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

export interface B2CEstimateResponse {
  lead_id: string;
  project_id: string;
  tenant_name: string;
  roof_area_sqm: number;
  max_capacity_kwp: number;
  total_panels: number;
  estimated_yearly_generation_kwh: number;
  estimated_yearly_savings_usd_min: number;
  estimated_yearly_savings_usd_max: number;
  message: string;
}

export interface UserAuthInfo {
  user_id: string;
  email: string;
  full_name: string;
  tenant_id: string;
  tenant_name: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
  full_name: string;
  tenant_id: string;
  tenant_name: string;
}

export interface LeadSchema {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: 'NEW' | 'CONTACTED' | 'CLOSED' | string;
  created_at: string;
  project_id?: string | null;
  project_address?: string | null;
}

export interface ProjectDetailResponse {
  project_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  tenant_id: string;
  lead?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    status: string;
  } | null;
  layout?: {
    id: string;
    total_panels: number;
    total_capacity_kwp: number;
    annual_generation_kwh: number;
    performance_ratio: number;
    geojson: GeoJSONFeatureCollection;
    financial_metrics: {
      cost_per_watt?: number;
      electricity_rate?: number;
      tax_credit_itc?: number;
      estimated_annual_savings?: number;
    };
  } | null;
}

export interface ProjectUpdateRequest {
  name?: string;
  notes?: string;
  toggled_geojson?: GeoJSONFeatureCollection;
  custom_cost_per_watt?: number;
}
