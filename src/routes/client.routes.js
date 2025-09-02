import express from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    createClient,
    getAllClients,
    getClientById,
    updateClient,
    deleteClient,
    getClientsForSelection
} from "../controllers/client.controller.js";

const router = express.Router();

// Apply JWT verification to all routes
router.use(verifyJWT);

// Client CRUD operations
router.route("/").post(createClient).get(getAllClients);
router.route("/selection").get(getClientsForSelection);
router.route("/:client_id")
    .get(getClientById)
    .patch(updateClient)
    .delete(deleteClient);

export { router as clientRouter };
