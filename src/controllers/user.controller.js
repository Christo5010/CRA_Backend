import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase, supabaseAdmin } from "../utils/supabaseClient.js";
import jwt from 'jsonwebtoken'
import { sendMail } from "../utils/sendMail.js";
import crypto from 'crypto';
import { redisClient } from '../utils/redisClient.js';
import bcrypt from 'bcrypt';

const generateAcessAndRefreshToken = async (userid)=>{
    try {
        const { data: user, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userid)
            .single();
            
        if (error || !user) {
            throw new ApiError(404, "User not found for token generation");
        }
        
        const accessToken = jwt.sign(
            { _id: user.id, email: user.email, role: user.role },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
        );
        
        const refreshToken = jwt.sign(
            { _id: user.id },
            process.env.REFRESH_TOKEN_SECRET,
            { expiresIn: process.env.REFRESH_TOKEN_EXPIRY }
        );
        
        // Update refresh token in database
        await supabase
            .from('profiles')
            .update({ refresh_token: refreshToken })
            .eq('id', userid);
            
        return {accessToken, refreshToken}
    } catch (error) {
        throw new ApiError(500, "Something went wrong at the end")
    }
}

const loginUser = asyncHandler(async(req,res)=>{
    const {username, email, password} = req.body
    if(!username&&!email)throw new ApiError(400,"Email or username required");
    
    // First, we need to get the user from auth.users table to check password
    // Since profiles table doesn't have password, we need to use Supabase auth
    let user = null;
    let profile = null;
    
    try {
        // Try to authenticate with Supabase auth first
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email || username,
            password: password
        });
        
        if (authError) {
            throw new ApiError(401, "Invalid credentials");
        }
        
        user = authData.user;
        
        // Now get the profile information
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
            
        if (profileError || !profileData) {
            throw new ApiError(404, "Profile not found");
        }
        
        profile = profileData;
        
        if (!profile.active) {
            throw new ApiError(403, 'Account is deactivated. Please contact your administrator.');
        }
        
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(401, "Invalid credentials");
    }
    
    const {accessToken, refreshToken} = await generateAcessAndRefreshToken(profile.id)
    
    const logedInUser = { ...profile };
    delete logedInUser.refresh_token;
    
    // Normalize role to lowercase for consistency
    if (logedInUser.role) {
        logedInUser.role = logedInUser.role.toLowerCase();
    }
    
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Only secure in production
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Lax for localhost
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
    
    return res.status(200).cookie("accessToken",accessToken,options).cookie("refreshToken",refreshToken,options).json(
        new ApiResponse(
            200,
            {
                user:logedInUser,accessToken,refreshToken
            },
            "user loggedIn successfully"
        )
    )
})

const logoutUser = asyncHandler(async(req,res)=>{
    await supabase
        .from('profiles')
        .update({ refresh_token: null })
        .eq('id', req.user.id);
        
    const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
    }
    
    return res.status(200).clearCookie("accessToken",options).clearCookie("refreshToken",options).json(
        new ApiResponse(
            200,
            {},
            "User loggedout successfully"
        )
    )
})

const refreshAccessToken = asyncHandler(async(req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if(!incomingRefreshToken){
        throw new ApiError(401,"Unauthorized Request")
    }
    
    const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    const { data: user, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', decodedToken?._id)
        .single();
        
    if(!user){
        throw new ApiError(401,"Invalid Refresh Token")
    }
    
    if(incomingRefreshToken !== user?.refresh_token){
        throw new ApiError(401, "Refresh Token is expired")
    }
    
    const {accessToken , newrefreshToken} = await generateAcessAndRefreshToken(user.id)
    const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
    
    return res.status(200).cookie("accessToken", accessToken, options).cookie("refreshToken", newrefreshToken, options).json(
        new ApiResponse(
            200,
            {
                accessToken, refreshToken: newrefreshToken
            },
            "New Token Created Successfully"
        )
    )
})

const changeCurrentPassword = asyncHandler(async(req,res)=>{
    const {oldPassword, newPassword} = req.body
    
    if (!oldPassword || !newPassword) {
        throw new ApiError(400, "Old password and new password are required");
    }
    
    // For profiles table, we need to use Supabase auth to change password
    try {
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });
        
        if (error) {
            throw new ApiError(400, "Failed to change password");
        }
        
        return res.status(200).json(
            new ApiResponse(200,{}, "Password Changed successfully")
        )
    } catch (error) {
        throw new ApiError(500, "Failed to change password");
    }
})

const getCurrentUser = asyncHandler(async(req,res)=>{
    const user = { ...req.user };
    
    // Normalize role to lowercase for consistency
    if (user.role) {
        user.role = user.role.toLowerCase();
    }
    
    return res.status(200).json(new ApiResponse(200, user, "Current user fetched Successfully"))
})

