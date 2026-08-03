import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LeadCaptureWidget } from './components/LeadCaptureWidget';
import { LoginPage } from './components/LoginPage';
import { DashboardLayout } from './components/DashboardLayout';
import { LeadsTable } from './components/LeadsTable';
import { ProjectManagerView } from './components/ProjectManagerView';
import { SolarCalculator } from './components/SolarCalculator';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public B2C Lead Generation Route */}
          <Route path="/" element={<LeadCaptureWidget />} />
          <Route path="/estimate" element={<LeadCaptureWidget />} />
          <Route path="/calculator" element={<SolarCalculator />} />

          {/* Public B2B Login Route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected B2B Manager Dashboard Routes */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Navigate to="/dashboard/leads" replace />} />
            <Route path="leads" element={<LeadsTable />} />
            <Route path="projects/:id" element={<ProjectManagerView />} />
          </Route>

          {/* Fallback Wildcard Route */}
          <Route path="*" element={<Navigate to="/estimate" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
