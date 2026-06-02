import { Router } from 'express';
import { getCatalog, updateCatalog } from '../../controllers/proposal/catalogController.js';
import { requireAdmin } from '../../middleware/authMiddleware.js';

const r = Router();

r.get('/', getCatalog);
r.put('/', requireAdmin, updateCatalog);

export default r;
