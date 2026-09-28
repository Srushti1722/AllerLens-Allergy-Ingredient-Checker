# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Install system dependencies for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container
COPY requirements.txt ./

# Install any needed Python packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download EasyOCR models into /models so OCR works offline at runtime
# (on the free tier ~/.EasyOCR is wiped on restart and the silent download
# fails — a baked-in copy makes OCR reliable)
RUN mkdir -p /models/model /models/user_network && \
    python -c "import easyocr; easyocr.Reader(['en'], gpu=False, model_storage_directory='/models/model', user_network_directory='/models/user_network', download_enabled=True)" && \
    ls -la /models/model

ENV EASYOCR_MODULE_PATH=/models
# easyocr reads models from $EASYOCR_MODULE_PATH/model and $EASYOCR_MODULE_PATH/user_network

# Copy the rest of your application's source code
COPY . .

# Expose the port your app runs on
EXPOSE 10000

# Run the application
CMD [ "gunicorn", "--bind", "0.0.0.0:10000", "app:app" ]

