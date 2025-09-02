import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken"
import { supabase } from "../utils/supabaseClient.js";

const verifyJWT = asyncHandler(async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");
    

    
    if (!token) {
      throw new ApiError(401, "Unauthorized request");
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const { data: user, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, active, client_id, phone, address, bio, created_at, updated_at')
      .eq('id', decodedToken?._id)
      .single();

    if (error || !user) {
      throw new ApiError(401, "Invalid Access Token");
    }

    if (!user.active) {
      throw new ApiError(403, "Account is deactivated");
    }

    req.user = user;
    next();
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid access token");
  }
});

export {verifyJWT}