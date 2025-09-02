import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { 
    sendWelcomeEmail, 
    sendDocumentNotification, 
    sendReminderEmail,
    getAutomationLogs
} from "../controllers/automation.controller.js";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

router.route("/welcome-email").post(sendWelcomeEmail);
router.route("/document-notification").post(sendDocumentNotification);
router.route("/reminder").post(sendReminderEmail);
router.route("/logs").get(getAutomationLogs);

export { router as automationRouter };
