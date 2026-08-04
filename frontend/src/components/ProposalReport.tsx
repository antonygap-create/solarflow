import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { STRINGS } from '../config/strings';

interface ProposalReportProps {
  proposalData?: any;
}

export const ProposalReport: React.FC<ProposalReportProps> = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Retrieve state or lead submission status
  const reportState = location.state || {};
  const isUnlocked = Boolean(reportState.isLeadSubmitted || localStorage.getItem('last_lead_submitted'));
  const data = reportState.assessmentData || {
    address: '1800 Port Margate Pl, Newport Beach, CA 92660',
    latitude: 33.62588,
    longitude: -117.85865,
    systemCapacityKw: 12.8,
    activePanelCount: 32,
    annualGenerationKwh: 18450,
    totalSystemCost: 35840,
    annualSavings: 4210,
    paybackYears: 6.2,
    roi25YearsPercent: 310,
    roofAreaSqm: 172.8,
    sunshineHoursPerYear: 2850,
    layoutMode: 'Standard',
    batteryKwh: 13.5,
    evCharger: true,
  };

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedLocally, setSubmittedLocally] = useState(isUnlocked);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    // Direct opening of /report without location state or saved lead redirects to /
    if (!location.state && !localStorage.getItem('last_lead_submitted') && !localStorage.getItem('current_assessment')) {
      navigate('/', { replace: true });
    }
  }, [location.state, navigate]);

  const validateEmail = (val: string) => {
    if (!val) return null;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(val) ? null : "Enter a valid email address.";
  };

  const validatePhone = (val: string) => {
    if (!val) return null;
    const clean = val.replace(/\D/g, '');
    if (clean.length < 10 || /^(\d)\1+$/.test(clean) || clean === '1234567890') {
      return "Enter a valid phone number.";
    }
    return null;
  };

  const isFormValid = Boolean(
    name.trim() &&
    email.trim() &&
    phone.trim() &&
    !validateEmail(email) &&
    !validatePhone(phone) &&
    consent
  );

  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setSubmitting(true);

    setTimeout(() => {
      setSubmitting(false);
      setSubmittedLocally(true);
      localStorage.setItem('last_lead_submitted', 'true');
    }, 600);
  };

  const handlePrint = () => {
    if (submittedLocally) {
      window.print();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 font-sans">
      {/* Top Header Control Panel (Screen Only) */}
      <div className="no-print max-w-5xl mx-auto mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
        <Link
          to="/"
          className="text-xs font-bold text-amber-400 hover:underline flex items-center space-x-1"
        >
          <span>{STRINGS.backToCalculator}</span>
        </Link>

        <div className="flex items-center space-x-4">
          {!submittedLocally && (
            <span className="text-xs text-amber-300/80 italic">
              🔒 {STRINGS.unlockPdfHint}
            </span>
          )}

          <button
            onClick={handlePrint}
            disabled={!submittedLocally}
            title={submittedLocally ? STRINGS.printSavePdfBtn : STRINGS.unlockPdfHint}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs shadow-lg transition disabled:opacity-40"
          >
            🖨️ {STRINGS.printSavePdfBtn}
          </button>
        </div>
      </div>

      {/* LOCKED PRINT PROPOSAL BLOCK (Rendered in print mode ONLY if lead is not submitted) */}
      {!submittedLocally && (
        <div className="print-only hidden p-12 text-center text-slate-900 bg-white">
          <h1 className="text-3xl font-bold text-red-600 mb-4">Proposal Locked</h1>
          <p className="text-lg text-slate-700">
            Please submit your contact details on the web calculator to unlock and generate your full 2-page solar proposal PDF.
          </p>
        </div>
      )}

      {/* 2-PAGE PROPOSAL DOCUMENT CONTAINER */}
      <div className={`max-w-5xl mx-auto space-y-8 ${!submittedLocally ? 'print:hidden' : ''}`}>
        
        {/* ================= PAGE 1 (A4) ================= */}
        <div className="bg-white text-slate-900 rounded-2xl p-8 sm:p-12 shadow-2xl space-y-8 border border-slate-200 page-break">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-6 gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-black text-xl shadow">
                SF
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">SolarFlow US</h1>
                <p className="text-xs text-slate-500 font-mono">Clean Energy Rooftop Proposal</p>
              </div>
            </div>

            <div className="text-right space-y-1 text-xs text-slate-500">
              <span className="px-3 py-1 bg-amber-100 text-amber-900 font-bold rounded-full border border-amber-300 uppercase tracking-wider text-[10px]">
                {STRINGS.preliminaryProposalBadge}
              </span>
              <p className="pt-2"><strong>Ref:</strong> {submittedLocally ? 'PR-2026-88412' : 'Pending lead submission'}</p>
              <p><strong>{STRINGS.dateLabel}:</strong> {new Date().toLocaleDateString('en-US')}</p>
            </div>
          </div>

          {/* Property Address & Title */}
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900">Solar Yield & Investment Proposal</h2>
            <p className="text-sm text-slate-600">📍 {data.address}</p>
          </div>

          {/* 3 Key Status Tiles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{STRINGS.recommendedCapacity}</span>
              <p className="text-2xl font-bold text-slate-900">{data.systemCapacityKw} kWp</p>
              <span className="text-[11px] text-slate-500">{data.activePanelCount} Active PV Modules</span>
            </div>
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-xs text-emerald-700 uppercase tracking-wider font-semibold">{STRINGS.annualSavings}</span>
              <p className="text-2xl font-bold text-emerald-700">${data.annualSavings.toLocaleString()} / yr</p>
              <span className="text-[11px] text-emerald-600">{STRINGS.includesIncentives}</span>
            </div>
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
              <span className="text-xs text-amber-800 uppercase tracking-wider font-semibold">{STRINGS.simplePayback}</span>
              <p className="text-2xl font-bold text-amber-800">{data.paybackYears} years</p>
              <span className="text-[11px] text-amber-700">{STRINGS.fastRoiBadge}</span>
            </div>
          </div>

          {/* Roof Analysis Section */}
          <div className="space-y-3 pt-2">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
              {STRINGS.roofAnalysisSection}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {STRINGS.exposureSunText}
            </p>
            <div className="h-48 bg-slate-900 rounded-xl overflow-hidden relative flex items-center justify-center border border-slate-800">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/60 via-red-600/40 to-slate-950 pointer-events-none"></div>
              <span className="relative z-10 px-4 py-2 bg-slate-950/80 text-amber-300 text-xs font-mono rounded-lg border border-amber-500/40">
                ☀️ Annual Sunlight Exposure Heatmap: {data.sunshineHoursPerYear} hours/yr
              </span>
            </div>
          </div>

          {/* Recommended System Section */}
          <div className="space-y-3 pt-2">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
              {STRINGS.recommendedSystemSection}
            </h3>
            <p className="text-xs font-mono text-slate-600">
              Configuration: {data.activePanelCount} × Qcells Q.PEAK DUO XL-G11S.3/BFG 600W (2462 × 1134 × 35 mm) · {data.layoutMode} Layout · {data.batteryKwh} kWh Battery Storage · Level 2 EV Charger
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px]">Annual Generation</span>
                <strong className="text-slate-900 font-bold">{data.annualGenerationKwh.toLocaleString()} kWh</strong>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px]">Turnkey System Cost</span>
                <strong className="text-slate-900 font-bold">${data.totalSystemCost.toLocaleString()}</strong>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px]">30% Federal Tax Credit</span>
                <strong className="text-emerald-700 font-bold">${(data.totalSystemCost * 0.3).toLocaleString()}</strong>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px]">Net Out-of-Pocket</span>
                <strong className="text-slate-900 font-bold">${(data.totalSystemCost * 0.7).toLocaleString()}</strong>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 italic pt-4 border-t border-slate-200">
            {STRINGS.reportEngineeringDisclaimer}
          </div>
        </div>

        {/* ================= PAGE 2 (A4) ================= */}
        <div className="bg-white text-slate-900 rounded-2xl p-8 sm:p-12 shadow-2xl space-y-8 border border-slate-200">
          {/* Section Header */}
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-xl font-bold text-slate-900">{STRINGS.outlook25Year}</h2>
            <p className="text-xs text-slate-500">Cumulative financial return and environmental offset over 25 years</p>
          </div>

          {/* 25-Year Projection SVG Chart */}
          <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">{STRINGS.cumulativeSavingsHeader}</h4>
            <div className="h-44 w-full flex items-end justify-between space-x-1 pt-4 border-b border-slate-300 pb-2">
              {[1, 3, 5, 7, 10, 15, 20, 25].map((yr) => {
                const height = Math.min(100, Math.max(15, yr * 4 + 10));
                const isPayback = yr === 7;
                return (
                  <div key={yr} className="flex-1 flex flex-col items-center group">
                    <div
                      style={{ height: `${height}%` }}
                      className={`w-full max-w-[28px] rounded-t-md transition ${
                        isPayback ? 'bg-amber-500 font-bold' : 'bg-blue-600'
                      }`}
                    ></div>
                    <span className="text-[10px] text-slate-600 font-mono mt-1">Y{yr}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-slate-700 font-medium pt-2">
              <span>{STRINGS.netCumulativeBenefit}: <strong>$84,200</strong></span>
              <span>{STRINGS.paybackYear}: <strong className="text-amber-700 font-bold">Year 6.2</strong></span>
              <span>{STRINGS.co2Avoided}: <strong>142.5 Tons</strong></span>
            </div>
          </div>

          {/* Assumptions Table */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
              {STRINGS.assumptionsDisclaimersSection}
            </h3>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-300 text-slate-500 font-semibold">
                  <th className="py-2">Parameter</th>
                  <th className="py-2">Assumed Value</th>
                  <th className="py-2">Verification Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="py-2 text-slate-800">Utility Electricity Rate</td>
                  <td className="py-2 font-mono">$0.28 / kWh</td>
                  <td className="py-2 text-emerald-700 font-semibold">Verified Rate Schedule</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-800">Rooftop Structural Capacity</td>
                  <td className="py-2 font-mono">15.2 kg/m²</td>
                  <td className="py-2">
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                      {STRINGS.pendingVerificationBadge}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-800">Annual Utility Rate Inflation</td>
                  <td className="py-2 font-mono">4.5% / year</td>
                  <td className="py-2 text-slate-600">Standard EIA Projection</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Next Steps List */}
          <div className="space-y-3 pt-2">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
              {STRINGS.nextStepsSection}
            </h3>
            <ol className="space-y-2 text-xs text-slate-700 list-decimal pl-4 leading-relaxed">
              <li>{STRINGS.nextStep1}</li>
              <li>{STRINGS.nextStep2}</li>
              <li>{STRINGS.nextStep3}</li>
            </ol>
          </div>

          {/* Lead Capture Form at Bottom of Report */}
          <div className="p-6 bg-slate-900 text-slate-100 rounded-xl space-y-4 no-print">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-amber-400">{STRINGS.getFullProposal}</h3>
              <p className="text-xs text-slate-400">{STRINGS.leadFormSubtext}</p>
            </div>

            {submittedLocally ? (
              <div className="p-4 bg-emerald-950/80 border border-emerald-500/60 rounded-xl text-emerald-300 text-sm font-bold text-center">
                ✅ {STRINGS.requestReceivedSuccess}
              </div>
            ) : (
              <form onSubmit={handleLeadSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{STRINGS.nameLabel} *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{STRINGS.emailLabel} *</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailError(validateEmail(e.target.value));
                      }}
                      placeholder="jane@example.com"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
                      required
                    />
                    {emailError && <span className="text-[10px] text-red-400 block mt-1">{emailError}</span>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">{STRINGS.phoneLabel} *</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setPhoneError(validatePhone(e.target.value));
                      }}
                      placeholder="(555) 000-0000"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
                      required
                    />
                    {phoneError && <span className="text-[10px] text-red-400 block mt-1">{phoneError}</span>}
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="consentReportCheck"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
                  />
                  <label htmlFor="consentReportCheck" className="text-xs text-slate-300 cursor-pointer">
                    {STRINGS.consentLabel}
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={!isFormValid || submitting}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition shadow-lg disabled:opacity-40"
                >
                  {submitting ? 'Submitting…' : STRINGS.requestQuoteBtn}
                </button>
              </form>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
