import express from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    createAbsence,
    createAbsenceForConsultant,
    getMyAbsences,
    listAbsences,
    decideAbsence,
    getApprovedAbsencesForMonth,
    deleteAbsence
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

// Manager/Admin: create approved absence for consultant
router.route("/admin/create")
	.post(asyncHandler(createAbsenceForConsultant));

router.route("/:absence_id/decision")
	.post(asyncHandler(decideAbsence));

// Admin: delete any absence
router.route("/:absence_id")
    .delete(asyncHandler(deleteAbsence));

// Approved for calendar/CRA integration
router.route("/approved/:user_id")
	.get(asyncHandler(getApprovedAbsencesForMonth));

export { router as absenceRouter };


