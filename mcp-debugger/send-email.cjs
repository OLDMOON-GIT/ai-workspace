const nodemailer = require('nodemailer');

async function sendEmail(to, subject, text) {
  // Gmail SMTP (이메일 발송용)
  // 계정: moony75@gmail.com
  // 앱 비밀번호: vpxj gajp qsnm txfr
  // 호스트: smtp.gmail.com
  // 포트: 587
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Use `true` for port 465, `false` for all other ports
    auth: {
      user: 'moony75@gmail.com',
      pass: 'vpxj gajp qsnm txfr',
    },
  });

  const mailOptions = {
    from: 'moony75@gmail.com',
    to: to,
    subject: subject,
    text: text,
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    console.log('Email sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

// Command-line argument parsing
console.log('process.argv:', process.argv);
const recipient = process.argv[2];
const subject = process.argv[3];
const text = process.argv[4];

if (!recipient || !subject || !text) {
  console.error('Usage: node send-email.cjs <recipient> <subject> <text>');
  process.exit(1);
}

sendEmail(recipient, subject, text);
