import express from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
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
router.route("/").post(createCRA);
router.route("/user/:user_id").get(getUserCRAs);
router.route("/all").get(getAllCRAs);
router.route("/dashboard").get(getDashboardCRAs);
router.route("/:cra_id")
    .get(getCRAById)
    .patch(updateCRA)
    .delete(deleteCRA);

export { router as craRouter };
