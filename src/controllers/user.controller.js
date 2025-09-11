import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";
import { sendMail } from "../utils/sendMail.js";
import { redisClient, ensureConnection } from "../utils/redisClient.js";
import crypto from 'crypto';
import { wrapEmail } from "../utils/emailTemplate.js";


const loginUser = asyncHandler(async(req,res)=>{
	const {username, email, password} = req.body
	if(!username&&!email)throw new ApiError(400,"Email ou nom d'utilisateur requis");
	
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
			throw new ApiError(401, "Identifiants invalides");
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
			throw new ApiError(404, "Profil introuvable");
		}
		
		profile = profileData;
		
		if (!profile.active) {
			throw new ApiError(403, 'Compte désactivé. Veuillez contacter votre administrateur.');
		}
		
	} catch (error) {
		if (error instanceof ApiError) {
			throw error;
		}
		throw new ApiError(401, "Identifiants invalides");
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
			"Utilisateur connecté avec succès"
		)
	)
})

const logoutUser = asyncHandler(async(req,res)=>{
	return res.status(200).json(new ApiResponse(200, {}, "Utilisateur déconnecté avec succès"))
})

const refreshAccessToken = asyncHandler(async (req, res) => {
	const { refreshToken } = req.body;
	if (!refreshToken) throw new ApiError(401, 'Requête non autorisée');
	const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
	if (error || !data?.session?.access_token) {
		throw new ApiError(401, 'Jeton de rafraîchissement invalide');
	}

	return res.status(200).json(
		new ApiResponse(200, {
			accessToken: data.session.access_token,
			refreshToken: data.session.refresh_token
		}, 'Nouveau jeton créé avec succès')
	);
});

const changeCurrentPassword = asyncHandler(async(req,res)=>{
	const {oldPassword, newPassword} = req.body
	
	if (!oldPassword || !newPassword) {
		throw new ApiError(400, "L'ancien mot de passe et le nouveau mot de passe sont requis");
	}
	
	// Récupérer l'email du profil (req.user.email n'est pas présent dans le middleware actuel)
	const { data: profileForEmail, error: profileEmailErr } = await supabase
		.from('profiles')
		.select('email')
		.eq('id', req.user.id)
		.single();
	if (profileEmailErr || !profileForEmail?.email) {
		throw new ApiError(500, "Impossible de récupérer l'email de l'utilisateur");
	}

	// Vérifier l'ancien mot de passe en tentant une connexion
	const { error: signInErr } = await supabase.auth.signInWithPassword({ email: profileForEmail.email, password: oldPassword });
	if (signInErr) {
		throw new ApiError(401, 'Ancien mot de passe incorrect');
	}

	// Utiliser l'API admin pour mettre à jour le mot de passe
	const { error: updateErr } = await supabase.auth.admin.updateUserById(req.user.id, {
		password: newPassword
	});
	if (updateErr) {
		throw new ApiError(500, "Échec du changement de mot de passe");
	}

	return res.status(200).json(new ApiResponse(200,{}, "Mot de passe modifié avec succès"))
})

const getCurrentUser = asyncHandler(async(req,res)=>{
	const user = { ...req.user };
	if (user.role) {
		user.role = user.role.toLowerCase();
	}
	
	return res.status(200).json(new ApiResponse(200, user, "Utilisateur actuel récupéré avec succès"))
})

const updateAccount = asyncHandler(async(req,res)=>{
	const {name, email} = req.body;
	
	if (req.file) {
		profilepicUrl = null;
	}
	
	const updateFields = {};
	if(name !== undefined) updateFields.name = name;
	// Do not directly update email here. Email change now uses verify flow.
	if(email !== undefined) {
		return res.status(400).json(new ApiResponse(400, {}, "La mise à jour de l'email nécessite une vérification."));
	}
	
	updateFields.updated_at = new Date().toISOString();
	
	if(Object.keys(updateFields).length === 0){
		throw new ApiError(400, "Aucun champ à mettre à jour");
	}
	
	const { data: user, error } = await supabase
		.from('profiles')
		.update(updateFields)
		.eq('id', req.user.id)
		.select('*')
		.single();
		
	if (error) {
		throw new ApiError(500, 'Échec de la mise à jour du profil');
	}
	
	return res.status(200).json(new ApiResponse(200, user, "Profil mis à jour avec succès"));
})

