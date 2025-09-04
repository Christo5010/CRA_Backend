import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";
import { sendMail } from "../utils/sendMail.js";

const sendWelcomeEmail = asyncHandler(async (req, res) => {
    const { userId, email, fullname } = req.body;
    
    if (!userId || !email || !fullname) {
        throw new ApiError(400, "L'ID utilisateur, l'email et le nom complet sont requis");
    }
    
    try {
        await sendMail({
            to: email,
            subject: 'Bienvenue sur Horizons !',
            html: `
                <div style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px;">
                    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                        <h2 style="color: #2a2a2a;">Bienvenue sur Horizons !</h2>
                        <p style="font-size: 16px; color: #444;">Bonjour ${fullname},</p>
                        <p style="font-size: 15px; color: #444;">Votre compte a été créé avec succès. Voici les détails de votre compte :</p>
                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Email :</strong> ${email}</p>
                            <p style="margin: 5px 0;"><strong>Nom d'utilisateur :</strong> ${fullname.toLowerCase().replace(/\s+/g, '')}</p>
                        </div>
                        <p style="font-size: 15px; color: #444;">Vous pouvez maintenant vous connecter à votre compte et commencer à utiliser notre système.</p>
                        <p style="font-size: 14px; color: #666;">Si vous avez des questions, veuillez contacter votre administrateur système.</p>
                        <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
                        <p style="font-size: 13px; color: #999;">
                            Cordialement,<br>L'équipe Horizons
                        </p>
                    </div>
                </div>
            `
        });
        
        // Log the automation
        await supabase
            .from('automation_logs')
            .insert({
                type: 'welcome_email',
                user_id: userId,
                status: 'success',
                created_at: new Date().toISOString()
            });
        
        return res.status(200).json(
            new ApiResponse(200, {}, "Email de bienvenue envoyé avec succès")
        );
    } catch (error) {
        // Log the failed automation
        await supabase
            .from('automation_logs')
            .insert({
                type: 'welcome_email',
                user_id: userId,
                status: 'failed',
                error_message: error.message,
                created_at: new Date().toISOString()
            });
        
        throw new ApiError(500, "Échec de l'envoi de l'email de bienvenue");
    }
});

const sendDocumentNotification = asyncHandler(async (req, res) => {
    const { documentId, userId, email, fullname, documentTitle } = req.body;
    
    if (!documentId || !userId || !email || !fullname || !documentTitle) {
        throw new ApiError(400, "Tous les champs sont requis");
    }
    
    try {
        await sendMail({
            to: email,
            subject: 'Document uploadé avec succès',
            html: `
                <div style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px;">
                    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                        <h2 style="color: #2a2a2a;">Confirmation d'upload de document</h2>
                        <p style="font-size: 16px; color: #444;">Bonjour ${fullname},</p>
                        <p style="font-size: 15px; color: #444;">Votre document a été uploadé avec succès :</p>
                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Document :</strong> ${documentTitle}</p>
                            <p style="margin: 5px 0;"><strong>Uploadé le :</strong> ${new Date().toLocaleDateString()}</p>
                        </div>
                        <p style="font-size: 15px; color: #444;">Vous pouvez maintenant consulter et gérer votre document dans le système.</p>
                        <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
                        <p style="font-size: 13px; color: #999;">
                            Cordialement,<br>L'équipe Horizons
                        </p>
                    </div>
                </div>
            `
        });
        
        // Log the automation
        await supabase
            .from('automation_logs')
            .insert({
                type: 'document_notification',
                user_id: userId,
                document_id: documentId,
                status: 'success',
                created_at: new Date().toISOString()
            });
        
        return res.status(200).json(
            new ApiResponse(200, {}, "Notification de document envoyée avec succès")
        );
    } catch (error) {
        // Log the failed automation
        await supabase
            .from('automation_logs')
            .insert({
                type: 'document_notification',
                user_id: userId,
                document_id: documentId,
                status: 'failed',
                error_message: error.message,
                created_at: new Date().toISOString()
            });
        
        throw new ApiError(500, "Échec de l'envoi de la notification de document");
    }
});

const sendReminderEmail = asyncHandler(async (req, res) => {
    const { userId, email, fullname, reminderType, dueDate } = req.body;
    
    if (!userId || !email || !fullname || !reminderType) {
        throw new ApiError(400, "L'ID utilisateur, l'email, le nom complet et le type de rappel sont requis");
    }
    
    let subject = '';
    let message = '';
    
    switch (reminderType) {
        case 'password_change':
            subject = 'Rappel de changement de mot de passe';
            message = 'Cela fait un moment que vous n\'avez pas changé votre mot de passe. Veuillez considérer le mettre à jour pour la sécurité.';
            break;
        case 'document_review':
            subject = 'Rappel de révision de document';
            message = 'Vous avez des documents qui peuvent nécessiter une révision. Veuillez vérifier votre tableau de bord de documents.';
            break;
        case 'account_update':
            subject = 'Rappel de mise à jour de compte';
            message = 'Veuillez réviser et mettre à jour les informations de votre compte pour vous assurer qu\'elles sont à jour.';
            break;
        default:
            subject = 'Rappel de Horizons';
            message = 'Ceci est un rappel amical de votre système.';
    }
    
    try {
        await sendMail({
            to: email,
            subject: subject,
            html: `
                <div style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px;">
                    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                        <h2 style="color: #2a2a2a;">${subject}</h2>
                        <p style="font-size: 16px; color: #444;">Bonjour ${fullname},</p>
                        <p style="font-size: 15px; color: #444;">${message}</p>
                        ${dueDate ? `<p style="font-size: 14px; color: #666;"><strong>Date d'échéance :</strong> ${dueDate}</p>` : ''}
                        <p style="font-size: 14px; color: #666;">Merci d'utiliser Horizons !</p>
                        <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
                        <p style="font-size: 13px; color: #999;">
                            Cordialement,<br>L'équipe Horizons
                        </p>
                    </div>
                </div>
            `
        });
        
        // Log the automation
        await supabase
            .from('automation_logs')
            .insert({
                type: `reminder_${reminderType}`,
                user_id: userId,
                status: 'success',
                created_at: new Date().toISOString()
            });
        
        return res.status(200).json(
            new ApiResponse(200, {}, "Email de rappel envoyé avec succès")
        );
    } catch (error) {
        // Log the failed automation
        await supabase
            .from('automation_logs')
            .insert({
                type: `reminder_${reminderType}`,
                user_id: userId,
                status: 'failed',
                error_message: error.message,
                created_at: new Date().toISOString()
            });
        
        throw new ApiError(500, "Échec de l'envoi de l'email de rappel");
    }
});

const getAutomationLogs = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    const { data: logs, error } = await supabase
        .from('automation_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    
    if (error) {
        throw new ApiError(500, "Échec de la récupération des journaux d'automatisation");
    }
    
    return res.status(200).json(
        new ApiResponse(200, logs, "Journaux d'automatisation récupérés avec succès")
    );
});

export {
    sendWelcomeEmail,
    sendDocumentNotification,
    sendReminderEmail,
    getAutomationLogs
};
