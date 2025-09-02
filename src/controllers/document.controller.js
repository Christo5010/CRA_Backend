import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";

const uploadDocument = asyncHandler(async (req, res) => {
    const { title, description, document_type } = req.body;
    const userId = req.user.id;

    if (!req.file) {
        throw new ApiError(400, "Document file is required");
    }

    if (!title || !document_type) {
        throw new ApiError(400, "Title and document type are required");
    }

    // For now, we'll skip file upload since we removed Cloudinary
    // This can be implemented later with a different file storage solution
    const fileUrl = null;

    // Store document metadata in Supabase
    const { data: document, error } = await supabase
        .from('documents')
        .insert({
            title,
            description,
            document_type,
            file_url: fileUrl,
            user_id: userId,
            created_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        throw new ApiError(500, 'Failed to upload document');
    }

    return res.status(201).json(
        new ApiResponse(201, document, "Document uploaded successfully")
    );
});

const getDocuments = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { data: documents, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        throw new ApiError(500, 'Failed to fetch documents');
    }

    return res.status(200).json(
        new ApiResponse(200, documents, "Documents fetched successfully")
    );
});

const getDocumentById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: document, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

    if (error || !document) {
        throw new ApiError(404, "Document not found");
    }

    return res.status(200).json(
        new ApiResponse(200, document, "Document fetched successfully")
    );
});

const updateDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, description, document_type } = req.body;
    const userId = req.user.id;

    // Check if document exists and belongs to user
    const { data: existingDoc, error: checkError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

    if (checkError || !existingDoc) {
        throw new ApiError(404, "Document not found");
    }

    const updateFields = {};
    if (title) updateFields.title = title;
    if (description) updateFields.description = description;
    if (document_type) updateFields.document_type = document_type;

    if (Object.keys(updateFields).length === 0) {
        throw new ApiError(400, "No fields to update");
    }

    const { data: document, error } = await supabase
        .from('documents')
        .update(updateFields)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw new ApiError(500, 'Failed to update document');
    }

    return res.status(200).json(
        new ApiResponse(200, document, "Document updated successfully")
    );
});

const deleteDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if document exists and belongs to user
    const { data: existingDoc, error: checkError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

    if (checkError || !existingDoc) {
        throw new ApiError(404, "Document not found");
    }

    const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id);

    if (error) {
        throw new ApiError(500, 'Failed to delete document');
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Document deleted successfully")
    );
});

const signDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { signature_data } = req.body;
    const userId = req.user.id;

    if (!signature_data) {
        throw new ApiError(400, "Signature data is required");
    }

    // Check if document exists and belongs to user
    const { data: existingDoc, error: checkError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

    if (checkError || !existingDoc) {
        throw new ApiError(404, "Document not found");
    }

    // Store signature in Supabase
    const { data: signature, error } = await supabase
        .from('document_signatures')
        .insert({
            document_id: id,
            user_id: userId,
            signature_data,
            signed_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        throw new ApiError(500, 'Failed to sign document');
    }

    // Update document status to signed
    await supabase
        .from('documents')
        .update({ 
            status: 'signed',
            updated_at: new Date().toISOString()
        })
        .eq('id', id);

    return res.status(200).json(
        new ApiResponse(200, signature, "Document signed successfully")
    );
});

export {
    uploadDocument,
    getDocuments,
    getDocumentById,
    updateDocument,
    deleteDocument,
    signDocument
};