// Start email change: send code and store in Redis
const requestEmailChange = asyncHandler(async (req, res) => {
    const { newEmail } = req.body;
    if (!newEmail) {
        throw new ApiError(400, 'Nouvel email requis');
    }

    // Optional: ensure email not same
    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', req.user.id)
        .single();

    if (currentProfile && currentProfile.email === newEmail) {
        throw new ApiError(400, 'Le nouvel email est identique à l’ancien');
    }

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const redis = await ensureConnection();
    await redis.set(`emailchange:${req.user.id}`, JSON.stringify({ newEmail, code }), { EX: 15 * 60 });

    try {
        await sendMail({
            to: newEmail,
            subject: 'Vérification de votre nouvel email',
            html: wrapEmail({
                title: 'Vérification de votre nouvel email',
                contentHtml: `<p style="font-size:15px">Bonjour,</p>
                  <p style="font-size:15px">Votre code de vérification est <span class="highlight"><b>${code}</b></span>. Il expire dans 15 minutes.</p>`
            })
        });
    } catch (e) {
        // Clean stored code if email send fails
        await redis.del(`emailchange:${req.user.id}`);
        throw new ApiError(500, "Échec de l'envoi du code de vérification");
    }

    return res.status(200).json(new ApiResponse(200, {}, 'Code de vérification envoyé'));
});

// Verify email change code and apply update
const verifyEmailChange = asyncHandler(async (req, res) => {
    const { code } = req.body;
    if (!code) {
        throw new ApiError(400, 'Code requis');
    }

    const redis = await ensureConnection();
    const payload = await redis.get(`emailchange:${req.user.id}`);
    if (!payload) {
        throw new ApiError(400, 'Code invalide ou expiré');
    }

    let parsed;
    try { parsed = JSON.parse(payload); } catch { parsed = null; }
    if (!parsed || parsed.code !== code) {
        throw new ApiError(400, 'Code invalide ou expiré');
    }

    // Read current profile to preserve old email for rollback if needed
    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', req.user.id)
        .single();
    const oldEmail = currentProfile?.email || null;

    // 1) Update Supabase Auth user email first (source of truth for login)
    const { error: authUpdateErr } = await supabase.auth.admin.updateUserById(req.user.id, {
        email: parsed.newEmail,
        email_confirm: true
    });
    if (authUpdateErr) {
        throw new ApiError(500, "Échec de la mise à jour de l'email (auth)");
    }

    // 2) Then update our profiles table email
    const { data: updatedProfile, error: profileErr } = await supabase
        .from('profiles')
        .update({ email: parsed.newEmail, updated_at: new Date().toISOString() })
        .eq('id', req.user.id)
        .select('*')
        .single();

    if (profileErr) {
        // Try to rollback auth email to old value
        if (oldEmail) {
            await supabase.auth.admin.updateUserById(req.user.id, { email: oldEmail, email_confirm: true });
        }
        throw new ApiError(500, "Échec de la mise à jour de l'email (profil)");
    }

    await redis.del(`emailchange:${req.user.id}`);

    return res.status(200).json(new ApiResponse(200, updatedProfile, 'Email mis à jour'));
});

const getAllUsers = asyncHandler(async (req, res) => {
	if (req.user.role !== 'admin') {
		throw new ApiError(403, 'Accès refusé. Rôle administrateur requis.');
	}
	
	const { data: users, error } = await supabase
		.from('profiles')
		.select('id, name, email, role, active, client_id, updated_at')
		.order('updated_at', { ascending: false });
		
	if (error) {
		throw new ApiError(500, 'Échec de la récupération des utilisateurs');
	}
	const normalizedUsers = users.map(user => ({
		...user,
		role: user.role ? user.role.toLowerCase() : user.role
	}));
	
	return res.status(200).json(new ApiResponse(200, normalizedUsers, 'Utilisateurs récupérés avec succès'));
});

