import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import { 
    uploadDocument, 
    getDocuments, 
    getDocumentById, 
    deleteDocument, 
    updateDocument,
    signDocument
} from "../controllers/document.controller.js";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

router.route("/upload").post(upload.single("document"), uploadDocument);
router.route("/").get(getDocuments);
router.route("/:id").get(getDocumentById);
router.route("/:id").put(updateDocument);
router.route("/:id").delete(deleteDocument);
// Accept either multipart (file) or JSON body for signature
router.route("/:id/sign").post(upload.single('signature'), signDocument);

export { router as documentRouter };
