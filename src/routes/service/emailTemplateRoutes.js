import { Router } from 'express';
import {
  getActiveTemplate,
  updateTemplate,
  testTemplate,
} from '../../controllers/service/emailTemplateController.js';

const router = Router();

router.get('/active', getActiveTemplate);

router.put('/', updateTemplate);

router.get('/test', testTemplate);

export default router;
