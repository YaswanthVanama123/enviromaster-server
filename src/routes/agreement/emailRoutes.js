import { Router } from 'express';
import {
  sendEmailWithPdf,
  verifyEmailConfiguration,
  sendTestEmail
} from '../../controllers/agreement/emailController.js';

const router = Router();

router.post('/send', sendEmailWithPdf);

router.get('/verify-config', verifyEmailConfiguration);

router.post('/send-test', sendTestEmail);

export default router;
