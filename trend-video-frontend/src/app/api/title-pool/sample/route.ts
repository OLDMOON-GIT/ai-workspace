import { NextRequest, NextResponse } from 'next/server';
import { saveTitleCandidates } from '@/lib/automation';

// ========== 제목 생성 패턴 (1000개+ 요소) ==========

// 1. 주체 (누가) - 100개+
const SUBJECTS: Record<string, string[]> = {
  '시니어사연': [
    '시어머니', '며느리', '할머니', '할아버지', '노모', '시댁 식구들',
    '장모', '사위', '효도하던 딸', '외면했던 아들', '양로원에 버린 자식들',
    '유산을 노리던 자녀들', '평생 헌신한 아내', '집안일만 하던 어머니',
    '치매 걸린 어머니', '병든 아버지', '혼자 사는 할머니', '요양원 할아버지',
    '손녀', '손자', '큰며느리', '작은며느리', '맏이', '막내',
    '첫째 아들', '둘째 딸', '셋째', '외동딸', '외동아들',
    '가출했던 아들', '연락 끊긴 딸', '외국 간 자녀', '효자', '불효자',
    '재혼한 아버지', '홀로된 어머니', '부모 버린 자식', '자식 버린 부모',
    '간병하던 며느리', '생활비 끊긴 노모', '노인정 할머니들', '경로당 어르신',
    '시골 어머니', '도시로 간 자녀들', '명절마다 싸우는 가족', '장례식장 가족들'
  ],
  '복수극': [
    '청소부', '신입사원', '인턴', '해고당한 직원', '무시당하던 막내',
    '왕따당한 동창', '가난한 남자', '버림받은 딸', '쫓겨난 사위',
    '무능하다 비웃음 받던 사람', '배신당한 친구', '사기당한 피해자',
    '계약직', '파견직', '비정규직', '알바생', '수습사원', '말단 직원',
    '고졸 출신', '지방대 출신', '후배', '동기', '선배',
    '실패한 사업가', '파산한 CEO', '빚쟁이', '노숙자 출신', '고아 출신',
    '시골 촌놈', '못생긴 여자', '뚱뚱한 남자', '키 작은 직원', '말더듬이',
    '외국인 노동자', '다문화 가정', '장애인', '전과자 출신', '미혼모',
    '이혼녀', '돌싱남', '싱글맘', '백수', '취준생', '무직자',
    '식당 종업원', '택배기사', '대리기사', '청소 아줌마', '경비 아저씨'
  ],
  '탈북자사연': [
    '탈북민', '탈북 모녀', '탈북 청년', '북한에서 온 며느리', '탈북 의사',
    '이산가족', '북한 어머니', '탈북 소녀', '북한 군인 출신', '탈북 가족',
    '북한 예술단 출신', '북한 체육인', '북한 과학자', '북한 교사', '북한 간호사',
    '평양 출신', '함경도 출신', '탈북 3세대', '탈북 부부', '탈북 형제',
    '북송 교포', '재북 가족', '남파 간첩 출신', '귀순 용사', '망명자',
    '두만강 건넌 소녀', '브로커에게 팔린 여성', '중국에서 온 탈북민',
    '제3국 출신 탈북민', '탈북 고아', '부모 잃은 탈북 청소년'
  ],
  '막장드라마': [
    '재벌 회장', '숨겨진 자녀', '배다른 형제', '입양아', '친엄마',
    '본처', '첩의 자식', '유산 상속자', '친부', '생모', '양부모',
    '재벌 2세', '재벌 3세', '대기업 후계자', '그룹 총수', '오너 일가',
    '혼외자', '사생아', '비밀 자녀', '숨겨진 후계자', '버려진 아들',
    '출생의 비밀', '뒤바뀐 아이', '병원에서 바뀐 자녀', '유괴된 아이',
    '실종된 딸', '30년 만에 찾은 아들', '해외 입양아', '고아원 출신 재벌',
    '전처 소생', '후처 자녀', '서자', '적자', '장손', '종손',
    '대를 이을 아들', '며느리 감', '사돈', '처가', '시가'
  ]
};

// 2. 과거 행동/상황 - 50개+
const PAST_ACTIONS = [
  '무시했던', '구박했던', '내쫓았던', '버렸던', '외면했던',
  '비웃었던', '괴롭혔던', '차별했던', '학대했던', '착취했던',
  '배신했던', '속였던', '이용했던', '깔봤던', '멸시했던',
  '무능하다 비웃던', '가난하다 차버린', '왕따시켰던', '해고했던',
  '쫓아냈던', '인정 안 했던', '존재를 부정했던', '손절했던',
  '무시하고 지나갔던', '인사도 안 받아주던', '이름도 안 불러주던',
  '밥도 안 차려주던', '같은 밥상에 앉지도 않던', '눈도 안 마주치던',
  '말도 안 걸던', '존재 자체를 무시했던', '투명인간 취급했던',
  '하인 취급했던', '종처럼 부리던', '노예처럼 다루던',
  '돈 한 푼 안 주던', '월급 떼먹은', '야근비 착복한', '성과 가로챈',
  '아이디어 뺏은', '공로 훔친', '승진 막은', '보직 해제시킨',
  '좌천시킨', '지방 발령 보낸', '퇴사 압박한', '권고사직 시킨',
  '모함한', '험담한', '뒷담화한', '소문 퍼뜨린', '누명 씌운'
];

