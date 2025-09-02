import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";
import { sendMail } from "../utils/sendMail.js";

const sendWelcomeEmail = asyncHandler(async (req, res) => {
    const { userId, email, fullname } = req.body;
    
    if (!userId || !email || !fullname) {
        throw new ApiError(400, "User ID, email, and fullname are required");
    }
    
    try {
        await sendMail({
            to: email,
            subject: 'Welcome to Horizons!',
            html: `
                <div style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px;">
                    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                        <h2 style="color: #2a2a2a;">Welcome to Horizons!</h2>
                        <p style="font-size: 16px; color: #444;">Hello ${fullname},</p>
                        <p style="font-size: 15px; color: #444;">Your account has been successfully created. Here are your account details:</p>
                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
                            <p style="margin: 5px 0;"><strong>Username:</strong> ${fullname.toLowerCase().replace(/\s+/g, '')}</p>
                        </div>
                        <p style="font-size: 15px; color: #444;">You can now log in to your account and start using our system.</p>
                        <p style="font-size: 14px; color: #666;">If you have any questions, please contact your system administrator.</p>
                        <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
                        <p style="font-size: 13px; color: #999;">
                            Best regards,<br>The Horizons Team
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
            new ApiResponse(200, {}, "Welcome email sent successfully")
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
        
        throw new ApiError(500, "Failed to send welcome email");
    }
});

const sendDocumentNotification = asyncHandler(async (req, res) => {
    const { documentId, userId, email, fullname, documentTitle } = req.body;
    
    if (!documentId || !userId || !email || !fullname || !documentTitle) {
        throw new ApiError(400, "All fields are required");
    }
    
    try {
        await sendMail({
            to: email,
            subject: 'Document Uploaded Successfully',
            html: `
                <div style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px;">
                    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                        <h2 style="color: #2a2a2a;">Document Upload Confirmation</h2>
                        <p style="font-size: 16px; color: #444;">Hello ${fullname},</p>
                        <p style="font-size: 15px; color: #444;">Your document has been uploaded successfully:</p>
                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Document:</strong> ${documentTitle}</p>
                            <p style="margin: 5px 0;"><strong>Uploaded:</strong> ${new Date().toLocaleDateString()}</p>
                        </div>
                        <p style="font-size: 15px; color: #444;">You can now view and manage your document in the system.</p>
                        <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
                        <p style="font-size: 13px; color: #999;">
                            Best regards,<br>The Horizons Team
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
            new ApiResponse(200, {}, "Document notification sent successfully")
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
        
        throw new ApiError(500, "Failed to send document notification");
    }
});

const sendReminderEmail = asyncHandler(async (req, res) => {
    const { userId, email, fullname, reminderType, dueDate } = req.body;
    
    if (!userId || !email || !fullname || !reminderType) {
        throw new ApiError(400, "User ID, email, fullname, and reminder type are required");
    }
    
    let subject = '';
    let message = '';
    
    switch (reminderType) {
        case 'password_change':
            subject = 'Password Change Reminder';
            message = 'It\'s been a while since you last changed your password. Please consider updating it for security.';
            break;
        case 'document_review':
            subject = 'Document Review Reminder';
            message = 'You have documents that may need review. Please check your document dashboard.';
            break;
        case 'account_update':
            subject = 'Account Update Reminder';
            message = 'Please review and update your account information to ensure it\'s current.';
            break;
        default:
            subject = 'Reminder from Horizons';
            message = 'This is a friendly reminder from your system.';
    }
    
    try {
        await sendMail({
            to: email,
            subject: subject,
            html: `
                <div style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px;">
                    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                        <h2 style="color: #2a2a2a;">${subject}</h2>
                        <p style="font-size: 16px; color: #444;">Hello ${fullname},</p>
                        <p style="font-size: 15px; color: #444;">${message}</p>
                        ${dueDate ? `<p style="font-size: 14px; color: #666;"><strong>Due Date:</strong> ${dueDate}</p>` : ''}
                        <p style="font-size: 14px; color: #666;">Thank you for using Horizons!</p>
                        <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
                        <p style="font-size: 13px; color: #999;">
                            Best regards,<br>The Horizons Team
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
            new ApiResponse(200, {}, "Reminder email sent successfully")
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
        
        throw new ApiError(500, "Failed to send reminder email");
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
        throw new ApiError(500, "Failed to fetch automation logs");
    }
    
    return res.status(200).json(
        new ApiResponse(200, logs, "Automation logs fetched successfully")
    );
});

export {
    sendWelcomeEmail,
    sendDocumentNotification,
    sendReminderEmail,
    getAutomationLogs
};
