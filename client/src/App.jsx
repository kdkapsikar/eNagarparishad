import { Route, Routes } from 'react-router-dom';
import Layout from './components/layout/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Certificates from './pages/public/Certificates.jsx';
import Home from './pages/public/Home.jsx';
import Login from './pages/public/Login.jsx';
import NotFound from './pages/public/NotFound.jsx';
import Notices from './pages/public/Notices.jsx';
import SchemeDetail from './pages/public/SchemeDetail.jsx';
import Schemes from './pages/public/Schemes.jsx';
import SelfRegister from './pages/public/SelfRegister.jsx';
import BotPage from './pages/staff/BotPage.jsx';
import CertificateRequests from './pages/staff/CertificateRequests.jsx';
import Dashboard from './pages/staff/Dashboard.jsx';
import Families from './pages/staff/Families.jsx';
import FamilyForm from './pages/staff/FamilyForm.jsx';
import FamilyView from './pages/staff/FamilyView.jsx';
import Import from './pages/staff/Import.jsx';
import ManageNotices from './pages/staff/ManageNotices.jsx';
import ManageSchemes from './pages/staff/ManageSchemes.jsx';
import Messages from './pages/staff/Messages.jsx';
import Settings from './pages/staff/Settings.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Residents (no login) */}
        <Route index element={<Home />} />
        <Route path="notices" element={<Notices />} />
        <Route path="schemes" element={<Schemes />} />
        <Route path="schemes/:id" element={<SchemeDetail />} />
        <Route path="certificates" element={<Certificates />} />
        <Route path="register" element={<SelfRegister />} />
        <Route path="login" element={<Login />} />

        {/* Office staff and volunteers */}
        <Route path="staff" element={<ProtectedRoute />}>
          <Route index element={<Dashboard />} />
          <Route path="families" element={<Families />} />
          <Route path="families/new" element={<FamilyForm />} />
          <Route path="families/:id" element={<FamilyView />} />
          <Route path="families/:id/edit" element={<FamilyForm />} />
          <Route path="bot" element={<BotPage />} />
          <Route path="messages" element={<Messages />} />
          <Route path="certificates" element={<CertificateRequests />} />
          <Route path="import" element={<Import />} />
          <Route element={<ProtectedRoute admin />}>
            <Route path="notices" element={<ManageNotices />} />
            <Route path="schemes" element={<ManageSchemes />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
