import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Home from './pages/Home';
import Meeting from './pages/Meeting';
import ResetPassword from './pages/ResetPassword';
import ServerSetup from './components/ServerSetup';
import { isTauri } from './lib/tauri';
import { isServerConfigured } from './lib/config';

export default function App() {
  const [serverReady, setServerReady] = useState(() => isServerConfigured());

  if (isTauri() && !serverReady) {
    return <ServerSetup onConnected={() => setServerReady(true)} />;
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/meeting/:roomId" element={<Meeting />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
