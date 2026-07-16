import Header from '../layouts/AdminHeader';
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../Sidebar';
import AiChatFab from '../ai/AiChatFab';
import DemoBanner from '../DemoBanner';

interface AdminLayoutProps {
  children?: ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const isSettingsPage = useLocation().pathname.includes('/settings');

  // On smaller screens, the sidebar should be closed by default.
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex h-screen bg-white font-sans">
      <Sidebar isOpen={isSidebarOpen} />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          isSidebarOpen={isSidebarOpen}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />
        <main className="relative z-0 flex-1 overflow-x-hidden overflow-y-auto bg-white-50 p-4">
          {isSettingsPage && <DemoBanner />}
          {children || <Outlet />}
        </main>
      </div>
      {/* Cluster H — slice H.3: floating co-pilot, only visible when AI is enabled */}
      <AiChatFab />
    </div>
  );
};

export default AdminLayout;