// 3. 시간 표현 - 30개+
const TIME_EXPRESSIONS = [
  '3년 후', '5년 후', '10년 후', '15년 만에', '20년 만에',
  '30년 만에', '40년간', '평생', '10년간', '어느 날',
  '1년 후', '결혼 10년 만에', '이혼 후', '장례식 날',
  '유산 공개 날', '동창회에서', '회사 회식에서', '명절에',
  '설날에', '추석에', '생일날', '기일에', '제사 때',
  '환갑잔치에서', '칠순잔치에서', '돌잔치에서', '결혼식에서',
  '졸업식에서', '입학식에서', '회사 창립기념일에', '퇴직하는 날',
  '은퇴식에서', '수상식에서', '시상식에서', '기자회견에서'
];

// 4. 반전 상황 - 50개+
const PLOT_TWISTS = [
  'CEO로 나타났다', '재벌 후계자로 돌아왔다', '대표이사가 되어 나타났다',
  '상사로 나타났다', '사장 딸이었다', '본사 부장으로 돌아왔다',
  '회장님 손녀였다', '대기업 임원이 되었다', '연예인이 되어 나타났다',
  '무릎 꿇었다', '펑펑 울었다', '오열했다', '사색이 되었다',
  '얼어붙었다', '경악했다', '말을 잃었다', '충격에 빠졌다',
  '용서를 빌었다', '후회의 눈물을 흘렸다', '땅을 치며 후회했다',
  '국회의원이 되어 나타났다', '시장이 되어 나타났다', '장관이 되었다',
  '판사가 되어 나타났다', '검사가 되어 나타났다', '변호사가 되었다',
  '의사가 되어 나타났다', '교수가 되었다', '박사가 되어 나타났다',
  '유명 작가가 되었다', '베스트셀러 작가가 되었다', 'CEO 남편과 결혼했다',
  '재벌과 결혼했다', '왕자와 결혼했다', '셀럽이 되었다', '인플루언서가 되었다',
  '유튜버로 대박났다', '사업가로 성공했다', '부동산 재벌이 되었다',
  '주식으로 대박났다', '비트코인으로 벼락부자가 되었다', '로또에 당첨됐다',
  '해외에서 성공했다', '실리콘밸리 CEO가 되었다', '월가의 큰손이 되었다'
];

// 5. 발견/폭로 - 30개+
const REVELATIONS = [
  '알고 보니', '숨겨진 진실이', '30년간 숨겨온 비밀이',
  'DNA 검사 결과', '친자확인 결과', '유언장을 열어보니',
  '유품을 정리하다 발견한', '노트를 발견하니', '편지를 읽고 나서',
  '사진을 보고', '영상을 보고', 'CCTV에 찍힌',
  '통장을 확인하니', '보험금 수령자가', '수익자가',
  '등기부등본을 보니', '부동산 명의가', '주식 명의가',
  '유전자 검사 결과', '혈액형 검사 결과', '지문 감식 결과',
  '녹음 파일을 들으니', '녹화 영상을 보니', '문자 내역을 확인하니',
  '카톡을 확인하니', '이메일을 확인하니', 'SNS를 확인하니',
  '블랙박스 영상에', '차량 GPS 기록에', '신용카드 내역에'
];

// 6. 감정 결과 - 30개+
const EMOTIONAL_RESULTS = [
  '무릎 꿇고 빌어야 했다', '펑펑 울어버렸다', '오열했다',
  '말을 잃었다', '충격에 빠졌다', '통곡했다', '절규했다',
  '땅을 치며 후회했다', '사죄했다', '용서를 빌었다',
  '눈물 바다가 되었다', '대성통곡했다', '울부짖었다',
  '기절했다', '쓰러졌다', '입원했다', '충격으로 쓰러졌다',
  '심장마비가 올 뻔했다', '뇌졸중이 올 뻔했다', '정신이 나갔다',
  '멘붕이 왔다', '패닉에 빠졌다', '제정신이 아니었다',
  '밤잠을 설쳤다', '우울증에 걸렸다', '트라우마가 생겼다',
  '자책했다', '죄책감에 시달렸다', '평생 후회했다'
];

// 7. 후킹 엔딩 - 30개+
const HOOK_ENDINGS = [
  '그 이유', '그 순간', '믿을 수 없는 일이', '충격적인 진실',
  '반전이 터졌다', '놀라운 반응', '경악할 사실', '믿기 힘든 결말',
  '소름 돋는 이유', '눈물 흘린 이유', '무릎 꿇은 이유',
  '충격의 반전', '대반전', '반전 엔딩', '충격 결말',
  '놀라운 진실', '숨겨진 비밀', '드러난 진실', '밝혀진 사실',
  '상상도 못한 결과', '예상 밖의 결말', '뜻밖의 전개',
  '소름 끼치는 진실', '경악스러운 사실', '충격적인 고백',
  '폭탄 선언', '폭로', '고백', '커밍아웃', '실토'
];

// 8. 장소/상황 - 30개+
const PLACES = [
  '양로원에서', '요양원에서', '병원에서', '장례식장에서', '법원에서',
  '경찰서에서', '검찰청에서', '회사에서', '학교에서', '동창회에서',
  '결혼식에서', '돌잔치에서', '환갑잔치에서', '제사에서', '명절에',
  '공항에서', '역에서', '버스터미널에서', '호텔에서', '레스토랑에서',
  '아파트에서', '전원주택에서', '시골집에서', '고향에서', '해외에서',
  'TV 방송에서', '유튜브에서', 'SNS에서', '뉴스에서', '신문에서'
];

// 9. 관계 변화 - 30개+
const RELATIONSHIP_CHANGES = [
  '원수가 되었다', '남남이 되었다', '절연했다', '의절했다', '인연을 끊었다',
  '화해했다', '용서했다', '재회했다', '결혼했다', '이혼했다',
  '동거를 시작했다', '별거했다', '가출했다', '돌아왔다', '떠났다',
  '연락이 끊겼다', '연락이 왔다', '찾아왔다', '방문했다', '초대했다'
];

