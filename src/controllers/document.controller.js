import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";

const uploadDocument = asyncHandler(async (req, res) => {
    const { title, description, document_type } = req.body;
    const userId = req.user.id;

    if (!req.file) {
        throw new ApiError(400, "Le fichier du document est requis");
    }

    if (!title || !document_type) {
        throw new ApiError(400, "Le titre et le type de document sont requis");
    }

    // Upload file to Supabase Storage (bucket: documents)
    const fileExt = req.file.originalname.split('.').pop();
    const objectKey = `u_${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
    const { data: uploaded, error: uploadError } = await supabase
        .storage
        .from('documents')
        .upload(objectKey, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false
        });

    if (uploadError) {
        throw new ApiError(500, 'Échec de l\'upload du fichier document');
    }

    const { data: publicUrlData } = supabase
        .storage
        .from('documents')
        .getPublicUrl(uploaded.path);

    const fileUrl = publicUrlData?.publicUrl || null;

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
        throw new ApiError(500, 'Échec de l\'upload du document');
    }

    return res.status(201).json(
        new ApiResponse(201, document, "Document uploadé avec succès")
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
        throw new ApiError(500, 'Échec de la récupération des documents');
    }

    return res.status(200).json(
        new ApiResponse(200, documents, "Documents récupérés avec succès")
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
        throw new ApiError(404, "Document introuvable");
    }

    return res.status(200).json(
        new ApiResponse(200, document, "Document récupéré avec succès")
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
        throw new ApiError(404, "Document introuvable");
    }

    const updateFields = {};
    if (title) updateFields.title = title;
    if (description) updateFields.description = description;
    if (document_type) updateFields.document_type = document_type;

    if (Object.keys(updateFields).length === 0) {
        throw new ApiError(400, "Aucun champ à mettre à jour");
    }

    const { data: document, error } = await supabase
        .from('documents')
        .update(updateFields)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw new ApiError(500, 'Échec de la mise à jour du document');
    }

    return res.status(200).json(
        new ApiResponse(200, document, "Document mis à jour avec succès")
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
        throw new ApiError(404, "Document introuvable");
    }

    const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id);

    if (error) {
        throw new ApiError(500, 'Échec de la suppression du document');
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Document supprimé avec succès")
    );
});

const signDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { signature_text, signature_svg } = req.body;
    const userId = req.user.id;

    // Accept either an uploaded signature image file or a typed signature text
    let signaturePayload = {};
    if (req.file) {
        const fileExt = req.file.originalname.split('.').pop();
        const objectKey = `u_${userId}/sig_${id}_${Date.now()}.${fileExt}`;
        const { data: uploaded, error: uploadError } = await supabase
            .storage
            .from('signatures')
            .upload(objectKey, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
            });
        if (uploadError) {
            throw new ApiError(500, 'Échec de l\'upload de la signature');
        }
        const { data: publicUrlData } = supabase
            .storage
            .from('signatures')
            .getPublicUrl(uploaded.path);
        signaturePayload = { signature_type: 'image', signature_url: publicUrlData?.publicUrl || null };
    } else if (signature_svg) {
        signaturePayload = { signature_type: 'svg', signature_svg };
    } else if (signature_text) {
        signaturePayload = { signature_type: 'text', signature_text };
    } else {
        throw new ApiError(400, 'La signature est requise (upload de fichier ou signature_text)');
    }

    // Check if document exists and belongs to user
    const { data: existingDoc, error: checkError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

    if (checkError || !existingDoc) {
        throw new ApiError(404, "Document introuvable");
    }

    // Store signature in Supabase
    const { data: signature, error } = await supabase
        .from('document_signatures')
        .insert({
            document_id: id,
            user_id: userId,
            ...signaturePayload,
            signed_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        throw new ApiError(500, 'Échec de la signature du document');
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
        new ApiResponse(200, signature, "Document signé avec succès")
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
