import { Router } from "express";
import { changeCurrentPassword, getCurrentUser, loginUser, logoutUser, refreshAccessToken, updateAccount, getAllUsers, createUser, updateUser, deleteUser, forgotPassword, resetPassword, verifyResetCode } from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router()

router.route("/login").post(loginUser)
router.route("/logout").post(verifyJWT,logoutUser)
router.route("/refresh-token").post(refreshAccessToken)
router.route("/change-password").post(verifyJWT,changeCurrentPassword)
router.route("/get-user").get(verifyJWT,getCurrentUser)
router.route("/update-account").patch(verifyJWT, upload.single("profilepic"), updateAccount)
router.route("/all").get(verifyJWT, getAllUsers)
router.route("/create").post(verifyJWT, createUser)
router.route("/:id").patch(verifyJWT, updateUser)
router.route("/:id").delete(verifyJWT, deleteUser)
router.route("/forgot-password").post(forgotPassword)
router.route("/verify-reset-code").post(verifyResetCode)
router.route("/reset-password").post(resetPassword)

export {router}