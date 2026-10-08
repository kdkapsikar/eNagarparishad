import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Spinner from './ui/Spinner.jsx';

/** Staff-only routes; `admin` additionally requires the office admin role. */
export default function ProtectedRoute({ admin = false }) {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (admin && user.role !== 'admin') return <Navigate to="/staff" replace />;
  return <Outlet />;
}
