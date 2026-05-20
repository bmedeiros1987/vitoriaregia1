require('dotenv').config();
const nodemailer = require('nodemailer');

async function main() {
  const user = process.env.SMTP_USER;
  const pass = String(process.env.SMTP_APP_PASSWORD || '').replace(/\s+/g, '');
  const to = process.env.SMTP_TEST_TO || user;

  if (!user || !pass) {
    throw new Error('Preencha SMTP_USER e SMTP_APP_PASSWORD no .env ou nas variáveis do Render.');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'Condomínio Vitória Régia'}" <${process.env.SMTP_FROM_EMAIL || user}>`,
    to,
    subject: 'Teste de e-mail - Condomínio Vitória Régia',
    text: 'E-mail automático funcionando.',
  });

  console.log('E-mail enviado:', info.messageId);
}

main().catch((error) => {
  console.error('Erro no teste:', error.message);
  process.exit(1);
});
