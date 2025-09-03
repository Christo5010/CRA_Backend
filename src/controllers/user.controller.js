import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";
import { sendMail } from "../utils/sendMail.js";
import { redisClient, ensureConnection } from "../utils/redisClient.js";
import crypto from 'crypto';


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
        console.log(error)
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
	return res.status(200).json(new ApiResponse(200, {}, "User logged out successfully"))
})

const refreshAccessToken = asyncHandler(async (req, res) => {
	const { refreshToken } = req.body;
	if (!refreshToken) throw new ApiError(401, 'Unauthorized Request');
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
	if (user.role) {
		user.role = user.role.toLowerCase();
	}
	
	return res.status(200).json(new ApiResponse(200, user, "Current user fetched Successfully"))
})

const updateAccount = asyncHandler(async(req,res)=>{
	const {name, email} = req.body;
	
	if (req.file) {
		profilepicUrl = null;
	}
	
	const updateFields = {};
	if(name !== undefined) updateFields.name = name;
	if(email !== undefined) updateFields.email = email;
	
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
		// Check if profile already exists
		const { data: existingProfile, error: profileCheckError } = await supabase
			.from('profiles')
			.select('*')
			.eq('email', email)
			.maybeSingle();

		if (profileCheckError) {
			throw new ApiError(500, `Failed to check existing profile: ${profileCheckError.message}`);
		}

		let userId;

		if (existingProfile) {
			// User already has a profile → reuse it
			userId = existingProfile.id;
		} else {
			// Check if Supabase user already exists
			const { data: authList, error: authListError } = await supabase.auth.admin.listUsers();
			if (authListError) {
				throw new ApiError(500, `Failed to list auth users: ${authListError.message}`);
			}

			const matchedUser = authList.users.find(u => u.email === email);

			if (matchedUser) {
				// User already exists in Supabase
				userId = matchedUser.id;
			} else {
				// ✅ Create a confirmed Supabase user (no email invite from Supabase)
				const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
					email,
					email_confirm: true, // skip Supabase email confirmation
				});
				if (createError) {
					throw new ApiError(500, `Failed to create Supabase user: ${createError.message}`);
				}
				userId = createdUser.user.id;
			}

			// Create profile in your DB
			const { data: profile, error: profileError } = await supabase
				.from('profiles')
				.upsert({
					id: userId,
					name,
					email,
					role: normalizedRole,
					active: true,
					client_id: client_id || null,
					updated_at: new Date().toISOString(),
				})
				.select()
				.single();

			if (profileError) {
				throw new ApiError(500, `Failed to create profile: ${profileError.message}`);
			}
		}

		// Always generate a fresh Horizons invite token (valid 48h)
		const token = crypto.randomUUID();
		console.log('Generated invite token:', token);
		
		// Ensure Redis is connected before storing the token
		const redis = await ensureConnection();
		await redis.set(`invite:${token}`, email, { EX: 48 * 60 * 60 });
		console.log('Token stored successfully in Redis');

		try {
			await sendMail({
				to: email,
				subject: 'Set up your Horizons account password',
				html: `
					<div style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px;">
						<div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
							<h2 style="color: #2a2a2a;">Welcome to Horizons</h2>
							<p style="font-size: 16px; color: #444;">Hello ${name},</p>
							<p style="font-size: 15px; color: #444;">Click the link below to set your password and get started.</p>
							<p><a href="${process.env.FRONTEND_URL || ''}/new-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}" style="color:#2b6cb0">Create your password</a></p>
							<p style="font-size: 12px; color: #666;">This link expires in 48 hours.</p>
						</div>
					</div>
				`,
			});
		} catch (emailError) {
			console.error('Failed to send invite email:', emailError.message);
		}

		return res.status(201).json(
			new ApiResponse(201, { email, role: normalizedRole }, 'User created or re-invited. Invitation email sent.')
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
	
	// Ensure the email corresponds to an auth user
	const { data, error: authListError } = await supabase.auth.admin.listUsers();
	if (authListError) {
		console.error('Supabase listUsers error:', authListError);
		throw new ApiError(500, 'Failed to process request');
	}

	const existing = data?.users?.find(u => u.email === email);
	if (!existing) {
		// To prevent user enumeration, still respond success
		return res.status(200).json(new ApiResponse(200, {}, 'If the email exists, a code has been sent.'));
	}

	// Generate a one-time code and store in Redis (15 minutes)
	const code = Math.floor(100000 + Math.random() * 900000).toString();
	const key = `pwdreset:${email}`;
	
	// Ensure Redis is connected before storing the code
	const redis = await ensureConnection();
	await redis.set(key, code, { EX: 15 * 60 });

	try {
		await sendMail({
			to: email,
			subject: 'Your password reset code',
			html: `
				<div style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px;">
					<div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
						<h2 style="color: #2a2a2a;">Reset your password</h2>
						<p style="font-size: 15px; color: #444;">Use this code to reset your password:</p>
						<div style="background: #f0f3ff; border: 1px solid #dfe3f6; color: #273e8a; font-size: 24px; font-weight: 700; padding: 14px 18px; letter-spacing: 6px; text-align: center; border-radius: 6px;">${code}</div>
						<p style="font-size: 14px; color: #666;">Code expires in 15 minutes.</p>
						<p style="font-size: 15px; color: #444;">Open the link and enter the code to set a new password:</p>
						<p><a href="${process.env.FRONTEND_URL || ''}/reset-password?email=${encodeURIComponent(email)}" style="color:#2b6cb0">Open reset page</a></p>
					</div>
				</div>
			`
		});
	} catch (emailError) {
		console.error('Email send error:', emailError);
		// don't throw — prevent leaking info
	}
	
	return res.status(200).json(new ApiResponse(200, {}, 'If the email exists, a code has been sent.'));
});

