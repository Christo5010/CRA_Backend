import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";

const createActionLog = asyncHandler(async (req, res) => {
    const { action, details, user_id } = req.body;
    const currentUser = req.user;

    if (!action) {
        throw new ApiError(400, "Action is required");
    }

    // Users can only log actions for themselves, unless they're admin
    if (currentUser.role !== 'admin' && currentUser.id !== user_id) {
        throw new ApiError(403, "You can only log actions for yourself");
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
        throw new ApiError(500, 'Failed to create action log');
    }

    return res.status(201).json(
        new ApiResponse(201, logEntry, "Action logged successfully")
    );
});

// Get action logs for a specific user
const getUserActionLogs = asyncHandler(async (req, res) => {
    const { user_id } = req.params;
    const currentUser = req.user;

    // Users can only view their own logs, unless they're admin
    if (currentUser.role !== 'admin' && currentUser.id !== user_id) {
        throw new ApiError(403, "You can only view your own action logs");
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
        throw new ApiError(500, 'Failed to fetch action logs');
    }

    return res.status(200).json(
        new ApiResponse(200, logs, "Action logs fetched successfully")
    );
});

// Get all action logs (admin only)
const getAllActionLogs = asyncHandler(async (req, res) => {
    const currentUser = req.user;
    const { page = 1, limit = 50, user_id, action, start_date, end_date } = req.query;

    if (currentUser.role !== 'admin') {
        throw new ApiError(403, "Only admins can view all action logs");
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
        throw new ApiError(500, 'Failed to fetch action logs');
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
        }, "Action logs fetched successfully")
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
        throw new ApiError(404, 'Action log not found');
    }

    // Users can only view their own logs, unless they're admin
    if (currentUser.role !== 'admin' && currentUser.id !== logEntry.user_id) {
        throw new ApiError(403, "You can only view your own action logs");
    }

    return res.status(200).json(
        new ApiResponse(200, logEntry, "Action log fetched successfully")
    );
});

// Get action logs for dashboard (recent activity)
const getDashboardActionLogs = asyncHandler(async (req, res) => {
    const currentUser = req.user;
    const { limit = 20 } = req.query;

    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        throw new ApiError(403, "Only managers and admins can access dashboard action logs");
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
                new ApiResponse(200, { logs: [] }, "No action logs found")
            );
        }
    }

    const { data: logs, error } = await query;

    if (error) {
        console.log(error)
        throw new ApiError(500, 'Failed to fetch dashboard action logs');
    }

    return res.status(200).json(
        new ApiResponse(200, { logs }, "Dashboard action logs fetched successfully")
    );
});

// Delete action log (admin only)
const deleteActionLog = asyncHandler(async (req, res) => {
    const { log_id } = req.params;
    const currentUser = req.user;

    if (currentUser.role !== 'admin') {
        throw new ApiError(403, "Only admins can delete action logs");
    }

    const { error } = await supabase
        .from('action_logs')
        .delete()
        .eq('id', log_id);

    if (error) {
        throw new ApiError(500, 'Failed to delete action log');
    }

    return res.status(200).json(
        new ApiResponse(200, null, "Action log deleted successfully")
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
