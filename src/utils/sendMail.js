import nodemailer from 'nodemailer';

export const sendMail = async ({ to, subject, html }) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const fromAddress = `Seven Opportunity <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;

  try {
    await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('sendMail error:', err);
    throw err;
  }
}; 