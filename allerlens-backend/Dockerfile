# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Install system dependencies required by OpenCV and PaddleOCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 && \
    rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container
COPY requirements.txt ./

# Install any needed Python packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download PaddleOCR models into the image so OCR works offline at runtime
# (Cloud Run containers have no outbound model downloads at request time)
RUN python -c "\
from paddleocr import PaddleOCR; \
PaddleOCR(use_angle_cls=True, lang='en', use_gpu=False, show_log=False)"

# Copy the rest of your application's source code
COPY . .

# Expose the port your app runs on
EXPOSE 10000

# Cloud Run injects $PORT; default (10000) applies when unset
CMD [ "sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-10000} --timeout 300 app:app" ]
