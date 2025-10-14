import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { 
    sendWelcomeEmail, 
    sendDocumentNotification, 
    sendReminderEmail,
    getAutomationLogs,
    sendCRAMonthEndReminders,
    sendCRADocumentReminders,
    sendCRASignatureReminders
} from "../controllers/automation.controller.js";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

router.route("/welcome-email").post(sendWelcomeEmail);
router.route("/document-notification").post(sendDocumentNotification);
router.route("/reminder").post(sendReminderEmail);
router.route("/logs").get(getAutomationLogs);
router.route("/cra-reminders").post(sendCRAMonthEndReminders);
router.route("/cra-reminders").get(sendCRAMonthEndReminders);
router.route("/cra-document-reminders").post(sendCRADocumentReminders);
router.route("/cra-signature-reminders").post(sendCRASignatureReminders);

export { router as automationRouter };