const updateAccount = asyncHandler(async(req,res)=>{
    const {name, email, phone, address, bio} = req.body;
    let profilepicUrl = undefined;
    
    if (req.file) {
        // For now, we'll skip file upload since we removed Cloudinary
        // This can be implemented later with a different file storage solution
        profilepicUrl = null;
    }
    
    const updateFields = {};
    if(name !== undefined) updateFields.name = name;
    if(phone !== undefined) updateFields.phone = phone;
    if(address !== undefined) updateFields.address = address;
    if(bio !== undefined) updateFields.bio = bio;
    if(profilepicUrl) updateFields.profilepic = profilepicUrl;
    
    // Add updated_at timestamp
    updateFields.updated_at = new Date().toISOString();
    
    if(Object.keys(updateFields).length === 0){
        throw new ApiError(400, "No fields to update");
    }
    
    const { data: user, error } = await supabase
        .from('profiles')
        .update(updateFields)
        .eq('id', req.user.id)
        .select('*')
        .single();
        
    if (error) {
        throw new ApiError(500, 'Failed to update profile');
    }
    
    return res.status(200).json(new ApiResponse(200, user, "Profile updated successfully"));
})

const getAllUsers = asyncHandler(async (req, res) => {
    // Only admin can see all users
    if (req.user.role !== 'admin') {
        throw new ApiError(403, 'Access denied. Admin role required.');
    }
    
    const { data: users, error } = await supabase
        .from('profiles')
        .select('id, name, email, role, active, client_id, updated_at')
        .order('updated_at', { ascending: false });
        
    if (error) {
        throw new ApiError(500, 'Failed to fetch users');
    }
    
    // Normalize roles to lowercase for consistency
    const normalizedUsers = users.map(user => ({
        ...user,
        role: user.role ? user.role.toLowerCase() : user.role
    }));
    
    return res.status(200).json(new ApiResponse(200, normalizedUsers, 'Users fetched successfully'));
});

const createUser = asyncHandler(async (req, res) => {
    // Only admin can create users
    if (req.user.role !== 'admin') {
        throw new ApiError(403, 'Access denied. Admin role required.');
    }
    
    const { name, email, password, role, client_id } = req.body;
    
    if (!name || !email || !password || !role) {
        throw new ApiError(400, 'All fields are required: name, email, password, role');
    }
    
    // Validate role
    const validRoles = ['admin', 'consultant', 'manager'];
    if (!validRoles.includes(role)) {
        throw new ApiError(400, 'Invalid role. Must be admin, consultant, or manager');
    }
    
    try {
        // First create user in Supabase auth
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true
        });
        
        if (authError) {
            throw new ApiError(500, `Failed to create user: ${authError.message}`);
        }
        
        // Now create profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: authData.user.id,
                name,
                email,
                role,
                active: true,
                client_id: client_id || null,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
            
        if (profileError) {
            // If profile creation fails, we should delete the auth user
            await supabase.auth.admin.deleteUser(authData.user.id);
            throw new ApiError(500, `Failed to create profile: ${profileError.message}`);
        }
        
        // Send welcome email
        try {
            await sendMail({
                to: email,
                subject: 'Welcome to Horizons!',
                html: `                    <div style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px;">
                        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                            <h2 style="color: #2a2a2a;">Welcome to Horizons!</h2>
                            <p style="font-size: 16px; color: #444;">Hello ${name},</p>
                            <p style="font-size: 15px; color: #444;">Your account has been successfully created. Here are your account details:</p>
                            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
                                <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
                                <p style="margin: 5px 0;"><strong>Role:</strong> ${role}</p>
                            </div>
                            <p style="font-size: 15px; color: #444;">You can now log in to your account and start using our system.</p>
                            <p style="font-size: 14px; color: #666;">If you have any questions, please contact your system administrator.</p>
                            <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
                            <p style="font-size: 13px; color: #999;">
                                Best regards,<br>The Horizons Team
                            </p>
                        </div>
                    </div>
                `
            });
        } catch (emailError) {
            // Failed to send welcome email
            // Don't fail the user creation if email fails
        }
        
        return res.status(201).json(
            new ApiResponse(201, profile, "User created successfully")
        );
        
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, `Failed to create user: ${error.message}`);
    }
});

const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw new ApiError(400, 'Email is required');
    
    try {
        // Use Supabase auth to send password reset
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.FRONTEND_URL}/reset-password`
        });
        
        if (error) {
            throw new ApiError(500, 'Failed to send reset email');
        }
        
        return res.status(200).json(new ApiResponse(200, {}, 'Password reset email sent successfully.'));
    } catch (error) {
        throw new ApiError(500, 'Failed to send reset email');
    }
});

const resetPassword = asyncHandler(async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) throw new ApiError(400, 'Email, code, and new password are required');
    
    try {
        // Use Supabase auth to reset password
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });
        
        if (error) {
            throw new ApiError(500, 'Failed to reset password');
        }
        
        return res.status(200).json(new ApiResponse(200, {}, 'Password has been reset. You can now log in.'));
    } catch (error) {
        throw new ApiError(500, 'Failed to reset password');
    }
});

export {
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccount,
    getAllUsers,
    createUser,
    forgotPassword,
    resetPassword
}
