import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";
import { sendMail } from "../utils/sendMail.js";


const loginUser = asyncHandler(async(req,res)=>{
    const {username, email, password} = req.body
    if(!username&&!email)throw new ApiError(400,"Email or username required");
    
    let accessToken = null;
    let refreshToken = null;
    let user = null;
    let profile = null;

    try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email || username,
            password: password
        });
        
        if (authError) {
            throw new ApiError(401, "Invalid credentials");
        }
        
        user = authData.user;
        accessToken = authData.session?.access_token || null;
        refreshToken = authData.session?.refresh_token || null;
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

    const logedInUser = { ...profile };
    delete logedInUser.refresh_token;
    
    if (logedInUser.role) {
        logedInUser.role = logedInUser.role.toLowerCase();
    }
    return res.status(200).json(
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
    // Client stores tokens; just respond success
    return res.status(200).json(new ApiResponse(200, {}, "User logged out successfully"))
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new ApiError(401, 'Unauthorized Request');

    // Ask Supabase to refresh the session using the provided refresh_token
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session?.access_token) {
        throw new ApiError(401, 'Invalid refresh token');
    }

    return res.status(200).json(
        new ApiResponse(200, {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token
        }, 'New Token Created Successfully')
    );
});

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
    if (req.user.role !== 'admin') {
        throw new ApiError(403, 'Access denied. Admin role required.');
    }

    const { name, email, role, client_id } = req.body;

    if (!name || !email || !role) {
        throw new ApiError(400, 'All fields are required: name, email, role');
    }

    const validRoles = ['admin', 'consultant', 'manager'];
    if (!validRoles.includes(role.toLowerCase())) {
        throw new ApiError(400, 'Invalid role. Must be admin, consultant, or manager');
    }

    const normalizedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();

    try {
        const { data: existingProfile, error: profileCheckError } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        if (profileCheckError) {
            throw new ApiError(500, `Failed to check existing profile: ${profileCheckError.message}`);
        }

        if (existingProfile) {
            throw new ApiError(400, 'User profile already exists for this email.');
        }

        const { data: authList, error: authListError } = await supabase.auth.admin.listUsers();

        if (authListError) {
            throw new ApiError(500, `Failed to list auth users: ${authListError.message}`);
        }

        let invitedUserId;
        const matchedUser = authList.users.find(u => u.email === email);

        if (matchedUser) {
            invitedUserId = matchedUser.id;
        } else {
            const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
                redirectTo: `${process.env.FRONTEND_URL || ''}/reset-password`
            });
            if (inviteError) {
                throw new ApiError(500, `Failed to invite user: ${inviteError.message}`);
            }
            invitedUserId = inviteData?.user?.id;
            if (!invitedUserId) {
                throw new ApiError(500, 'Failed to retrieve invited user id');
            }
        }
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: invitedUserId,
                name,
                email,
                role: normalizedRole,
                active: true,
                client_id: client_id || null,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (profileError) {
            if (!matchedUser) {
                await supabase.auth.admin.deleteUser(invitedUserId);
            }
            throw new ApiError(500, `Failed to create profile: ${profileError.message}`);
        }

        try {
            await sendMail({
                to: email,
                subject: 'Your Horizons account is ready',
                html: `
                    <div style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px;">
                        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                            <h2 style="color: #2a2a2a;">Welcome to Horizons</h2>
                            <p style="font-size: 16px; color: #444;">Hello ${name},</p>
                            <p style="font-size: 15px; color: #444;">An account has been created for you.</p>
                            <p style="font-size: 15px; color: #444;">Please check your inbox for an invitation email to set your password and activate your account.</p>
                            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
                                <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
                                <p style="margin: 5px 0;"><strong>Role:</strong> ${normalizedRole}</p>
                            </div>
                            <p style="font-size: 14px; color: #666;">If you haven't received the invitation, try checking the spam folder or request a new invitation from your administrator.</p>
                        </div>
                    </div>
                `
            });
        } catch (emailError) {
            // Ignore email failures
        }

        return res.status(201).json(
            new ApiResponse(201, profile, 'User created and invitation sent successfully')
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

const updateUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, email, role, active, client_id } = req.body;
    
    // Only admin can update users
    if (req.user.role !== 'admin') {
        throw new ApiError(403, 'Access denied. Admin role required.');
    }
    
    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();
        
    if (fetchError || !existingUser) {
        throw new ApiError(404, 'User not found');
    }
    
    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (email !== undefined) updateFields.email = email;
    if (role !== undefined) {
        const normalizedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
        updateFields.role = normalizedRole; // "Consultant", "Manager", "Admin"
    }
    if (active !== undefined) updateFields.active = active;
    if (client_id !== undefined) updateFields.client_id = client_id;
    
    // Add updated_at timestamp
    updateFields.updated_at = new Date().toISOString();
    
    if (Object.keys(updateFields).length === 0) {
        throw new ApiError(400, 'No fields to update');
    }
    
    const { data: updatedUser, error: updateError } = await supabase
        .from('profiles')
        .update(updateFields)
        .eq('id', id)
        .select('*')
        .single();
        
    if (updateError) {
        throw new ApiError(500, 'Failed to update user');
    }
    
    return res.status(200).json(new ApiResponse(200, updatedUser, 'User updated successfully'));
});

const deleteUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Only admin can delete users
    if (req.user.role !== 'admin') {
        throw new ApiError(403, 'Access denied. Admin role required.');
    }
    
    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();
        
    if (fetchError || !existingUser) {
        throw new ApiError(404, 'User not found');
    }
    
    // Prevent admin from deleting themselves
    if (id === req.user.id) {
        throw new ApiError(400, 'Cannot delete your own account');
    }
    
    try {
        // Delete from Supabase auth
        const { error: authError } = await supabase.auth.admin.deleteUser(id);
        if (authError) {
            throw new ApiError(500, 'Failed to delete user from authentication');
        }
        
        // Delete from profiles table
        const { error: profileError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', id);
            
        if (profileError) {
            throw new ApiError(500, 'Failed to delete user profile');
        }
        
        return res.status(200).json(new ApiResponse(200, {}, 'User deleted successfully'));
    } catch (error) {
        throw new ApiError(500, `Failed to delete user: ${error.message}`);
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
    updateUser,
    deleteUser,
    forgotPassword,
    resetPassword
}
