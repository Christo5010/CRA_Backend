import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";

// Create a new CRA
const createCRA = asyncHandler(async (req, res) => {
    const { user_id, month, status, days } = req.body;
    const userId = req.user.id;

    if (!user_id || !month || !status) {
        throw new ApiError(400, "User ID, month, and status are required");
    }

    // Check if user is admin or creating their own CRA
    if (req.user.role !== 'admin' && req.user.id !== user_id) {
        throw new ApiError(403, "You can only create CRAs for yourself");
    }

    // Check if CRA already exists for this user and month
    const { data: existingCRA } = await supabase
        .from('cras')
        .select('*')
        .eq('user_id', user_id)
        .eq('month', month)
        .single();

    if (existingCRA) {
        throw new ApiError(400, "CRA already exists for this user and month");
    }

    const craData = {
        user_id,
        month,
        status,
        days: days || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const { data: cra, error } = await supabase
        .from('cras')
        .insert(craData)
        .select()
        .single();

    if (error) {
        throw new ApiError(500, 'Failed to create CRA');
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
        throw new ApiError(403, "You can only view your own CRAs");
    }

    const { data: cras, error } = await supabase
        .from('cras')
        .select('*')
        .eq('user_id', user_id)
        .order('month', { ascending: false });

    if (error) {
        throw new ApiError(500, 'Failed to fetch CRAs');
    }

    return res.status(200).json(
        new ApiResponse(200, cras, "CRAs fetched successfully")
    );
});

// Get all CRAs (admin only)
const getAllCRAs = asyncHandler(async (req, res) => {
    const currentUser = req.user;

    if (currentUser.role !== 'admin') {
        throw new ApiError(403, "Only admins can view all CRAs");
    }

    const { data: cras, error } = await supabase
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
        .order('month', { ascending: false });

    if (error) {
        throw new ApiError(500, 'Failed to fetch CRAs');
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
        throw new ApiError(404, 'CRA not found');
    }

    // Check if user is admin or owns this CRA
    if (currentUser.role !== 'admin' && currentUser.id !== cra.user_id) {
        throw new ApiError(403, "You can only view your own CRAs");
    }

    return res.status(200).json(
        new ApiResponse(200, cra, "CRA fetched successfully")
    );
});

// Update CRA
const updateCRA = asyncHandler(async (req, res) => {
    const { cra_id } = req.params;
    const { status, days } = req.body;
    const currentUser = req.user;

    // Get the CRA first to check ownership
    const { data: existingCRA } = await supabase
        .from('cras')
        .select('*')
        .eq('id', cra_id)
        .single();

    if (!existingCRA) {
        throw new ApiError(404, 'CRA not found');
    }

    // Check if user is admin or owns this CRA
    if (currentUser.role !== 'admin' && currentUser.id !== existingCRA.user_id) {
        throw new ApiError(403, "You can only update your own CRAs");
    }

    const updateData = {
        updated_at: new Date().toISOString()
    };

    if (status !== undefined) updateData.status = status;
    if (days !== undefined) updateData.days = days;

    const { data: cra, error } = await supabase
        .from('cras')
        .update(updateData)
        .eq('id', cra_id)
        .select()
        .single();

    if (error) {
        throw new ApiError(500, 'Failed to update CRA');
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
        throw new ApiError(404, 'CRA not found');
    }

    // Check if user is admin or owns this CRA
    if (currentUser.role !== 'admin' && currentUser.id !== existingCRA.user_id) {
        throw new ApiError(403, "You can only delete your own CRAs");
    }

    const { error } = await supabase
        .from('cras')
        .delete()
        .eq('id', cra_id);

    if (error) {
        throw new ApiError(500, 'Failed to delete CRA');
    }

    return res.status(200).json(
        new ApiResponse(200, null, "CRA deleted successfully")
    );
});

// Get CRAs for dashboard (manager/admin view)
const getDashboardCRAs = asyncHandler(async (req, res) => {
    const currentUser = req.user;
    const { start_date, end_date, consultant_id, status } = req.query;

    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        throw new ApiError(403, "Only managers and admins can access dashboard CRAs");
    }

    let query = supabase
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
        throw new ApiError(500, 'Failed to fetch dashboard CRAs');
    }

    return res.status(200).json(
        new ApiResponse(200, cras, "Dashboard CRAs fetched successfully")
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
