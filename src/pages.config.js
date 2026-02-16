/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Alerts from './pages/Alerts';
import Customers from './pages/Customers';
import Home from './pages/Home';
import Onboarding from './pages/Onboarding';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Settings from './pages/Settings';
import Shipping from './pages/Shipping';
import Tasks from './pages/Tasks';
import AuditLogs from './pages/AuditLogs';
import SystemHealth from './pages/SystemHealth';
import FounderDashboard from './pages/FounderDashboard';
import DataCompliance from './pages/DataCompliance';
import Integrations from './pages/Integrations';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Alerts": Alerts,
    "Customers": Customers,
    "Home": Home,
    "Onboarding": Onboarding,
    "Orders": Orders,
    "Products": Products,
    "Settings": Settings,
    "Shipping": Shipping,
    "Tasks": Tasks,
    "AuditLogs": AuditLogs,
    "SystemHealth": SystemHealth,
    "FounderDashboard": FounderDashboard,
    "DataCompliance": DataCompliance,
    "Integrations": Integrations,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};