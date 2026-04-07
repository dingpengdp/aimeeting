#
# Copyright 2024 mark.ding
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

"""
本地 ASR 服务 — Apple MLX Whisper（针对 Apple Silicon M 系列芯片优化）
对外暴露与 OpenAI `/v1/audio/transcriptions` 兼容的接口。

支持语言：普通话、粤语、闽南语等中文方言，以及英文等 100+ 语种（自动检测）。

启动方式：
  # 使用项目 venv（推荐）：
  backend/.venv-asr/bin/python3 backend/asr_server.py

  # 或通过 npm：
  npm run dev:asr

环境变量：
  ASR_MODEL   HuggingFace 模型仓库（默认 mlx-community/whisper-large-v3）
  ASR_PORT    监听端口（默认 8000）

安装依赖：
  pip install mlx-whisper fastapi uvicorn python-multipart
"""

import os
import json
import tempfile
import logging

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("asr_server")

# ── 读取持久化配置（UI 保存的优先于环境变量）──
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_CONFIG_PATH = os.path.join(_SCRIPT_DIR, "data", "aiConfig.json")

def _load_ai_config() -> dict:
    if os.path.exists(_CONFIG_PATH):
        try:
            with open(_CONFIG_PATH, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

_ai_cfg = _load_ai_config()

# 可用模型（按质量排序，前两个需联网下载）：
# mlx-community/whisper-large-v3         — 最佳中文方言 + 英文（~3GB）
# mlx-community/whisper-large-v3-turbo   — 速度优先，方言略弱（~1.5GB）
# mlx-community/whisper-small-mlx        — 已缓存，可离线使用（~500MB，精度较低）
MODEL_REPO = os.environ.get("ASR_MODEL", _ai_cfg.get("asrModel", "mlx-community/whisper-small-mlx"))
PORT = int(os.environ.get("ASR_PORT", "8000"))

_hf_token_in_use = None

def _resolve_hf_token() -> str:
    cfg = _load_ai_config()
    return os.environ.get("HF_TOKEN") or cfg.get("hfToken", "")

def _ensure_hf_auth() -> None:
    global _hf_token_in_use

    hf_token = _resolve_hf_token()
    if not hf_token or hf_token == _hf_token_in_use:
        return

    try:
        from huggingface_hub import login as _hf_login
        _hf_login(token=hf_token, add_to_git_credential=False)
        _hf_token_in_use = hf_token
        logger.info("HuggingFace authenticated successfully")
    except Exception as _e:
        logger.warning(f"HuggingFace login failed: {_e}")

_ensure_hf_auth()

try:
    import mlx_whisper
    logger.info(f"MLX Whisper loaded, model repo: {MODEL_REPO}")
except ImportError:
    logger.error("mlx-whisper 未安装！请运行：pip install mlx-whisper fastapi uvicorn python-multipart")
    raise

# ---------------------------------------------------------------------------
# FastAPI 应用
# ---------------------------------------------------------------------------
app = FastAPI(title="Local ASR Server (MLX Whisper)", version="2.0.0")


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_REPO, "backend": "mlx-whisper"}


@app.get("/v1/models")
def list_models():
    """OpenAI-compatible /v1/models stub for connectivity tests."""
    return {
        "object": "list",
        "data": [{"id": MODEL_REPO, "object": "model", "created": 0, "owned_by": "local"}],
    }


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form(default=MODEL_REPO),
    response_format: str = Form(default="json"),
    language: str = Form(default=None),
    prompt: str = Form(default=None),
):
    """与 OpenAI audio/transcriptions API 兼容的转录接口。
    
    language 示例：
      zh       — 普通话（让模型自动判断，通常不需要指定）
      yue      — 粤语
      None     — 自动检测（推荐，大部分场景效果最好）
    """
    try:
        audio_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"读取音频失败: {e}")

    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        _ensure_hf_auth()
        decode_options: dict = {
            "path_or_hf_repo": MODEL_REPO,
            "verbose": False,
        }
        # 不传 language 时自动检测，支持中文方言
        if language:
            decode_options["language"] = language
        if prompt:
            decode_options["initial_prompt"] = prompt

        logger.info(f"Transcribing {file.filename} ({len(audio_bytes)//1024}KB), language={language or 'auto'}")
        result = mlx_whisper.transcribe(tmp_path, **decode_options)
        text: str = result["text"].strip()
        detected_lang = result.get("language", "unknown")
        logger.info(f"Done — detected language: {detected_lang}, length: {len(text)} chars")

    except Exception as e:
        logger.exception("转录失败")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)

    if response_format == "text":
        return PlainTextResponse(text)
    return JSONResponse({"text": text})


import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi.responses import StreamingResponse


@app.get("/v1/check")
def check_model_cached(repo_id: str):
    """Check whether a model repo is already in the local HuggingFace cache."""
    try:
        from huggingface_hub import try_to_load_from_cache
        result = try_to_load_from_cache(repo_id=repo_id, filename="config.json")
        # Returns a path string if cached, None if not present
        return {"cached": isinstance(result, str)}
    except Exception:
        return {"cached": False}


@app.get("/v1/download")
async def download_model_sse(repo_id: str):
    """
    Stream model download progress as Server-Sent Events.
    Skips files that are already in the local HuggingFace cache.
    """
    async def generate():
        executor = ThreadPoolExecutor(max_workers=2)
        loop = asyncio.get_event_loop()
        try:
            _ensure_hf_auth()
            from huggingface_hub import list_repo_files, hf_hub_download

            yield f"data: {json.dumps({'type': 'listing', 'repo': repo_id})}\n\n"

            files = await loop.run_in_executor(
                executor,
                lambda: [f for f in list_repo_files(repo_id) if not f.startswith(".")],
            )
            total = len(files)
            yield f"data: {json.dumps({'type': 'start', 'total': total, 'repo': repo_id})}\n\n"

            for i, filename in enumerate(files):
                pct = int(i / total * 100) if total else 0
                yield f"data: {json.dumps({'type': 'file', 'file': filename, 'index': i, 'total': total, 'percent': pct})}\n\n"
                await loop.run_in_executor(
                    executor,
                    lambda f=filename: hf_hub_download(repo_id=repo_id, filename=f),
                )

            yield f"data: {json.dumps({'type': 'done', 'repo': repo_id})}\n\n"
        except Exception as e:
            logger.exception(f"下载失败: {repo_id}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            executor.shutdown(wait=False)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    logger.info(f"Starting MLX ASR server on http://0.0.0.0:{PORT}")
    logger.info(f"Model: {MODEL_REPO}")
    logger.info("首次请求时自动下载模型（如未缓存）...")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")