// 10. 물질적 변화 - 30개+
const MATERIAL_CHANGES = [
  '재산을 물려받았다', '유산을 상속받았다', '보험금을 받았다',
  '복권에 당첨됐다', '사업이 대박났다', '주식으로 대박났다',
  '부동산으로 벼락부자가 됐다', '빚을 다 갚았다', '빚더미에 앉았다',
  '파산했다', '노숙자가 됐다', '거지가 됐다', '망했다', '폭삭 망했다'
];

// ========== 카테고리별 템플릿 (40개+) - ⭐ 조사 자동 처리 + 다양한 구조 ==========
const TEMPLATES: Record<string, ((idx: number) => string)[]> = {
  '시니어사연': [
    // 기본형
    () => `${을를(pick(SUBJECTS['시니어사연']))} ${pick(PAST_ACTIONS)}, ${pick(TIME_EXPRESSIONS)} ${pick(EMOTIONAL_RESULTS)}`,
    () => `${pick(PAST_ACTIONS)} ${pick(SUBJECTS['시니어사연'])}, ${pick(REVELATIONS)} ${pick(HOOK_ENDINGS)}`,
    () => `${pick(TIME_EXPRESSIONS)} ${이가(pick(SUBJECTS['시니어사연']))} ${pick(PLOT_TWISTS)}, ${pick(HOOK_ENDINGS)}`,
    () => `${이가(pick(SUBJECTS['시니어사연']))} 숨겨온 비밀, ${pick(TIME_EXPRESSIONS)} ${pick(REVELATIONS)} ${pick(HOOK_ENDINGS)}`,
    () => `${pick(PAST_ACTIONS)} ${pick(SUBJECTS['시니어사연'])}, ${pick(TIME_EXPRESSIONS)} 찾아와 ${pick(EMOTIONAL_RESULTS)}`,
    () => `${pick(PLACES)} ${을를(pick(SUBJECTS['시니어사연']))} 만난 순간, ${pick(EMOTIONAL_RESULTS)}`,
    () => `${pick(SUBJECTS['시니어사연'])}의 ${pick(REVELATIONS)}, 가족 모두 ${pick(EMOTIONAL_RESULTS)}`,
    () => `${pick(TIME_EXPRESSIONS)} ${이가(pick(SUBJECTS['시니어사연']))} 보낸 편지, ${pick(HOOK_ENDINGS)}`,
    () => `${이가(pick(SUBJECTS['시니어사연']))} 남긴 유언, ${pick(REVELATIONS)} ${pick(HOOK_ENDINGS)}`,
    () => `${pick(PAST_ACTIONS)} 자식들, ${pick(TIME_EXPRESSIONS)} ${pick(SUBJECTS['시니어사연'])} 앞에서 ${pick(EMOTIONAL_RESULTS)}`,
    () => `${이가(pick(SUBJECTS['시니어사연']))} ${pick(TIME_EXPRESSIONS)} ${pick(MATERIAL_CHANGES)}, ${pick(HOOK_ENDINGS)}`,
    () => `${과와(pick(SUBJECTS['시니어사연']))} ${pick(RELATIONSHIP_CHANGES)}, ${pick(TIME_EXPRESSIONS)} ${pick(HOOK_ENDINGS)}`,
    // ⭐ 질문형
    () => `${이가(pick(SUBJECTS['시니어사연']))} 왜 ${pick(EMOTIONAL_RESULTS)}? ${pick(REVELATIONS)} ${pick(HOOK_ENDINGS)}`,
    () => `${pick(SUBJECTS['시니어사연'])}에게 무슨 일이? ${pick(TIME_EXPRESSIONS)} ${pick(REVELATIONS)}`,
    () => `왜 ${이가(pick(SUBJECTS['시니어사연']))} ${pick(PLACES)}에? ${pick(HOOK_ENDINGS)}`,
    // ⭐ 인용형
    () => `"나 ${pick(SUBJECTS['시니어사연'])}이야" ${pick(TIME_EXPRESSIONS)} 나타난 그 사람, ${pick(HOOK_ENDINGS)}`,
    () => `"${pick(PAST_ACTIONS)} 거 후회해" ${이가(pick(SUBJECTS['시니어사연']))} 마지막으로 한 말`,
    () => `"용서해줘" ${pick(PLACES)} 무릎 꿇은 ${pick(SUBJECTS['시니어사연'])}, ${pick(HOOK_ENDINGS)}`,
    // ⭐ 반어/대조형
    () => `${pick(PAST_ACTIONS)} ${이가(pick(SUBJECTS['시니어사연']))} 오히려 ${pick(PLOT_TWISTS)}`,
    () => `모두가 버린 ${pick(SUBJECTS['시니어사연'])}, ${pick(TIME_EXPRESSIONS)} ${pick(PLOT_TWISTS)}`,
    () => `가난했던 ${pick(SUBJECTS['시니어사연'])} vs 부자였던 자식들, ${pick(TIME_EXPRESSIONS)} 역전된 ${pick(HOOK_ENDINGS)}`,
    // ⭐ 숫자형
    () => `${pick(SUBJECTS['시니어사연'])}이 숨긴 3가지 비밀, ${pick(REVELATIONS)} ${pick(HOOK_ENDINGS)}`,
    () => `${pick(TIME_EXPRESSIONS)}, ${pick(SUBJECTS['시니어사연'])}에게 일어난 ${Math.floor(Math.random() * 3) + 2}가지 반전`,
    // ⭐ 감탄형
    () => `${이가(pick(SUBJECTS['시니어사연']))} ${pick(PLOT_TWISTS)}! 믿을 수 없는 ${pick(HOOK_ENDINGS)}`,
    () => `충격! ${pick(REVELATIONS)} ${pick(SUBJECTS['시니어사연'])}, ${pick(EMOTIONAL_RESULTS)}`,
    () => `${pick(PAST_ACTIONS)} 자식들 앞에서 ${이가(pick(SUBJECTS['시니어사연']))}! ${pick(HOOK_ENDINGS)}`,
    // ⭐ 열거형
    () => `${pick(SUBJECTS['시니어사연'])}, ${pick(SUBJECTS['시니어사연'])}, 그리고 ${pick(SUBJECTS['시니어사연'])}까지... ${pick(HOOK_ENDINGS)}`,
    () => `무시, 냉대, 학대... ${pick(TIME_EXPRESSIONS)} ${이가(pick(SUBJECTS['시니어사연']))} ${pick(PLOT_TWISTS)}`,
    // ⭐ 대화체형
    () => `${이가(pick(SUBJECTS['시니어사연']))} ${pick(PLOT_TWISTS)}했대, ${pick(HOOK_ENDINGS)}`,
    () => `${pick(PAST_ACTIONS)} ${이가(pick(SUBJECTS['시니어사연']))} 사실은 ${pick(MATERIAL_CHANGES)}했다더라`,
    // ⭐ 명령/경고형
    () => `${pick(SUBJECTS['시니어사연'])} 이야기, 끝까지 보세요... ${pick(HOOK_ENDINGS)}`,
    () => `눈물 없이 못 보는 ${pick(SUBJECTS['시니어사연'])}의 ${pick(HOOK_ENDINGS)}`,
    // ⭐ 시간순서형
    () => `처음엔 ${pick(PAST_ACTIONS)}, 나중엔 ${pick(PLOT_TWISTS)}, ${pick(SUBJECTS['시니어사연'])}의 ${pick(HOOK_ENDINGS)}`,
    () => `어제는 ${pick(PAST_ACTIONS)}, 오늘은 ${pick(EMOTIONAL_RESULTS)}, ${pick(SUBJECTS['시니어사연'])}의 하루`,
  ],
  '복수극': [
    // 기본형
    () => `${을를(pick(SUBJECTS['복수극']))} ${pick(PAST_ACTIONS)} 사람들, ${pick(TIME_EXPRESSIONS)} 그녀가 ${pick(PLOT_TWISTS)}`,
    () => `매일 ${pick(PAST_ACTIONS)} ${pick(SUBJECTS['복수극'])}, ${pick(REVELATIONS)} ${pick(HOOK_ENDINGS)}`,
    () => `${pick(PAST_ACTIONS)} ${이가(pick(SUBJECTS['복수극']))} ${pick(TIME_EXPRESSIONS)} ${pick(PLOT_TWISTS)}`,
    () => `${이가(pick(SUBJECTS['복수극']))} ${pick(TIME_EXPRESSIONS)} ${pick(PLOT_TWISTS)}, 그들은 ${pick(EMOTIONAL_RESULTS)}`,
    () => `회사에서 ${pick(PAST_ACTIONS)} 직원, ${pick(TIME_EXPRESSIONS)} ${pick(PLOT_TWISTS)}`,
    () => `${pick(PLACES)} ${pick(PAST_ACTIONS)} ${pick(SUBJECTS['복수극'])}, ${pick(TIME_EXPRESSIONS)} ${pick(PLOT_TWISTS)}`,
    () => `${pick(SUBJECTS['복수극'])}의 복수가 시작됐다, ${pick(TIME_EXPRESSIONS)} ${pick(HOOK_ENDINGS)}`,
    () => `${pick(PAST_ACTIONS)} 상사들, ${pick(TIME_EXPRESSIONS)} ${pick(SUBJECTS['복수극'])} 앞에서 ${pick(EMOTIONAL_RESULTS)}`,
    () => `${이가(pick(SUBJECTS['복수극']))} ${pick(MATERIAL_CHANGES)}, 그를 ${pick(PAST_ACTIONS)} 사람들은 ${pick(EMOTIONAL_RESULTS)}`,
    () => `${pick(TIME_EXPRESSIONS)} ${pick(PLACES)} 나타난 ${pick(SUBJECTS['복수극'])}, ${pick(HOOK_ENDINGS)}`,
    () => `${과와(pick(SUBJECTS['복수극']))} ${pick(RELATIONSHIP_CHANGES)}, ${pick(TIME_EXPRESSIONS)} ${pick(PLOT_TWISTS)}`,
    () => `${pick(PAST_ACTIONS)} 동료들이 ${pick(PLACES)} 마주친 ${pick(SUBJECTS['복수극'])}, ${pick(HOOK_ENDINGS)}`,
    // ⭐ 질문형
    () => `${이가(pick(SUBJECTS['복수극']))} 왜 ${pick(PLOT_TWISTS)}? ${pick(HOOK_ENDINGS)}`,
    () => `${pick(PAST_ACTIONS)} 사람들이 왜 갑자기 ${pick(EMOTIONAL_RESULTS)}?`,
    () => `누가 ${pick(SUBJECTS['복수극'])}을 ${pick(PLOT_TWISTS)}로 만들었나? ${pick(HOOK_ENDINGS)}`,
    // ⭐ 인용형
    () => `"다시는 무시 못 할 걸" ${이가(pick(SUBJECTS['복수극']))} 던진 한마디, ${pick(HOOK_ENDINGS)}`,
    () => `"나 기억나?" ${pick(TIME_EXPRESSIONS)} 돌아온 ${pick(SUBJECTS['복수극'])}, ${pick(HOOK_ENDINGS)}`,
    () => `"후회하게 해줄게" ${을를(pick(SUBJECTS['복수극']))} ${pick(PAST_ACTIONS)} 그들 앞에서`,
    // ⭐ 반어/대조형
    () => `${pick(PAST_ACTIONS)} ${이가(pick(SUBJECTS['복수극']))} 오히려 ${pick(PLOT_TWISTS)}, ${pick(HOOK_ENDINGS)}`,
    () => `비웃던 직원 vs ${pick(TIME_EXPRESSIONS)} ${pick(PLOT_TWISTS)}, 입장 역전`,
    () => `밑바닥 ${pick(SUBJECTS['복수극'])}이 정상으로, ${pick(PAST_ACTIONS)} 상사는 바닥으로`,
    // ⭐ 숫자형
    () => `${pick(SUBJECTS['복수극'])}이 복수하는 3가지 방법, ${pick(HOOK_ENDINGS)}`,
    () => `${pick(PAST_ACTIONS)} 직원의 ${Math.floor(Math.random() * 3) + 2}년 복수 플랜, ${pick(HOOK_ENDINGS)}`,
    () => `${pick(TIME_EXPRESSIONS)} 터진 ${Math.floor(Math.random() * 5) + 3}가지 반전, ${pick(EMOTIONAL_RESULTS)}`,
    // ⭐ 감탄형
    () => `${이가(pick(SUBJECTS['복수극']))} ${pick(PLOT_TWISTS)}! 모두가 경악한 ${pick(HOOK_ENDINGS)}`,
    () => `충격! ${pick(PAST_ACTIONS)} ${이가(pick(SUBJECTS['복수극']))} 사실은...! ${pick(HOOK_ENDINGS)}`,
    () => `역대급 복수! ${pick(SUBJECTS['복수극'])}의 ${pick(HOOK_ENDINGS)}`,
    // ⭐ 열거형
    () => `해고, 모욕, 왕따... 그리고 ${pick(TIME_EXPRESSIONS)} ${pick(PLOT_TWISTS)}`,
    () => `알바, 인턴, 계약직... ${pick(SUBJECTS['복수극'])}의 ${pick(TIME_EXPRESSIONS)} ${pick(HOOK_ENDINGS)}`,
    // ⭐ 대화체형
    () => `${이가(pick(SUBJECTS['복수극']))} ${pick(PLOT_TWISTS)}했대, 그걸 본 상사는 ${pick(EMOTIONAL_RESULTS)}`,
    () => `${pick(PAST_ACTIONS)} 사람이 ${pick(TIME_EXPRESSIONS)} ${pick(EMOTIONAL_RESULTS)}했다더라`,
    // ⭐ 명령/경고형
    () => `절대 무시하지 마세요, ${pick(SUBJECTS['복수극'])}의 ${pick(HOOK_ENDINGS)}`,
    () => `사이다 터지는 복수극, ${pick(SUBJECTS['복수극'])}의 ${pick(HOOK_ENDINGS)}`,
    // ⭐ 시간순서형
    () => `처음엔 ${pick(PAST_ACTIONS)}, 그다음엔 참았다, ${pick(TIME_EXPRESSIONS)} ${pick(PLOT_TWISTS)}`,
    () => `입사 첫날 ${pick(PAST_ACTIONS)}, ${pick(TIME_EXPRESSIONS)} 그들 앞에서 ${pick(PLOT_TWISTS)}`,
  ],
  '탈북자사연': [
    // 기본형
    () => `${이가(pick(SUBJECTS['탈북자사연']))} 처음 본 한국의 모습, 그녀가 ${pick(EMOTIONAL_RESULTS)}`,
    () => `${pick(TIME_EXPRESSIONS)} 재회한 ${pick(SUBJECTS['탈북자사연'])}, 서로를 몰라본 ${pick(HOOK_ENDINGS)}`,
    () => `${을를(pick(SUBJECTS['탈북자사연']))} ${pick(PAST_ACTIONS)}, ${pick(REVELATIONS)} ${pick(EMOTIONAL_RESULTS)}`,
    () => `북한에서 온 ${pick(SUBJECTS['탈북자사연'])}, 남한에서 겪은 ${pick(HOOK_ENDINGS)}`,
    () => `${pick(SUBJECTS['탈북자사연'])}의 정체를 알게 된 순간, ${pick(HOOK_ENDINGS)}`,
    () => `${이가(pick(SUBJECTS['탈북자사연']))} ${pick(PLACES)} 처음 가본 날, ${pick(EMOTIONAL_RESULTS)}`,
    () => `${pick(TIME_EXPRESSIONS)} ${이가(pick(SUBJECTS['탈북자사연']))} 보낸 편지, ${pick(HOOK_ENDINGS)}`,
    () => `${과와(pick(SUBJECTS['탈북자사연']))} ${pick(RELATIONSHIP_CHANGES)}, ${pick(TIME_EXPRESSIONS)} ${pick(HOOK_ENDINGS)}`,
    () => `${pick(PAST_ACTIONS)} ${pick(SUBJECTS['탈북자사연'])}, ${pick(REVELATIONS)} ${pick(PLOT_TWISTS)}`,
    () => `${이가(pick(SUBJECTS['탈북자사연']))} ${pick(MATERIAL_CHANGES)}, ${pick(HOOK_ENDINGS)}`,
    // ⭐ 질문형
    () => `${이가(pick(SUBJECTS['탈북자사연']))} 왜 ${pick(EMOTIONAL_RESULTS)}? 북에 두고 온 ${pick(HOOK_ENDINGS)}`,
    () => `남한에서 ${이가(pick(SUBJECTS['탈북자사연']))} 처음 본 것은? ${pick(EMOTIONAL_RESULTS)}`,
    () => `왜 ${이가(pick(SUBJECTS['탈북자사연']))} 그날 두만강을 건넜나? ${pick(HOOK_ENDINGS)}`,
    // ⭐ 인용형
    () => `"북에 가족이 있어요" ${이가(pick(SUBJECTS['탈북자사연']))} 처음 꺼낸 말, ${pick(HOOK_ENDINGS)}`,
    () => `"다시 만날 수 있을까" ${pick(TIME_EXPRESSIONS)} 보낸 편지, ${pick(EMOTIONAL_RESULTS)}`,
    () => `"여기가 천국이에요?" ${이가(pick(SUBJECTS['탈북자사연']))} 마트에서 한 말`,
    // ⭐ 반어/대조형
    () => `북한에선 간부였던 ${pick(SUBJECTS['탈북자사연'])}, 남한에선 ${pick(HOOK_ENDINGS)}`,
    () => `탈북 전 vs 탈북 후, ${pick(SUBJECTS['탈북자사연'])}에게 일어난 ${pick(HOOK_ENDINGS)}`,
    () => `굶주리던 ${pick(SUBJECTS['탈북자사연'])}이 본 남한 마트, ${pick(EMOTIONAL_RESULTS)}`,
    // ⭐ 숫자형
    () => `${pick(SUBJECTS['탈북자사연'])}이 밝힌 북한의 ${Math.floor(Math.random() * 3) + 3}가지 진실, ${pick(HOOK_ENDINGS)}`,
    () => `탈북 ${Math.floor(Math.random() * 10) + 5}년 차 ${pick(SUBJECTS['탈북자사연'])}, ${pick(TIME_EXPRESSIONS)} ${pick(HOOK_ENDINGS)}`,
    () => `${pick(TIME_EXPRESSIONS)} 만난 가족 ${Math.floor(Math.random() * 3) + 2}명, ${pick(EMOTIONAL_RESULTS)}`,
    // ⭐ 감탄형
    () => `${이가(pick(SUBJECTS['탈북자사연']))} 남한에서 처음 본 것! ${pick(EMOTIONAL_RESULTS)}`,
    () => `충격! 북한에선 이게 불법이었다고? ${pick(SUBJECTS['탈북자사연'])}의 ${pick(HOOK_ENDINGS)}`,
    () => `기적 같은 재회! ${pick(SUBJECTS['탈북자사연'])}이 ${pick(TIME_EXPRESSIONS)} 만난 ${pick(HOOK_ENDINGS)}`,
    // ⭐ 열거형
    () => `배고픔, 두려움, 희망... ${pick(SUBJECTS['탈북자사연'])}이 걸어온 길`,
    () => `북한, 중국, 제3국... ${이가(pick(SUBJECTS['탈북자사연']))} 남한에 오기까지`,
    // ⭐ 대화체형
    () => `${이가(pick(SUBJECTS['탈북자사연']))} 마트에서 ${pick(EMOTIONAL_RESULTS)}했대`,
    () => `북한에선 ${pick(SUBJECTS['탈북자사연'])}이 이랬다더라, ${pick(HOOK_ENDINGS)}`,
    // ⭐ 명령/경고형
    () => `눈물 없이 못 보는 ${pick(SUBJECTS['탈북자사연'])}의 이야기`,
    () => `이건 꼭 알아야 합니다, ${pick(SUBJECTS['탈북자사연'])}이 밝힌 ${pick(HOOK_ENDINGS)}`,
    // ⭐ 시간순서형
    () => `탈북 전 굶주림, 탈북 중 두려움, 탈북 후 ${pick(EMOTIONAL_RESULTS)}`,
    () => `어제는 북한, 오늘은 남한, ${pick(SUBJECTS['탈북자사연'])}이 느낀 ${pick(HOOK_ENDINGS)}`,
  ],
  '막장드라마': [
    // 기본형
    () => `${pick(REVELATIONS)} ${pick(SUBJECTS['막장드라마'])}, ${pick(TIME_EXPRESSIONS)} 밝혀진 ${pick(HOOK_ENDINGS)}`,
    () => `${pick(SUBJECTS['막장드라마'])}인 줄 알았던 사람, ${pick(REVELATIONS)} ${pick(HOOK_ENDINGS)}`,
    () => `${pick(TIME_EXPRESSIONS)} ${이가(pick(SUBJECTS['막장드라마']))} 나타났다, 가족 모두 ${pick(EMOTIONAL_RESULTS)}`,
    () => `${pick(SUBJECTS['막장드라마'])}의 ${pick(REVELATIONS)}, 유산 상속 자리에서 ${pick(HOOK_ENDINGS)}`,
    () => `결혼식 날 나타난 ${pick(SUBJECTS['막장드라마'])}, ${pick(HOOK_ENDINGS)}`,
    () => `${pick(PLACES)} 나타난 ${pick(SUBJECTS['막장드라마'])}, ${pick(HOOK_ENDINGS)}`,
    () => `${이가(pick(SUBJECTS['막장드라마']))} ${pick(MATERIAL_CHANGES)}, ${pick(HOOK_ENDINGS)}`,
    () => `${과와(pick(SUBJECTS['막장드라마']))} ${pick(RELATIONSHIP_CHANGES)}, ${pick(TIME_EXPRESSIONS)} ${pick(HOOK_ENDINGS)}`,
    () => `${pick(TIME_EXPRESSIONS)} ${pick(REVELATIONS)} ${pick(SUBJECTS['막장드라마'])}, ${pick(EMOTIONAL_RESULTS)}`,
    () => `${을를(pick(SUBJECTS['막장드라마']))} 찾아온 ${pick(SUBJECTS['막장드라마'])}, ${pick(HOOK_ENDINGS)}`,
    () => `${pick(PAST_ACTIONS)} ${pick(SUBJECTS['막장드라마'])}, ${pick(TIME_EXPRESSIONS)} ${pick(PLOT_TWISTS)}`,
    () => `${pick(SUBJECTS['막장드라마'])}의 등장에 ${이가(pick(SUBJECTS['막장드라마']))} ${pick(EMOTIONAL_RESULTS)}`,
    // ⭐ 질문형
    () => `${이가(pick(SUBJECTS['막장드라마']))} 진짜 ${pick(SUBJECTS['막장드라마'])}? ${pick(REVELATIONS)} ${pick(HOOK_ENDINGS)}`,
    () => `왜 ${pick(TIME_EXPRESSIONS)} 밝혀졌나? ${pick(SUBJECTS['막장드라마'])}의 ${pick(HOOK_ENDINGS)}`,
    () => `${pick(SUBJECTS['막장드라마'])}은 누구의 자식? ${pick(REVELATIONS)} ${pick(HOOK_ENDINGS)}`,
    // ⭐ 인용형
    () => `"난 ${pick(SUBJECTS['막장드라마'])}이야" 유언장 앞에서 터진 한마디, ${pick(HOOK_ENDINGS)}`,
    () => `"당신 자식이 아니에요" ${pick(PLACES)} 폭탄 고백, ${pick(EMOTIONAL_RESULTS)}`,
    () => `"${pick(TIME_EXPRESSIONS)} 찾아올 줄 알았어" ${pick(SUBJECTS['막장드라마'])}에게 건넨 말`,
    // ⭐ 반어/대조형
    () => `버려진 ${pick(SUBJECTS['막장드라마'])} vs 키운 ${pick(SUBJECTS['막장드라마'])}, ${pick(HOOK_ENDINGS)}`,
    () => `유산 0원 받은 적자 vs 전 재산 받은 ${pick(SUBJECTS['막장드라마'])}, ${pick(HOOK_ENDINGS)}`,
    () => `${pick(PAST_ACTIONS)} ${이가(pick(SUBJECTS['막장드라마']))} 오히려 ${pick(PLOT_TWISTS)}`,
    // ⭐ 숫자형
    () => `${pick(SUBJECTS['막장드라마'])}이 숨긴 ${Math.floor(Math.random() * 3) + 2}가지 출생의 비밀, ${pick(HOOK_ENDINGS)}`,
    () => `유산 상속 ${Math.floor(Math.random() * 3) + 2}명 중 진짜 자식은? ${pick(REVELATIONS)}`,
    () => `${pick(TIME_EXPRESSIONS)} 나타난 ${Math.floor(Math.random() * 3) + 2}명의 숨겨진 자녀, ${pick(EMOTIONAL_RESULTS)}`,
    // ⭐ 감탄형
    () => `${pick(REVELATIONS)} ${pick(SUBJECTS['막장드라마'])}였다니! ${pick(HOOK_ENDINGS)}`,
    () => `충격! ${이가(pick(SUBJECTS['막장드라마']))} 진짜 ${pick(SUBJECTS['막장드라마'])}! ${pick(EMOTIONAL_RESULTS)}`,
    () => `대반전! 유언장을 열자 ${pick(SUBJECTS['막장드라마'])}이! ${pick(HOOK_ENDINGS)}`,
    // ⭐ 열거형
    () => `본처, 첩, 그리고 ${pick(SUBJECTS['막장드라마'])}까지... 유산 전쟁의 ${pick(HOOK_ENDINGS)}`,
    () => `친자, 양자, 숨겨진 자녀... 재벌가의 ${pick(HOOK_ENDINGS)}`,
    // ⭐ 대화체형
    () => `${이가(pick(SUBJECTS['막장드라마']))} 사실 ${pick(SUBJECTS['막장드라마'])}이었대, ${pick(HOOK_ENDINGS)}`,
    () => `재벌 ${pick(SUBJECTS['막장드라마'])}이 유언장에 적은 내용이 ${pick(HOOK_ENDINGS)}했다더라`,
    // ⭐ 명령/경고형
    () => `막장 중 막장! ${pick(SUBJECTS['막장드라마'])}의 ${pick(HOOK_ENDINGS)}`,
    () => `드라마보다 더 드라마 같은 ${pick(SUBJECTS['막장드라마'])} 이야기`,
    // ⭐ 시간순서형
    () => `태어났을 땐 버려졌고, ${pick(TIME_EXPRESSIONS)} ${pick(PLOT_TWISTS)}, ${pick(SUBJECTS['막장드라마'])}의 ${pick(HOOK_ENDINGS)}`,
    () => `어릴 땐 고아원, 지금은 ${pick(PLOT_TWISTS)}, ${pick(SUBJECTS['막장드라마'])}의 역전 인생`,
    // ⭐ 반전/스포일러형
    () => `${pick(SUBJECTS['막장드라마'])}인 줄 알았는데 ${pick(REVELATIONS)} ${pick(SUBJECTS['막장드라마'])}이었다`,
    () => `모두가 속았다! ${pick(SUBJECTS['막장드라마'])}의 진짜 정체는 ${pick(HOOK_ENDINGS)}`,
  ],
};

