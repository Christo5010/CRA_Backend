import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { ensureConnection } from "../utils/redisClient.js";

// Public endpoint: validate signature link token, return associated data if valid
export const validateSignatureToken = asyncHandler(async (req, res) => {
	const token = String(req.query?.token || '').trim();
	if (!token) throw new ApiError(400, 'Token requis');
	const redis = await ensureConnection();
	const raw = await redis.get(`signlink:${token}`);
	if (!raw) throw new ApiError(400, 'Token invalide ou expiré');
	let parsed = null;
	try { parsed = JSON.parse(raw); } catch { parsed = null; }
	if (!parsed?.userId || !parsed?.craId) throw new ApiError(400, 'Token invalide');
	return res.status(200).json(new ApiResponse(200, { user_id: parsed.userId, cra_id: parsed.craId }, 'Token valide'));
});


