import nodemailer from 'nodemailer';

// 관리자 이메일
const ADMIN_EMAIL = 'moony75@gmail.com';

// 메일 전송 설정
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

/**
 * 프로세스 종료 실패 알림 메일 전송
 */
export async function sendProcessKillFailureEmail(
  taskId: string,
  pid: number | undefined,
  userId: string,
  error: string
): Promise<void> {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
      to: ADMIN_EMAIL,
      subject: `[긴급] 프로세스 종료 실패 알림 - JobID: ${taskId}`,
      html: `
        <h2 style="color: #d32f2f;">⚠️ 프로세스 종료 실패</h2>

        <p>영상 제작 중지 요청이 있었으나 프로세스 종료에 실패했습니다.</p>

        <h3>작업 정보:</h3>
        <ul>
          <li><strong>Job ID:</strong> ${taskId}</li>
          <li><strong>Process ID (PID):</strong> ${pid || 'N/A'}</li>
          <li><strong>User ID:</strong> ${userId}</li>
          <li><strong>발생 시간:</strong> ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</li>
        </ul>

        <h3>오류 내용:</h3>
        <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 4px;">${error}</pre>

        <h3>조치 필요:</h3>
        <p>서버에 직접 접속하여 프로세스를 수동으로 종료해야 할 수 있습니다.</p>

        <hr>
        <p style="color: #666; font-size: 12px;">
          이 메일은 Trend Video 시스템에서 자동으로 발송되었습니다.<br>
          문의: moony75@gmail.com
        </p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ 프로세스 종료 실패 알림 메일 전송 완료: ${ADMIN_EMAIL}`);
  } catch (emailError) {
    console.error('❌ 메일 전송 실패:', emailError);
    // 메일 전송 실패는 치명적이지 않으므로 에러를 던지지 않음
  }
}

/**
 * 프로세스 종료 타임아웃 알림 메일 전송
 */
export async function sendProcessKillTimeoutEmail(
  taskId: string,
  pid: number | undefined,
  userId: string,
  timeoutSeconds: number
): Promise<void> {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
      to: ADMIN_EMAIL,
      subject: `[경고] 프로세스 종료 타임아웃 - JobID: ${taskId}`,
      html: `
        <h2 style="color: #f57c00;">⏱️ 프로세스 종료 타임아웃</h2>

        <p>프로세스 종료 명령을 보냈으나 ${timeoutSeconds}초 내에 종료되지 않았습니다.</p>

        <h3>작업 정보:</h3>
        <ul>
          <li><strong>Job ID:</strong> ${taskId}</li>
          <li><strong>Process ID (PID):</strong> ${pid || 'N/A'}</li>
          <li><strong>User ID:</strong> ${userId}</li>
          <li><strong>Timeout:</strong> ${timeoutSeconds}초</li>
          <li><strong>발생 시간:</strong> ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</li>
        </ul>

        <h3>조치 필요:</h3>
        <p>프로세스가 정상적으로 종료되지 않았을 수 있습니다. 확인이 필요합니다.</p>

        <hr>
        <p style="color: #666; font-size: 12px;">
          이 메일은 Trend Video 시스템에서 자동으로 발송되었습니다.<br>
          문의: moony75@gmail.com
        </p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ 프로세스 종료 타임아웃 알림 메일 전송 완료: ${ADMIN_EMAIL}`);
  } catch (emailError) {
    console.error('❌ 메일 전송 실패:', emailError);
  }
}

/**
 * 자동화 에러 알림 메일 전송
 */
export async function sendAutomationErrorEmail(
  context: string,
  errorMessage: string,
  details?: {
    userId?: string;
    channelId?: string;
    channelName?: string;
    category?: string;
    step?: string;
    productInfo?: any;
  }
): Promise<void> {
  try {
    const timestamp = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

    const mailOptions = {
      from: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
      to: ADMIN_EMAIL,
      subject: `[자동화 에러] ${context}`,
      html: `
        <h2 style="color: #d32f2f;">🚨 자동화 에러 발생</h2>

        <h3>컨텍스트:</h3>
        <p><strong>${context}</strong></p>

        <h3>에러 메시지:</h3>
        <pre style="background-color: #ffebee; padding: 10px; border-radius: 4px; color: #c62828;">${errorMessage}</pre>

        ${details ? `
        <h3>상세 정보:</h3>
        <ul>
          ${details.userId ? `<li><strong>User ID:</strong> ${details.userId}</li>` : ''}
          ${details.channelId ? `<li><strong>Channel ID:</strong> ${details.channelId}</li>` : ''}
          ${details.channelName ? `<li><strong>Channel:</strong> ${details.channelName}</li>` : ''}
          ${details.category ? `<li><strong>Category:</strong> ${details.category}</li>` : ''}
          ${details.step ? `<li><strong>Step:</strong> ${details.step}</li>` : ''}
          ${details.productInfo ? `<li><strong>Product:</strong> ${JSON.stringify(details.productInfo, null, 2)}</li>` : ''}
        </ul>
        ` : ''}

        <h3>발생 시간:</h3>
        <p>${timestamp}</p>

        <hr>
        <p style="color: #666; font-size: 12px;">
          이 메일은 Trend Video 자동화 시스템에서 자동으로 발송되었습니다.
        </p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ 자동화 에러 알림 메일 전송 완료: ${ADMIN_EMAIL}`);
  } catch (emailError) {
    console.error('❌ 에러 메일 전송 실패:', emailError);
  }
}
