# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Install system dependencies for Tesseract OCR and OpenCV
RUN apt-get update && apt-get install -y tesseract-ocr libgl1-mesa-glx

# Copy the requirements file into the container
COPY requirements.txt ./

# Install any needed Python packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your application's source code
COPY . .

# Expose the port your app runs on
EXPOSE 10000

# Run the application
CMD [ "gunicorn", "--bind", "0.0.0.0:10000", "app:app" ]
