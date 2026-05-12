import { pool } from "./db.js";

export function requireApiKey(req, res, next) {
  const configuredKey = process.env.API_KEY;

  if (!configuredKey) {
    return res.status(500).json({
      success: false,
      error: "API_KEY is not configured"
    });
  }

  if (req.get("x-api-key") !== configuredKey) {
    return res.status(401).json({
      success: false,
      error: "Invalid or missing x-api-key"
    });
  }

  return next();
}

export async function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Authentication required"
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT u.id, u.username, u.role, u.display_name
        FROM auth_sessions s
        JOIN app_users u ON u.id = s.user_id
        WHERE s.token = $1 AND s.expires_at > now()
      `,
      [token]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired session"
      });
    }

    req.user = result.rows[0];
    return next();
  } catch (err) {
    return next(err);
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: "Endpoint not found"
  });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  console.error(err);

  const status = err.statusCode || err.status || 500;
  return res.status(status).json({
    success: false,
    error: status === 500 ? "Internal server error" : err.message
  });
}
