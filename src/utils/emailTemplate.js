import dotenv from 'dotenv';
dotenv.config();

const DEFAULT_BRAND = {
	primary: '#7f4f6a',
	bg: '#f5f5f7',
	white: '#ffffff',
	text: '#222222',
	muted: '#666666',
};

export function wrapEmail({ title = 'SevenOpportunity', contentHtml = '', logoUrl }) {
	const safeLogo = url || logoUrl || `${process.env.FRONTEND_URL || ''}/seven.png`;
	return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; background: ${DEFAULT_BRAND.bg}; color: ${DEFAULT_BRAND.text}; }
      .wrapper { width: 100%; background: ${DEFAULT_BRAND.bg}; padding: 20px 0; }
      .container { width: 100%; max-width: 680px; margin: 0 auto; }
      .banner { background: ${DEFAULT_BRAND.primary}; color: ${DEFAULT_BRAND.white}; padding: 22px; border-radius: 4px 4px 0 0; display: flex; align-items: center; justify-content: space-between; }
      .banner .title { font-size: 20px; font-weight: 700; margin: 0; }
      .logo { max-height: 56px; margin-left: 16px; }
      .card { border: 1px solid #e6e2e6; border-top: none; padding: 28px; background: ${DEFAULT_BRAND.white}; }
      p { margin: 0 0 14px 0; line-height: 1.45; color: #333; }
      .muted { color: ${DEFAULT_BRAND.muted}; font-size: 13px; }
      .highlight { background: #ffe8f2; padding: 2px 6px; border-radius: 3px; font-weight: 700; color: #2b2b2b; }
      .btn, .btn:link, .btn:visited { display: inline-block; text-decoration: none !important; padding: 12px 20px; border-radius: 6px; background: ${DEFAULT_BRAND.primary}; color: ${DEFAULT_BRAND.white} !important; font-weight: 700; margin: 12px 0; }
      .small-note { font-size: 13px; color: #555; margin-top: 8px; }
      .footer { margin-top: 22px; border-top: 1px solid #eee; padding-top: 12px; font-size: 13px; color: ${DEFAULT_BRAND.muted}; }
      .contact { margin-top: 6px; font-weight: 600; color: ${DEFAULT_BRAND.primary}; }
      @media (max-width: 480px) { .banner { flex-direction: column; align-items: flex-start; gap: 10px; } .logo { margin-left: 0; } }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <div class="banner">
          <div class="title">${title} - <span style="font-weight: 800">SevenOpportunity</span></div>
          <img src="${safeLogo}" alt="SevenOpportunity" class="logo" />
        </div>
        <div class="card">
          ${contentHtml}
          <div class="footer">
            <p class="muted">En cas de difficulté, contactez notre support :</p>
            <p class="contact">support@sevenopportunity.fr • 0955909688</p>
            <p style="margin-top: 10px">Cordialement,<br /><strong>L'équipe SevenOpportunity</strong></p>
            <p style="font-size: 12px; color: #999; margin-top: 12px">SevenOpportunity • 101 Rue de Paris, 77200 Torcy • <a href="http://7opportunity.com" style="color: ${DEFAULT_BRAND.primary}; text-decoration: none">7opportunity.com</a></p>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export default wrapEmail;