const createUser = asyncHandler(async (req, res) => {
	if (req.user.role !== 'admin') {
		throw new ApiError(403, 'Accès refusé. Rôle administrateur requis.');
	}

	const { name, email, role, client_id } = req.body;

	if (!name || !email || !role) {
		throw new ApiError(400, 'Tous les champs sont requis : nom, email, rôle');
	}

	const validRoles = ['admin', 'consultant', 'manager'];
	if (!validRoles.includes(role.toLowerCase())) {
		throw new ApiError(400, 'Rôle invalide. Doit être admin, consultant ou manager');
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
			throw new ApiError(500, `Échec de la vérification du profil existant : ${profileCheckError.message}`);
		}

		let userId;

		if (existingProfile) {
			// User already has a profile → reuse it
			userId = existingProfile.id;
		} else {
			// Check if Supabase user already exists
			const { data: authList, error: authListError } = await supabase.auth.admin.listUsers();
			if (authListError) {
				throw new ApiError(500, `Échec de la liste des utilisateurs : ${authListError.message}`);
			}

			const matchedUser = authList.users.find(u => u.email === email);

			if (matchedUser) {
				// User already exists in Supabase
				userId = matchedUser.id;
			} else {
				// ✅ Create a confirmed Supabase user (no email invite from Supabase)
				const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
					email,
					email_confirm: true,
				});
				if (createError) {
					throw new ApiError(500, `Échec de la création de l'utilisateur Supabase : ${createError.message}`);
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
				throw new ApiError(500, `Échec de la création du profil : ${profileError.message}`);
			}
		}

		// Always generate a fresh Sevenopportunity invite token (valid 48h)
		const token = crypto.randomUUID();
		
		// Ensure Redis is connected before storing the token
		const redis = await ensureConnection();
		await redis.set(`invite:${token}`, email, { EX: 48 * 60 * 60 });

		try {
			await sendMail({
				to: email,
				subject: 'Définissez le mot de passe de votre compte Sevenopportunity',
				html: wrapEmail({
					title: 'Bienvenue sur Sevenopportunity',
					contentHtml: `
					  <p style="font-size:15px">Bonjour <strong>${name}</strong>,</p>
					  <p style="font-size:15px">Cliquez sur le bouton ci-dessous pour définir votre mot de passe et commencer.</p>
					  <p><a class="btn" href="${process.env.FRONTEND_URL || ''}/new-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}" target="_blank" rel="noopener">Créer votre mot de passe</a></p>
					  <p class="small-note">Ce lien expire dans 48 heures.</p>
					`
				})
			});
		} catch (emailError) {
			// ignore email failure
		}

		return res.status(201).json(
			new ApiResponse(201, { email, role: normalizedRole }, "Utilisateur créé ou réinvité. Email d'invitation envoyé.")
		);

	} catch (error) {
		if (error instanceof ApiError) {
			throw error;
		}
		throw new ApiError(500, `Échec de la création de l'utilisateur : ${error.message}`);
	}
});


const forgotPassword = asyncHandler(async (req, res) => {
	const { email } = req.body;
	if (!email) throw new ApiError(400, 'Email requis');
	
	// Ensure the email corresponds to an auth user
	const { data, error: authListError } = await supabase.auth.admin.listUsers();
	if (authListError) {
		throw new ApiError(500, 'Échec du traitement de la demande');
	}

	const existing = data?.users?.find(u => u.email === email);
	if (!existing) {
		// To prevent user enumeration, still respond success
		return res.status(200).json(new ApiResponse(200, {}, 'Si l’email existe, un code a été envoyé.'));
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
			subject: 'Votre code de réinitialisation de mot de passe',
			html: wrapEmail({
				title: 'Réinitialisez votre mot de passe',
				contentHtml: `
				  <p style=\"font-size:15px\">Utilisez ce code pour réinitialiser votre mot de passe :</p>
				  <div style=\"background: #f0f3ff; border: 1px solid #dfe3f6; color: #273e8a; font-size: 24px; font-weight: 700; padding: 14px 18px; letter-spacing: 6px; text-align: center; border-radius: 6px;\">${code}</div>
				  <p class=\"small-note\">Le code expire dans 15 minutes.</p>
				  <p style=\"font-size:15px\">Ouvrez le lien et saisissez le code pour définir un nouveau mot de passe :</p>
				  <p><a class=\"btn\" href=\"${process.env.FRONTEND_URL || ''}/reset-password?email=${encodeURIComponent(email)}\" target=\"_blank\" rel=\"noopener\">Ouvrir la page de réinitialisation</a></p>
				`
			})
		});
	} catch (emailError) {
		// don't throw — prevent leaking info
	}
	
	return res.status(200).json(new ApiResponse(200, {}, 'Si l’email existe, un code a été envoyé.'));
});

const verifyResetCode = asyncHandler(async (req, res) => {
	const { email, code } = req.body;
	if (!email || !code) throw new ApiError(400, 'Email et code requis');
	const key = `pwdreset:${email}`;
	
	// Ensure Redis is connected before checking the code
	const redis = await ensureConnection();
	const stored = await redis.get(key);
	if (!stored || stored !== code) {
		throw new ApiError(400, 'Code invalide ou expiré');
	}
	return res.status(200).json(new ApiResponse(200, {}, 'Code vérifié'));
});

