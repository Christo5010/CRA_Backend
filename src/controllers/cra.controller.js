import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";
import { sendMail } from "../utils/sendMail.js";

// Create a new CRA
const createCRA = asyncHandler(async (req, res) => {
    const { user_id, month, status, days, hide_header, hide_client_signature } = req.body;
    const userId = req.user.id;

    if (!user_id || !month || !status) {
        throw new ApiError(400, "Identifiant utilisateur, mois et statut requis");
    }

    // Check if user is admin or creating their own CRA
    if (req.user.role !== 'admin' && req.user.id !== user_id) {
        throw new ApiError(403, "Vous ne pouvez créer des CRA que pour vous-même");
    }

    // Check if CRA already exists for this user and month
    const { data: existingCRA } = await supabase
        .from('cras')
        .select('*')
        .eq('user_id', user_id)
        .eq('month', month)
        .single();

    if (existingCRA) {
        throw new ApiError(400, "Un CRA existe déjà pour cet utilisateur et ce mois");
    }

    const craData = {
        user_id,
        month,
        status,
        days: days || {},
        // Optional visibility flags (columns must exist in DB)
        ...(hide_header !== undefined ? { hide_header: !!hide_header } : {}),
        ...(hide_client_signature !== undefined ? { hide_client_signature: !!hide_client_signature } : {}),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const { data: cra, error } = await supabase
        .from('cras')
        .insert(craData)
        .select()
        .single();

    if (error) {
        throw new ApiError(500, 'Échec de création du CRA');
    }

    return res.status(201).json(
        new ApiResponse(201, cra, "CRA created successfully")
    );
});

// Get all CRAs for a user
const getUserCRAs = asyncHandler(async (req, res) => {
    const { user_id } = req.params;
    const currentUser = req.user;

    // Check if user is admin or requesting their own CRAs
    if (currentUser.role !== 'admin' && currentUser.id !== user_id) {
        throw new ApiError(403, "Vous ne pouvez consulter que vos propres CRA");
    }

    const { data: cras, error } = await supabase
        .from('cras')
        .select('*')
        .eq('user_id', user_id)
        .order('month', { ascending: false });

    if (error) {
        throw new ApiError(500, 'Échec de la récupération des CRA');
    }

    return res.status(200).json(
        new ApiResponse(200, cras, "CRAs fetched successfully")
    );
});

// Get all CRAs (admin only)
const getAllCRAs = asyncHandler(async (req, res) => {
    const currentUser = req.user;

    if (currentUser.role !== 'admin') {
        throw new ApiError(403, "Seuls les administrateurs peuvent voir tous les CRA");
    }

    const { data: cras, error } = await supabase
        .from('cras')
        .select(`
            *,
            profiles:profiles!cras_user_id_fkey (
                id,
                name,
                email,
                role,
                clients:client_id (
                    id,
                    name
                )
            )
        `)
        .order('month', { ascending: false });

    if (error) {
        throw new ApiError(500, 'Échec de la récupération des CRA');
    }

    return res.status(200).json(
        new ApiResponse(200, cras, "All CRAs fetched successfully")
    );
});

// Get CRA by ID
const getCRAById = asyncHandler(async (req, res) => {
    const { cra_id } = req.params;
    const currentUser = req.user;

    const { data: cra, error } = await supabase
        .from('cras')
        .select(`
            *,
            profiles:user_id (
                id,
                name,
                email,
                role,
                clients (
                    id,
                    name
                )
            )
        `)
        .eq('id', cra_id)
        .single();

    if (error) {
        throw new ApiError(404, 'CRA introuvable');
    }

    // Check if user is admin or owns this CRA
    if (currentUser.role !== 'admin' && currentUser.id !== cra.user_id) {
        throw new ApiError(403, "Vous ne pouvez consulter que vos propres CRA");
    }

    return res.status(200).json(
        new ApiResponse(200, cra, "CRA fetched successfully")
    );
});

// Update CRA
const updateCRA = asyncHandler(async (req, res) => {
    const { cra_id } = req.params;
    const { status, days, signature_dataurl,signature_text,comment, revision_reason, hide_header, hide_client_signature } = req.body;
    const currentUser = req.user;

    const { data: existingCRA } = await supabase
        .from('cras')
        .select('*')
        .eq('id', cra_id)
        .single();

    if (!existingCRA) {
        throw new ApiError(404, 'CRA introuvable');
    }

    // Check if user is admin or owns this CRA
    if (currentUser.role !== 'admin' && currentUser.id !== existingCRA.user_id) {
        throw new ApiError(403, "Vous ne pouvez modifier que vos propres CRA");
    }

    const updateData = {
        updated_at: new Date().toISOString()
    };

    if (status !== undefined) updateData.status = status;
    if (days !== undefined) updateData.days = days;
    if (signature_text !== undefined) updateData.signature_text = signature_text;
    if (comment !== undefined) updateData.comment = comment;
    if (revision_reason !== undefined) updateData.revision_reason = revision_reason;
    if (hide_header !== undefined) updateData.hide_header = !!hide_header;
    if (hide_client_signature !== undefined) updateData.hide_client_signature = !!hide_client_signature;

    if (signature_dataurl) {
        try {
            const matches = signature_dataurl.match(/^data:(image\/\w+);base64,(.+)$/);
            if (!matches) {
                throw new Error('URL de signature invalide');
            }
            const mimeType = matches[1];
            const b64 = matches[2];
            const buffer = Buffer.from(b64, 'base64');
            const ext = mimeType.split('/')[1] || 'png';
            const objectKey = `cra_${cra_id}/sig_${Date.now()}.${ext}`;
            const { data: uploaded, error: uploadError } = await supabase
                .storage
                .from('signatures')
                .upload(objectKey, buffer, { contentType: mimeType, upsert: false });
            if (uploadError) {
                throw uploadError;
            }
            const { data: publicUrlData } = await supabase
                .storage
                .from('signatures')
                .getPublicUrl(uploaded.path);
            updateData.signature_url = publicUrlData?.publicUrl || null;
        } catch (e) {
            throw new ApiError(500, 'Échec de l’enregistrement de la signature');
        }
    }

    const previousStatus = existingCRA.status;
    const { data: cra, error } = await supabase
        .from('cras')
        .update(updateData)
        .eq('id', cra_id)
        .select()
        .single();

    if (error) {
        throw new ApiError(500, 'Échec de la mise à jour du CRA');
    }

    // // If status changed, notify consultant by email
    try {
        if (status !== undefined && status !== previousStatus && cra?.user_id) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('id, name, email')
                .eq('id', cra.user_id)
                .single();

            if (profile?.email) {
                let subject = `Mise à jour du statut de votre CRA`;
                let middle = `Le statut de votre CRA (${cra.month}) a été mis à jour à <b>${status}</b>.`;

                if (status === 'À réviser' && (revision_reason || cra.revision_reason)) {
                    middle += `<br/><br/><b>Motif de la révision :</b><br/>${revision_reason || cra.revision_reason}`;
                }

                if (status === 'Signature demandée') {
                    middle += `<br/><br/>Veuillez vous connecter pour signer votre CRA.`;
                }

                const { wrapEmail } = await import('../utils/emailTemplate.js');
                const html = wrapEmail({
                    title: subject,
                    contentHtml: `
                      <p style=\"font-size:15px\">Bonjour <strong>${profile.name || ''}</strong>,</p>
                      <p style=\"font-size:15px\">${middle}</p>
                    `
                });
                try { await sendMail({ to: profile.email, subject, html }); } catch (e) { /* ignore email failure */ }
            }
        }
    } catch (notifyErr) {
        // Non-blocking: ignore email errors
    }

    return res.status(200).json(
        new ApiResponse(200, cra, "CRA updated successfully")
    );
});

