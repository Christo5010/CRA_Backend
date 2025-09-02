import express from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    createActionLog,
    getUserActionLogs,
    getAllActionLogs,
    getActionLogById,
    getDashboardActionLogs,
    deleteActionLog
} from "../controllers/actionLog.controller.js";

const router = express.Router();

// Apply JWT verification to all routes
router.use(verifyJWT);

// Action log operations
router.route("/").post(createActionLog);
router.route("/user/:user_id").get(getUserActionLogs);
router.route("/all").get(getAllActionLogs);
router.route("/dashboard").get(getDashboardActionLogs);
router.route("/:log_id")
    .get(getActionLogById)
    .delete(deleteActionLog);

export { router as actionLogRouter };
