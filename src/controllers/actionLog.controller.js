import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";

const createActionLog = asyncHandler(async (req, res) => {
    const { action, details, user_id } = req.body;
    const currentUser = req.user;

    if (!action) {
        throw new ApiError(400, "L'action est requise");
    }

    // Users can only log actions for themselves, unless they're admin
    if (currentUser.role !== 'admin' && currentUser.id !== user_id) {
        throw new ApiError(403, "Vous ne pouvez enregistrer des actions que pour vous-même");
    }

    const logData = {
        action,
        details: details || {},
        user_id: user_id || currentUser.id,
        created_at: new Date().toISOString()
    };

    const { data: logEntry, error } = await supabase
        .from('action_logs')
        .insert(logData)
        .select()
        .single();

    if (error) {
        console.log(error)
        throw new ApiError(500, 'Échec de la création du journal d\'action');
    }

    return res.status(201).json(
        new ApiResponse(201, logEntry, "Action enregistrée avec succès")
    );
});

// Get action logs for a specific user
const getUserActionLogs = asyncHandler(async (req, res) => {
    const { user_id } = req.params;
    const currentUser = req.user;

    // Users can only view their own logs, unless they're admin
    if (currentUser.role !== 'admin' && currentUser.id !== user_id) {
        throw new ApiError(403, "Vous ne pouvez consulter que vos propres journaux d'action");
    }

    const { data: logs, error } = await supabase
        .from('action_logs')
        .select(`
            *,
            profiles:user_id (
                id,
                name,
                email,
                role
            )
        `)
        .eq('user_id', user_id)
        .order('created_at', { ascending: false });

    if (error) {
        throw new ApiError(500, 'Échec de la récupération des journaux d\'action');
    }

    return res.status(200).json(
        new ApiResponse(200, logs, "Journaux d'action récupérés avec succès")
    );
});

// Get all action logs (admin only)
const getAllActionLogs = asyncHandler(async (req, res) => {
    const currentUser = req.user;
    const { page = 1, limit = 50, user_id, action, start_date, end_date } = req.query;

    if (currentUser.role !== 'admin') {
        throw new ApiError(403, "Seuls les administrateurs peuvent voir tous les journaux d'action");
    }

    let query = supabase
        .from('action_logs')
        .select(`
            *,
            profiles:user_id (
                id,
                name,
                email,
                role
            )
        `, { count: 'exact' });

    // Apply filters
    if (user_id) {
        query = query.eq('user_id', user_id);
    }
    if (action) {
        query = query.ilike('action', `%${action}%`);
    }
    if (start_date && end_date) {
        query = query.gte('created_at', start_date).lte('created_at', end_date);
    }

    // Apply pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

    const { data: logs, error, count } = await query;

    if (error) {
        throw new ApiError(500, 'Échec de la récupération des journaux d\'action');
    }

    return res.status(200).json(
        new ApiResponse(200, {
            logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                pages: Math.ceil(count / limit)
            }
        }, "Journaux d'action récupérés avec succès")
    );
});

// Get action log by ID
const getActionLogById = asyncHandler(async (req, res) => {
    const { log_id } = req.params;
    const currentUser = req.user;

    const { data: logEntry, error } = await supabase
        .from('action_logs')
        .select(`
            *,
            profiles:user_id (
                id,
                name,
                email,
                role
            )
        `)
        .eq('id', log_id)
        .single();

    if (error) {
        throw new ApiError(404, 'Journal d\'action introuvable');
    }

    // Users can only view their own logs, unless they're admin
    if (currentUser.role !== 'admin' && currentUser.id !== logEntry.user_id) {
        throw new ApiError(403, "Vous ne pouvez consulter que vos propres journaux d'action");
    }

    return res.status(200).json(
        new ApiResponse(200, logEntry, "Journal d'action récupéré avec succès")
    );
});

// Get action logs for dashboard (recent activity)
const getDashboardActionLogs = asyncHandler(async (req, res) => {
    const currentUser = req.user;
    const { limit = 20 } = req.query;

    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        throw new ApiError(403, "Seuls les managers et administrateurs peuvent accéder aux journaux d'action du tableau de bord");
    }

    let query = supabase
        .from('action_logs')
        .select(`
            *,
            profiles:user_id (
                id,
                name,
                email,
                role
            )
        `)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

    // Managers can only see logs from their team members
    if (currentUser.role === 'manager') {
        // Get all consultants under this manager
        const { data: teamMembers } = await supabase
            .from('profiles')
            .select('id')
            .eq('manager_id', currentUser.id);

        if (teamMembers && teamMembers.length > 0) {
            const teamMemberIds = teamMembers.map(member => member.id);
            query = query.in('user_id', teamMemberIds);
        } else {
            // If no team members, return empty
            return res.status(200).json(
                new ApiResponse(200, { logs: [] }, "Aucun journal d'action trouvé")
            );
        }
    }

    const { data: logs, error } = await query;

    if (error) {
        throw new ApiError(500, 'Échec de la récupération des journaux d\'action du tableau de bord');
    }

    return res.status(200).json(
        new ApiResponse(200, { logs }, "Journaux d'action du tableau de bord récupérés avec succès")
    );
});

// Delete action log (admin only)
const deleteActionLog = asyncHandler(async (req, res) => {
    const { log_id } = req.params;
    const currentUser = req.user;

    if (currentUser.role !== 'admin') {
        throw new ApiError(403, "Seuls les administrateurs peuvent supprimer des journaux d'action");
    }

    const { error } = await supabase
        .from('action_logs')
        .delete()
        .eq('id', log_id);

    if (error) {
        throw new ApiError(500, 'Échec de la suppression du journal d\'action');
    }

    return res.status(200).json(
        new ApiResponse(200, null, "Journal d'action supprimé avec succès")
    );
});

export {
    createActionLog,
    getUserActionLogs,
    getAllActionLogs,
    getActionLogById,
    getDashboardActionLogs,
    deleteActionLog
};
