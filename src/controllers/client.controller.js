import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";

const createClient = asyncHandler(async (req, res) => {
    const { name, address} = req.body;
    const currentUser = req.user;

    if (!name) {
        throw new ApiError(400, "Le nom du client est requis");
    }

    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        throw new ApiError(403, "Seuls les administrateurs et managers peuvent créer des clients");
    }

    const { data: existingClient } = await supabase
        .from('clients')
        .select('*')
        .eq('name', name)
        .single();

    if (existingClient) {
        throw new ApiError(400, "Un client avec ce nom existe déjà");
    }

    const clientData = {
        name,
        address: address || ''
    };

    const { data: client, error } = await supabase
        .from('clients')
        .insert(clientData)
        .select()
        .single();

    if (error) {
        throw new ApiError(500, 'Échec de la création du client');
    }

    return res.status(201).json(
        new ApiResponse(201, client, "Client créé avec succès")
    );
});

const getAllClients = asyncHandler(async (req, res) => {
    const currentUser = req.user;

    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        throw new ApiError(403, "Seuls les administrateurs et managers peuvent voir tous les clients");
    }

    const { data: clients, error } = await supabase
        .from('clients')
        .select('*')          // just clients, no inner join
        .order('name', { ascending: true });

    if (error) {
        throw new ApiError(500, 'Échec de la récupération des clients');
    }

    return res.status(200).json(
        new ApiResponse(200, clients, "Clients récupérés avec succès")
    );
});

// Get clients for dropdown/selection
const getClientsForSelection = asyncHandler(async (req, res) => {
    const currentUser = req.user;

    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        throw new ApiError(403, "Seuls les administrateurs et managers peuvent voir les clients");
    }

    const { data: clients, error } = await supabase
        .from('clients')
        .select('id, name')  // only the fields needed for dropdown
        .order('name', { ascending: true });

    if (error) {
        throw new ApiError(500, 'Échec de la récupération des clients pour la sélection');
    }

    return res.status(200).json(
        new ApiResponse(200, clients, "Clients récupérés avec succès")
    );
});

// Get client assigned to current user (for consultants)
const getMyClient = asyncHandler(async (req, res) => {
    const currentUser = req.user;

    if (!currentUser.client_id) {
        return res.status(200).json(
            new ApiResponse(200, null, "Aucun client attribué")
        );
    }

    const { data: client, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', currentUser.client_id)
        .single();

    if (error) {
        throw new ApiError(500, 'Échec de la récupération du client attribué');
    }

    return res.status(200).json(
        new ApiResponse(200, client, "Client attribué récupéré avec succès")
    );
});


// Get client by ID
const getClientById = asyncHandler(async (req, res) => {
    const { client_id } = req.params;
    const currentUser = req.user;

    // Only admins and managers can view client details
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        throw new ApiError(403, "Seuls les administrateurs et managers peuvent voir les détails du client");
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
        throw new ApiError(404, 'Client introuvable');
    }

    return res.status(200).json(
        new ApiResponse(200, client, "Client récupéré avec succès")
    );
});

// Update client
const updateClient = asyncHandler(async (req, res) => {
    const { client_id } = req.params;
    const { name, address} = req.body;
    const currentUser = req.user;

    // Only admins and managers can update clients
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        throw new ApiError(403, "Seuls les administrateurs et managers peuvent mettre à jour les clients");
    }

    // Check if client exists
    const { data: existingClient } = await supabase
        .from('clients')
        .select('*')
        .eq('id', client_id)
        .single();

    if (!existingClient) {
        throw new ApiError(404, 'Client introuvable');
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
            throw new ApiError(400, "Un client avec ce nom existe déjà");
        }
    }

    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (address !== undefined) updateData.address = address;

    const { data: client, error } = await supabase
        .from('clients')
        .update(updateData)
        .eq('id', client_id)
        .select()
        .single();

    if (error) {
        throw new ApiError(500, 'Échec de la mise à jour du client');
    }

    return res.status(200).json(
        new ApiResponse(200, client, "Client mis à jour avec succès")
    );
});

// Delete client
const deleteClient = asyncHandler(async (req, res) => {
    const { client_id } = req.params;
    const currentUser = req.user;

    // Only admins can delete clients
    if (currentUser.role !== 'admin') {
        throw new ApiError(403, "Seuls les administrateurs peuvent supprimer des clients");
    }

    // Check if client exists
    const { data: existingClient } = await supabase
        .from('clients')
        .select('*')
        .eq('id', client_id)
        .single();

    if (!existingClient) {
        throw new ApiError(404, 'Client introuvable');
    }

    // Check if client has associated profiles
    const { data: associatedProfiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('client_id', client_id);

    if (associatedProfiles && associatedProfiles.length > 0) {
        throw new ApiError(400, "Impossible de supprimer un client avec des profils associés");
    }

    const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', client_id);

    if (error) {
        throw new ApiError(500, 'Échec de la suppression du client');
    }

    return res.status(200).json(
        new ApiResponse(200, null, "Client supprimé avec succès")
    );
});

// Get clients for dropdown/selection
// const getClientsForSelection = asyncHandler(async (req, res) => {
//     const currentUser = req.user;

//     // Only admins and managers can view clients
//     if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
//         throw new ApiError(403, "Only admins and managers can view clients");
//     }

//     const { data: clients, error } = await supabase
//         .from('clients')
//         .select('id, name')
//         .order('name', { ascending: true });

//     if (error) {
//         throw new ApiError(500, 'Failed to fetch clients');
//     }

//     return res.status(200).json(
//         new ApiResponse(200, clients, "Clients fetched successfully")
//     );
// });

export {
    createClient,
    getAllClients,
    getClientById,
    updateClient,
    deleteClient,
    getClientsForSelection,
    getMyClient
};
