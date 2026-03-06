import { Navigate, Route, Routes } from 'react-router-dom';
import EmbeddedEntry from './routes/EmbeddedEntry';
import AuthLoading from './routes/AuthLoading';
import DashboardShell from './routes/DashboardShell';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<EmbeddedEntry />} />
      <Route path="/auth/loading" element={<AuthLoading />} />
      <Route path="/dashboard" element={<DashboardShell />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
