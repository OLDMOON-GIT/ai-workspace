#!/usr/bin/env python3
"""
비디오 병합 + TTS 나레이션 추가 웹 인터페이스
"""

import gradio as gr
import asyncio
import os
import sys
import shutil
import tempfile
import json
from pathlib import Path
from typing import List, Optional, Tuple
import logging
import subprocess
import re

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Edge TTS 임포트
try:
    import edge_tts
except ImportError:
    logger.error("edge-tts를 설치해주세요: pip install edge-tts")
    sys.exit(1)


class VideoMergerWeb:
    """비디오 병합 + TTS 웹 인터페이스"""

    def __init__(self):
        self.temp_dir = None

    def process_videos(
        self,
        all_files: List,
        voice: str,
        add_subtitles: bool,
        aspect_ratio: str,
        progress=gr.Progress()
    ) -> Tuple[str, str]:
        """
        비디오 파일들 처리 및 병합

        Args:
            all_files: 모든 파일 (비디오 + JSON/TXT)
            voice: TTS 음성
            add_subtitles: 자막 추가 여부
            aspect_ratio: 비디오 비율
            progress: Gradio Progress

        Returns:
            (최종 비디오 경로, 로그 메시지)
        """
        try:
            progress(0, desc="파일 준비 중...")

            # 파일이 없으면
            if not all_files:
                return None, "❌ 파일을 최소 1개 이상 업로드해주세요!"

            # 1. 파일 분류 (비디오 vs JSON/TXT)
            video_files = []
            script_file = None

            for file in all_files:
                file_path = Path(file.name)
                ext = file_path.suffix.lower()

                if ext in ['.json', '.txt']:
                    script_file = file
                    logger.info(f"대본 파일: {file_path.name}")
                elif ext in ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm']:
                    video_files.append(file)
                    logger.info(f"비디오 파일: {file_path.name}")
                else:
                    logger.warning(f"알 수 없는 파일 형식: {file_path.name}")

            # 비디오 파일 확인
            if not video_files:
                return None, "❌ 비디오 파일을 최소 1개 이상 업로드해주세요!"

            # 임시 폴더 생성
            self.temp_dir = tempfile.mkdtemp(prefix="video_merge_")
            temp_path = Path(self.temp_dir)
            logger.info(f"임시 폴더: {temp_path}")

            # 2. 비디오 파일 정렬 및 복사
            progress(0.1, desc="비디오 파일 정렬 중...")
            sorted_videos = self._sort_video_files(video_files)

            video_paths = []
            for idx, video_file in enumerate(sorted_videos):
                ext = Path(video_file.name).suffix
                target_name = f"video_{idx+1:03d}{ext}"
                target_path = temp_path / target_name
                shutil.copy(video_file.name, target_path)
                video_paths.append(target_path)
                logger.info(f"비디오 복사: {target_name}")

            # 3. 대본 파일 처리 (선택사항)
            narrations = []
            if script_file:
                progress(0.2, desc="대본 파일 처리 중...")
                narrations = self._parse_script_file(script_file)
                logger.info(f"대본 {len(narrations)}개 로드됨")

            # 4. TTS 나레이션 생성 (대본이 있는 경우)
            audio_paths = []
            if narrations:
                progress(0.3, desc=f"TTS 나레이션 생성 중... ({len(narrations)}개)")

                for idx, text in enumerate(narrations):
                    audio_path = temp_path / f"narration_{idx+1:03d}.mp3"
                    await_result = asyncio.run(self._generate_tts(text, voice, audio_path))
                    audio_paths.append(audio_path)
                    progress(0.3 + (idx / len(narrations)) * 0.2,
                            desc=f"TTS 생성 중... ({idx+1}/{len(narrations)})")

            # 5. 비디오에 나레이션 오버레이
            processed_videos = []
            if audio_paths:
                progress(0.5, desc="나레이션을 비디오에 추가 중...")

                for idx, (video_path, audio_path) in enumerate(zip(video_paths, audio_paths)):
                    output_path = temp_path / f"processed_{idx+1:03d}.mp4"
                    self._add_audio_to_video(video_path, audio_path, output_path, add_subtitles)
                    processed_videos.append(output_path)
                    progress(0.5 + (idx / len(video_paths)) * 0.3,
                            desc=f"나레이션 추가 중... ({idx+1}/{len(video_paths)})")
            else:
                # 나레이션 없으면 원본 비디오 사용
                processed_videos = video_paths

            # 6. 비디오 병합
            progress(0.8, desc="비디오 병합 중...")
            final_output = temp_path / "final_merged.mp4"
            self._merge_videos(processed_videos, final_output)

            # 7. 출력 폴더로 복사
            progress(0.9, desc="최종 파일 생성 중...")
            output_dir = Path("output/merged_videos")
            output_dir.mkdir(parents=True, exist_ok=True)

            final_path = output_dir / f"merged_{len(video_files)}videos.mp4"
            shutil.copy(final_output, final_path)

            progress(1.0, desc="완료!")

            success_msg = f"""
✅ 비디오 병합 완료!

📁 출력 경로: {final_path}
🎬 비디오 개수: {len(video_files)}
🎤 나레이션: {len(narrations)}개
🎙️ 음성: {voice}
📝 자막: {'추가됨' if add_subtitles else '없음'}
📐 비율: {aspect_ratio}

💡 아래에서 다운로드하세요!
"""

            logger.info("비디오 병합 완료!")
            return str(final_path), success_msg

        except Exception as e:
            logger.error(f"비디오 처리 실패: {e}", exc_info=True)
            return None, f"❌ 에러 발생:\n{str(e)}"

        finally:
            # 임시 폴더 정리
            if self.temp_dir and os.path.exists(self.temp_dir):
                try:
                    shutil.rmtree(self.temp_dir)
                except Exception as e:
                    logger.warning(f"임시 폴더 삭제 실패: {e}")

    def _sort_video_files(self, video_files: List) -> List:
        """비디오 파일을 숫자 순서로 정렬"""
        def get_number(file):
            try:
                filename = Path(file.name).stem
                match = re.search(r'(\d+)', filename)
                if match:
                    return int(match.group(1))
                return 999
            except:
                return 999

        return sorted(video_files, key=get_number)

    def _parse_script_file(self, script_file) -> List[str]:
        """
        대본 파일 파싱

        JSON 형식:
        {
          "scenes": [
            {"text": "나레이션 1"},
            {"text": "나레이션 2"}
          ]
        }

        TXT 형식:
        나레이션 1
        ---
        나레이션 2
        ---
        나레이션 3
        """
        file_path = Path(script_file.name)

        if file_path.suffix.lower() == '.json':
            # JSON 파일
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            if "scenes" in data:
                return [scene.get("text", scene.get("narration", ""))
                       for scene in data["scenes"]]
            else:
                return []

        elif file_path.suffix.lower() == '.txt':
            # TXT 파일 (--- 구분자)
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            return [text.strip() for text in content.split('---') if text.strip()]

        else:
            return []

    async def _generate_tts(self, text: str, voice: str, output_path: Path):
        """TTS 나레이션 생성"""
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(output_path))
        logger.info(f"TTS 생성: {output_path.name}")

    def _add_audio_to_video(self, video_path: Path, audio_path: Path,
                           output_path: Path, add_subtitles: bool = False):
        """
        비디오에 오디오 오버레이

        FFmpeg 명령어:
        - 원본 비디오 유지
        - 오디오 믹싱 (원본 음량 30%, 나레이션 100%)
        - 자막 추가 (옵션)
        """
        try:
            # 기본 FFmpeg 명령어
            cmd = [
                'ffmpeg',
                '-i', str(video_path),  # 비디오 입력
                '-i', str(audio_path),   # 오디오 입력
                '-filter_complex',
                '[0:a]volume=0.3[a1];[1:a]volume=1.0[a2];[a1][a2]amix=inputs=2:duration=longest[aout]',
                '-map', '0:v',  # 비디오 스트림
                '-map', '[aout]',  # 믹싱된 오디오
                '-c:v', 'copy',  # 비디오 재인코딩 안함 (빠름)
                '-c:a', 'aac',
                '-shortest',  # 짧은 쪽에 맞춤
                '-y',
                str(output_path)
            ]

            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode != 0:
                logger.error(f"FFmpeg 에러: {result.stderr}")
                # 폴백: 오디오만 교체
                cmd_fallback = [
                    'ffmpeg',
                    '-i', str(video_path),
                    '-i', str(audio_path),
                    '-map', '0:v',
                    '-map', '1:a',
                    '-c:v', 'copy',
                    '-c:a', 'aac',
                    '-shortest',
                    '-y',
                    str(output_path)
                ]
                subprocess.run(cmd_fallback, check=True)

            logger.info(f"오디오 오버레이 완료: {output_path.name}")

        except Exception as e:
            logger.error(f"오디오 오버레이 실패: {e}")
            # 실패 시 원본 비디오 복사
            shutil.copy(video_path, output_path)

    def _merge_videos(self, video_paths: List[Path], output_path: Path):
        """
        여러 비디오를 하나로 병합 (FFmpeg concat demuxer)
        """
        try:
            # concat 리스트 파일 생성
            concat_file = output_path.parent / "concat_list.txt"
            with open(concat_file, 'w', encoding='utf-8') as f:
                for video_path in video_paths:
                    f.write(f"file '{video_path.name}'\n")

            # FFmpeg concat
            cmd = [
                'ffmpeg',
                '-f', 'concat',
                '-safe', '0',
                '-i', str(concat_file),
                '-c', 'copy',  # 재인코딩 없음 (초고속)
                '-y',
                str(output_path)
            ]

            result = subprocess.run(cmd, capture_output=True, text=True,
                                   cwd=str(output_path.parent))

            if result.returncode != 0:
                logger.warning("concat demuxer 실패, 재인코딩 시도...")
                # 재인코딩으로 재시도
                cmd_reencode = [
                    'ffmpeg',
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', str(concat_file),
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-y',
                    str(output_path)
                ]
                subprocess.run(cmd_reencode, check=True, cwd=str(output_path.parent))

            # 정리
            concat_file.unlink()
            logger.info(f"비디오 병합 완료: {output_path.name}")

        except Exception as e:
            logger.error(f"비디오 병합 실패: {e}")
            raise


