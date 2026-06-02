import express from 'express';
import {
  createProposal,
  updateProposal,
  getProposalById,
  listProposals,
  getFormCatalog,
  attachPdfAndMarkForZoho,
} from '../../controllers/proposal/proposalController.js';

const router = express.Router();

router.get('/catalog', getFormCatalog);

router.get('/', listProposals);
router.get('/:id', getProposalById);
router.post('/', createProposal);
router.put('/:id', updateProposal);

router.post('/:id/pdf', attachPdfAndMarkForZoho);

export default router;