const verifyResetCode = asyncHandler(async (req, res) => {
	const { email, code } = req.body;
	if (!email || !code) throw new ApiError(400, 'Email and code are required');
	const key = `pwdreset:${email}`;
	
	// Ensure Redis is connected before checking the code
	const redis = await ensureConnection();
	const stored = await redis.get(key);
	if (!stored || stored !== code) {
		throw new ApiError(400, 'Invalid or expired code');
	}
	return res.status(200).json(new ApiResponse(200, {}, 'Code verified'));
});

const resetPassword = asyncHandler(async (req, res) => {
	console.log('=== resetPassword function called ===');
	const { email, code, token, newPassword } = req.body;
	console.log('resetPassword called with:', { email, code: code ? '***' : undefined, token: token ? '***' : undefined, newPassword: newPassword ? '***' : undefined });
	
	if (!email || !newPassword) throw new ApiError(400, 'Email and new password are required');
	
	let authorized = false;
	let isInviteFlow = false;
    console.log(token)
	if (token) {
		// invitation token flow
		console.log('Checking invite token in Redis...');
		// Ensure Redis is connected before checking the token
		const redis = await ensureConnection();
		const inviteEmail = await redis.get(`invite:${token}`);
		console.log('Invite email from Redis:', inviteEmail);
		if (inviteEmail && inviteEmail === email) {
			authorized = true;
			isInviteFlow = true;
			console.log('Token authorized for invite flow');
		} else {
			console.log('Token validation failed:', { inviteEmail, email, match: inviteEmail === email });
		}
	} else if (code) {
		console.log('Checking reset code in Redis...');
		// Ensure Redis is connected before checking the code
		const redis = await ensureConnection();
		const storedCode = await redis.get(`pwdreset:${email}`);
		console.log('Stored code from Redis:', storedCode);
		if (storedCode && storedCode === code) {
			authorized = true;
			console.log('Code authorized for reset flow');
		} else {
			console.log('Code validation failed:', { storedCode, code, match: storedCode === code });
		}
	}

	if (!authorized) {
		console.log('Authorization failed - throwing error');
		throw new ApiError(400, 'Invalid or expired code/token');
	}

	// Find user id by email
	const { data, error: authListError } = await supabase.auth.admin.listUsers();
	if (authListError) {
		console.error('Supabase listUsers error:', authListError);
		throw new ApiError(500, 'Failed to reset password');
	}

	const user = data?.users?.find(u => u.email === email);
	if (!user?.id) {
		throw new ApiError(404, 'User not found');
	}

	// Update password (and confirm email if invite flow)
	const updatePayload = { password: newPassword };
	if (isInviteFlow) {
		updatePayload.email_confirm = true;
	}

	const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, updatePayload);
	if (updateErr) {
		console.error('Supabase updateUserById error:', updateErr);
		throw new ApiError(500, 'Failed to reset password');
	}

	// Don't clear redis keys yet - wait until after successful response
	
	// If invite flow, auto-sign user in
	if (isInviteFlow) {
		const { data: authData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password: newPassword });
		if (signInErr || !authData?.session?.access_token) {
			console.warn('Supabase signInWithPassword failed:', signInErr);
			return res.status(200).json(new ApiResponse(200, {}, 'Password has been reset.'));
		}

		const accessToken = authData.session?.access_token || null;
		const refreshToken = authData.session?.refresh_token || null;

		const { data: profileData } = await supabase
			.from('profiles')
			.select('*')
			.eq('id', authData.user.id)
			.single();

		const profile = profileData ? { ...profileData, role: profileData.role?.toLowerCase() } : null;

		// Clear redis keys AFTER successful response
		if (token) {
			const redis = await ensureConnection();
			await redis.del(`invite:${token}`);
			console.log('Token deleted from Redis after successful password reset');
		}

		return res.status(200).json(
			new ApiResponse(200, { accessToken, refreshToken, user: profile }, 'Password set and logged in')
		);
	}
	
	// Clear redis keys for non-invite flow
	if (code) {
		const redis = await ensureConnection();
		await redis.del(`pwdreset:${email}`);
		console.log('Reset code deleted from Redis after successful password reset');
	}
	
	return res.status(200).json(new ApiResponse(200, {}, 'Password has been reset.'));
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
	verifyResetCode,
	resetPassword
}
