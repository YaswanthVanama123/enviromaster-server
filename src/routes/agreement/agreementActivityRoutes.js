import express from "express";
import {
  getAgreementActivity,
  getEmployeeAgreements,
} from "../../controllers/agreement/agreementActivityController.js";

const router = express.Router();

router.get("/", getAgreementActivity);
router.get("/employee", getEmployeeAgreements);

export default router;
