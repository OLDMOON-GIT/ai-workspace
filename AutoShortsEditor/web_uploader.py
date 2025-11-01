#!/usr/bin/env python3
"""
통합 웹 인터페이스: 영상 제작 + 영상 병합
"""

import gradio as gr
import asyncio
import os
import sys
import shutil
import tempfile
import json
import subprocess
import re
from pathlib import Path
from typing import List, Optional, Tuple
import logging

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# create_video_from_folder 임포트
try:
    from create_video_from_folder import VideoFromFolderCreator
except ImportError:
    logger.warning("create_video_from_folder.py를 찾을 수 없습니다. 영상 제작 모드가 비활성화됩니다.")
    VideoFromFolderCreator = None

# Edge TTS 임포트
try:
    import edge_tts
except ImportError:
    logger.warning("edge-tts를 찾을 수 없습니다. 영상 병합 모드가 비활성화됩니다.")
    edge_tts = None


class UnifiedVideoCreator:
    """통합 비디오 생성 클래스"""

    def __init__(self):
        self.temp_dir = None

    # ========================================
    # 모드 1: 영상 제작 (story.json + 이미지)
    # ========================================

    def create_video_from_images(
        self,
        all_files: List,
        voice: str,
        aspect_ratio: str,
        add_subtitles: bool,
        progress=gr.Progress()
    ) -> Tuple[str, str]:
        """
        이미지들로 비디오 생성

        Args:
            all_files: story.json + 이미지 파일들
            voice: TTS 음성
            aspect_ratio: 비디오 비율
            add_subtitles: 자막 추가
            progress: Gradio Progress

        Returns:
            (비디오 경로, 로그)
        """
        try:
            progress(0, desc="파일 준비 중...")

            if not all_files:
                return None, "❌ 파일을 업로드해주세요!"

            # 1. 파일 분류 (JSON vs 이미지)
            story_file = None
            image_files = []

            for file in all_files:
                file_path = Path(file.name)
                ext = file_path.suffix.lower()

                if ext == '.json':
                    story_file = file
                elif ext in ['.png', '.jpg', '.jpeg', '.webp', '.bmp']:
                    image_files.append(file)

            if not story_file:
                return None, "❌ story.json 파일이 없습니다!"

            if not image_files:
                return None, "❌ 이미지 파일이 없습니다!"

            # 2. 임시 폴더 생성
            self.temp_dir = tempfile.mkdtemp(prefix="video_create_")
            temp_path = Path(self.temp_dir)

            # 3. story.json 복사
            progress(0.1, desc="story.json 처리 중...")
            story_path = temp_path / "story.json"
            shutil.copy(story_file.name, story_path)

            with open(story_path, 'r', encoding='utf-8') as f:
                story_data = json.load(f)

            if "scenes" not in story_data:
                return None, "❌ story.json에 'scenes' 필드가 없습니다!"

            num_scenes = len(story_data["scenes"])

            # 4. 이미지 정렬 및 복사
            progress(0.2, desc=f"{len(image_files)}개 이미지 처리 중...")
            sorted_images = self._sort_files(image_files)

            for idx, img_file in enumerate(sorted_images):
                scene_num = idx + 1
                ext = Path(img_file.name).suffix
                target_name = f"scene_{scene_num:02d}_image{ext}"
                target_path = temp_path / target_name
                shutil.copy(img_file.name, target_path)

            # 5. 비디오 생성
            progress(0.3, desc="비디오 생성 중...")

            creator = VideoFromFolderCreator(
                folder_path=str(temp_path),
                voice=voice,
                aspect_ratio=aspect_ratio,
                add_subtitles=add_subtitles,
                image_source="none",
                is_admin=False
            )

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            result = loop.run_until_complete(creator.create_all_videos(combine=True))
            loop.close()

            if not result:
                return None, "❌ 비디오 생성 실패!"

            # 6. 출력
            progress(0.9, desc="완료!")
            output_dir = Path("output/web_videos")
            output_dir.mkdir(parents=True, exist_ok=True)

            title = story_data.get("title", "video")
            safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '_', '-')).strip()
            safe_title = safe_title.replace(' ', '_')

            final_path = output_dir / f"{safe_title}.mp4"
            shutil.copy(result, final_path)

            progress(1.0, desc="완료!")

            success_msg = f"""
✅ 비디오 생성 완료!

📁 출력: {final_path}
🎬 씬: {num_scenes}개
🖼️ 이미지: {len(image_files)}개
🎤 음성: {voice}
📝 자막: {'추가됨' if add_subtitles else '없음'}
"""

            return str(final_path), success_msg

        except Exception as e:
            logger.error(f"비디오 생성 실패: {e}", exc_info=True)
            return None, f"❌ 에러:\n{str(e)}"

        finally:
            if self.temp_dir and os.path.exists(self.temp_dir):
                try:
                    shutil.rmtree(self.temp_dir)
                except:
                    pass

    # ========================================
    # 모드 2: 영상 병합 (비디오 + JSON/TXT)
    # ========================================

    def merge_videos(
        self,
        all_files: List,
        voice: str,
        add_subtitles: bool,
        progress=gr.Progress()
    ) -> Tuple[str, str]:
        """
        비디오 병합 + TTS 나레이션 추가

        Args:
            all_files: 비디오 파일들 + JSON/TXT 대본
            voice: TTS 음성
            add_subtitles: 자막 추가
            progress: Gradio Progress

        Returns:
            (비디오 경로, 로그)
        """
        try:
            progress(0, desc="파일 준비 중...")

            if not all_files:
                return None, "❌ 파일을 업로드해주세요!"

            # 1. 파일 분류
            video_files = []
            script_file = None

            for file in all_files:
                file_path = Path(file.name)
                ext = file_path.suffix.lower()

                if ext in ['.json', '.txt']:
                    script_file = file
                elif ext in ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm']:
                    video_files.append(file)

            if not video_files:
                return None, "❌ 비디오 파일이 없습니다!"

            # 2. 임시 폴더
            self.temp_dir = tempfile.mkdtemp(prefix="video_merge_")
            temp_path = Path(self.temp_dir)

            # 3. 비디오 정렬 및 복사
            progress(0.1, desc="비디오 정렬 중...")
            sorted_videos = self._sort_files(video_files)

            video_paths = []
            for idx, video_file in enumerate(sorted_videos):
                ext = Path(video_file.name).suffix
                target_name = f"video_{idx+1:03d}{ext}"
                target_path = temp_path / target_name
                shutil.copy(video_file.name, target_path)
                video_paths.append(target_path)

            # 4. 대본 파싱
            narrations = []
            if script_file:
                progress(0.2, desc="대본 처리 중...")
                narrations = self._parse_script(script_file)

            # 5. TTS 생성
            audio_paths = []
            if narrations:
                progress(0.3, desc=f"TTS 생성 중... ({len(narrations)}개)")

                for idx, text in enumerate(narrations):
                    audio_path = temp_path / f"narration_{idx+1:03d}.mp3"
                    asyncio.run(self._generate_tts(text, voice, audio_path))
                    audio_paths.append(audio_path)
                    progress(0.3 + (idx / len(narrations)) * 0.2,
                            desc=f"TTS 생성 중... ({idx+1}/{len(narrations)})")

            # 6. 나레이션 오버레이
            processed_videos = []
            if audio_paths:
                progress(0.5, desc="나레이션 추가 중...")

                for idx, (video_path, audio_path) in enumerate(zip(video_paths, audio_paths)):
                    output_path = temp_path / f"processed_{idx+1:03d}.mp4"
                    self._add_audio_overlay(video_path, audio_path, output_path)
                    processed_videos.append(output_path)
                    progress(0.5 + (idx / len(video_paths)) * 0.3,
                            desc=f"나레이션 추가 중... ({idx+1}/{len(video_paths)})")
            else:
                processed_videos = video_paths

            # 7. 병합
            progress(0.8, desc="비디오 병합 중...")
            final_output = temp_path / "merged.mp4"
            self._merge_videos_ffmpeg(processed_videos, final_output)

            # 8. 출력
            progress(0.9, desc="완료!")
            output_dir = Path("output/merged_videos")
            output_dir.mkdir(parents=True, exist_ok=True)

            final_path = output_dir / f"merged_{len(video_files)}videos.mp4"
            shutil.copy(final_output, final_path)

            progress(1.0, desc="완료!")

            success_msg = f"""
✅ 비디오 병합 완료!

📁 출력: {final_path}
🎬 비디오: {len(video_files)}개
🎤 나레이션: {len(narrations)}개
🎙️ 음성: {voice}
📝 자막: {'추가됨' if add_subtitles else '없음'}
"""

            return str(final_path), success_msg

        except Exception as e:
            logger.error(f"비디오 병합 실패: {e}", exc_info=True)
            return None, f"❌ 에러:\n{str(e)}"

        finally:
            if self.temp_dir and os.path.exists(self.temp_dir):
                try:
                    shutil.rmtree(self.temp_dir)
                except:
                    pass

    # ========================================
    # 유틸리티 함수들
    # ========================================

    def _sort_files(self, files: List) -> List:
        """파일을 숫자 순서로 정렬"""
        def get_number(file):
            try:
                filename = Path(file.name).stem
                match = re.search(r'(\d+)', filename)
                return int(match.group(1)) if match else 999
            except:
                return 999

        return sorted(files, key=get_number)

    def _parse_script(self, script_file) -> List[str]:
        """대본 파일 파싱"""
        file_path = Path(script_file.name)

        if file_path.suffix.lower() == '.json':
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if "scenes" in data:
                return [scene.get("text", scene.get("narration", ""))
                       for scene in data["scenes"]]
            return []

        elif file_path.suffix.lower() == '.txt':
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return [text.strip() for text in content.split('---') if text.strip()]

        return []

    async def _generate_tts(self, text: str, voice: str, output_path: Path):
        """TTS 생성"""
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(output_path))

    def _add_audio_overlay(self, video_path: Path, audio_path: Path, output_path: Path):
        """비디오에 오디오 오버레이"""
        try:
            cmd = [
                'ffmpeg',
                '-i', str(video_path),
                '-i', str(audio_path),
                '-filter_complex',
                '[0:a]volume=0.3[a1];[1:a]volume=1.0[a2];[a1][a2]amix=inputs=2:duration=longest[aout]',
                '-map', '0:v',
                '-map', '[aout]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-shortest',
                '-y',
                str(output_path)
            ]

            result = subprocess.run(cmd, capture_output=True)

            if result.returncode != 0:
                # 폴백: 오디오만 교체
                cmd_fallback = [
                    'ffmpeg', '-i', str(video_path), '-i', str(audio_path),
                    '-map', '0:v', '-map', '1:a',
                    '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-y', str(output_path)
                ]
                subprocess.run(cmd_fallback, check=True)

        except Exception as e:
            logger.error(f"오디오 오버레이 실패: {e}")
            shutil.copy(video_path, output_path)

    def _merge_videos_ffmpeg(self, video_paths: List[Path], output_path: Path):
        """FFmpeg로 비디오 병합"""
        concat_file = output_path.parent / "concat_list.txt"
        with open(concat_file, 'w', encoding='utf-8') as f:
            for video_path in video_paths:
                f.write(f"file '{video_path.name}'\n")

        cmd = [
            'ffmpeg', '-f', 'concat', '-safe', '0',
            '-i', str(concat_file), '-c', 'copy', '-y', str(output_path)
        ]

        result = subprocess.run(cmd, capture_output=True, cwd=str(output_path.parent))

        if result.returncode != 0:
            # 재인코딩으로 재시도
            cmd_reencode = [
                'ffmpeg', '-f', 'concat', '-safe', '0',
                '-i', str(concat_file), '-c:v', 'libx264', '-c:a', 'aac',
                '-y', str(output_path)
            ]
            subprocess.run(cmd_reencode, check=True, cwd=str(output_path.parent))

        concat_file.unlink()


