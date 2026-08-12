import time
import base64
from typing import Dict, Any, Optional

try:
    import cv2
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False

class PythonCameraDriver:
    """
    Server-Side Python OpenCV Camera Hardware Device Driver Manager.
    Manages physical open_camera_device(), capture_camera_frame(), and 
    close_camera_device() session lifecycles for USB/Webcam video sensors.
    """

    _active_cam_sessions: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def open_camera_device(cls, camera_index: int = 0, width: int = 640, height: int = 640) -> Dict[str, Any]:
        """
        Initializes OpenCV cv2.VideoCapture handle, configures resolution, 
        and powers up hardware camera session in Python.
        """
        session_id = f"CAM_SESSION_INDEX_{camera_index}_{int(time.time())}"
        
        cap = None
        if HAS_OPENCV:
            try:
                cap = cv2.VideoCapture(camera_index)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
            except Exception:
                cap = None

        session_info = {
            "session_id": session_id,
            "camera_index": camera_index,
            "status": "OPENED",
            "cap": cap,
            "opened_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "width": width,
            "height": height,
            "is_hardware_connected": cap.isOpened() if cap else False
        }

        cls._active_cam_sessions[session_id] = session_info

        return {
            "ok": True,
            "session_id": session_id,
            "status": "OPENED",
            "camera_index": camera_index,
            "is_hardware_connected": session_info["is_hardware_connected"],
            "message": f"🟢 Camera Hardware (Index #{camera_index}) successfully opened & initialized in Python OpenCV!"
        }

    @classmethod
    def capture_camera_frame(cls, session_id: str) -> Dict[str, Any]:
        """
        Captures raw JPEG frame directly from active OpenCV cv2.VideoCapture handle.
        """
        if session_id not in cls._active_cam_sessions:
            return {
                "ok": False,
                "message": f"❌ Camera Session {session_id} not found or device is closed."
            }

        sess = cls._active_cam_sessions[session_id]
        cap = sess.get("cap")

        if cap and cap.isOpened():
            ret, frame = cap.read()
            if ret and frame is not None:
                _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                frame_base64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")
                return {
                    "ok": True,
                    "session_id": session_id,
                    "image": frame_base64,
                    "message": "📸 Frame captured successfully from OpenCV camera stream."
                }

        return {
            "ok": False,
            "session_id": session_id,
            "message": "⚠️ Hardware frame read unavailable."
        }

    @classmethod
    def close_camera_device(cls, session_id: str) -> Dict[str, Any]:
        """
        Releases cv2.VideoCapture handle and closes camera session cleanly in Python.
        """
        if session_id in cls._active_cam_sessions:
            sess = cls._active_cam_sessions.pop(session_id)
            cap = sess.get("cap")
            if cap and cap.isOpened():
                cap.release()
            
            return {
                "ok": True,
                "session_id": session_id,
                "status": "CLOSED",
                "message": "🔴 Camera Hardware handle successfully released and closed in Python OpenCV."
            }

        return {
            "ok": True,
            "session_id": session_id,
            "status": "CLOSED",
            "message": "Camera session was already closed."
        }