// 랜덤 선택 함수
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ⭐ 한글 받침 확인 함수
function hasFinalConsonant(str: string): boolean {
  if (!str) return false;
  const lastChar = str[str.length - 1];
  const code = lastChar.charCodeAt(0);
  // 한글 범위: 0xAC00 ~ 0xD7A3
  if (code < 0xAC00 || code > 0xD7A3) return false;
  // 종성(받침) 있는지 확인: (code - 0xAC00) % 28 !== 0
  return (code - 0xAC00) % 28 !== 0;
}

// ⭐ 조사 자동 선택 함수들
function 이가(word: string): string {
  return word + (hasFinalConsonant(word) ? '이' : '가');
}

function 을를(word: string): string {
  return word + (hasFinalConsonant(word) ? '을' : '를');
}

function 과와(word: string): string {
  return word + (hasFinalConsonant(word) ? '과' : '와');
}

function 은는(word: string): string {
  return word + (hasFinalConsonant(word) ? '은' : '는');
}

// 규칙 기반 점수 평가 (⭐ 90점 이상 달성 가능하도록 개선)
function evaluateTitleWithRules(title: string, category: string): number {
  let score = 0;

  // 1. 기본 점수 - 제목 있으면 40점 시작
  score += 40;

  // 2. 길이 점수 (최대 15점)
  const length = title.length;
  if (length >= 25 && length <= 55) score += 15;
  else if (length >= 20 && length < 25) score += 12;
  else if (length > 55 && length <= 70) score += 10;
  else score += 5;

  // 3. 구두점 점수 (최대 10점)
  if (title.includes(',')) score += 6;
  if (title.includes('?') || title.includes('!')) score += 4;

  // 4. 감정적 키워드 (최대 20점)
  const emotionalKeywords = [
    '후회', '복수', '반전', '충격', '눈물', '오열', '무릎', '비밀', '진실', '통곡', '절규',
    '펑펑', '울었다', '경악', '용서', '배신', '무시', '버렸', '내쫓',
    '대박', '벼락', '재벌', 'CEO', '회장', '상속', '유산', '돈', '재산'
  ];
  let emotionalCount = 0;
  for (const keyword of emotionalKeywords) {
    if (title.includes(keyword)) emotionalCount++;
  }
  score += Math.min(emotionalCount * 7, 20);

  // 5. 시간 표현 (최대 10점)
  const timePatterns = ['년 후', '년 만에', '년간', '어느 날', '그날', '오늘', '그 순간', '만에'];
  for (const pattern of timePatterns) {
    if (title.includes(pattern)) {
      score += 10;
      break;
    }
  }

  // 6. 숫자 포함 (최대 8점)
  if (/\d+/.test(title)) score += 8;

  // 7. 반전/결말 키워드 (최대 10점)
  const twistKeywords = ['나타났다', '돌아왔다', '알고 보니', '정체가', '밝혀진', '드러난', '나타나', '되어'];
  for (const keyword of twistKeywords) {
    if (title.includes(keyword)) {
      score += 10;
      break;
    }
  }

  // ⭐ 감점 요소
  // 너무 짧으면 감점
  if (length < 15) score -= 15;
  // 너무 길면 감점
  if (length > 80) score -= 10;

  // ⭐ 문법 감점 (주어 중복 등)
  // "이/가" 주격조사 2번 이상 → 주어 충돌 가능성 높음
  const subjectMarkers = title.match(/[^0-9][이가]\s|[^0-9][이가],|[^0-9][이가]$/g) || [];
  if (subjectMarkers.length >= 2) {
    score -= 20; // 주어 중복 감점
  }

  // "은/는" 2번 이상도 어색할 수 있음
  const topicMarkers = title.match(/[은는]\s|[은는],/g) || [];
  if (topicMarkers.length >= 2) {
    score -= 10;
  }

  // 연속된 조사 (예: "가가", "이이", "을를") 감점
  if (/[이가을를은는][이가을를은는]/.test(title)) {
    score -= 15;
  }

  // 쉼표로 분리된 문장 둘 다 너무 짧으면 감점 (어색한 분리)
  if (title.includes(',')) {
    const parts = title.split(',');
    const shortParts = parts.filter(p => p.trim().length < 8);
    if (shortParts.length >= 2) {
      score -= 10;
    }
  }

  // 키워드만 나열된 느낌 (동사 없이 명사만) 감점
  // "대박났다", "드러난", "나타났다" 같은 서술어가 없으면 감점
  const hasVerb = /[다난된진]$|[다난된진],|[다난된진]\s/.test(title);
  if (!hasVerb) {
    score -= 15;
  }

  return Math.min(100, Math.max(0, score));
}