def create_ui():
    """Gradio UI 생성"""

    creator = UnifiedVideoCreator()

    with gr.Blocks(title="AutoShortsEditor 통합 웹", theme=gr.themes.Soft()) as app:
        gr.Markdown("""
        # 🎬 AutoShortsEditor - 통합 웹 인터페이스

        **두 가지 모드를 제공합니다:**
        - **영상 제작**: story.json + 이미지들 → 비디오 생성
        - **영상 병합**: 비디오들 + 나레이션(선택) → 하나로 병합
        """)

        with gr.Tabs():
            # ========================================
            # 탭 1: 영상 제작
            # ========================================
            with gr.Tab("📹 영상 제작"):
                gr.Markdown("""
                ### 영상 제작 모드: 이미지로 비디오를 만듭니다

                story.json과 이미지들을 업로드하면 TTS 나레이션이 포함된 비디오를 자동 생성합니다.
                """)

                with gr.Row():
                    with gr.Column(scale=1):
                        create_files = gr.File(
                            label="📁 JSON/TXT와 이미지들을 한번에 드래그하세요",
                            file_count="multiple",
                            file_types=[".json", ".png", ".jpg", ".jpeg", ".webp", ".bmp"],
                            type="filepath"
                        )

                        gr.Markdown("""
                        **💡 이미지를 복사한 후 여기를 클릭하고 Ctrl+V로 붙여넣기 가능**

                        - story.json + 이미지 파일들을 한번에 업로드
                        - 이미지 파일명에 숫자가 있으면 자동 정렬
                        """)

                        create_voice = gr.Dropdown(
                            label="TTS 음성",
                            choices=[
                                "ko-KR-SoonBokNeural",
                                "ko-KR-SunHiNeural",
                                "ko-KR-InJoonNeural",
                                "ko-KR-BongJinNeural",
                            ],
                            value="ko-KR-SoonBokNeural"
                        )

                        create_ratio = gr.Radio(
                            label="비디오 비율",
                            choices=["9:16", "16:9"],
                            value="16:9"
                        )

                        create_subtitles = gr.Checkbox(
                            label="자막 추가",
                            value=True
                        )

                        create_btn = gr.Button("🎬 비디오 생성", variant="primary", size="lg")

                    with gr.Column(scale=1):
                        gr.Markdown("### 📺 결과")
                        create_video = gr.Video(label="생성된 비디오")
                        create_file = gr.File(label="다운로드")
                        create_log = gr.Textbox(label="로그", lines=15, interactive=False)

            # ========================================
            # 탭 2: 영상 병합
            # ========================================
            with gr.Tab("🔗 영상 병합"):
                gr.Markdown("""
                ### 영상 병합 모드: 여러 비디오를 하나로 연결합니다

                1개 이상의 비디오 파일을 업로드하면 순서대로 병합됩니다. 선택적으로 TTS 나레이션을 추가할 수 있습니다.
                """)

                with gr.Row():
                    with gr.Column(scale=1):
                        merge_files = gr.File(
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

                        merge_voice = gr.Dropdown(
                            label="TTS 음성",
                            choices=[
                                "ko-KR-SoonBokNeural",
                                "ko-KR-SunHiNeural",
                                "ko-KR-InJoonNeural",
                                "ko-KR-BongJinNeural",
                            ],
                            value="ko-KR-SoonBokNeural"
                        )

                        merge_subtitles = gr.Checkbox(
                            label="자막 추가",
                            value=False
                        )

                        merge_btn = gr.Button("🔗 비디오 병합", variant="primary", size="lg")

                    with gr.Column(scale=1):
                        gr.Markdown("### 📺 결과")
                        merge_video = gr.Video(label="병합된 비디오")
                        merge_file = gr.File(label="다운로드")
                        merge_log = gr.Textbox(label="로그", lines=15, interactive=False)

        gr.Markdown("""
        ---
        ### 💡 팁:
        - 파일명에 숫자를 포함하면 자동으로 순서대로 정렬됩니다
        - TTS 나레이션은 원본 오디오와 믹싱됩니다 (원본 30%, 나레이션 100%)
        - 대본 파일 형식: JSON의 경우 `{"scenes": [{"text": "..."}, ...]}`
        - TXT의 경우 `---`로 구분
        """)

        # 이벤트 핸들러
        create_btn.click(
            fn=creator.create_video_from_images,
            inputs=[create_files, create_voice, create_ratio, create_subtitles],
            outputs=[create_file, create_log]
        ).then(
            fn=lambda x: x if x else None,
            inputs=[create_file],
            outputs=[create_video]
        )

        merge_btn.click(
            fn=creator.merge_videos,
            inputs=[merge_files, merge_voice, merge_subtitles],
            outputs=[merge_file, merge_log]
        ).then(
            fn=lambda x: x if x else None,
            inputs=[merge_file],
            outputs=[merge_video]
        )

    return app


def main():
    """메인 함수"""

    os.makedirs("output/web_videos", exist_ok=True)
    os.makedirs("output/merged_videos", exist_ok=True)
    os.makedirs("logs", exist_ok=True)

    app = create_ui()

    print("=" * 70)
    print("🎬 AutoShortsEditor 통합 웹 인터페이스 시작!")
    print("=" * 70)
    print("브라우저에서 http://localhost:7860 으로 접속하세요")
    print("=" * 70)

    app.launch(
        server_name="0.0.0.0",
        server_port=7861,  # 다른 포트
        share=False,
        inbrowser=True
    )


if __name__ == "__main__":
    main()
