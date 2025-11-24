"""
통합 이미지 크롤링 진입점
자동화 및 내 콘텐츠 모두에서 사용 가능한 통합 인터페이스
"""

import sys
import os
import json
import argparse
import time
from pathlib import Path

# 리팩토링된 크롤러 import
from image_crawler_refactored import main as run_crawler


def get_scenes_file_path(script_id, base_dir=None):
    """
    script_id를 기반으로 scenes 파일 경로 찾기

    Args:
        script_id: 대본 ID
        base_dir: 기본 디렉토리 (없으면 자동 탐색)

    Returns:
        str: scenes.json 파일 경로
    """
    # 가능한 경로들
    possible_paths = []

    if base_dir:
        possible_paths.append(os.path.join(base_dir, f'project_{script_id}', 'scenes.json'))
        possible_paths.append(os.path.join(base_dir, script_id, 'scenes.json'))

    # 자동화에서 사용하는 경로
    backend_path = os.path.join(os.path.dirname(__file__), '..', '..', 'trend-video-backend')
    possible_paths.extend([
        os.path.join(backend_path, 'input', f'project_{script_id}', 'scenes.json'),
        os.path.join(backend_path, 'output', f'project_{script_id}', 'scenes.json'),
        os.path.join(backend_path, 'temp', f'scenes_{script_id}.json'),
    ])

    # 내 콘텐츠에서 사용하는 경로
    workspace_path = os.path.join(os.path.dirname(__file__), '..', '..')
    possible_paths.extend([
        os.path.join(workspace_path, 'scripts', 'outputs', script_id, 'scenes.json'),
        os.path.join(workspace_path, 'outputs', script_id, 'scenes.json'),
    ])

    # 첫 번째로 존재하는 파일 반환
    for path in possible_paths:
        if os.path.exists(path):
            print(f"✅ Scenes 파일 발견: {path}")
            return path

    # 못 찾으면 에러
    print(f"❌ Scenes 파일을 찾을 수 없습니다.")
    print(f"   확인한 경로:")
    for path in possible_paths[:5]:  # 처음 5개만 표시
        print(f"   - {path}")

    raise FileNotFoundError(f"Script ID '{script_id}'에 대한 scenes 파일을 찾을 수 없습니다")


def run_image_crawling(script_id=None, scenes_file=None, use_imagefx=False, output_dir=None, source='unknown'):
    """
    통합 이미지 크롤링 실행

    Args:
        script_id: 대본 ID (scenes_file이 없을 때 사용)
        scenes_file: scenes JSON 파일 경로 (직접 지정)
        use_imagefx: ImageFX 사용 여부
        output_dir: 출력 디렉토리 (없으면 자동 설정)
        source: 호출 출처 ('automation', 'my-content', 'cli')

    Returns:
        int: 종료 코드 (0=성공, 1=실패)
    """
    print("\n" + "="*80)
    print(f"🚀 통합 이미지 크롤링 시작")
    print(f"   출처: {source}")
    print(f"   모드: {'ImageFX + Whisk' if use_imagefx else 'Whisk 전용'}")
    print("="*80)

    try:
        # scenes 파일 경로 결정
        if scenes_file and os.path.exists(scenes_file):
            target_scenes_file = scenes_file
        elif script_id:
            target_scenes_file = get_scenes_file_path(script_id)
        else:
            raise ValueError("script_id 또는 scenes_file 중 하나는 필수입니다")

        print(f"📄 Scenes 파일: {target_scenes_file}")

        # 출력 디렉토리 자동 설정
        if not output_dir:
            scenes_dir = os.path.dirname(target_scenes_file)
            output_dir = os.path.join(scenes_dir, 'images')

        print(f"📁 출력 폴더: {output_dir}")

        # 크롤러 실행
        result = run_crawler(
            scenes_json_file=target_scenes_file,
            use_imagefx=use_imagefx,
            output_dir=output_dir,
            images_per_prompt=1
        )

        if result == 0:
            print("\n✅ 이미지 크롤링 성공!")

            # 완료 로그 작성 (자동화/내 콘텐츠 연동용)
            log_file = os.path.join(output_dir, 'crawling_complete.json')
            with open(log_file, 'w', encoding='utf-8') as f:
                json.dump({
                    'status': 'completed',
                    'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
                    'source': source,
                    'mode': 'imagefx+whisk' if use_imagefx else 'whisk',
                    'output_dir': output_dir,
                    'script_id': script_id or os.path.basename(os.path.dirname(target_scenes_file))
                }, f, indent=2, ensure_ascii=False)

            print(f"📝 완료 로그: {log_file}")
        else:
            print("\n❌ 이미지 크롤링 실패")

        return result

    except Exception as e:
        print(f"\n❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return 1


def main():
    """CLI 진입점"""
    parser = argparse.ArgumentParser(
        description='통합 이미지 크롤링 - 자동화 및 내 콘텐츠 지원',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
예제:
  # Scenes 파일 직접 지정
  python image_crawler_unified.py scenes.json
  python image_crawler_unified.py scenes.json --use-imagefx

  # Script ID로 자동 탐색
  python image_crawler_unified.py --script-id abc123
  python image_crawler_unified.py --script-id abc123 --use-imagefx

  # 출력 폴더 지정
  python image_crawler_unified.py scenes.json --output-dir ./my_images

  # 소스 지정 (로깅용)
  python image_crawler_unified.py scenes.json --source automation
        """
    )

    # 위치 인자 (선택적)
    parser.add_argument('scenes_file', nargs='?', help='Scenes JSON 파일 경로')

    # 옵션 인자
    parser.add_argument('--script-id', help='대본 ID (scenes 파일 자동 탐색)')
    parser.add_argument('--use-imagefx', action='store_true',
                       help='ImageFX로 첫 이미지 생성 (일관된 인물)')
    parser.add_argument('--output-dir', help='이미지 저장 폴더')
    parser.add_argument('--source', default='cli',
                       choices=['automation', 'my-content', 'cli'],
                       help='호출 출처 (기본: cli)')

    args = parser.parse_args()

    # 입력 검증
    if not args.scenes_file and not args.script_id:
        parser.error("scenes_file 또는 --script-id 중 하나는 필수입니다")

    # 실행
    result = run_image_crawling(
        script_id=args.script_id,
        scenes_file=args.scenes_file,
        use_imagefx=args.use_imagefx,
        output_dir=args.output_dir,
        source=args.source
    )

    sys.exit(result)


if __name__ == '__main__':
    main()