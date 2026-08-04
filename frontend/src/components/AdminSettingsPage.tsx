import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export interface AdminSettingsState {
  // Financials & Tariffs
  costPerKwpUsd: number;
  federalCreditActive: boolean;
  federalCreditCapUsd: number;
  batteryIncentiveCapUsd: number;
  selfConsumptionRatioPercent: number;
  daytimeConsumptionRatioPercent: number;
  retailTariffRateUsd: number;
  configuredExportRateUsd: number;
  alternativeExportRateUsd: number;

  // Hardware & PVGIS
  panelModelId: string;
  systemLossesPercent: number;
  dcAcRatioPercent: number;
  minSystemSizeKwp: number;
  maxSystemSizeKwp: number;
  defaultSystemType: 'GRID_TIED' | 'HYBRID_BATTERY' | 'OFF_GRID';

  // Branding & Export
  companyName: string;
  brandColorHex: string;
}

const DEFAULT_SETTINGS: AdminSettingsState = {
  costPerKwpUsd: 2800,
  federalCreditActive: true,
  federalCreditCapUsd: 10000,
  batteryIncentiveCapUsd: 3000,
  selfConsumptionRatioPercent: 45,
  daytimeConsumptionRatioPercent: 60,
  retailTariffRateUsd: 0.28,
  configuredExportRateUsd: 0.08,
  alternativeExportRateUsd: 0.05,

  panelModelId: '400w_mono',
  systemLossesPercent: 14,
  dcAcRatioPercent: 120,
  minSystemSizeKwp: 2.0,
  maxSystemSizeKwp: 40.0,
  defaultSystemType: 'HYBRID_BATTERY',

  companyName: 'SolarFlow US Energy Solutions',
  brandColorHex: '#f59e0b',
};

