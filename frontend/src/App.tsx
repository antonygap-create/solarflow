import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SolarCalculator } from './components/SolarCalculator';
import { ProposalReport } from './components/ProposalReport';
import { AdminLoginPage } from './components/AdminLoginPage';
import { AdminSettingsPage } from './components/AdminSettingsPage';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Specification Primary Route: / - Calculator (Simple & Pro Mode) */}
          <Route path="/" element={<SolarCalculator />} />
          <Route path="/calculator" element={<SolarCalculator />} />

          {/* Specification Proposal Report Route: /report */}
          <Route path="/report" element={<ProposalReport />} />
          <Route path="/report/:id" element={<ProposalReport />} />

          {/* Specification Admin Routes: /admin/login & /admin */}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminSettingsPage />} />
          
          {/* Legacy Aliases */}
          <Route path="/login" element={<Navigate to="/admin/login" replace />} />
          <Route path="/dashboard" element={<Navigate to="/admin" replace />} />
          <Route path="/estimate" element={<Navigate to="/" replace />} />

          {/* Fallback Wildcard Route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
