import express from 'express';
import { asyncHandler } from "../utils/asyncHandler.js";
import { validateSignatureToken } from "../controllers/link.controller.js";

const router = express.Router();

// No auth: validation is public, token is time-limited
router.route('/cra-signature/validate').get(asyncHandler(validateSignatureToken));

export { router as linkRouter };


