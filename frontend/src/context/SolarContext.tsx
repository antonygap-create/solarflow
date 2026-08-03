import React, { createContext, useContext, useState, useMemo } from 'react';
import type { 
  PanelItem, 
  SolarApiResponse, 
  FinancialConfig, 
  YearlyCashFlow 
} from '../types/solar';

export type LayoutMode = 'STANDARD' | 'EAST_WEST';

interface SolarContextType {
  address: string;
  setAddress: (addr: string) => void;
  lat: number;
  lng: number;
  setCoordinates: (lat: number, lng: number) => void;
  googleApiKey: string;
  setGoogleApiKey: (key: string) => void;
  loading: boolean;
  error: string | null;
  panels: PanelItem[];
  togglePanel: (id: string) => void;
  resetPanels: () => void;
  fetchSolarLayout: (latitude?: number, longitude?: number) => Promise<void>;
  
  // Task 4: Layout Mode & Atomic Pair Operations
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
  incrementPanels: () => void;
  decrementPanels: () => void;

  // Real-time recalculated metrics
  activePanelsCount: number;
  totalCapacityKwp: number;
  totalAnnualYieldKwh: number;
  performanceRatio: number;
  
  // Financial configuration & ROI
  financialConfig: FinancialConfig;
  setFinancialConfig: React.Dispatch<React.SetStateAction<FinancialConfig>>;
  cashFlowProjections: YearlyCashFlow[];
  paybackYears: number | null;
  net25YearSavings: number;
}

const SolarContext = createContext<SolarContextType | undefined>(undefined);

