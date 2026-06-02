import express from 'express';
import { getActiveTemplate, updateTemplate } from '../../controllers/service/serviceAgreementTemplateController.js';

const router = express.Router();

router.get('/active', getActiveTemplate);

router.put('/', updateTemplate);

export default router;