const resetPassword = asyncHandler(async (req, res) => {
	const { email, code, token, newPassword } = req.body;
	
	if (!email || !newPassword) throw new ApiError(400, 'Email et nouveau mot de passe requis');
	
	let authorized = false;
	let isInviteFlow = false;
	if (token) {
		// invitation token flow
		const redis = await ensureConnection();
		const inviteEmail = await redis.get(`invite:${token}`);
		if (inviteEmail && inviteEmail === email) {
			authorized = true;
			isInviteFlow = true;
		}
	} else if (code) {
		// Ensure Redis is connected before checking the code
		const redis = await ensureConnection();
		const storedCode = await redis.get(`pwdreset:${email}`);
		if (storedCode && storedCode === code) {
			authorized = true;
		}
	}

	if (!authorized) {
		throw new ApiError(400, 'Code/jeton invalide ou expiré');
	}

	// Find user id by email
	const { data, error: authListError } = await supabase.auth.admin.listUsers();
	if (authListError) {
		throw new ApiError(500, 'Échec de la réinitialisation du mot de passe');
	}

	const user = data?.users?.find(u => u.email === email);
	if (!user?.id) {
		throw new ApiError(404, 'Utilisateur introuvable');
	}

	// Update password (and confirm email if invite flow)
	const updatePayload = { password: newPassword };
	if (isInviteFlow) {
		updatePayload.email_confirm = true;
	}

	const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, updatePayload);
	if (updateErr) {
		throw new ApiError(500, 'Échec de la réinitialisation du mot de passe');
	}

	// Don't clear redis keys yet - wait until after successful response
	
	// If invite flow, auto-sign user in
	if (isInviteFlow) {
		const { data: authData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password: newPassword });
		if (signInErr || !authData?.session?.access_token) {
			return res.status(200).json(new ApiResponse(200, {}, 'Le mot de passe a été réinitialisé.'));
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
		}

		return res.status(200).json(
			new ApiResponse(200, { accessToken, refreshToken, user: profile }, 'Mot de passe défini et connecté')
		);
	}
	
	// Clear redis keys for non-invite flow
	if (code) {
		const redis = await ensureConnection();
		await redis.del(`pwdreset:${email}`);
	}
	
	return res.status(200).json(new ApiResponse(200, {}, 'Le mot de passe a été réinitialisé.'));
});


const updateUser = asyncHandler(async (req, res) => {
	const { id } = req.params;
	const { name, email, role, active, client_id } = req.body;
	
	// Only admin can update users
	if (req.user.role !== 'admin') {
		throw new ApiError(403, 'Accès refusé. Rôle administrateur requis.');
	}
	
	// Check if user exists
	const { data: existingUser, error: fetchError } = await supabase
		.from('profiles')
		.select('*')
		.eq('id', id)
		.single();
		
	if (fetchError || !existingUser) {
		throw new ApiError(404, 'Utilisateur introuvable');
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
		throw new ApiError(400, 'Aucun champ à mettre à jour');
	}
	
	const { data: updatedUser, error: updateError } = await supabase
		.from('profiles')
		.update(updateFields)
		.eq('id', id)
		.select('*')
		.single();
		
	if (updateError) {
		throw new ApiError(500, "Échec de la mise à jour de l'utilisateur");
	}
	
	return res.status(200).json(new ApiResponse(200, updatedUser, 'Utilisateur mis à jour avec succès'));
});

const deleteUser = asyncHandler(async (req, res) => {
	const { id } = req.params;
	
	// Only admin can delete users
	if (req.user.role !== 'admin') {
		throw new ApiError(403, 'Accès refusé. Rôle administrateur requis.');
	}
	
	// Check if user exists
	const { data: existingUser, error: fetchError } = await supabase
		.from('profiles')
		.select('*')
		.eq('id', id)
		.single();
		
	if (fetchError || !existingUser) {
		throw new ApiError(404, 'Utilisateur introuvable');
	}
	
	// Prevent admin from deleting themselves
	if (id === req.user.id) {
		throw new ApiError(400, 'Impossible de supprimer votre propre compte');
	}
	
	try {
		// Delete from Supabase auth
		const { error: authError } = await supabase.auth.admin.deleteUser(id);
		if (authError) {
			throw new ApiError(500, "Échec de suppression de l'utilisateur de l'authentification");
		}
		
		// Delete from profiles table
		const { error: profileError } = await supabase
			.from('profiles')
			.delete()
			.eq('id', id);
			
		if (profileError) {
			throw new ApiError(500, 'Échec de suppression du profil utilisateur');
		}
		
		return res.status(200).json(new ApiResponse(200, {}, 'Utilisateur supprimé avec succès'));
	} catch (error) {
		throw new ApiError(500, `Échec de suppression de l'utilisateur : ${error.message}`);
	}
});

export {
	loginUser,
	logoutUser,
	refreshAccessToken,
	changeCurrentPassword,
	getCurrentUser,
	updateAccount,
	requestEmailChange,
	verifyEmailChange,
	getAllUsers,
	createUser,
	updateUser,
	deleteUser,
	forgotPassword,
	verifyResetCode,
	resetPassword
}
