"""
本地 ASR 服务 — Qwen3-ASR-1.7B
对外暴露与 OpenAI `/v1/audio/transcriptions` 兼容的接口。

启动方式：
  python3 backend/asr_server.py
  # 或指定端口：
  ASR_PORT=8000 python3 backend/asr_server.py

依赖（已通过系统 pip3 安装）：
  torch, transformers, fastapi, uvicorn, soundfile, librosa
"""

import os
import io
import tempfile
import logging
import torch
import soundfile as sf
import numpy as np
import uvicorn

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("asr_server")

MODEL_ID = os.environ.get("ASR_MODEL", "Qwen/Qwen3-ASR-1.7B")
PORT = int(os.environ.get("ASR_PORT", "8000"))

# ---------------------------------------------------------------------------
# 模型加载（仅在首次请求时懒加载）
# ---------------------------------------------------------------------------
_pipe = None

def get_pipeline():
    global _pipe
    if _pipe is not None:
        return _pipe

    logger.info(f"Loading model {MODEL_ID} ...")
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    dtype = torch.float16 if device != "cpu" else torch.float32

    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
        low_cpu_mem_usage=True,
    )
    model.to(device)

    processor = AutoProcessor.from_pretrained(MODEL_ID)

    _pipe = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        torch_dtype=dtype,
        device=device,
        return_timestamps=False,
    )
    logger.info(f"Model loaded on {device}")
    return _pipe


# ---------------------------------------------------------------------------
# FastAPI 应用
# ---------------------------------------------------------------------------
app = FastAPI(title="Local ASR Server", version="1.0.0")


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_ID}


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form(default=MODEL_ID),  # 兼容 OpenAI SDK 传参，忽略实际值
    response_format: str = Form(default="json"),
    language: str = Form(default=None),
    prompt: str = Form(default=None),
):
    """与 OpenAI audio/transcriptions API 兼容的转录接口。"""
    try:
        audio_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"读取音频失败: {e}")

    # 写入临时文件，soundfile 需要文件路径
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        pipe = get_pipeline()

        generate_kwargs = {}
        if language:
            generate_kwargs["language"] = language

        result = pipe(tmp_path, generate_kwargs=generate_kwargs)
        text: str = result["text"].strip()  # type: ignore

    except Exception as e:
        logger.exception("转录失败")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)

    # 兼容 OpenAI SDK 的两种 response_format
    if response_format == "text":
        return PlainTextResponse(text)
    return JSONResponse({"text": text})


if __name__ == "__main__":
    logger.info(f"Starting ASR server on http://0.0.0.0:{PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
