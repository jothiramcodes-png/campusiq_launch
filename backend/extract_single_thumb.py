import cv2
import sys
import os

if len(sys.argv) < 3:
    sys.exit(1)

video_path = sys.argv[1]
out_path = sys.argv[2]

cap = cv2.VideoCapture(video_path)
if not cap.isOpened():
    sys.exit(2)

# Seek to 1 second (1000 ms)
cap.set(cv2.CAP_PROP_POS_MSEC, 1000.0)
ret, frame = cap.read()
if not ret or frame is None:
    cap.set(cv2.CAP_PROP_POS_MSEC, 0.0)
    ret, frame = cap.read()

if ret and frame is not None:
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    cv2.imwrite(out_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
    cap.release()
    sys.exit(0)

cap.release()
sys.exit(3)
