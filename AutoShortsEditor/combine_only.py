#!/usr/bin/env python3
"""
기존 씬 비디오들만 결합하는 스크립트
"""

import argparse
import logging
from pathlib import Path
import subprocess
from typing import List, Optional
import time
import json

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def combine_videos(video_folder: Path, output_path: Path, video_codec: str = "h264_qsv") -> Optional[Path]:
    """여러 씬 비디오를 하나로 결합"""
    try:
        # scene_*.mp4 파일들 찾기
        video_files = list(video_folder.glob("scene_*.mp4"))

        # 자연스러운 숫자 정렬 (scene_1, scene_2, ..., scene_10, scene_11 순서)
        def get_scene_number(path):
            try:
                # scene_01.mp4 또는 scene_1.mp4 형식에서 숫자 추출
                stem = path.stem  # 'scene_01' or 'scene_1'
                number_str = stem.split('_')[-1]  # '01' or '1'
                return int(number_str)
            except (ValueError, IndexError):
                return 0

        video_files = sorted(video_files, key=get_scene_number)

        if not video_files:
            logger.error(f"비디오 파일을 찾을 수 없습니다: {video_folder}")
            return None

        logger.info(f"🎬 {len(video_files)}개 씬 결합 중...")
        for vf in video_files:
            logger.info(f"  - {vf.name}")

        # FFmpeg concat demuxer용 파일 리스트 생성
        concat_file = video_folder / "concat_list.txt"
        with open(concat_file, 'w', encoding='utf-8') as f:
            for video_path in video_files:
                # 파일명만 사용 (같은 폴더에 있으므로)
                f.write(f"file '{video_path.name}'\n")

        logger.info(f"📝 Concat 리스트 생성: {concat_file}")

        # 1단계: 재인코딩 없이 결합 시도 (초고속)
        logger.info("⚡ 1단계: 재인코딩 없이 결합 시도...")
        cmd_copy = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_file.name,  # 파일명만 (cwd가 video_folder)
            '-c', 'copy',  # 재인코딩 없음
            '-y',
            output_path.name  # 파일명만
        ]

        try:
            result = subprocess.run(cmd_copy, check=True, capture_output=True, text=True, encoding='utf-8', errors='ignore', cwd=str(video_folder))
            logger.info(f"✅ 비디오 결합 완료 (copy): {output_path}")
            concat_file.unlink()
            return output_path
        except subprocess.CalledProcessError as e:
            logger.warning(f"Copy 방식 실패, GPU 재인코딩 시도...")
            logger.debug(f"stderr: {e.stderr}")

        # 2단계: GPU 재인코딩
        logger.info(f"🚀 2단계: GPU 재인코딩 ({video_codec})...")
        cmd_gpu = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_file.name,  # 파일명만
            '-c:v', video_codec,
            '-preset', 'fast',
            '-c:a', 'aac',
            '-y',
            output_path.name  # 파일명만
        ]

        try:
            result = subprocess.run(cmd_gpu, check=True, capture_output=True, text=True, encoding='utf-8', errors='ignore', cwd=str(video_folder))
            logger.info(f"✅ 비디오 결합 완료 (GPU): {output_path}")
            concat_file.unlink()
            return output_path
        except subprocess.CalledProcessError as e:
            logger.error(f"❌ GPU 재인코딩 실패!")
            logger.error(f"FFmpeg stderr:\n{e.stderr}")
            logger.error(f"FFmpeg stdout:\n{e.stdout}")
            concat_file.unlink()
            raise RuntimeError(f"GPU 인코딩 실패: {video_codec}")

    except Exception as e:
        logger.error(f"비디오 결합 실패: {e}")
        return None


def get_story_title(folder: Path) -> str:
    """story*.json에서 제목 추출"""
    # generated_videos 폴더의 부모 폴더에서 story*.json 찾기
    parent_folder = folder.parent

    # story로 시작하는 json 파일들 찾기
    story_files = list(parent_folder.glob("story*.json"))

    if story_files:
        # 첫 번째 story*.json 파일 사용
        story_json = story_files[0]
        logger.info(f"📖 Story 파일 발견: {story_json.name}")

        try:
            with open(story_json, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # title이 최상위에 있거나 metadata 안에 있을 수 있음
                title = data.get("title")
                if not title and "metadata" in data:
                    title = data["metadata"].get("title")

                if not title:
                    title = "video"
                    logger.warning("title 필드를 찾을 수 없음, 기본값 사용")

                # 파일명으로 사용 가능하도록 특수문자 제거
                safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '_', '-', '.')).strip()
                safe_title = safe_title.replace(' ', '_')
                logger.info(f"📝 제목: {title} → {safe_title}.mp4")
                return safe_title
        except Exception as e:
            logger.warning(f"story.json 읽기 실패: {e}")
    else:
        logger.warning(f"story*.json 파일을 찾을 수 없음: {parent_folder}")

    return "video"


def main():
    start_time = time.time()

    parser = argparse.ArgumentParser(description="기존 씬 비디오들만 결합")
    parser.add_argument("--folder", "-f", required=True, help="씬 비디오가 있는 폴더 (예: input/경계의 사람들/generated_videos)")
    parser.add_argument("--output", "-o", help="출력 파일 경로 (기본: story.json 제목.mp4)")
    parser.add_argument("--codec", "-c", default="h264_qsv",
                       choices=["h264_qsv", "h264_nvenc", "libx264"],
                       help="비디오 코덱 (기본: h264_qsv)")

    args = parser.parse_args()

    # 폴더 확인
    video_folder = Path(args.folder)
    if not video_folder.exists():
        logger.error(f"폴더가 존재하지 않습니다: {video_folder}")
        return

    logger.info(f"입력 폴더: {video_folder}")
    logger.info(f"코덱: {args.codec}")

    # 출력 경로
    if args.output:
        output_path = Path(args.output)
        logger.info(f"출력 파일 (수동 지정): {output_path}")
    else:
        # story.json에서 제목 가져오기
        logger.info("story*.json에서 제목 추출 중...")
        title = get_story_title(video_folder)
        output_path = video_folder / f"{title}.mp4"
        logger.info(f"출력 파일: {output_path}")

    # 결합 실행
    result = combine_videos(video_folder, output_path, args.codec)

    # 총 소요 시간 계산
    elapsed_time = time.time() - start_time
    minutes = int(elapsed_time // 60)
    seconds = elapsed_time % 60

    if result:
        logger.info(f"🎉 완료! 풀영상: {result}")
        logger.info(f"⏱️  총 소요 시간: {minutes}분 {seconds:.2f}초")
        print(f"\n✅ 풀영상 생성 완료: {result}")
        print(f"⏱️  총 소요 시간: {minutes}분 {seconds:.2f}초 (Total Elapsed Time: {elapsed_time:.2f}s)")
    else:
        logger.error("❌ 결합 실패")
        logger.info(f"⏱️  소요 시간: {minutes}분 {seconds:.2f}초")
        print(f"\n❌ 결합 실패")
        print(f"⏱️  소요 시간: {minutes}분 {seconds:.2f}초")


if __name__ == "__main__":
    main()
