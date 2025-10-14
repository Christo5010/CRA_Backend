import express from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
	createAbsence,
	getMyAbsences,
	listAbsences,
	decideAbsence,
	getApprovedAbsencesForMonth
} from "../controllers/absence.controller.js";

const router = express.Router();

router.use(verifyJWT);

// Consultant: create and view mine
router.route("/me")
	.get(asyncHandler(getMyAbsences))
	.post(asyncHandler(createAbsence));

// Manager/Admin: list and decide
router.route("/")
	.get(asyncHandler(listAbsences));

router.route("/:absence_id/decision")
	.post(asyncHandler(decideAbsence));

// Approved for calendar/CRA integration
router.route("/approved/:user_id")
	.get(asyncHandler(getApprovedAbsencesForMonth));

export { router as absenceRouter };


