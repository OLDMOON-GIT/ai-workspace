import { NextResponse } from 'next/server';
import { clearBestsellerCache } from '@/lib/coupang';

export async function POST() {
  try {
    clearBestsellerCache();
    return NextResponse.json({ success: true, message: '캐시 클리어 완료' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