export const SolarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [address, setAddress] = useState<string>('Los Angeles, CA');
  const [lat, setLat] = useState<number>(34.0522);
  const [lng, setLng] = useState<number>(-118.2437);
  const [googleApiKey, setGoogleApiKey] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [panels, setPanels] = useState<PanelItem[]>([]);
  const [layoutMode, setLayoutModeState] = useState<LayoutMode>('STANDARD');
  const [performanceRatio, setPerformanceRatio] = useState<number>(0.7369);

  // Financial Config defaults
  const [financialConfig, setFinancialConfig] = useState<FinancialConfig>({
    costPerWatt: 2.50,
    electricityRate: 0.15,
    rateInflation: 3.0,
    panelDegradation: 0.5,
    federalTaxCreditItc: 30.0
  });

  // Task 4: Guarantee even number of active panels in East-West mode
  const ensureEvenPanelsInEastWest = (currentPanels: PanelItem[]): PanelItem[] => {
    const activePanels = currentPanels.filter(p => p.active);
    if (activePanels.length % 2 !== 0) {
      // Find last active panel and set inactive to enforce even count invariant
      const lastActiveIndex = currentPanels.map((p, idx) => (p.active ? idx : -1)).filter(idx => idx !== -1).pop();
      if (lastActiveIndex !== undefined) {
        return currentPanels.map((p, idx) => (idx === lastActiveIndex ? { ...p, active: false } : p));
      }
    }
    return currentPanels;
  };

  const setLayoutMode = (mode: LayoutMode) => {
    setLayoutModeState(mode);
    if (mode === 'EAST_WEST') {
      setPanels(prev => ensureEvenPanelsInEastWest(prev));
    }
  };

  // Task 4: Atomic increment by 1 (STANDARD) or by 2 (EAST_WEST)
  const incrementPanels = () => {
    setPanels((prev) => {
      const step = layoutMode === 'EAST_WEST' ? 2 : 1;
      let toggledCount = 0;
      const updated = prev.map((p) => {
        if (!p.active && toggledCount < step) {
          toggledCount++;
          return { ...p, active: true };
        }
        return p;
      });
      return layoutMode === 'EAST_WEST' ? ensureEvenPanelsInEastWest(updated) : updated;
    });
  };

  // Task 4: Atomic decrement by 1 (STANDARD) or by 2 (EAST_WEST)
  const decrementPanels = () => {
    setPanels((prev) => {
      const step = layoutMode === 'EAST_WEST' ? 2 : 1;
      const activeIndices = prev.map((p, idx) => (p.active ? idx : -1)).filter((idx) => idx !== -1);
      const indicesToDisable = new Set(activeIndices.slice(-step));

      const updated = prev.map((p, idx) => (indicesToDisable.has(idx) ? { ...p, active: false } : p));
      return layoutMode === 'EAST_WEST' ? ensureEvenPanelsInEastWest(updated) : updated;
    });
  };

  const fetchSolarLayout = async (targetLat?: number, targetLng?: number) => {
    const queryLat = targetLat ?? lat;
    const queryLng = targetLng ?? lng;
    
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8000/api/v1/solar/generate-layout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          latitude: queryLat,
          longitude: queryLng,
          google_api_key: googleApiKey.trim() || undefined
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || `Server error ${response.status}`);
      }

      const data: SolarApiResponse = await response.json();

      // Transform GeoJSON features into interactive panel state
      const parsedPanels: PanelItem[] = data.geojson.features.map((feat) => ({
        id: feat.properties.panel_id,
        segmentId: feat.properties.segment_id ?? 0,
        orientation: feat.properties.orientation ?? 'Portrait',
        pitchDeg: feat.properties.pitch_deg ?? 22.5,
        azimuthDeg: feat.properties.azimuth_deg ?? 180,
        annualYieldKwh: feat.properties.annual_yield_kwh,
        capacityKwp: feat.properties.capacity_kwp || 0.4,
        active: true,
        coordinates: feat.geometry.coordinates[0] as [number, number][]
      }));

      const initialPanels = layoutMode === 'EAST_WEST' ? ensureEvenPanelsInEastWest(parsedPanels) : parsedPanels;
      setPanels(initialPanels);
      setPerformanceRatio(data.summary.system_performance_ratio || 0.7369);
    } catch (err: any) {
      console.error('Failed to fetch solar layout:', err);
      setError(err.message || 'Failed to connect to FastAPI backend service.');
    } finally {
      setLoading(false);
    }
  };

  const togglePanel = (id: string) => {
    setPanels((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p));
      return layoutMode === 'EAST_WEST' ? ensureEvenPanelsInEastWest(updated) : updated;
    });
  };

  const resetPanels = () => {
    setPanels((prev) => {
      const updated = prev.map((p) => ({ ...p, active: true }));
      return layoutMode === 'EAST_WEST' ? ensureEvenPanelsInEastWest(updated) : updated;
    });
  };

  const setCoordinates = (newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
  };

  // Real-time recalculated metrics based ONLY on active panels
  const activePanels = useMemo(() => panels.filter((p) => p.active), [panels]);
  const activePanelsCount = activePanels.length;

  const totalCapacityKwp = useMemo(
    () => Number((activePanelsCount * 0.4).toFixed(2)),
    [activePanelsCount]
  );

  const totalAnnualYieldKwh = useMemo(
    () => Number(activePanels.reduce((sum, p) => sum + p.annualYieldKwh, 0).toFixed(2)),
    [activePanels]
  );

  // 25-Year Cumulative Cash Flow Projections Calculation
  const { cashFlowProjections, paybackYears, net25YearSavings } = useMemo(() => {
    if (totalCapacityKwp === 0 || totalAnnualYieldKwh === 0) {
      return { cashFlowProjections: [], paybackYears: null, net25YearSavings: 0 };
    }

    const totalWatts = totalCapacityKwp * 1000.0;
    const grossCapex = totalWatts * financialConfig.costPerWatt;
    const netCapex = grossCapex * (1.0 - financialConfig.federalTaxCreditItc / 100.0);

    let cumulative = -netCapex;
    let foundPayback: number | null = null;

    const projections: YearlyCashFlow[] = [];

    for (let yr = 1; yr <= 25; yr++) {
      const degFactor = Math.pow(1.0 - financialConfig.panelDegradation / 100.0, yr - 1);
      const infFactor = Math.pow(1.0 + financialConfig.rateInflation / 100.0, yr - 1);

      const yearlyYield = totalAnnualYieldKwh * degFactor;
      const yearlyRate = financialConfig.electricityRate * infFactor;
      const yearlySavings = yearlyYield * yearlyRate;

      cumulative += yearlySavings;

      if (cumulative >= 0 && foundPayback === null) {
        // Interpolate fractional payback year
        const prevCum = cumulative - yearlySavings;
        const fraction = Math.abs(prevCum) / yearlySavings;
        foundPayback = Number(((yr - 1) + fraction).toFixed(1));
      }

      projections.push({
        year: yr,
        annualSavings: Number(yearlySavings.toFixed(2)),
        cumulativeCashFlow: Number(cumulative.toFixed(2)),
        degradedYieldKwh: Number(yearlyYield.toFixed(1)),
        electricityTariff: Number(yearlyRate.toFixed(3))
      });
    }

    return {
      cashFlowProjections: projections,
      paybackYears: foundPayback,
      net25YearSavings: Number(cumulative.toFixed(2))
    };
  }, [totalCapacityKwp, totalAnnualYieldKwh, financialConfig]);

  return (
    <SolarContext.Provider
      value={{
        address,
        setAddress,
        lat,
        lng,
        setCoordinates,
        googleApiKey,
        setGoogleApiKey,
        loading,
        error,
        panels,
        togglePanel,
        resetPanels,
        fetchSolarLayout,
        layoutMode,
        setLayoutMode,
        incrementPanels,
        decrementPanels,
        activePanelsCount,
        totalCapacityKwp,
        totalAnnualYieldKwh,
        performanceRatio,
        financialConfig,
        setFinancialConfig,
        cashFlowProjections,
        paybackYears,
        net25YearSavings
      }}
    >
      {children}
    </SolarContext.Provider>
  );
};

export const useSolar = () => {
  const context = useContext(SolarContext);
  if (!context) {
    throw new Error('useSolar must be used within a SolarProvider');
  }
  return context;
};
