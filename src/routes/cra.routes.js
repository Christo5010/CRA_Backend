import express from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createCRA,
  getUserCRAs,
  getAllCRAs,
  getCRAById,
  updateCRA,
  deleteCRA,
  getDashboardCRAs
} from "../controllers/cra.controller.js";

const router = express.Router();

// Apply JWT verification to all routes
router.use(verifyJWT);

// CRA CRUD operations
router.route("/")
  .post(asyncHandler(createCRA));

router.route("/user/:user_id")
  .get(asyncHandler(getUserCRAs));

router.route("/all")
  .get(asyncHandler(getAllCRAs));

router.route("/dashboard")
  .get(asyncHandler(getDashboardCRAs));

router.route("/:cra_id")
  .get(asyncHandler(getCRAById))
  .patch(asyncHandler(updateCRA))
  .delete(asyncHandler(deleteCRA));

export { router as craRouter };