// Delete CRA
const deleteCRA = asyncHandler(async (req, res) => {
    const { cra_id } = req.params;
    const currentUser = req.user;

    // Get the CRA first to check ownership
    const { data: existingCRA } = await supabase
        .from('cras')
        .select('*')
        .eq('id', cra_id)
        .single();

    if (!existingCRA) {
        throw new ApiError(404, 'CRA introuvable');
    }

    // Check if user is admin or owns this CRA
    if (currentUser.role !== 'admin' && currentUser.id !== existingCRA.user_id) {
        throw new ApiError(403, "Vous ne pouvez supprimer que vos propres CRA");
    }

    const { error } = await supabase
        .from('cras')
        .delete()
        .eq('id', cra_id);

    if (error) {
        throw new ApiError(500, 'Échec de la suppression du CRA');
    }

    return res.status(200).json(
        new ApiResponse(200, null, "CRA supprimé avec succès")
    );
});

// Get CRAs for dashboard (manager/admin view)
const getDashboardCRAs = asyncHandler(async (req, res) => {
    const currentUser = req.user;
    const { start_date, end_date, consultant_id, status } = req.query;

    
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        throw new ApiError(403, "Seuls les managers et administrateurs peuvent accéder aux CRA du tableau de bord");
    }

    let query = supabase
        .from('cras')
        .select(`
            *,
            profiles:profiles!cras_user_id_fkey (
                id,
                name,
                email,
                role,
                clients:client_id (
                    id,
                    name
                )
            )
        `);

    // Apply filters
    if (start_date && end_date) {
        query = query.gte('month', start_date).lte('month', end_date);
    }
    if (consultant_id) {
        query = query.eq('user_id', consultant_id);
    }
    if (status && status !== 'Tous') {
        query = query.eq('status', status);
    }

    const { data: cras, error } = await query.order('month', { ascending: false });

    if (error) {
        throw new ApiError(500, 'Échec de la récupération des CRA du tableau de bord');
    }

    return res.status(200).json(
        new ApiResponse(200, cras, "CRA du tableau de bord récupérés avec succès")
    );
});

export {
    createCRA,
    getUserCRAs,
    getAllCRAs,
    getCRAById,
    updateCRA,
    deleteCRA,
    getDashboardCRAs
};
