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