def create_ui():
    """Gradio UI 생성"""

    merger = VideoMergerWeb()

    with gr.Blocks(
        title="비디오 병합 + TTS 나레이션",
        theme=gr.themes.Soft()
    ) as app:
        gr.Markdown("""
        # 🎬 비디오 병합 + TTS 나레이션 추가

        여러 개의 비디오 클립을 병합하고, 선택적으로 TTS 나레이션을 추가합니다.

        ### 📋 사용 방법:
        1. **비디오 파일들** 업로드 (여러 개 선택 가능)
        2. **JSON/TXT 대본** 업로드 (선택사항 - TTS 나레이션용)
        3. 옵션 설정
        4. **비디오 병합** 버튼 클릭
        """)

        with gr.Row():
            with gr.Column(scale=1):
                gr.Markdown("### 📤 파일 업로드")

                all_files = gr.File(
                    label="📁 JSON/TXT 대본과 비디오 파일들을 한번에 드래그하세요",
                    file_count="multiple",
                    file_types=[".json", ".txt", ".mp4", ".avi", ".mov", ".mkv", ".wmv", ".flv", ".webm"],
                    type="filepath"
                )

                gr.Markdown("""
                **💡 이미지를 복사한 후 여기를 클릭하고 Ctrl+V로 붙여넣기 가능**

                - 비디오 파일 (MP4, AVI, MOV 등) + JSON/TXT 대본을 한번에 업로드
                - JSON/TXT는 선택사항 (없으면 나레이션 없이 병합만)
                - 비디오 파일명에 숫자가 있으면 자동 정렬
                """)


                gr.Markdown("### ⚙️ 옵션")

                voice = gr.Dropdown(
                    label="TTS 음성",
                    choices=[
                        "ko-KR-SoonBokNeural",
                        "ko-KR-SunHiNeural",
                        "ko-KR-InJoonNeural",
                        "ko-KR-BongJinNeural",
                    ],
                    value="ko-KR-SoonBokNeural"
                )

                aspect_ratio = gr.Radio(
                    label="비디오 비율",
                    choices=["9:16", "16:9"],
                    value="16:9"
                )

                add_subtitles = gr.Checkbox(
                    label="자막 추가",
                    value=False,
                    info="TTS 나레이션 자막"
                )

                merge_btn = gr.Button(
                    "🎬 비디오 병합",
                    variant="primary",
                    size="lg"
                )

            with gr.Column(scale=1):
                gr.Markdown("### 📺 결과")

                output_video = gr.Video(
                    label="병합된 비디오"
                )

                output_file = gr.File(
                    label="다운로드"
                )

                output_log = gr.Textbox(
                    label="로그",
                    lines=15,
                    interactive=False
                )

        gr.Markdown("""
        ---
        ### 💡 팁:
        - 비디오 파일명에 숫자를 포함하면 자동으로 순서대로 정렬됩니다
        - 대본 파일 없이도 비디오만 병합 가능합니다
        - TTS 나레이션은 원본 오디오와 믹싱됩니다 (원본 30%, 나레이션 100%)
        """)

        gr.Markdown("""
        ### 📝 대본 파일 형식

        **JSON:**
        ```json
        {
          "scenes": [
            {"text": "나레이션 1"},
            {"text": "나레이션 2"}
          ]
        }
        ```

        **TXT:**
        ```
        나레이션 1
        ---
        나레이션 2
        ---
        나레이션 3
        ```
        """)

        # 이벤트 핸들러
        merge_btn.click(
            fn=merger.process_videos,
            inputs=[
                all_files,
                voice,
                add_subtitles,
                aspect_ratio
            ],
            outputs=[output_file, output_log]
        ).then(
            fn=lambda x: x if x else None,
            inputs=[output_file],
            outputs=[output_video]
        )

    return app


def main():
    """메인 함수"""

    os.makedirs("output/merged_videos", exist_ok=True)
    os.makedirs("logs", exist_ok=True)

    app = create_ui()

    print("=" * 70)
    print("🎬 비디오 병합 + TTS 웹 인터페이스 시작!")
    print("=" * 70)
    print("브라우저에서 http://localhost:7860 으로 접속하세요")
    print("=" * 70)

    app.launch(
        server_name="0.0.0.0",
        server_port=7860,
        share=False,
        inbrowser=True
    )


if __name__ == "__main__":
    main()
