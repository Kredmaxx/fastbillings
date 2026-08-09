import { Router } from 'express';

import { register, login, logout, switchTenant, loginWithGoogle } from '../controllers/authController';
import protect from '../middleware/authMiddleware';
import { authRateLimiter } from '../middleware/authRateLimit';
import { registerValidator, loginValidator } from '../validators/authValidator';

const router = Router();

router.use(authRateLimiter);

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, email, password]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       201:
 *         description: User created
 */
router.post('/register', registerValidator, register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate user
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Returns JWT token
 */
router.post('/login', loginValidator, login);

/**
 * @swagger
 * /auth/google:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate with Google ID token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [credential]
 *             properties:
 *               credential: { type: string }
 *     responses:
 *       200:
 *         description: Returns JWT token
 */
router.post('/google', loginWithGoogle);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out current session
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post('/logout', logout);

router.post('/switch-tenant', protect, switchTenant);

export default router;

// CommonJS interop so server.js's require() picks up the Express router
module.exports = router;
