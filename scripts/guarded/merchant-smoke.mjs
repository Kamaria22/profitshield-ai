import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const criticalPages = [
  {
    name: 'Home',
    route: '/',
    file: 'src/pages/Home.jsx',
    requiredMarkers: ['TopCommandBar', 'DashboardLayout', 'ControlPanel', 'ProfitCorePanel', 'ActionCenterPanel', 'SystemStatusPanel', 'RecentActivityPanel'],
  },
  {
    name: 'Orders',
    route: '/orders',
    file: 'src/pages/Orders.jsx',
    requiredMarkers: ['OrdersTable', 'OrderSearchBox'],
  },
  {
    name: 'Customers',
    route: '/customers',
    file: 'src/pages/Customers.jsx',
    requiredMarkers: ['CustomerTable'],
  },
  {
    name: 'Integrations',
    route: '/integrations',
    file: 'src/pages/Integrations.jsx',
    requiredMarkers: ['DiagnoseFixPanel', 'platformConnector'],
  },
  {
    name: 'Intelligence',
    route: '/intelligence',
    file: 'src/pages/Intelligence.jsx',
    requiredMarkers: ['GlobalIntelligenceDashboard'],
  },
  {
    name: 'Settings',
    route: '/settings',
    file: 'src/pages/Settings.jsx',
    requiredMarkers: ['ShopifyIntegrationPanel', 'ProfitAlertRulesManager'],
  },
  {
    name: 'PnLAnalytics',
    route: '/pnlanalytics',
    file: 'src/pages/PnLAnalytics.jsx',
    requiredMarkers: ['PnLMetricsCards', 'PnLTrendsChart'],
  },
];

const requiredFiles = [
  'src/components/dashboard/TopCommandBar.jsx',
  'src/components/dashboard/DashboardLayout.jsx',
  'src/components/dashboard/ControlPanel.jsx',
  'src/components/dashboard/ProfitCorePanel.jsx',
  'src/components/dashboard/ActionCenterPanel.jsx',
  'src/components/dashboard/SystemStatusPanel.jsx',
  'src/components/dashboard/RecentActivityPanel.jsx',
  'src/components/orders/OrdersTable.jsx',
  'src/components/customers/CustomerTable.jsx',
  'src/components/intelligence/GlobalIntelligenceDashboard.jsx',
  'src/components/settings/ShopifyIntegrationPanel.jsx',
  'src/lib/safeApi.js',
];

const requiredSafeApiMarkers = [
  'syncShopifyOrders',
  'processWebhookQueue',
  'syncShopifyData',
  'registerShopifyWebhooks',
  'invokeWithRetry',
  'invokeSelfHealSafe',
  'invokeSupportGuardianSafe',
];

async function readWorkspaceFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return await fs.readFile(absolutePath, 'utf8');
}

async function assertFileExists(relativePath) {
  const absolutePath = path.join(root, relativePath);
  await fs.access(absolutePath);
}

async function main() {
  const pagesConfigSource = await readWorkspaceFile('src/pages.config.js');
  const safeApiSource = await readWorkspaceFile('src/lib/safeApi.js');

  for (const relativePath of requiredFiles) {
    await assertFileExists(relativePath);
  }

  for (const page of criticalPages) {
    const pageSource = await readWorkspaceFile(page.file);

    if (!pagesConfigSource.includes(`const ${page.name} = lazy(`) || !pagesConfigSource.includes(`${page.name},`)) {
      throw new Error(`Critical page ${page.name} is not fully registered in src/pages.config.js`);
    }

    for (const marker of page.requiredMarkers) {
      if (!pageSource.includes(marker)) {
        throw new Error(`Critical page ${page.name} is missing required marker: ${marker}`);
      }
    }
  }

  for (const marker of requiredSafeApiMarkers) {
    if (!safeApiSource.includes(marker)) {
      throw new Error(`safeApi contract missing marker: ${marker}`);
    }
  }

  console.log('merchant-smoke:ok');
  for (const page of criticalPages) {
    console.log(`${page.name} ${page.route} contract verified`);
  }
  console.log('safeApi Shopify fallback contract verified');
}

main().catch((error) => {
  console.error('merchant-smoke:failed');
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
