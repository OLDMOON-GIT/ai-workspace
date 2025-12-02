#!/usr/bin/env npx tsx
/**
 * 일간 패턴 진화 리포트
 * - 자동 진화 실행
 * - 이메일로 결과 전송 (trend-video-frontend 환경변수 사용)
 */

import { runAutoEvolve } from './auto-evolve.js';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 파일 로드 (우선순위: 로컬 > trend-video-frontend)
const localEnvPath = path.join(__dirname, '..', '.env');
const frontendEnvPath = path.join(__dirname, '..', '..', 'trend-video-frontend', '.env.local');

if (fs.existsSync(localEnvPath)) {
  dotenvConfig({ path: localEnvPath });
  console.log('📧 환경변수 로드: mcp-title-patterns/.env');
} else if (fs.existsSync(frontendEnvPath)) {
  dotenvConfig({ path: frontendEnvPath });
  console.log('📧 환경변수 로드: trend-video-frontend/.env.local');
}

// 관리자 이메일
const ADMIN_EMAIL = 'moony75@gmail.com';

async function sendEmail(subject: string, content: string): Promise<boolean> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASSWORD;

  if (!smtpUser || !smtpPass) {
    console.log('📧 SMTP 설정 없음 (SMTP_USER, SMTP_PASSWORD 환경변수 필요)');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL || smtpUser,
      to: ADMIN_EMAIL,
      subject: subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">🧬 MCP 패턴 진화 리포트</h2>
          <pre style="background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap;">${content}</pre>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <p style="color: #64748b; font-size: 12px;">이 메일은 MCP Title Patterns 시스템에서 자동 발송되었습니다.</p>
        </div>
      `
    });

    console.log(`✅ 이메일 전송 완료: ${ADMIN_EMAIL}`);
    return true;
  } catch (error: any) {
    console.error(`❌ 이메일 전송 실패: ${error.message}`);
    return false;
  }
}

async function main() {
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  console.log(`\n📅 ${today} - 일간 패턴 진화 리포트\n`);
  console.log('='.repeat(50));

  // 자동 진화 실행
  let report: string;
  try {
    report = runAutoEvolve();
    console.log(report);
  } catch (error: any) {
    report = `❌ 진화 실행 오류: ${error.message}`;
    console.error(report);
  }

  // 이메일 전송
  const subject = `[MCP 패턴] ${today} 진화 리포트`;
  const emailContent = `${today} 패턴 진화 리포트
${'='.repeat(50)}

${report}`;

  await sendEmail(subject, emailContent);

  // 로그 파일 저장
  const logDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logFile = path.join(logDir, `evolve-${new Date().toISOString().split('T')[0]}.log`);
  fs.writeFileSync(logFile, `${today}\n\n${report}`);
  console.log(`\n📁 로그 저장됨: ${logFile}`);
}

main().catch(console.error);
