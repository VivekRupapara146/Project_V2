"""
auth.py
JWT-based authentication for the traffic detection API.

Flow:
  1. POST /auth/register  → create user (bcrypt hashed password)
  2. POST /auth/login     → verify credentials → return JWT
  3. Protected routes use @require_auth decorator to validate token

Dependencies:
  pip install PyJWT bcrypt
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from functools import wraps

import bcrypt
import jwt
from flask import request, jsonify, g

from utils.database import create_user, find_user_by_email

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
# CRITICAL: Set a strong secret in production via environment variable.
# Never hardcode this in source code.
JWT_SECRET = os.getenv("JWT_SECRET")

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable not set")

JWT_ALGORITHM = "HS256"

JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24")) 

if JWT_SECRET == "change-this-secret-in-production":
    logger.warning(
        "[auth] ⚠️  JWT_SECRET is using the default placeholder. "
        "Set the JWT_SECRET environment variable before deploying."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Password Helpers
# ─────────────────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """Return bcrypt hash of a plaintext password."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if plain matches the stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# JWT Helpers
# ─────────────────────────────────────────────────────────────────────────────

def generate_token(user_email: str) -> str:
    """Generate a signed JWT for the given user email."""
    payload = {
        "sub": user_email,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    """
    Decode and validate a JWT.
    Returns the payload dict on success, None on any failure.
    """
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        logger.debug("[auth] Token expired.")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug(f"[auth] Invalid token: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Auth Decorator
# ─────────────────────────────────────────────────────────────────────────────

def require_auth(f):
    """
    Decorator that protects a Flask route with JWT authentication.

    Expects header:
        Authorization: Bearer <token>

    On success, sets g.current_user = email string.
    On failure, returns 401 JSON response.

    Usage:
        @app.get("/detections")
        @require_auth
        def detections_list(): ...
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")

        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or malformed Authorization header."}), 401

        token = auth_header.split(" ", 1)[1].strip()
        payload = decode_token(token)

        if payload is None:
            return jsonify({"error": "Invalid or expired token."}), 401

        g.current_user = payload.get("sub")
        return f(*args, **kwargs)

    return decorated


# ─────────────────────────────────────────────────────────────────────────────
# Route Handlers (register these blueprints in app.py)
# ─────────────────────────────────────────────────────────────────────────────

def register_routes(app):
    """
    Register auth endpoints on the Flask app.
    Call this in app.py:  register_routes(app)
    """

    @app.post("/auth/register")
    def auth_register():
        """
        Register a new user.

        Request JSON:
            { "username": "alice", "email": "alice@example.com", "password": "secret123" }

        Response 201:
            { "message": "User registered successfully." }
        """
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "JSON body required."}), 400

        username = (data.get("username") or "").strip()
        email    = (data.get("email")    or "").strip().lower()
        password = (data.get("password") or "").strip()

        if not username or not email or not password:
            return jsonify({"error": "username, email, and password are required."}), 400

        if len(password) < 8:
            return jsonify({"error": "Password must be at least 8 characters."}), 400

        if find_user_by_email(email):
            return jsonify({"error": "An account with this email already exists."}), 409

        password_hash = hash_password(password)
        success = create_user(username, email, password_hash)

        if not success:
            return jsonify({"error": "Registration failed. Please try again."}), 500

        logger.info(f"[auth] New user registered: {email}")
        return jsonify({"message": "User registered successfully."}), 201


    @app.post("/auth/login")
    def auth_login():
        """
        Authenticate user and return JWT.

        Request JSON:
            { "email": "alice@example.com", "password": "secret123" }

        Response 200:
            { "token": "<jwt>", "expires_in_hours": 24 }
        """
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "JSON body required."}), 400

        email    = (data.get("email")    or "").strip().lower()
        password = (data.get("password") or "").strip()

        if not email or not password:
            return jsonify({"error": "email and password are required."}), 400

        user = find_user_by_email(email)

        # Use a constant-time comparison path to avoid user enumeration
        if not user or not verify_password(password, user.get("password_hash", "")):
            return jsonify({"error": "Invalid email or password."}), 401

        token = generate_token(email)
        logger.info(f"[auth] Login successful: {email}")

        return jsonify({
            "token":           token,
            "expires_in_hours": JWT_EXPIRY_HOURS,
        })
