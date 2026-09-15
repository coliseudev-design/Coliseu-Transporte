import DashboardLayout from '../layouts/v3.0/DashboardLayout';
import { useEffect } from 'react';

export default function DynamicDashboardLayout() {
  useEffect(() => {
    // Aplicar a classe do layout no body para que as variáveis CSS se propaguem por todo o app
    document.body.classList.remove('layout-v1-0', 'layout-v2-0', 'layout-v3-0');
    document.body.classList.add('layout-v3-0');
  }, []);

  return <DashboardLayout />;
}