// 제목 생성
function generateTitle(category: string): string {
  const templates = TEMPLATES[category] || TEMPLATES['시니어사연'];
  const template = pick(templates);
  return template(0);
}

/**
 * POST /api/title-pool/sample - 샘플 제목 생성 (패턴 조합)
 * 조합 가능 경우의 수: 수십억 개
 * ⭐ 90점 이상 제목만 반환 + DB 저장
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const category = body.category || '시니어사연';
    const count = body.count || 3;
    const minScore = body.minScore || 90; // ⭐ 최소 점수 (기본 90점)
    const saveToPool = body.saveToPool !== false; // 기본적으로 저장

    const titles: { title: string; score: number }[] = [];
    const usedTitles = new Set<string>();

    // ⭐ minScore 이상 제목만 수집 (최대 500번 시도)
    let attempts = 0;
    const maxAttempts = 500;

    while (titles.length < count && attempts < maxAttempts) {
      const title = generateTitle(category);
      if (!usedTitles.has(title)) {
        usedTitles.add(title);
        const score = evaluateTitleWithRules(title, category);

        // ⭐ 점수가 minScore 이상인 경우만 추가
        if (score >= minScore) {
          titles.push({ title, score });
        }
      }
      attempts++;
    }

    // ⭐ 점수 높은 순으로 정렬
    titles.sort((a, b) => b.score - a.score);

    // ⭐ DB에 저장 (saveToPool이 true일 때)
    let savedCount = 0;
    if (saveToPool && titles.length > 0) {
      try {
        savedCount = await saveTitleCandidates(category, titles.map(t => ({
          title: t.title,
          aiModel: 'pattern-sampling',
          score: t.score
        })));
      } catch (e: any) {
        console.error('제목 저장 실패:', e.message);
      }
    }

    return NextResponse.json({
      success: true,
      category,
      titles,
      attempts, // 디버깅용
      minScore,
      savedCount
    });

  } catch (error: any) {
    console.error('샘플 제목 생성 실패:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '샘플 제목 생성 실패',
      titles: []
    }, { status: 500 });
  }
}
