import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { supabase } from "../utils/supabaseClient.js";
import { sendMail } from "../utils/sendMail.js";
import { wrapEmail } from "../utils/emailTemplate.js";

// Create absence request (consultant)
const createAbsence = asyncHandler(async (req, res) => {
	const { start_date, end_date, type, reason } = req.body;
	const userId = req.user.id;

	if (req.user.role !== 'consultant' && req.user.role !== 'admin' && req.user.role !== 'manager') {
		throw new ApiError(403, 'Seuls les consultants peuvent créer des absences.');
	}

	if (!start_date || !end_date) {
		throw new ApiError(400, 'Les dates de début et de fin sont requises');
	}

	const payload = {
		user_id: userId,
		start_date,
		end_date,
		type: type || null,
		reason: reason || null,
		status: 'Pending',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	};

	const { data, error } = await supabase
		.from('absences')
		.insert(payload)
		.select('*')
		.single();

	if (error) {
		throw new ApiError(500, "Échec de la création de la demande d'absence");
	}

	return res.status(201).json(new ApiResponse(201, data, 'Demande d\'absence créée'));
});

// List my absences (consultant)
const getMyAbsences = asyncHandler(async (req, res) => {
	const userId = req.user.id;
	const { month } = req.query; // optional YYYY-MM-01 filter by month window

	let query = supabase
		.from('absences')
		.select('*')
		.eq('user_id', userId)
		.order('start_date', { ascending: false });

	if (month) {
		// Filter if absence intersects the month
		query = query.gte('end_date', month).lte('start_date', month.replace(/\d{2}$/, '28'));
	}

	const { data, error } = await query;
	if (error) throw new ApiError(500, 'Échec du chargement des absences');

	return res.status(200).json(new ApiResponse(200, data, 'Absences récupérées'));
});

// Manager/Admin: list all/pending absences
const listAbsences = asyncHandler(async (req, res) => {
	if (req.user.role !== 'admin' && req.user.role !== 'manager') {
		throw new ApiError(403, 'Accès refusé');
	}
	const { status, user_id } = req.query;
	let query = supabase
		.from('absences')
		.select('*, profiles:profiles!absences_user_id_fkey ( id, name, email )')
		.order('created_at', { ascending: false });
	if (status) query = query.eq('status', status);
	if (user_id) query = query.eq('user_id', user_id);
	const { data, error } = await query;
	if (error) throw new ApiError(500, 'Échec du chargement des absences');
	return res.status(200).json(new ApiResponse(200, data, 'Absences listées'));
});

// Approve/Reject absence with optional comment
const decideAbsence = asyncHandler(async (req, res) => {
	if (req.user.role !== 'admin' && req.user.role !== 'manager') {
		throw new ApiError(403, 'Accès refusé');
	}
	const { absence_id } = req.params;
	const { action, comment } = req.body; // action: 'approve' | 'reject'

	if (!['approve', 'reject'].includes(String(action))) {
		throw new ApiError(400, 'Action invalide');
	}

	const { data: absence, error: findErr } = await supabase
		.from('absences')
		.select('*')
		.eq('id', absence_id)
		.single();
	if (findErr || !absence) throw new ApiError(404, 'Demande introuvable');

	const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
	const update = {
		status: newStatus,
		manager_id: req.user.id,
		manager_comment: comment || null,
		updated_at: new Date().toISOString()
	};

	const { data: updated, error: updErr } = await supabase
		.from('absences')
		.update(update)
		.eq('id', absence_id)
		.select('*')
		.single();
	if (updErr) throw new ApiError(500, 'Échec de la mise à jour');

	// Notify consultant
	try {
		const { data: profile } = await supabase
			.from('profiles')
			.select('id, name, email')
			.eq('id', absence.user_id)
			.single();
		if (profile?.email) {
			const subject = `Votre demande d'absence a été ${newStatus === 'Approved' ? 'approuvée' : 'refusée'}`;
			const html = wrapEmail({
				title: subject,
				contentHtml: `
				  <p style="font-size:15px">Bonjour <strong>${profile?.name || ''}</strong>,</p>
				  <p style="font-size:15px">Votre demande du <b>${absence.start_date}</b> au <b>${absence.end_date}</b> a été <b>${newStatus}</b>.</p>
				  ${comment ? `<p style="font-size:14px;color:#666"><b>Commentaire:</b> ${comment}</p>` : ''}
				`
			});
			await sendMail({ to: profile.email, subject, html });
		}
	} catch (_) {}

	return res.status(200).json(new ApiResponse(200, updated, 'Décision enregistrée'));
});

// Public for CRA/calendar: fetch approved absences for user/month
const getApprovedAbsencesForMonth = asyncHandler(async (req, res) => {
	const { user_id } = req.params;
	const { month } = req.query; // YYYY-MM

	// Access: owner, admin, manager
	if (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.id !== user_id) {
		throw new ApiError(403, 'Accès refusé');
	}

	let query = supabase
		.from('absences')
		.select('*')
		.eq('user_id', user_id)
		.eq('status', 'Approved')
		.order('start_date', { ascending: true });

	if (month) {
		const monthStart = `${month}-01`;
		// naive month end as 28 to avoid per-month calc; frontend can handle spillover
		const monthEnd = `${month}-28`;
		query = query.gte('end_date', monthStart).lte('start_date', monthEnd);
	}

	const { data, error } = await query;
	if (error) throw new ApiError(500, 'Échec du chargement des absences approuvées');
	return res.status(200).json(new ApiResponse(200, data, 'Absences approuvées'));
});

export {
	createAbsence,
	getMyAbsences,
	listAbsences,
	decideAbsence,
	getApprovedAbsencesForMonth
};


