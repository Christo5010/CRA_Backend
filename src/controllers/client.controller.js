import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";

// Create a new client
const createClient = asyncHandler(async (req, res) => {
    const { name, address, contact_email, contact_phone, description } = req.body;
    const currentUser = req.user;

    if (!name) {
        throw new ApiError(400, "Client name is required");
    }

    // Only admins and managers can create clients
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        throw new ApiError(403, "Only admins and managers can create clients");
    }

    // Check if client already exists
    const { data: existingClient } = await supabase
        .from('clients')
        .select('*')
        .eq('name', name)
        .single();

    if (existingClient) {
        throw new ApiError(400, "Client with this name already exists");
    }

    const clientData = {
        name,
        address: address || '',
        contact_email: contact_email || '',
        contact_phone: contact_phone || '',
        description: description || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const { data: client, error } = await supabase
        .from('clients')
        .insert(clientData)
        .select()
        .single();

    if (error) {
        throw new ApiError(500, 'Failed to create client');
    }

    return res.status(201).json(
        new ApiResponse(201, client, "Client created successfully")
    );
});

// Get all clients
const getAllClients = asyncHandler(async (req, res) => {
    const currentUser = req.user;

    // Only admins and managers can view all clients
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        throw new ApiError(403, "Only admins and managers can view all clients");
    }

    const { data: clients, error } = await supabase
        .from('clients')
        .select(`
            *,
            profiles:profiles!inner (
                id,
                name,
                email,
                role
            )
        `)
        .order('name', { ascending: true });

    if (error) {
        throw new ApiError(500, 'Failed to fetch clients');
    }

    return res.status(200).json(
        new ApiResponse(200, clients, "Clients fetched successfully")
    );
});

// Get client by ID
const getClientById = asyncHandler(async (req, res) => {
    const { client_id } = req.params;
    const currentUser = req.user;

    // Only admins and managers can view client details
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        throw new ApiError(403, "Only admins and managers can view client details");
    }

    const { data: client, error } = await supabase
        .from('clients')
        .select(`
            *,
            profiles:profiles!inner (
                id,
                name,
                email,
                role
            )
        `)
        .eq('id', client_id)
        .single();

    if (error) {
        throw new ApiError(404, 'Client not found');
    }

    return res.status(200).json(
        new ApiResponse(200, client, "Client fetched successfully")
    );
});

// Update client
const updateClient = asyncHandler(async (req, res) => {
    const { client_id } = req.params;
    const { name, address, contact_email, contact_phone, description } = req.body;
    const currentUser = req.user;

    // Only admins and managers can update clients
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        throw new ApiError(403, "Only admins and managers can update clients");
    }

    // Check if client exists
    const { data: existingClient } = await supabase
        .from('clients')
        .select('*')
        .eq('id', client_id)
        .single();

    if (!existingClient) {
        throw new ApiError(404, 'Client not found');
    }

    // Check if new name conflicts with existing client
    if (name && name !== existingClient.name) {
        const { data: nameConflict } = await supabase
            .from('clients')
            .select('*')
            .eq('name', name)
            .neq('id', client_id)
            .single();

        if (nameConflict) {
            throw new ApiError(400, "Client with this name already exists");
        }
    }

    const updateData = {
        updated_at: new Date().toISOString()
    };

    if (name !== undefined) updateData.name = name;
    if (address !== undefined) updateData.address = address;
    if (contact_email !== undefined) updateData.contact_email = contact_email;
    if (contact_phone !== undefined) updateData.contact_phone = contact_phone;
    if (description !== undefined) updateData.description = description;

    const { data: client, error } = await supabase
        .from('clients')
        .update(updateData)
        .eq('id', client_id)
        .select()
        .single();

    if (error) {
        throw new ApiError(500, 'Failed to update client');
    }

    return res.status(200).json(
        new ApiResponse(200, client, "Client updated successfully")
    );
});

// Delete client
const deleteClient = asyncHandler(async (req, res) => {
    const { client_id } = req.params;
    const currentUser = req.user;

    // Only admins can delete clients
    if (currentUser.role !== 'admin') {
        throw new ApiError(403, "Only admins can delete clients");
    }

    // Check if client exists
    const { data: existingClient } = await supabase
        .from('clients')
        .select('*')
        .eq('id', client_id)
        .single();

    if (!existingClient) {
        throw new ApiError(404, 'Client not found');
    }

    // Check if client has associated profiles
    const { data: associatedProfiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('client_id', client_id);

    if (associatedProfiles && associatedProfiles.length > 0) {
        throw new ApiError(400, "Cannot delete client with associated profiles");
    }

    const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', client_id);

    if (error) {
        throw new ApiError(500, 'Failed to delete client');
    }

    return res.status(200).json(
        new ApiResponse(200, null, "Client deleted successfully")
    );
});

// Get clients for dropdown/selection
const getClientsForSelection = asyncHandler(async (req, res) => {
    const currentUser = req.user;

    // Only admins and managers can view clients
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        throw new ApiError(403, "Only admins and managers can view clients");
    }

    const { data: clients, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name', { ascending: true });

    if (error) {
        throw new ApiError(500, 'Failed to fetch clients');
    }

    return res.status(200).json(
        new ApiResponse(200, clients, "Clients fetched successfully")
    );
});

export {
    createClient,
    getAllClients,
    getClientById,
    updateClient,
    deleteClient,
    getClientsForSelection
};
