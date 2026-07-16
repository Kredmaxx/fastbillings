// routes/dimensionRoutes.ts
// P3.3 — Cost Centers / Job Costing routes

import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  listCostCenters,
  createCostCenter,
  updateCostCenter,
  deleteCostCenter,
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  pnlByCostCenter,
  pnlByProject,
} from '../controllers/dimensionReportController';

const router = Router();

// All routes require authentication
router.use(protect);

// ---- Cost Centers ----
router.get('/cost-centers', listCostCenters);
router.post('/cost-centers', createCostCenter);
router.put('/cost-centers/:id', updateCostCenter);
router.delete('/cost-centers/:id', deleteCostCenter);

// ---- Projects ----
router.get('/projects', listProjects);
router.post('/projects', createProject);
router.put('/projects/:id', updateProject);
router.delete('/projects/:id', deleteProject);

// ---- P&L reports ----
router.get('/reports/pnl-by-cost-center', pnlByCostCenter);
router.get('/reports/pnl-by-project', pnlByProject);

export default router;
// CommonJS export so `require('./routes/dimensionRoutes')` under ts-node returns
// the router directly (matches authRoutes.ts / publicRoutes.ts). Without this,
// require() yields `{ default: router }` and `app.use(...)` throws
// "argument handler must be a function" — crashing the whole API on boot.
module.exports = router;
