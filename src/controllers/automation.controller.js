import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";
import { sendMail } from "../utils/sendMail.js";
import { formatISO, startOfMonth } from "date-fns";
import { wrapEmail } from "../utils/emailTemplate.js";

const sendWelcomeEmail = asyncHandler(async (req, res) => {
    const { userId, email, fullname } = req.body;
    
    if (!userId || !email || !fullname) {
        throw new ApiError(400, "L'ID utilisateur, l'email et le nom complet sont requis");
    }
    
    try {
        await sendMail({
            to: email,
            subject: 'Bienvenue sur Sevenopportunity !',
            html: wrapEmail({
                title: 'Bienvenue sur Sevenopportunity',
                contentHtml: `
                  <p style=\"font-size:15px\">Bonjour <strong>${fullname}</strong>,</p>
                  <p style=\"font-size:15px\">Votre compte a été créé avec succès. Voici les détails de votre compte :</p>
                  <div style=\"background-color:#f8f9fa;padding:20px;border-radius:6px;margin:20px 0;\">
                    <p style=\"margin:5px 0;\"><strong>Email :</strong> ${email}</p>
                    <p style=\"margin:5px 0;\"><strong>Nom d'utilisateur :</strong> ${fullname.toLowerCase().replace(/\s+/g, '')}</p>
                  </div>
                  <p class=\"small-note\">Si vous avez des questions, veuillez contacter votre administrateur système.</p>
                `
            })
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
            html: wrapEmail({
                title: "Confirmation d'upload de document",
                contentHtml: `
                  <p style=\"font-size:15px\">Bonjour <strong>${fullname}</strong>,</p>
                  <p style=\"font-size:15px\">Votre document a été uploadé avec succès :</p>
                  <div style=\"background-color:#f8f9fa;padding:20px;border-radius:6px;margin:20px 0;\">
                    <p style=\"margin:5px 0;\"><strong>Document :</strong> ${documentTitle}</p>
                    <p style=\"margin:5px 0;\"><strong>Uploadé le :</strong> ${new Date().toLocaleDateString()}</p>
                  </div>
                  <p class=\"small-note\">Vous pouvez maintenant consulter et gérer votre document dans le système.</p>
                `
            })
        });
        
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
    let body = '';
    
    switch (reminderType) {
        case 'password_change':
            subject = 'Rappel de changement de mot de passe';
            body = `Cela fait un moment que vous n'avez pas changé votre mot de passe. Veuillez considérer le mettre à jour pour la sécurité.`;
            break;
        case 'document_review':
            subject = 'Rappel de révision de document';
            body = `Vous avez des documents qui peuvent nécessiter une révision. Veuillez vérifier votre tableau de bord de documents.`;
            break;
        case 'account_update':
            subject = 'Rappel de mise à jour de compte';
            body = `Veuillez réviser et mettre à jour les informations de votre compte pour vous assurer qu'elles sont à jour.`;
            break;
        default:
            subject = 'Rappel de Sevenopportunity';
            body = `Ceci est un rappel amical de votre système.`;
    }
    
    try {
        await sendMail({
            to: email,
            subject,
            html: wrapEmail({
                title: subject,
                contentHtml: `
                  <p style=\"font-size:15px\">Bonjour <strong>${fullname}</strong>,</p>
                  <p style=\"font-size:15px\">${body}</p>
                  ${dueDate ? `<p style=\"font-size:14px;color:#666\"><strong>Date d'échéance :</strong> ${dueDate}</p>` : ''}
                  <p class=\"small-note\">Merci d'utiliser Sevenopportunity !</p>
                `
            })
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

// New: Send CRA month-end reminders to consultants with pending CRAs
export const sendCRAMonthEndReminders = asyncHandler(async (req, res) => {
    const onlyStatuses = Array.isArray(req.body?.onlyStatuses) && req.body.onlyStatuses.length > 0
        ? req.body.onlyStatuses
        : ['Brouillon', 'À réviser'];

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    const queryMonth = req.query?.month;
    const bodyMonth = req.body?.month;
    const fallbackMonth = queryMonth || bodyMonth || formatISO(startOfMonth(new Date()), { representation: 'date' });
    const selectedUserIds = Array.isArray(req.body?.userIds) ? req.body.userIds : null;

    let totalTargets = 0;
    let successCount = 0;

    const sendReminder = async (email, name, craMonth, status) => {
        await sendMail({
            to: email,
            subject: `Rappel: complétez votre CRA (${craMonth})`,
            html: wrapEmail({
                title: `Rappel CRA (${craMonth})`,
                contentHtml: `
                  <p style=\"font-size:15px\">Bonjour <strong>${name || ''}</strong>,</p>
                  <p style=\"font-size:15px\">Votre CRA pour <b>${craMonth}</b> est actuellement <b>${status}</b>.</p>
                  <p class=\"small-note\">Merci de le compléter et le soumettre avant la fin du mois.</p>
                `
            })
        });
    };

    if (rows && rows.length > 0) {
        for (const { user_id, month } of rows) {
            if (!user_id || !month) continue;
            const { data: cras, error } = await supabase
                .from('cras')
                .select(`id, month, status, user_id, profiles:profiles!cras_user_id_fkey ( id, name, email )`)
                .eq('month', month)
                .eq('user_id', user_id)
                .in('status', onlyStatuses);
            if (error) continue;
            totalTargets += (cras?.length || 0);
            for (const cra of (cras || [])) {
                const email = cra?.profiles?.email;
                const name = cra?.profiles?.name || '';
                if (!email) continue;
                try { await sendReminder(email, name, cra.month, cra.status); successCount += 1; } catch (_) {}
            }
        }
    } else {
        let query = supabase
            .from('cras')
            .select(`id, month, status, user_id, profiles:profiles!cras_user_id_fkey ( id, name, email )`)
            .eq('month', fallbackMonth)
            .in('status', onlyStatuses);

        if (selectedUserIds && selectedUserIds.length > 0) {
            query = query.in('user_id', selectedUserIds);
        }

        const { data: cras, error } = await query;
        if (error) {
            throw new ApiError(500, "Échec de la récupération des CRA pour rappel");
        }
        totalTargets = cras?.length || 0;
        for (const cra of (cras || [])) {
            const email = cra?.profiles?.email;
            const name = cra?.profiles?.name || '';
            if (!email) continue;
            try { await sendReminder(email, name, cra.month, cra.status); successCount += 1; } catch (_) {}
        }
    }

    return res.status(200).json(new ApiResponse(200, { total: totalTargets, sent: successCount }, 'Rappels CRA envoyés'));
});

// Send CRA document reminders for selected rows (create/complete/sign pending)
export const sendCRADocumentReminders = asyncHandler(async (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) {
        throw new ApiError(400, "Aucune ligne sélectionnée");
    }

    let totalTargets = rows.length;
    let sent = 0;

    for (const { user_id, month } of rows) {
        if (!user_id || !month) continue;

        const { data: cra, error: craErr } = await supabase
            .from('cras')
            .select('id, status, month, user_id')
            .eq('user_id', user_id)
            .eq('month', month)
            .single();

        const { data: profile } = await supabase
            .from('profiles')
            .select('id, name, email')
            .eq('id', user_id)
            .single();

        const email = profile?.email;
        if (!email) continue;

        let shouldSend = false;
        let subject = `Rappel: votre CRA (${month}) nécessite une action`;
        let middle = '';

        if (!cra || craErr) {
            shouldSend = true;
            middle = `Aucun CRA n'a été créé pour <b>${month}</b>.<br/>Veuillez créer et compléter votre CRA.`;
        } else if (cra.status !== 'Signé') {
            shouldSend = true;
            switch (cra.status) {
                case 'Brouillon':
                    middle = `Votre CRA pour <b>${month}</b> est en <b>Brouillon</b>. Merci de le compléter et le soumettre.`;
                    break;
                case 'À réviser':
                    middle = `Votre CRA pour <b>${month}</b> est marqué <b>À réviser</b>. Merci de corriger et de le soumettre à nouveau.`;
                    break;
                case 'Soumis':
                    middle = `Votre CRA pour <b>${month}</b> est <b>Soumis</b>. Merci d'attendre la validation ou de vérifier s'il y a des retours.`;
                    break;
                case 'Validé':
                    middle = `Votre CRA pour <b>${month}</b> est <b>Validé</b>. Vous serez notifié si une signature est demandée.`;
                    break;
                case 'Signature demandée':
                    middle = `Votre CRA pour <b>${month}</b> est en <b>Signature demandée</b>. Merci de le signer.`;
                    break;
                default:
                    middle = `Votre CRA pour <b>${month}</b> nécessite votre attention (statut: ${cra.status}).`;
            }
        }

        if (shouldSend) {
            const html = wrapEmail({
                title: subject,
                contentHtml: `
                  <p style=\"font-size:15px\">Bonjour <strong>${profile?.name || ''}</strong>,</p>
                  <p style=\"font-size:15px\">${middle}</p>
                `
            });
            try { await sendMail({ to: email, subject, html }); sent += 1; } catch (_) {}
        }
    }

    return res.status(200).json(new ApiResponse(200, { total: totalTargets, sent }, 'Rappels CRA documents envoyés'));
});