export const AdminSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'financials' | 'hardware' | 'branding'>('financials');
  const [settings, setSettings] = useState<AdminSettingsState>(DEFAULT_SETTINGS);
  const [originalSettings, setOriginalSettings] = useState<AdminSettingsState>(DEFAULT_SETTINGS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const session = localStorage.getItem('admin_session');
    if (!session) {
      navigate('/admin/login');
      return;
    }

    const saved = localStorage.getItem('admin_settings_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings(parsed);
        setOriginalSettings(parsed);
      } catch {
        // fallback to defaults
      }
    }
  }, [navigate]);

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (settings.costPerKwpUsd < 0) errs.costPerKwpUsd = "Cannot be negative.";
    if (settings.selfConsumptionRatioPercent < 0 || settings.selfConsumptionRatioPercent > 100) {
      errs.selfConsumptionRatioPercent = "Must be between 0 and 100%.";
    }
    if (settings.maxSystemSizeKwp < settings.minSystemSizeKwp) {
      errs.maxSystemSizeKwp = "Maximum must be at least the minimum.";
    }
    if (!settings.companyName.trim()) {
      errs.companyName = "Company name is required.";
    } else if (settings.companyName.length > 80) {
      errs.companyName = "Use 80 characters or fewer.";
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(settings.brandColorHex)) {
      errs.brandColorHex = "Use a hex colour, e.g. #FF6A13.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = () => {
    if (!validate()) {
      showToast("Fix the highlighted fields before saving.");
      return;
    }
    localStorage.setItem('admin_settings_data', JSON.stringify(settings));
    setOriginalSettings(settings);
    showToast("Settings saved. The calculator will use them.");
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem('admin_settings_data', JSON.stringify(DEFAULT_SETTINGS));
    setOriginalSettings(DEFAULT_SETTINGS);
    setErrors({});
    showToast("Reset to the built-in defaults.");
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_session');
    navigate('/admin/login');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 pb-24">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-amber-400">Operator Dashboard & Shared Settings</h1>
            <p className="text-xs text-slate-400">Configure financial benchmarks, hardware parameters, and branding tokens</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
          >
            Logout
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 space-x-2">
          <button
            onClick={() => setActiveTab('financials')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition border-t border-x ${
              activeTab === 'financials'
                ? 'bg-slate-900 text-amber-400 border-slate-700'
                : 'bg-transparent text-slate-400 border-transparent hover:text-white'
            }`}
          >
            Financials & Tariffs
          </button>
          <button
            onClick={() => setActiveTab('hardware')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition border-t border-x ${
              activeTab === 'hardware'
                ? 'bg-slate-900 text-amber-400 border-slate-700'
                : 'bg-transparent text-slate-400 border-transparent hover:text-white'
            }`}
          >
            Hardware & PVGIS
          </button>
          <button
            onClick={() => setActiveTab('branding')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition border-t border-x ${
              activeTab === 'branding'
                ? 'bg-slate-900 text-amber-400 border-slate-700'
                : 'bg-transparent text-slate-400 border-transparent hover:text-white'
            }`}
          >
            Branding & Export
          </button>
        </div>

        {/* Tab Content */}
        <div className="bg-slate-900 border border-slate-800 rounded-b-2xl rounded-tr-2xl p-6 shadow-xl space-y-6">
          {activeTab === 'financials' && (
            <div className="space-y-4 max-w-2xl">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Turnkey Cost per kWp ($/kWp)</label>
                <input
                  type="number"
                  value={settings.costPerKwpUsd}
                  onChange={(e) => setSettings({ ...settings, costPerKwpUsd: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                />
                {errors.costPerKwpUsd && <p className="text-xs text-red-400 mt-1">{errors.costPerKwpUsd}</p>}
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="fedCreditCheck"
                  checked={settings.federalCreditActive}
                  onChange={(e) => setSettings({ ...settings, federalCreditActive: e.target.checked })}
                  className="w-4 h-4 accent-amber-400 rounded"
                />
                <label htmlFor="fedCreditCheck" className="text-xs font-semibold text-slate-200">
                  Federal Tax Credit Active (30% Section 48E / 25D)
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Self-Consumption Ratio (%)</label>
                <input
                  type="number"
                  value={settings.selfConsumptionRatioPercent}
                  onChange={(e) => setSettings({ ...settings, selfConsumptionRatioPercent: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                />
                {errors.selfConsumptionRatioPercent && <p className="text-xs text-red-400 mt-1">{errors.selfConsumptionRatioPercent}</p>}
              </div>
            </div>
          )}

          {activeTab === 'hardware' && (
            <div className="space-y-4 max-w-2xl">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Default Panel Model</label>
                <div className="flex space-x-4 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="panelModel"
                      value="400w_mono"
                      checked={settings.panelModelId === '400w_mono'}
                      onChange={() => setSettings({ ...settings, panelModelId: '400w_mono' })}
                      className="accent-amber-400"
                    />
                    <span>400W Monocrystalline (1.72m × 1.13m)</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="panelModel"
                      value="450w_bifacial"
                      checked={settings.panelModelId === '450w_bifacial'}
                      onChange={() => setSettings({ ...settings, panelModelId: '450w_bifacial' })}
                      className="accent-amber-400"
                    />
                    <span>450W Bifacial High-Efficiency</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Min System Size (kWp)</label>
                  <input
                    type="number"
                    value={settings.minSystemSizeKwp}
                    onChange={(e) => setSettings({ ...settings, minSystemSizeKwp: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Max System Size (kWp)</label>
                  <input
                    type="number"
                    value={settings.maxSystemSizeKwp}
                    onChange={(e) => setSettings({ ...settings, maxSystemSizeKwp: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  />
                  {errors.maxSystemSizeKwp && <p className="text-xs text-red-400 mt-1">{errors.maxSystemSizeKwp}</p>}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'branding' && (
            <div className="space-y-6">
              <div className="max-w-2xl space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={settings.companyName}
                    onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                  />
                  {errors.companyName && <p className="text-xs text-red-400 mt-1">{errors.companyName}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Primary Brand Color (HEX)</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={settings.brandColorHex}
                      onChange={(e) => setSettings({ ...settings, brandColorHex: e.target.value })}
                      className="w-10 h-10 rounded cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={settings.brandColorHex}
                      onChange={(e) => setSettings({ ...settings, brandColorHex: e.target.value })}
                      className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono"
                    />
                  </div>
                  {errors.brandColorHex && <p className="text-xs text-red-400 mt-1">{errors.brandColorHex}</p>}
                </div>
              </div>

              {/* Live Preview Block */}
              <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Branding Preview</h4>
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-slate-950 font-bold"
                      style={{ backgroundColor: settings.brandColorHex }}
                    >
                      {settings.companyName.charAt(0) || 'S'}
                    </div>
                    <span className="font-bold text-slate-100">{settings.companyName}</span>
                  </div>
                  <button
                    style={{ backgroundColor: settings.brandColorHex }}
                    className="px-4 py-2 text-slate-950 font-bold text-xs rounded-xl shadow"
                  >
                    Sample Branded Button
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Action Panel */}
      <div className="fixed bottom-0 inset-x-0 bg-slate-900/95 border-t border-slate-800 p-4 backdrop-blur-md z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400">
            Status: {hasChanges ? 'Unsaved changes' : 'All changes saved'}
          </span>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
            >
              Reset to defaults
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl shadow disabled:opacity-40"
            >
              Save changes
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Toast */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-2xl animate-bounce">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
